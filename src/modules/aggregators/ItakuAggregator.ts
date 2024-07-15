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

class ItakuAggregator implements Aggregator {
  index: number = 46
  manager: AggregationManager

  host: string = "itaku"
  displayName: string = "Itaku"
  homepage: string = "https://itaku.ee"

  galleryTemplates: RegExp[] = [
    `itaku\\.ee\\/profile\\/${Globals.siteArtistIdentifier}`,
    `itaku\\.ee\\/profile\\/${Globals.siteArtistIdentifier}/gallery`
  ].map(r => new RegExp(`${Globals.prefix}${r}\\/?${Globals.remaining}\\??${Globals.remaining}#?${Globals.remaining}`))

  usernameIdentifierRegex: RegExp = /[a-zA-Z0-9_-]{3,25}/

  submissionTemplate: string = "https://itaku.ee/images/{siteSubmissionIdentifier}"

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
      let url = `https://itaku.ee/api/galleries/images/?owner=${artistUrl.apiIdentifier}&ordering=-date_added&page=1&page_size=100&date_range=&maturity_rating=SFW&maturity_rating=Questionable&maturity_rating=NSFW&visibility=PUBLIC&visibility=PROFILE_ONLY&visibility=UNLISTED&format=json`

      let fullBreak = false
      do {
        let res = await fetch(url)

        if (!res.ok) {
          console.error(`Itaku Error with (${res.status}): ${url} (${artistUrl._id})`)
          break
        }

        let data = await res.json() as any

        if (!data.results || data.results.length == 0) break

        for (let d of data.results) {
          let date = new Date(d.date_added)
          if (date < latestDate) {
            fullBreak = true
            break
          }

          let res = await fetch(`https://itaku.ee/api/galleries/images/${d.id}?format=json`)

          let data = await res.json() as any

          let url = data.video ? data.video.video : data.image
          let p = ImageDownloader.queueDownload(url)

          p.then(async (id) => {
            if (id) {
              let imageData = { ...id, source: this.submissionTemplate.replace("{siteArtistIdentifier}", artistUrl.urlIdentifier).replace("{siteSubmissionIdentifier}", data.id.toString()), offsiteId: `${data.id}_0` }
              let prom = Submission.create(artistUrl._id, imageData.offsiteId, imageData.source, imageData.md5, data.title, data.description, date, imageData.width, imageData.height, imageData.fileSize, url, imageData.extension)
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

        if (fullBreak) break

        url = data?.links?.next
      } while (url)

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
    try {
      let res = await fetch(`https://itaku.ee/api/user_profiles/${urlIdentifier}/?format=json`)
      let json = await res.json() as any
      return json.owner.toString()
    } catch (e) {
      console.error("Error fetching itaku api identifier")
      console.error(e)
      return null
    }
  }
}

export default ItakuAggregator