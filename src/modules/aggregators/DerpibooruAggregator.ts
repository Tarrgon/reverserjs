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
import DerpibooruScraper from "../customScrapers/DerpibooruScraper"

class ArtStationAggregator implements Aggregator {
  index: number = 55
  manager: AggregationManager

  host: string = "derpibooru"
  displayName: string = "Derpibooru"
  homepage: string = "https://derpibooru.org/"

  galleryTemplates: RegExp[] = [
    `derpibooru\\.org\\/tags\\/artist\\-colon\\-${Globals.siteArtistIdentifier}`,
  ].map(r => new RegExp(`${Globals.prefix}${r}\\/?${Globals.remaining}\\??${Globals.remaining}#?${Globals.remaining}`))

  usernameIdentifierRegex: RegExp = /[a-zA-Z0-9_\-\.\s]{1,30}/

  submissionTemplate: string = "https://derpibooru.org/images/{siteSubmissionIdentifier}"

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
      for await (let media of DerpibooruScraper.getMedia(artistUrl)) {
        if (promises.length >= 100) {
          await Promise.all(promises)
          promises.length = 0
        }

        // Special case, they aren't sorted, so just skip them instead of breaking
        if (media.mediaUrls.length <= 0 || media.createdAt < latestDate) {
          continue
        }

        for (let i = 0; i < media.mediaUrls.length; i++) {
          let url = media.mediaUrls[i]
          let p = ImageDownloader.queueDownload(url)

          p.then(async id => {
            if (id) {
              let imageData = { ...id, source: this.submissionTemplate.replace("{siteArtistIdentifier}", artistUrl.urlIdentifier).replace("{siteSubmissionIdentifier}", media.id), directLinkOffsite: url, offsiteId: `${media.id}_${i}` }
              let prom = Submission.create(artistUrl._id, imageData.offsiteId, imageData.source, imageData.md5, media.title, media.description, media.createdAt, imageData.width, imageData.height, imageData.fileSize, imageData.directLinkOffsite, imageData.extension, { tags: media.additionalTags, sources: media.additionalSources })
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
    return urlIdentifier
  }
}

export default ArtStationAggregator