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
import DeviantArtScraper from "../customScrapers/DeviantArtScraper"

class PatreonAggregator implements Aggregator {
  index: number = 6
  manager: AggregationManager

  host: string = "patreon"
  displayName: string = "Patreon"
  homepage: string = "https://www.patreon.com"

  galleryTemplates: RegExp[] = [
    `patreon.com\\/${Globals.siteArtistIdentifier}`,
  ].map(r => new RegExp(`${Globals.prefix}${r}\\/?${Globals.remaining}\\??${Globals.remaining}#?${Globals.remaining}`))

  usernameIdentifierRegex: RegExp = /[a-zA-Z0-9_]{1,64}/

  submissionTemplate: string = "https://www.patreon.com/posts/{siteSubmissionIdentifier}"

  ready: boolean = false
  inUse: boolean = false
  canFetch: boolean = false
  canSearch: boolean = false

  constructor(manager: AggregationManager) {
    this.manager = manager
  }

  async createJobData(artistUrl: ArtistURL): Promise<AggregationJobData> {
    return { artistUrlId: artistUrl._id }
  }

  private async _internalProcess(artistUrl: ArtistURL, latestDate: Date): Promise<boolean> {
    return false
  }

  async fetchAll(artistUrlId: ObjectId): Promise<boolean> {
    return false
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
    return null
  }
}

export default PatreonAggregator