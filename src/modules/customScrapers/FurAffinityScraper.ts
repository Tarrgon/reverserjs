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

const removePrefix = (value, prefix) =>
  value.startsWith(prefix) ? value.slice(prefix.length) : value

export class FurAffinityMedia extends Media {
  private static parseTime(document: any): Date {
    let stamp = document.querySelector(".submission-id-container .popup_date")
    // There will always be a comma in full dates
    if (stamp.innerText.includes(",")) {
      return new Date(stamp.innerText)
    } else {
      return new Date(stamp.getAttribute("title"))
    }
  }

  constructor(id: string, document: HTMLElement) {
    let url: string = document.querySelector(".download a")?.getAttribute("href") as string
    if (url.startsWith("//")) url = url.replace(/^\/\//, "https://")
    super(id, document.querySelector(".submission-title")?.innerText ?? "",
      DTextUtils.htmlToDText(document.querySelector(".submission-description")), [url],
      FurAffinityMedia.parseTime(document))
  }
}

class FurAffinityScraper {
  private static fetchNewTokensAt: Date = new Date()
  private static fetchingTokens: boolean = false
  static needCaptchaDone: boolean = false
  static puppetServer: PuppetServer | null
  private static cookieA: string = ""
  private static cookieB: string = ""

  private static getRandomUserAgent(): string {
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.${~~(Math.random() * 9999)} Safari/537.${~~(Math.random() * 99)}`
  }

  static async getTokens(bypassCheck: boolean = false): Promise<{ cookieA: string, cookieB: string }> {
    try {
      if (new Date() < FurAffinityScraper.fetchNewTokensAt) {
        return { cookieA: FurAffinityScraper.cookieA, cookieB: FurAffinityScraper.cookieB }
      }

      let dbTokens = await Globals.db.collection("tokens").findOne({ id: "furaffinity" })
      if (dbTokens && new Date() < dbTokens.fetchNewTokensAt) {
        FurAffinityScraper.cookieA = dbTokens.cookieA
        FurAffinityScraper.cookieB = dbTokens.cookieB

        return { cookieA: FurAffinityScraper.cookieA, cookieB: FurAffinityScraper.cookieB }
      }

      if (!bypassCheck && FurAffinityScraper.fetchingTokens) {
        while (FurAffinityScraper.fetchingTokens) await Utils.wait(1000)
        return { cookieA: FurAffinityScraper.cookieA, cookieB: FurAffinityScraper.cookieB }
      }

      console.log("GETTING FA TOKENS")

      FurAffinityScraper.fetchingTokens = true

      FurAffinityScraper.cookieA = ""
      FurAffinityScraper.cookieB = ""

      let browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      })

      let page = await browser.newPage()

      FurAffinityScraper.puppetServer = new PuppetServer("furaffinity", page)

      await page.goto("https://www.furaffinity.net/login")

      let usernameInput = await page.waitForSelector("#login-form input[name='name']")
      await usernameInput?.type(Globals.config.furAffinityAuth.username, { delay: 100 })

      let passwordInput = await page.waitForSelector("#login-form input[name='pass']")
      await passwordInput?.type(Globals.config.furAffinityAuth.password, { delay: 100 })

      let login = await page.waitForSelector("#login-button")
      await login?.click()

      FurAffinityScraper.needCaptchaDone = true
      let timeWaited = 0
      do {
        FurAffinityScraper.cookieA = ""
        FurAffinityScraper.cookieB = ""

        await Utils.wait(500)
        timeWaited += 500
        let cookies = await page.cookies()

        for (let cookie of cookies) {
          if (cookie.name == "a") {
            FurAffinityScraper.cookieA = cookie.value
          } else if (cookie.name == "b") {
            FurAffinityScraper.cookieB = cookie.value
          }
        }

        if (timeWaited > 120000) {
          break
        }
      } while (!FurAffinityScraper.cookieA || !FurAffinityScraper.cookieB)

      console.log("GOT FA TOKENS")

      FurAffinityScraper.needCaptchaDone = false

      await FurAffinityScraper.puppetServer.destroy()
      await Utils.wait(1000)
      await browser.close()

      FurAffinityScraper.puppetServer = null

      if (!FurAffinityScraper.cookieA || !FurAffinityScraper.cookieB) {
        return await FurAffinityScraper.getTokens(true)
      }

      FurAffinityScraper.fetchNewTokensAt = new Date(Date.now() + 1209600000)
      await Globals.db.collection("tokens").updateOne({ id: "furaffinity" }, { $set: { cookieA: FurAffinityScraper.cookieA, cookieB: FurAffinityScraper.cookieB, fetchNewTokensAt: FurAffinityScraper.fetchNewTokensAt } }, { upsert: true })

      setTimeout(() => {
        FurAffinityScraper.getTokens()
      }, 1209600000)

      FurAffinityScraper.fetchingTokens = false

      return { cookieA: FurAffinityScraper.cookieA, cookieB: FurAffinityScraper.cookieB }
    } catch (e) {
      console.error("ERROR GETTING FA TOKENS")
      console.error(e)
      return await FurAffinityScraper.getTokens(true)
    }
  }

  private static async getHeaders(hasFormData: boolean = false) {
    let { cookieA, cookieB } = await FurAffinityScraper.getTokens()
    let headers = {
      "User-Agent": FurAffinityScraper.getRandomUserAgent(),
      "Cookie": `a=${cookieA}; b=${cookieB}`,
    }

    if (hasFormData) headers["Content-Type"] = "application/x-www-form-urlencoded"

    return headers
  }

  private static async makeRequest(url: string, method: "POST" | "GET", form: FormData | null = null): Promise<any> {
    let data: string | null = form ? (new URLSearchParams(form as any)).toString() : null
    form = null
    return new Promise(async (resolve, reject) => {
      Globals.multiIPFetch.queueFetch({
        url: url.toString(),
        method: method,
        body: data,
        headers: await FurAffinityScraper.getHeaders(data != null),
        onResolve: async (res: Response) => {
          // resolve("")
          if (!res.ok) {
            console.log(res.headers)
            return reject(new Error(await res.text()))
          }

          return resolve(await res.text())
        },
        onReject: reject
      })
    })
  }

  private static async getSubmissionIds(apiIdentifier: string, page: number): Promise<string[]> {
    let form: FormData | null = new FormData()

    form.set("page", page)
    form.set("q", `@lower ${removePrefix(apiIdentifier.replaceAll("~", "-"), "-")}`)
    form.set("order-by", "date")
    form.set("order-direction", "desc")
    form.set("range", "all")
    form.set("rating-general", "on")
    form.set("rating-mature", "on")
    form.set("rating-adult", "on")
    form.set("type-art", "on")
    form.set("mode", "extended")

    try {
      let html = await FurAffinityScraper.makeRequest("https://www.furaffinity.net/search", "POST", form)
      form = null
      let root: HTMLElement | null = parse(html)

      let relevant = Array.from(root.querySelectorAll("#browse-search figure")).filter((e: any) => {
        return (Array.from(e.querySelectorAll("figcaption a"))[1] as any)?.textContent?.toLowerCase()?.replaceAll("_", "") == apiIdentifier.toLowerCase()
      })

      let ids = relevant.map((e: any) => e.getAttribute("id").split("-")[1]) as string[]

      return ids
    } catch (e) {
      console.error("ERROR IN FA SCRAPER")
      console.error(e)
      throw e
    }
  }

  static async* getMedia(apiIdentifier: string): AsyncGenerator<Media, void> {
    let page = 1

    while (true) {
      let ids = await FurAffinityScraper.getSubmissionIds(apiIdentifier, page++)

      if (ids.length == 0) {
        console.log("BREAK, NO IDS LEFT")
        break
      }

      for (let id of ids) {
        try {
          let html = await FurAffinityScraper.makeRequest(`https://www.furaffinity.net/view/${id}`, "GET")
          // console.log(html)
          let root: HTMLElement | null = parse(html)

          if (root.querySelector(".submission-area.submission-writing")) {
            console.log("CONTINUE, FA TEXT SUBMISSION")
            continue
          }

          yield new FurAffinityMedia(id, root)
          // root = null
        } catch (e) {
          console.error(`ERROR MAKING FA REQUEST TO: https://www.furaffinity.net/view/${id}`)
          console.error(e)
        }
      }
    }
  }
}

export default FurAffinityScraper