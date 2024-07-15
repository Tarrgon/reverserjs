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
import MastodonScraper from "../customScrapers/MastodonScraper"
import Job from "../Job"

class BaraagAggregator implements Aggregator {
  index: number = 54
  manager: AggregationManager

  host: string = "baraag"
  displayName: string = "Baraag"
  homepage: string = "https://baraag.net"

  galleryTemplates: RegExp[] = [
    `baraag\\.net\\/@${Globals.siteArtistIdentifier}`
  ].map(r => new RegExp(`${Globals.prefix}${r}\\/?${Globals.remaining}\\??${Globals.remaining}#?${Globals.remaining}`))

  usernameIdentifierRegex: RegExp = /[a-zA-Z0-9_]{1,30}/

  submissionTemplate: string = "https://baraag.net/statuses/{siteSubmissionIdentifier}"

  ready: boolean = false
  inUse: boolean = false
  canFetch: boolean = true
  canSearch: boolean = true

  scraper: MastodonScraper

  constructor(manager: AggregationManager) {
    this.manager = manager
    this.scraper = new MastodonScraper("https://baraag.net/api/v1")
  }

  async createJobData(artistUrl: ArtistURL): Promise<AggregationJobData> {
    return { artistUrlId: artistUrl._id }
  }

  private async _internalProcess(artistUrl: ArtistURL, latestDate: Date): Promise<boolean> {
    console.log(`Fetching: ${artistUrl.url} | Going back to ${latestDate}`)

    let promises: Promise<any>[] = []

    try {
      for await (let media of this.scraper.getMedia(artistUrl)) {
        if (promises.length >= 100) {
          await Promise.all(promises)
          promises.length = 0
        }

        if (media.createdAt < latestDate) {
          break
        }

        if (media.media.length <= 0) {
          continue
        }

        for (let i = 0; i < media.media.length; i++) {
          let mastodonMedia = media.media[i]
          let url = mastodonMedia.url
          let p = ImageDownloader.queueDownload(url)

          p.then(async (id) => {
            if (id) {
              let imageData = { ...id, source: this.submissionTemplate.replace("{siteArtistIdentifier}", artistUrl.urlIdentifier).replace("{siteSubmissionIdentifier}", media.id), offsiteId: mastodonMedia.id }
              let prom = Submission.create(artistUrl._id, imageData.offsiteId, imageData.source, imageData.md5, "", mastodonMedia.description.length == 0 ? media.description : `${media.description}\n\n${mastodonMedia.description}`, media.createdAt, imageData.width, imageData.height, imageData.fileSize, url, imageData.extension)
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

      await Promise.all(promises)

      console.log(`Completed: ${artistUrl.url}`)

      return false
    } catch (e: any) {
      console.error(`Error with: ${this.host}/${artistUrl.urlIdentifier} (${artistUrl._id})`)
      console.error(e)
      console.error(JSON.stringify(e, null, 4))
      return true
    }
  }

  async fetchAll(artistUrlId: ObjectId): Promise<boolean> {
    if (!this.canFetch) return false

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
    return await this.scraper.getApiIdentifier(urlIdentifier)
  }
}

export default BaraagAggregator