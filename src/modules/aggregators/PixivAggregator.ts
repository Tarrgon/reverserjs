import Aggregator from "../../interfaces/Aggregator"
import Globals from "../Globals"
import Submission from "../Submission"
import Utils from "../Utils"
import SourceData from "../../interfaces/SourceData"
import ImageData from "../../interfaces/ImageData"
import { ObjectId, WithId, Document } from "mongodb"
import AggregationManager, { AggregationJobData } from "../AggregationManager"
import ArtistURL from "../ArtistURL"
import ImageDownloader from "../ImageDownloader"
import PixivApi from "pixiv-api-client"
import DTextUtils from "../DTextUtils"

const HEADERS = {
  Referer: "https://www.pixiv.net"
}

class PixivAggregator implements Aggregator {
  index: number = 7
  manager: AggregationManager

  host: string = "pixiv"
  displayName: string = "Pixiv"
  homepage: string = "https://www.pixiv.net"

  galleryTemplates: RegExp[] = [
    `pixiv\\.net\\/${Globals.pixivLang}users\\/${Globals.siteArtistIdentifier}`,
    `pixiv\\.net\\/member\\.php\\?id=${Globals.siteArtistIdentifier}`
  ].map(r => new RegExp(`${Globals.prefix}${r}\\/?${Globals.remaining}\\??${Globals.remaining}#?${Globals.remaining}`))

  usernameIdentifierRegex: RegExp = /[0-9]{1,8}/

  submissionTemplate: string = "https://www.pixiv.net/artworks/{siteSubmissionIdentifier}"

  ready: boolean = false
  inUse: boolean = false
  canFetch: boolean = true
  canSearch: boolean = true

  pixivClient: PixivApi

  constructor(manager: AggregationManager) {
    this.manager = manager
    this.pixivClient = new PixivApi()
    this.setup()
  }

  async setup() {
    try {
      console.log("GETTING PIXIV TOKEN")
      this.ready = false
      let data = await this.pixivClient.refreshAccessToken(Globals.config.pixivRefreshToken)
      console.log("GOT PIXIV TOKEN")
      Globals.config.pixivRefreshToken = data.refresh_token
      Globals.saveConfig()
      this.ready = true
    } catch (e) {
      console.error("ERROR GETTING PIXIV TOKEN")
      console.error(e)
    }
  }

  async createJobData(artistUrl: ArtistURL): Promise<AggregationJobData> {
    return { artistUrlId: artistUrl._id }
  }

  private async _internalProcess(artistUrl: ArtistURL, latestDate: Date, retried: boolean = false): Promise<boolean> {
    console.log(`Fetching: ${artistUrl.url} | Going back to ${latestDate}`)

    let promises: Promise<any>[] = []

    try {
      let data = await this.pixivClient.userIllusts(artistUrl.apiIdentifier)

      let fullBreak = false
      do {
        for (let illustration of data.illusts) {
          let createdAt = new Date(illustration.create_date)

          if (createdAt < latestDate) {
            fullBreak = true
            break
          }

          let id = illustration.id.toString()
          let title = illustration.title
          let description = DTextUtils.htmlToDText(Utils.getHtmlElement(illustration.caption))

          if (illustration.meta_single_page?.original_image_url) {
            let url = illustration.meta_single_page.original_image_url
            let p = ImageDownloader.queueDownload(url, HEADERS)

            p.then(async (d) => {
              if (d) {
                let imageData = { ...d, source: this.submissionTemplate.replace("{siteArtistIdentifier}", artistUrl.urlIdentifier).replace("{siteSubmissionIdentifier}", id), directLinkOffsite: url, offsiteId: `${id}_0` }
                let prom = Submission.create(artistUrl._id, imageData.offsiteId, imageData.source, imageData.md5, title, description, createdAt, imageData.width, imageData.height, imageData.fileSize, imageData.directLinkOffsite, imageData.extension)
                promises.push(prom)
              } else {
                console.error("NO IMAGE DATA")
              }
            }).catch((e) => {
              console.error(`Error while downloading: ${url}`)
              console.error(e)
            })

            promises.push(p)
          } else {
            for (let i = 0; i < illustration.meta_pages.length; i++) {
              let singlePage = illustration.meta_pages[i]
              let url = singlePage.image_urls.original
              let p = ImageDownloader.queueDownload(url, HEADERS)

              p.then(async (d) => {
                if (d) {
                  let imageData = { ...d, source: this.submissionTemplate.replace("{siteArtistIdentifier}", artistUrl.urlIdentifier).replace("{siteSubmissionIdentifier}", id), directLinkOffsite: url, offsiteId: `${id}_${i}` }
                  let prom = Submission.create(artistUrl._id, imageData.offsiteId, imageData.source, imageData.md5, title, description, createdAt, imageData.width, imageData.height, imageData.fileSize, imageData.directLinkOffsite, imageData.extension)
                  promises.push(prom)
                } else {
                  console.error("NO IMAGE DATA")
                }
              }).catch((e) => {
                console.error(`Error while downloading: ${url}`)
                console.error(e)
              })

              promises.push(p)
            }
          }
        }

        if (fullBreak) break

        if (data.next_url) data = await this.pixivClient.requestUrl(data.next_url)
      } while (data.next_url)

      await Promise.all(promises)

      console.log(`Completed: ${artistUrl.url}`)

      return false
    } catch (e: any) {
      if (!retried) {
        await this.setup()
        return await this._internalProcess(artistUrl, latestDate, true)
      }

      console.error(`Error with: ${this.host}/${artistUrl.urlIdentifier} (${artistUrl._id})`)
      console.error(e)
      console.error(JSON.stringify(e, null, 4))
      return true
    }
  }

  async fetchAll(artistUrlId: ObjectId): Promise<boolean> {
    if (!this.canFetch) return false

    while (!this.ready) await Utils.wait(1000)

    this.inUse = true

    let artistURL = await ArtistURL.findByObjectId(artistUrlId) as ArtistURL

    let error = await this._internalProcess(artistURL, artistURL.lastScrapedAt ?? new Date(0))

    if (error) {
      throw new Error("Error")
    }

    this.inUse = false

    return true
  }

  testUrl(url: string): boolean {
    for (let regex of this.galleryTemplates) {
      if (regex.test(url)) return true
    }

    return false
  }

  matchUrl(url: string): RegExpExecArray | null {
    for (let regex of this.galleryTemplates) {
      let match = regex.exec(url)
      if (match) return match
    }

    return null
  }

  async getApiIdentifier(urlIdentifier: string): Promise<string | null> {
    return urlIdentifier
    // while (!this.ready) await Utils.wait(1000)

    // let data = await this.pixivClient.searchUser(urlIdentifier)

    // do {
    //   for (let user of data.user_previews) {
    //     if (user.name.toLowerCase() == urlIdentifier) {
    //       return user.id.toString()
    //     }
    //   }

    //   if (data.next_url) data = await this.pixivClient.requestUrl(data.next_url)
    // } while (data.next_url)

    return null
  }
}

export default PixivAggregator