import puppeteer from "puppeteer-extra"
import Globals from "../Globals"
import ArtistURL from "../ArtistURL"
import E621IqdbChecker from "../E621IqdbChecker"
import { features } from "process"
import Utils from "../Utils"
import { PuppetServer } from "../Puppet"
import Media from "../Media"
import { HTMLElement, parse } from "node-html-parser"
import DTextUtils from "../DTextUtils"

const StealthPlugin = require("puppeteer-extra-plugin-stealth")
puppeteer.use(StealthPlugin())

function isValidDate(d) {
  return d instanceof Date && !isNaN(d as any)
}

export class ToyHouseMedia extends Media {
  constructor(html: HTMLElement) {
    let id = html.querySelector("[data-id]")!.getAttribute("data-id") as string
    let date = Array.from(html.querySelector(".image-credits")!.childNodes).map((a: any) => new Date(a.innerText)).filter(d => isValidDate(d))[0]
    let description = DTextUtils.htmlToDText(html.querySelector(".image-description.user-content"))
    let url = html.querySelector("a.img-thumbnail")!.getAttribute("href") as string

    super(id, "", description, [url], date)
  }
}

class ToyHouseScraper {
  private static fetchNewTokenAt: Date = new Date()
  private static fetchingToken: boolean = false
  private static laravelSession: string = ""

  static async getToken(bypassCheck: boolean = false): Promise<string> {
    try {
      if (new Date() < ToyHouseScraper.fetchNewTokenAt) {
        return this.laravelSession
      }

      let dbTokens = await Globals.db.collection("tokens").findOne({ id: "toyhouse" })
      if (dbTokens && new Date() < dbTokens.fetchNewTokenAt) {
        ToyHouseScraper.laravelSession = dbTokens.laravelSession

        return ToyHouseScraper.laravelSession
      }

      if (!bypassCheck && ToyHouseScraper.fetchingToken) {
        while (ToyHouseScraper.fetchingToken) await Utils.wait(1000)
        return ToyHouseScraper.laravelSession
      }

      console.log("GETTING TOYHOUSE SESSION")

      ToyHouseScraper.fetchingToken = true

      ToyHouseScraper.laravelSession = ""

      let browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      })

      let page = await browser.newPage()

      new PuppetServer("toyhouse", page)

      await page.goto("https://toyhou.se/~account/login")

      await Utils.wait(10000)

      let usernameInput = await page.waitForSelector("#username")
      await usernameInput?.type(Globals.config.toyhouseAuth.username, { delay: 100 })

      let passwordInput = await page.waitForSelector("#password")
      await passwordInput?.type(Globals.config.toyhouseAuth.password, { delay: 100 })

      let login = await page.waitForSelector("#login-btn")
      await login?.click()
      let timeWaited = 0

      await Utils.wait(1000)
      await page.waitForNetworkIdle({ idleTime: 1000 })

      do {
        ToyHouseScraper.laravelSession = ""

        await Utils.wait(500)
        timeWaited += 500
        let cookies = await page.cookies()

        for (let cookie of cookies) {
          if (cookie.name == "laravel_session") {
            ToyHouseScraper.laravelSession = cookie.value
            break
          }
        }

        if (timeWaited > 10000) {
          break
        }
      } while (!ToyHouseScraper.laravelSession)

      console.log("GOT TOYHOUSE TOKEN")

      await Utils.wait(500)
      await browser.close()

      if (!ToyHouseScraper.laravelSession) {
        return await ToyHouseScraper.getToken(true)
      }

      ToyHouseScraper.fetchNewTokenAt = new Date(Date.now() + 3600000)
      await Globals.db.collection("tokens").updateOne({ id: "toyhouse" }, { $set: { laravelSession: this.laravelSession, fetchNewTokenAt: ToyHouseScraper.fetchNewTokenAt } }, { upsert: true })

      setTimeout(() => {
        ToyHouseScraper.getToken()
      }, 3600050)

      ToyHouseScraper.fetchingToken = false

      return ToyHouseScraper.laravelSession
    } catch (e) {
      console.error("ERROR GETTING TOYHOUSE TOKEN")
      console.error(e)
      return await ToyHouseScraper.getToken(true)
    }
  }

  private static async getHeaders() {
    return {
      Cookie: `laravel_session=${await ToyHouseScraper.getToken()}`
    }
  }

  private static async makeRequest(url: string): Promise<any> {
    return new Promise(async (resolve, reject) => {
      let headers = await ToyHouseScraper.getHeaders()
      console.log(headers)
      Globals.multiIPFetch.queueFetch({
        url: url.toString(),
        method: "GET",
        headers,
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

  public static async verifyUrlIdentifier(urlIdentifier: string): Promise<boolean> {
    try {
      let res = await fetch(`https://toyhou.se/${urlIdentifier}/art`)
      return res.ok
    } catch (e) {
      console.error(e)
      return false
    }
  }

  static async* getMedia(apiIdentifier: string): AsyncGenerator<Media, void> {
    let page = 1

    while (true) {
      let html = await ToyHouseScraper.makeRequest(`https://toyhou.se/${apiIdentifier}/art?page=${page++}`)
      console.log(html)
      let root: HTMLElement | null = parse(html)

      let galleryItems = Array.from(root.querySelectorAll(".gallery-item"))

      if (galleryItems.length == 0) {
        console.log("BREAK, NOTHING LEFT")
        break
      }

      for (let item of galleryItems) {
        yield new ToyHouseMedia(item)
      }
    }
  }
}

export default ToyHouseScraper