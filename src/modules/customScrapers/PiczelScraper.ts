import puppeteer from "puppeteer"
import Globals from "../Globals"
import ArtistURL from "../ArtistURL"
import E621IqdbChecker from "../E621IqdbChecker"
import { features } from "process"
import Utils from "../Utils"
import Media from "../Media"
import { parse } from "node-html-parser"
import DTextUtils from "../DTextUtils"

const BASE_URL = "https://piczel.tv/api"

class PiczelScraper {
  private static async makeRequest(path, params: Record<string, any> = {}): Promise<any> {
    return new Promise(async (resolve, reject) => {
      let url = new URL(`${BASE_URL}/${path}`)

      for (let [key, value] of Object.entries(params)) {
        if (value !== null) url.searchParams.set(key, value)
      }

      console.log(url.toString())

      try {
        let res = await fetch(url.toString())
        if (!res.ok) return reject(new Error(await res.text()))

        return resolve(await res.json())
      } catch (e: any) {
        console.error(e)
        reject(e)
      }
    })
  }

  public static async* getMedia(artistUrl: ArtistURL): AsyncGenerator<Media, void> {
    let fromId = null
    while (true) {
      let params: any = {}

      if (fromId) params.from_id = fromId

      let data = await PiczelScraper.makeRequest(`users/${artistUrl.urlIdentifier}/gallery`, params)

      if (data.length == 0) return

      for (let post of data) {
        let urls: string[] = []

        if (post.multi) {
          urls = post.images.map(i => i.image.url)
        } else {
          urls.push(post.image.url)
        }

        yield new Media(post.id.toString(), post.title, post.description, urls, new Date(post.created_at))
      }

      fromId = data[data.length - 1].id
    }
  }
}

export default PiczelScraper