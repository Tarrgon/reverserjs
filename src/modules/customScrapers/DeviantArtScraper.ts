import puppeteer from "puppeteer-extra"
import StealthPlugin from "puppeteer-extra-plugin-stealth"
import Globals from "../Globals"
import ArtistURL from "../ArtistURL"
import E621IqdbChecker from "../E621IqdbChecker"
import { features } from "process"
import Utils from "../Utils"
import Media from "../Media"
import { PuppetServer } from "../Puppet"
import { sortedIndex } from "../MultiIPFetch"
import { DeviantArtJobData } from "../aggregators/DeviantArtAggregator"
import Job from "../Job"
import { Document, WithId } from "mongodb"

const API_BASE_URL = "https://www.deviantart.com/api/v1/oauth2"

type QueueItem = { path: string, params: Record<string, string>, priority: number, onResolve: (data: any) => void, onReject: (error: any) => void }

class Deviation extends Media {
  deviationId: string
  isDownloadable: boolean
  constructor(deviation) {
    let identifier = /-([0-9]*)$/.exec(deviation.url)?.[1] as string
    let url = !deviation.is_downloadable ? deviation.content.src.replaceAll(/q_\d+(,strp)?/g, "q_100") : ""
    super(identifier, deviation.title, "", deviation.is_downloadable ? [`deviantart_download_${deviation.deviationid}`] : [url], new Date(deviation.published_time * 1000))
    this.deviationId = deviation.deviationid
    this.isDownloadable = deviation.is_downloadable
  }
}

class DeviantArtScraper {
  private static fetchNewTokensAt: Date = new Date()
  private static fetchingTokens: boolean = false
  private static accessToken: string = ""

  static async getAccessToken(force: boolean = false): Promise<string> {
    while (DeviantArtScraper.fetchingTokens) await Utils.wait(1000)

    if (!force && new Date() < DeviantArtScraper.fetchNewTokensAt) {
      return DeviantArtScraper.accessToken
    }

    let dbTokens = await Globals.db.collection("tokens").findOne({ id: "deviantart" }) as WithId<Document>
    if (!force && dbTokens && new Date() < dbTokens.fetchNewTokensAt) {
      DeviantArtScraper.accessToken = dbTokens.accessToken

      return DeviantArtScraper.accessToken
    }

    if (!dbTokens || !dbTokens.refreshToken) {
      console.error("DEVIANT ART REFRESH TOKEN NOT FOUND, CANNOT FETCH DEVIANT ART POSTS")
      return ""
    }

    DeviantArtScraper.fetchingTokens = true
    let refreshToken = dbTokens.refreshToken
    let u = new URL("https://www.deviantart.com/oauth2/token")
    u.searchParams.set("client_id", Globals.config.deviantArtAuth.clientId)
    u.searchParams.set("client_secret", Globals.config.deviantArtAuth.clientSecret)
    u.searchParams.set("grant_type", "refresh_token")
    u.searchParams.set("refresh_token", refreshToken)
    try {
      let res = await fetch(u.toString())
      let data = await res.json() as { access_token: string, expires_in: number, refresh_token: string }
      DeviantArtScraper.fetchNewTokensAt = new Date(Date.now() + (data.expires_in * 1000) - 1000)
      DeviantArtScraper.accessToken = data.access_token

      console.log("GOT DEVIANT ART ACCESS TOKEN!! YAY")

      setTimeout(() => {
        DeviantArtScraper.getAccessToken(true)
      }, (data.expires_in * 1000) - 1500)

      DeviantArtScraper.fetchingTokens = false

      await Globals.db.collection("tokens").updateOne({ id: "deviantart" }, { $set: { accessToken: DeviantArtScraper.accessToken, fetchNewTokensAt: DeviantArtScraper.fetchNewTokensAt, refreshToken: data.refresh_token } })
      return DeviantArtScraper.accessToken
    } catch (e) {
      console.error("ERROR WHILE REFRESHING DEVIANT ART TOKEN")
      console.error(e)
    }

    DeviantArtScraper.fetchingTokens = false

    return ""
  }

  private static currentWait: number = 0
  private static queue: QueueItem[] = []
  private static processingQueue: boolean = false

  private static async processQueue() {
    if (DeviantArtScraper.queue.length == 0) {
      DeviantArtScraper.processingQueue = false
      return
    }

    DeviantArtScraper.processingQueue = true

    let { path, params, priority, onResolve, onReject } = DeviantArtScraper.queue.shift() as QueueItem

    try {
      await DeviantArtScraper.makeRequest(path, params, priority, onResolve, onReject)
    } catch (e) {
      console.error(e)
    }


    if (DeviantArtScraper.currentWait > 0) {
      await Utils.wait(DeviantArtScraper.currentWait * 1000)
    } else {
      await Utils.wait(500)
    }

    DeviantArtScraper.processQueue()
  }

  static queueRequest(path, params: Record<string, any> = {}, priority: number, onResolve: (data: any) => void, onReject: (error: any) => void): void {
    let item = { path, params, priority, onResolve, onReject }
    let index = sortedIndex(DeviantArtScraper.queue, item)
    DeviantArtScraper.queue.splice(index, 0, item)

    if (!DeviantArtScraper.processingQueue) DeviantArtScraper.processQueue()
  }

  private static async makeRequest(path, params: Record<string, any> = {}, priority: number, onResolve: (data: any) => void, onReject: (error: any) => void): Promise<void> {
    // console.log(`Making request to /${path} current wait: ${DeviantArtScraper.currentWait}`)
    return new Promise(async (resolve, reject) => {
      let url = new URL(`${API_BASE_URL}/${path}`)

      let accessToken = await DeviantArtScraper.getAccessToken()
      url.searchParams.set("access_token", accessToken)

      for (let [key, value] of Object.entries(params)) {
        if (value) url.searchParams.set(key, value.toString())
      }

      Globals.multiIPFetch.queueFetch({
        priority,
        url: url.toString(),
        method: "GET",
        headers: {
          "dA-minor-version": "20210526"
        },
        onResolve: async (res: Response) => {
          if (res.status == 429) {
            if (DeviantArtScraper.currentWait > 0) DeviantArtScraper.currentWait *= 2
            else DeviantArtScraper.currentWait = 1

            DeviantArtScraper.queueRequest(path, params, priority + 1, onResolve, onReject)

            return resolve()
          }

          if (!res.ok) {
            let text = await res.text()
            console.error("STUPID FUCKING DEVIANT ART ERROR LETS FUCKING GO")
            console.error(text)
            console.error(url.toString())
            onReject(new Error(text))
            return reject()
          }

          if (DeviantArtScraper.currentWait > 0) DeviantArtScraper.currentWait /= 2
          if (DeviantArtScraper.currentWait < 1) DeviantArtScraper.currentWait = 0

          onResolve(await res.json())

          return resolve()
        },
        onReject: (e) => {
          console.error("STUPID FUCKING DEVIANT ART ERROR LETS FUCKING GO")
          console.error(e)
          console.error(url.toString())
          onReject(e)
          reject()
        }
      })
    })
  }

  static async getDownloadLink(id: string, priority: number = 500): Promise<string> {
    let json = await new Promise((resolve, reject) => {
      DeviantArtScraper.queueRequest(`deviation/download/${id}`, {}, priority, resolve, reject)
    }) as any

    return json.src
  }

  static async getApiIdentifier(urlIdentifier: string): Promise<string | null> {
    try {
      let json = await new Promise((resolve, reject) => {
        DeviantArtScraper.queueRequest(`user/profile/${urlIdentifier}`, {}, 1000, resolve, reject)
      }) as any

      if (json.error_code == 2) return null
      return json.user.userid
    } catch (e) {
      console.error("ERROR GETTING DEVIANT ART API IDENTIFIER")
      console.error(e)
      return null
    }
  }

  static async* getMedia(artistUrl: ArtistURL, job: Job<DeviantArtJobData>): AsyncGenerator<Deviation, void> {
    let offset = job.jobData.startingOffset

    let params = {
      username: artistUrl.urlIdentifier,
      limit: 24,
      mature_content: true,
      offset
    }

    console.log(`DEVIANT ART JOB (${job._id}) STARTING OFFSET: ${offset}`)

    while (true) {
      if (offset) {
        params.offset = offset

        // Since deviantart rate limits suck, we gotta save the state in case of a crash.
        job.jobData.startingOffset = offset
        await job.setJobData(job.jobData)
        console.log(`SET DA JOB (${job._id}) OFFSET TO ${offset}`)
      }

      let json = await new Promise((resolve, reject) => {
        DeviantArtScraper.queueRequest("gallery/all", params, 0, resolve, reject)
      }) as any

      let data = json.results.filter(d => d?.content)

      if (data.length == 0) {
        console.log("BREAK, NO DEVIATIONS")
        break
      }

      offset = json.next_offset

      // console.log("START YIELD")
      for (let deviation of data) {
        yield new Deviation(deviation)
      }

      if (!json.has_more) {
        console.log("BREAK, NO MORE DEVIATIONS")
        break
      }
      // console.log("YIELDED ALL")
    }
  }
}

export default DeviantArtScraper