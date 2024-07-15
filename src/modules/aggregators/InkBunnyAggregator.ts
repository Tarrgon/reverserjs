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
import Helper from "ib-helper"
import DTextUtils from "../DTextUtils"

class InkbunnyAggregator implements Aggregator {
  index: number = 2
  manager: AggregationManager

  host: string = "inkbunny"
  displayName: string = "Inkbunny"
  homepage: string = "https://inkbunny.net/"

  galleryTemplates: RegExp[] = [
    `inkbunny\\.net\\/${Globals.siteArtistIdentifier}`,
  ].map(r => new RegExp(`${Globals.prefix}${r}\\/?${Globals.remaining}\\??${Globals.remaining}#?${Globals.remaining}`))

  usernameIdentifierRegex: RegExp = /[a-zA-Z0-9]{1,22}/

  submissionTemplate: string = "https://inkbunny.net/s/{siteSubmissionIdentifier}"

  ready: boolean = false
  inUse: boolean = false
  canFetch: boolean = true
  canSearch: boolean = true

  inkbunnyHelper: Helper

  constructor(manager: AggregationManager) {
    this.manager = manager
    this.inkbunnyHelper = new Helper()
    this.inkbunnyHelper.login(Globals.config.inkBunnyAuth.username, Globals.config.inkBunnyAuth.password).then(() => {
      this.ready = true
    })
  }

  async createJobData(artistUrl: ArtistURL): Promise<AggregationJobData> {
    return { artistUrlId: artistUrl._id }
  }

  private async _internalProcess(artistUrl: ArtistURL, latestDate: Date): Promise<boolean> {
    console.log(`Fetching: ${artistUrl.url} | Going back to ${latestDate}`)

    let promises: Promise<any>[] = []

    try {
      let search = await this.inkbunnyHelper.search({ user_id: artistUrl.apiIdentifier, type: "1,2,3,4,5,8,9,13,14", submissions_per_page: 100, orderby: "last_file_update_datetime" })

      let tooOld = false

      while (search.page < search.pages_count) {
        if (promises.length >= 100) {
          await Promise.all(promises)
          promises.length = 0
        }

        let ids = search.submissions.map(s => s.submission_id)

        let data = await this.inkbunnyHelper.details(ids, true, false, false)

        for (let submission of data.submissions) {
          let date = new Date(submission.last_file_update_datetime)
          if (date < latestDate) {
            tooOld = true
            break
          }

          for (let file of submission.files) {
            let date = new Date(file.create_datetime)

            // If this file was added after the latest date, we know it's already indexed, so skip it
            if (date < latestDate) continue

            let order = parseInt(file.submission_file_order) + 1

            let url = file.file_url_full
            let p = ImageDownloader.queueDownload(url)

            p.then(async (id) => {
              if (id) {
                let imageData = { ...id, source: this.submissionTemplate.replace("{siteArtistIdentifier}", artistUrl.urlIdentifier).replace("{siteSubmissionIdentifier}", order == 1 ? file.submission_id.toString() : `${file.submission_id}-p${order}`), directLinkOffsite: url, offsiteId: `${submission.submission_id}_${order - 1}` }
                let prom = Submission.create(artistUrl._id, imageData.offsiteId, imageData.source, imageData.md5, submission.title, DTextUtils.htmlToDText(Utils.getHtmlElement(submission.description_bbcode_parsed ?? "")), date, imageData.width, imageData.height, imageData.fileSize, imageData.directLinkOffsite, imageData.extension)
                promises.push(prom)
              }
            }).catch(console.error)

            promises.push(p)
          }

          if (tooOld) break
        }

        if (tooOld) {
          break
        } else {
          search = await search.nextPage()
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
    while (!this.ready) await Utils.wait(1000)

    let url = new URL("https://inkbunny.net/api_username_autosuggest.php")
    url.searchParams.set("sid", this.inkbunnyHelper.sid as string)
    url.searchParams.set("username", urlIdentifier)

    try {
      let res = await fetch(url)

      let json = await res.json() as any

      let user = json.results.find(u => u.value.toLowerCase() == urlIdentifier.toLowerCase())
      if (user) return user.id

      return null
    } catch (e) {
      console.error(`Error fetching API Identifier (inkbunny) for ${urlIdentifier}`)
      console.error(e)
      return null
    }
  }
}

export default InkbunnyAggregator