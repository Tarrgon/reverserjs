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

  static puppetServer: PuppetServer
  static needCaptchaDone: boolean = false

  static forcingNewToken: boolean = false
  static async forceNewToken() {
    if (DeviantArtScraper.forcingNewToken) {
      while (DeviantArtScraper.forcingNewToken) await Utils.wait(1000)
      return
    }

    DeviantArtScraper.forcingNewToken = true
    await DeviantArtScraper.getAccessToken(true, true)
    DeviantArtScraper.forcingNewToken = false
  }

  static getAccessToken(bypassCheck: boolean = false, force: boolean = false): Promise<string> {
    return new Promise(async (resolve) => resolve(""))

    return new Promise(async (resolve) => {
      let browser
      try {
        if (!force) {
          if (new Date() < DeviantArtScraper.fetchNewTokensAt) {
            return resolve(DeviantArtScraper.accessToken)
          }

          if (!bypassCheck && DeviantArtScraper.fetchingTokens) {
            while (DeviantArtScraper.fetchingTokens) await Utils.wait(1000)
            return resolve(DeviantArtScraper.accessToken)
          }

          if (DeviantArtScraper.forcingNewToken) {
            while (DeviantArtScraper.forcingNewToken) await Utils.wait(1000)
            return resolve(DeviantArtScraper.accessToken)
          }
        }

        DeviantArtScraper.fetchingTokens = true

        DeviantArtScraper.accessToken = ""

        puppeteer.use(StealthPlugin())

        browser = await puppeteer.launch({
          args: ["--no-sandbox", "--disable-setuid-sandbox"]
        })

        let page = await browser.newPage()

        let url = new URL("https://www.deviantart.com/oauth2/authorize?")
        url.searchParams.set("response_type", "code")
        url.searchParams.set("client_id", Globals.config.deviantArtAuth.clientId)
        url.searchParams.set("redirect_uri", "http://localhost")
        url.searchParams.set("scope", "browse")

        await page.goto(url.toString())

        let button = await page.waitForSelector("::-p-xpath(//*[text()='Log In'])")
        await Utils.wait(Math.random() * 2000)
        await button?.click()

        let usernameInput = await page.waitForSelector("#username", { timeout: 15000 })
        await Utils.wait(Math.random() * 2000)
        await usernameInput?.type(Globals.config.deviantArtAuth.username, { delay: 50 })

        button = await page.waitForSelector("#loginbutton")
        await Utils.wait(Math.random() * 2000)
        await button?.click()

        let passwordInput = await page.waitForSelector("#password")
        await Utils.wait(Math.random() * 2000)
        await passwordInput?.type(Globals.config.deviantArtAuth.password, { delay: 50 })

        button = await page.waitForSelector("#loginbutton")

        let done = false

        page.on("request", async (request) => {
          if (done) return
          if (request.url().startsWith("http://localhost")) {
            done = true
            let code = new URL(request.url()).searchParams.get("code")
            let u = new URL("https://www.deviantart.com/oauth2/token")
            u.searchParams.set("client_id", Globals.config.deviantArtAuth.clientId)
            u.searchParams.set("client_secret", Globals.config.deviantArtAuth.clientSecret)
            u.searchParams.set("grant_type", "authorization_code")
            u.searchParams.set("code", code as string)
            u.searchParams.set("redirect_uri", "http://localhost")
            try {
              let res = await fetch(u.toString())
              let data = await res.json() as any

              if (data.access_token) {
                console.log("GOT DEVIANT ART ACCESS TOKEN")
                DeviantArtScraper.accessToken = data.access_token
                return resolve(DeviantArtScraper.accessToken)
              } else {
                console.error("ACCESS TOKEN NOT PRESENT DEVIANTART IN REPONSE!")
                console.error(data)
                return resolve(await DeviantArtScraper.getAccessToken(true))
              }
            } catch (e) {
              console.error("ERROR WITH DEVIANT ART ACCESS TOKEN FETCH!")
              console.error(e)
              return resolve(await DeviantArtScraper.getAccessToken(true))
            }
          }
        })

        await Utils.wait(Math.random() * 2000)
        await button?.click()

        await Utils.wait(3000)

        if (!done) {
          // DeviantArtScraper.puppetServer = new PuppetServer("deviantart", page)
          // DeviantArtScraper.needCaptchaDone = true
          let timeWaited = 0
          while (!done) {
            await Utils.wait(1000)
            timeWaited += 1000
            if (timeWaited > 10000) {
              break
            }
          }

          // DeviantArtScraper.needCaptchaDone = false
          // await DeviantArtScraper.puppetServer.destroy()
        }

        if (!done) {
          await browser.close()
          console.error("RETRYING DEVIANT ART AUTH, TIMEOUT")
          return resolve(await DeviantArtScraper.getAccessToken(true))
        }
        DeviantArtScraper.fetchNewTokensAt = new Date(Date.now() + 3300000)

        setTimeout(() => {
          DeviantArtScraper.getAccessToken()
        }, 3300000)

        DeviantArtScraper.fetchingTokens = false

        await Utils.wait(1000)
        await browser.close()
      } catch (e) {
        await browser.close()
        // await DeviantArtScraper.puppetServer?.destroy()
        console.error("RETRYING DEVIANT ART AUTH")
        console.error(e)
        return resolve(await DeviantArtScraper.getAccessToken(true))
      }
    })
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
    return new Promise(async (resolve, reject) => {
      let url = new URL(`${API_BASE_URL}/${path}`)

      let accessToken = await DeviantArtScraper.getAccessToken()

      while (accessToken == "") {
        console.error("ACCESS TOKEN IS EMPTY")
        await DeviantArtScraper.forceNewToken()
        accessToken = await DeviantArtScraper.getAccessToken()
      }

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
    return ""

    let json = await new Promise((resolve, reject) => {
      DeviantArtScraper.queueRequest(`deviation/download/${id}`, {}, priority, resolve, reject)
    }) as any

    return json.src
  }

  static async getApiIdentifier(urlIdentifier: string): Promise<string | null> {
    return null

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
    return
    
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