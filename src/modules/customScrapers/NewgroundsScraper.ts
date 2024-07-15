import puppeteer from "puppeteer"
import Globals from "../Globals"
import ArtistURL from "../ArtistURL"
import E621IqdbChecker from "../E621IqdbChecker"
import { features } from "process"
import Utils from "../Utils"
import { PuppetServer } from "../Puppet"
import Media from "../Media"
import { HTMLElement, parse } from "node-html-parser"
import DTextUtils from "../DTextUtils"

const COOKIE_NAME = "vmkIdu5l8m"

class NewgroundsScraper {
  private static fetchNewTokensAt: Date = new Date()
  private static fetchingTokens: boolean = false
  private static cookie: string = ""

  static needsCode: boolean = false
  static puppetServer: PuppetServer | null
  static timeout: NodeJS.Timeout

  static async getCookie(bypassCheck: boolean = false, force: boolean = false): Promise<{ cookie: string }> {
    let browser
    try {
      if (!force) {
        if (new Date() < NewgroundsScraper.fetchNewTokensAt) {
          return { cookie: NewgroundsScraper.cookie }
        }

        let dbTokens = await Globals.db.collection("tokens").findOne({ id: "newgrounds" })
        if (dbTokens && new Date() < dbTokens.fetchNewTokensAt) {
          NewgroundsScraper.cookie = dbTokens.cookie

          return { cookie: NewgroundsScraper.cookie }
        }

        if (!bypassCheck && NewgroundsScraper.fetchingTokens) {
          while (NewgroundsScraper.fetchingTokens) await Utils.wait(1000)
          return { cookie: NewgroundsScraper.cookie }
        }
      }

      if (NewgroundsScraper.timeout) clearTimeout(NewgroundsScraper.timeout)

      NewgroundsScraper.fetchingTokens = true

      NewgroundsScraper.cookie = ""

      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      })

      let page = await browser.newPage()

      await page.goto("https://www.newgrounds.com/passport")

      let usernameInput = await page.waitForSelector("input[name='username']")
      await usernameInput?.type(Globals.config.newgroundsAuth.username, { delay: 100 })

      let passwordInput = await page.waitForSelector("input[name='password']")
      await passwordInput?.type(Globals.config.newgroundsAuth.password, { delay: 100 })

      let login = await page.waitForSelector("button.PassportLoginBtn")
      await login?.click()

      let timeWaited = 0
      do {
        NewgroundsScraper.cookie = ""

        await Utils.wait(500)
        timeWaited += 500
        let cookies = await page.cookies()

        for (let cookie of cookies) {
          if (cookie.name == COOKIE_NAME) {
            NewgroundsScraper.cookie = cookie.value
          }
        }

        if (timeWaited > 2000 && !NewgroundsScraper.needsCode) {
          NewgroundsScraper.needsCode = true
          NewgroundsScraper.puppetServer = new PuppetServer("newgrounds", page)
        }

        if (timeWaited > 120000) {
          break
        }
      } while (!NewgroundsScraper.cookie)

      console.log("GOT NEWGROUNDS COOKIE")

      await browser?.close()
      await NewgroundsScraper.puppetServer?.destroy()

      await Utils.wait(1000)

      if (!NewgroundsScraper.cookie) {
        return await NewgroundsScraper.getCookie(true, force)
      }

      NewgroundsScraper.fetchNewTokensAt = new Date(Date.now() + 1209600000)
      await Globals.db.collection("tokens").updateOne({ id: "newgrounds" }, { $set: { cookie: NewgroundsScraper.cookie, fetchNewTokensAt: NewgroundsScraper.fetchNewTokensAt } }, { upsert: true })

      NewgroundsScraper.timeout = setTimeout(() => {
        NewgroundsScraper.getCookie(true, true)
      }, 1209600000)

      NewgroundsScraper.fetchingTokens = false

      return { cookie: NewgroundsScraper.cookie }
    } catch (e) {
      console.error("ERROR GETTING NEWGROUNDS COOKIE")
      console.error(e)
      return await NewgroundsScraper.getCookie(true, force)
    } finally {
      await browser?.close()
      await NewgroundsScraper.puppetServer?.destroy()
    }
  }

  private static async getHeaders() {
    let { cookie } = await NewgroundsScraper.getCookie()
    let headers = {
      "Cookie": `${COOKIE_NAME}=${cookie}`,
    }

    return headers
  }

  private static async makeRequest(url: string, headers: Record<string, string> = {}): Promise<Response> {
    return new Promise(async (resolve, reject) => {
      Globals.multiIPFetch.queueFetch({
        url: url.toString(),
        method: "GET",
        headers: {
          ...headers,
          ...(await NewgroundsScraper.getHeaders())
        },
        onResolve: async (res: Response) => {
          // resolve("")
          if (res.status == 401) {
            console.error("NEWGROUNDS 401, RETRYING!")
            await NewgroundsScraper.getCookie(true, true)
            try {
              resolve(await NewgroundsScraper.makeRequest(url, headers))
            } catch(e) {
              reject(e)
            }

            return
          }

          if (!res.ok) return reject({ code: res.status, error: new Error(await res.text()) })

          return resolve(res)
        },
        onReject: reject
      })
    })
  }

  static async getApiIdentifier(urlIdentifier: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      try {
        Globals.multiIPFetch.queueFetch({
          url: `https://${urlIdentifier}.newgrounds.com`,
          method: "GET",
          onResolve: async (res: Response) => {
            let html = parse(await res.text())
            let id = html.querySelector("#topsearch-elastic input[name='u']")?.getAttribute("value")
            return resolve(id ? id : null)
          },
          onReject: reject
        })
      } catch (e) {
        console.error("ERROR GETTING NEWGROUNDS API IDENTIFIER")
        console.error(e)
        return null
      }
    })
  }

  private static async getSubmissionUrls(urlIdentifier: string, page: number): Promise<string[] | null> {
    try {
      let res = await this.makeRequest(`https://${urlIdentifier}.newgrounds.com/art/page/${page}`, {
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json"
      })

      let data = await res.json() as any

      // empty
      if (Array.isArray(data.items)) {
        return null
      }

      return Object.keys(data.items).map(year => data.items[year]).flat().map(html => parse(html).querySelector("a")?.getAttribute("href") as string)
    } catch (e) {
      console.error(`ERROR GETTING NEWGROUNDS SUBMISSION URLS FOR ${urlIdentifier}`)
      console.error(e)
      return null
    }
  }

  private static async getSubmission(url: string, retries: number = 0): Promise<Media | null> {
    if (retries >= 3) return null
    try {
      let res = await this.makeRequest(url)
      let text = await res.text()
      let html = parse(text)
      let mediaObject = html.querySelector("[itemtype='https://schema.org/MediaObject']")?.parentNode as HTMLElement
      let urls: string[] = []

      let image: HTMLElement | undefined | null
      if ((image = mediaObject.querySelector(".medium_image")) != null) {
        urls.push(image.getAttribute("href") as string)
      }

      for (let element of mediaObject.querySelectorAll("[data-action='view-image'][href]")) {
        urls.push(element.getAttribute("href") as string)
      }

      let imageData = /imageData = (\[[\s\S]*\]);/m.exec(text)

      if (imageData) {
        urls.push(...JSON.parse(imageData[1]).map(e => e.image))
      }

      for (let element of mediaObject.querySelectorAll("#author_comments img[data-smartload-src]")) {
        urls.push(element.getAttribute("data-smartload-src") as string)
      }

      return new Media(url.slice(url.lastIndexOf("/") + 1), mediaObject.querySelector("[itemprop='name']")?.innerText ?? "", DTextUtils.htmlToDText(mediaObject.querySelector("#author_comments")), urls, new Date(mediaObject.querySelector("[itemprop='datePublished']")?.getAttribute("content") as string))
    } catch (e) {
      console.error(`ERROR GETTING NEWGROUNDS SUBMISSION: ${url}`)
      console.error(e)
      return await NewgroundsScraper.getSubmission(url, retries++)
    }
  }

  static async* getMedia(artistUrl: ArtistURL): AsyncGenerator<Media, void> {
    let page = 1

    while (true) {
      let submissionUrls = await this.getSubmissionUrls(artistUrl.urlIdentifier, page++)

      if (!submissionUrls) break

      for (let submissionUrl of submissionUrls) {
        let media = await this.getSubmission(submissionUrl)

        if (!media) continue
        yield media
      }
    }
  }
}

export default NewgroundsScraper