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
import { parse } from "node-html-parser"
import PiczelScraper from "../customScrapers/PiczelScraper"

class PiczelAggregator implements Aggregator {
  index: number = 19
  manager: AggregationManager

  host: string = "piczel"
  displayName: string = "Piczel"
  homepage: string = "https://piczel.tv/"

  galleryTemplates: RegExp[] = [
    `piczel\\.tv\\/gallery\\/${Globals.siteArtistIdentifier}`,
    `piczel\\.tv\\/watch\\/${Globals.siteArtistIdentifier}`
  ].map(r => new RegExp(`${Globals.prefix}${r}\\/?${Globals.remaining}\\??${Globals.remaining}#?${Globals.remaining}`))

  // usernameIdentifierRegex: RegExp = /[a-zA-Z0-9_\-]{3,63}/
  submissionTemplate: string = "https://piczel.tv/gallery/image/{siteSubmissionIdentifier}"

  ready: boolean = false
  inUse: boolean = false
  canFetch: boolean = true
  canSearch: boolean = true

  constructor(manager: AggregationManager) {
    this.manager = manager
  }

  async createJobData(artistUrl: ArtistURL): Promise<AggregationJobData> {
    return { artistUrlId: artistUrl._id }
  }

  private async _internalProcess(artistUrl: ArtistURL, latestDate: Date): Promise<boolean> {
    console.log(`Fetching: ${artistUrl.url} | Going back to ${latestDate}`)

    let promises: Promise<any>[] = []

    try {
      for await (let media of PiczelScraper.getMedia(artistUrl)) {
        if (promises.length >= 100) {
          await Promise.all(promises)
          promises.length = 0
        }

        if (media.createdAt < latestDate) {
          break
        }

        if (media.mediaUrls.length <= 0) {
          continue
        }

        for (let i = 0; i < media.mediaUrls.length; i++) {
          let url = media.mediaUrls[i]
          let p = ImageDownloader.queueDownload(url)

          p.then(async (id) => {
            if (id) {
              let imageData = { ...id, source: this.submissionTemplate.replace("{siteArtistIdentifier}", artistUrl.urlIdentifier).replace("{siteSubmissionIdentifier}", media.id), directLinkOffsite: url, offsiteId: `${media.id}_${i}` }
              let prom = Submission.create(artistUrl._id, imageData.offsiteId, imageData.source, imageData.md5, media.title, media.description, media.createdAt, imageData.width, imageData.height, imageData.fileSize, imageData.directLinkOffsite, imageData.extension)
              promises.push(prom)
            }
          }).catch(console.error)

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
    return urlIdentifier
  }
}

export default PiczelAggregator