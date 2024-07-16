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
import Job from "../Job"
import { Browser, Page } from "puppeteer"
import DTextUtils from "../DTextUtils"

const BASE_URL = "https://www.artstation.com"
const ALLOWED_ASSET_TYPES: string[] = ["image", "cover"]

class ArtStationScraper {
  private static openingBrowser: boolean = false
  private static browser: Browser

  private static async makeRequest(path): Promise<any> {
    while (ArtStationScraper.openingBrowser) await Utils.wait(1000)

    if (!ArtStationScraper.browser) {
      ArtStationScraper.openingBrowser = true
      puppeteer.use(StealthPlugin())
      ArtStationScraper.browser = await puppeteer.launch({
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      })
      ArtStationScraper.openingBrowser = false
    }

    return new Promise(async (resolve, reject) => {
      let page: Page | null = null
      try {
        page = await ArtStationScraper.browser.newPage()
        await page.goto(`${BASE_URL}/${path}`)
        let pre = await page.waitForSelector("pre", { timeout: 60000 })
        let json = await pre?.evaluate(e => e.innerText)
        return resolve(JSON.parse(json))
      } catch (e) {
        console.log(`Error making request to: ${BASE_URL}/${path}`)
        reject(e)
      } finally {
        await page?.close()
      }
    })
  }

  static async getApiIdentifier(urlIdentifier: string): Promise<string | null> {
    try {
      let json = await ArtStationScraper.makeRequest(`/users/${urlIdentifier}/quick.json`)

      return json.id.toString()
    } catch (e) {
      console.error("ERROR GETTING DEVIANT ART API IDENTIFIER")
      console.error(e)
      return null
    }
  }

  static async* getMedia(artistUrl: ArtistURL): AsyncGenerator<Media, void> {
    let page = 1

    while (true) {
      let json = await ArtStationScraper.makeRequest(`/users/${artistUrl.urlIdentifier}/projects.json?page=${page++}`)

      let ids = json.data.map(d => d.hash_id)

      if (ids.length == 0) break

      for (let id of ids) {
        let details = await ArtStationScraper.makeRequest(`/projects/${id}.json`)
        let assets = details.assets.filter(a => ALLOWED_ASSET_TYPES.includes(a.asset_type))

        let createdAt = new Date(details.updated_at)
        let primaryTitle = Utils.getHtmlElement(details.title)?.innerText ?? ""
        let primaryDescription = DTextUtils.htmlToDText(Utils.getHtmlElement(details.title))

        for (let asset of assets) {
          let assetTitle = asset.title ? Utils.getHtmlElement(asset.title)?.innerText : null
          yield new Media(id.toString(), assetTitle ? assetTitle : primaryTitle, primaryDescription, [asset.image_url], createdAt)
        }
      }
    }
  }
}

export default ArtStationScraper