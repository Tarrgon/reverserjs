import puppeteer from "puppeteer"
import Globals from "../Globals"
import ArtistURL from "../ArtistURL"
import E621IqdbChecker from "../E621IqdbChecker"
import { features } from "process"
import Utils from "../Utils"
import Media from "../Media"
import { parse } from "node-html-parser"

const BASE_URL = "https://www.weasyl.com/api"

class WeasylScraper {
  private static async makeRequest(path, params: Record<string, any> = {}): Promise<Response> {
    return new Promise(async (resolve, reject) => {
      let url = new URL(path)

      for (let [key, value] of Object.entries(params)) {
        if (value !== null) url.searchParams.set(key, value)
      }

      Globals.multiIPFetch.queueFetch({
        url: url.toString(),
        method: "GET",
        headers: {
          "X-Weasyl-API-Key": Globals.config.weasylApiKey
        },
        onResolve: async (res: Response) => {
          if (!res.ok) return reject(new Error(await res.text()))

          return resolve(res)
        },
        onReject: reject
      })
    })
  }

  public static async* getMedia(artistUrl: ArtistURL): AsyncGenerator<Media, void> {
    let path = `${BASE_URL}/users/${artistUrl.urlIdentifier}/gallery`

    let params: {
      count: number,
      nextid?: string,
    } = {
      count: 100
    }

    while (true) {
      let res = await WeasylScraper.makeRequest(path, params)
      let json = await res.json() as any

      for (let post of json.submissions) {
        if (post.subtype != "visual" || !post.media?.submission) continue

        let urls = post.media.submission.map(e => e.url)

        yield new Media(post.submitid.toString(), post.title, "", urls, new Date(post.posted_at))
      }

      if (!json.nextid) break

      params.nextid = json.nextid
    }
  }

  public static async getApiIdentifier(urlIdentifier: string): Promise<string> {
    let path = `https://www.weasyl.com/~${urlIdentifier}`

    let res = await WeasylScraper.makeRequest(path)
    let html = Utils.getHtmlElement(await res.text())

    let shoutboxId = html.querySelector("#user-shouts .comment-form input[name='userid']")?.getAttribute("value")

    let ignoreId = html.querySelector("form[name=ignoreuser] input[name='userid']")?.getAttribute("value")

    return (shoutboxId || ignoreId) ?? ""
  }
}

export default WeasylScraper