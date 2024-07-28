import puppeteer from "puppeteer"
import Globals from "../Globals"
import ArtistURL from "../ArtistURL"
import E621IqdbChecker from "../E621IqdbChecker"
import { features } from "process"
import Utils from "../Utils"
import Media from "../Media"
import { PuppetServer } from "../Puppet"
import { HTMLElement } from "node-html-parser"
import DTextUtils from "../DTextUtils"

export class Attack extends Media {
  constructor(id: string, html: HTMLElement) {
    let date: Date

    for (let node of html.querySelector(".profile-header-normal-status")!.childNodes) {
      if (node.innerText?.includes("On:")) {
        date = new Date(node.innerText.slice(4))
        break
      }
    }

    let a = Array.from(html.querySelectorAll("a[href^='https://images.artfight.net/attack']")).find(a => a.innerText == "Full view") as HTMLElement

    super(id, html.querySelector(".h2.profile-header-name u")!.innerText, DTextUtils.htmlToDText(html.querySelector("#attack-content > .clearfix")), [a.getAttribute("href")!.split("?")[0]], date!)
  }
}

class ArtFightScraper {
  private static fetchNewTokensAt: Date = new Date()
  private static fetchingTokens: boolean = false
  private static sessionToken: string = ""

  static async getToken(bypassCheck: boolean = false): Promise<string> {
    let browser
    try {
      if (new Date() < ArtFightScraper.fetchNewTokensAt) {
        return ArtFightScraper.sessionToken
      }

      if (!bypassCheck && ArtFightScraper.fetchingTokens) {
        while (ArtFightScraper.fetchingTokens) await Utils.wait(1000)
        return ArtFightScraper.sessionToken
      }

      ArtFightScraper.fetchingTokens = true

      ArtFightScraper.sessionToken = ""

      browser = await puppeteer.launch({
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      })

      let page = await browser.newPage()

      await page.goto("https://artfight.net/login")

      // let server = new PuppetServer("artfight", page)

      let usernameInput = await page.waitForSelector("input[name='username']", { timeout: 15000 })
      await usernameInput?.type(Globals.config.artFightAuth.username, { delay: 100 })

      let passwordInput = await page.waitForSelector("input[name='password']")
      await passwordInput?.type(Globals.config.artFightAuth.password, { delay: 100 })

      let remember = await page.waitForSelector("input[name='remember']", { delay: 100 })
      remember?.click()

      let login = await page.waitForSelector("input[value='Sign in']")
      await login?.click()

      do {
        ArtFightScraper.sessionToken = ""

        await Utils.wait(500)
        let cookies = await page.cookies()

        for (let cookie of cookies) {
          if (cookie.name == "laravel_session") {
            ArtFightScraper.sessionToken = cookie.value
            break
          }
        }
      } while (!ArtFightScraper.sessionToken)

      // await server.destroy()
      await browser.close()

      if (ArtFightScraper.sessionToken == "") {
        return await ArtFightScraper.getToken(true)
      }

      console.log("GOT ARTFIGHT TOKENS")

      ArtFightScraper.fetchNewTokensAt = new Date(Date.now() + 3300000)

      setTimeout(() => {
        ArtFightScraper.getToken()
      }, 3300000)

      ArtFightScraper.fetchingTokens = false

      return ArtFightScraper.sessionToken
    } catch (e) {
      await browser.close()
      console.error("RETRYING ARTFIGHT AUTH")
      console.error(e)
      return await ArtFightScraper.getToken(true)
    }
  }

  private static async getHeaders() {
    let sessionToken = await ArtFightScraper.getToken()
    return {
      "Cookie": `laravel_session=${sessionToken}`,
    }
  }

  private static async makeRequest(path: string, params: Record<string, any> = {}): Promise<HTMLElement> {
    return new Promise(async (resolve, reject) => {
      let url = new URL(`https://artfight.net/${path}`)

      for (let [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value.toString())
      }

      Globals.multiIPFetch.queueFetch({
        url: url.toString(),
        method: "GET",
        headers: await ArtFightScraper.getHeaders(),
        onResolve: async (res: Response) => {
          if (!res.ok) {
            console.error(`Error with ${url.toString()}`)
            return reject(new Error(await res.text()))
          }

          return resolve(Utils.getHtmlElement(await res.text()))
        },
        onReject: reject
      })
    })
  }

  static async getApiIdentifier(urlIdentifier: string): Promise<string | null> {
    try {
      let html = await ArtFightScraper.makeRequest(`~${urlIdentifier}`)
      return html.querySelector(".btn.btn-danger.report-button")!.getAttribute("data-id")!
    } catch (e) {
      console.error("ERROR IN ARTFIGHT SCRAPER")
      console.error(e)
      return null
    }
  }

  static async getAttack(attackId: string): Promise<Attack> {
    let html = await ArtFightScraper.makeRequest(`attack/${attackId}`)

    return new Attack(attackId, html)
  }

  static async* getMedia(artistUrl: ArtistURL): AsyncGenerator<Media, void> {
    let page = 1

    while (true) {
      let html = await ArtFightScraper.makeRequest(`~${artistUrl.urlIdentifier}/attacks`, { page })
      let attacks = Array.from(html.querySelectorAll(".profile-attacks-body a")).map(e => e.getAttribute("data-id")!)

      if (attacks.length == 0) break

      for (let attackId of attacks) {
        yield await ArtFightScraper.getAttack(attackId)
      }

      page++
    }
  }
}

export default ArtFightScraper