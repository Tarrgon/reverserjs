import puppeteer from "puppeteer"
import Globals from "../Globals"
import ArtistURL from "../ArtistURL"
import E621IqdbChecker from "../E621IqdbChecker"
import { features } from "process"
import Utils from "../Utils"
import Media from "../Media"
import { parse } from "node-html-parser"
import DTextUtils from "../DTextUtils"

const BASE_URL = "https://ptvintern.picarto.tv/api"
const GALLERY_URL = "https://images.picarto.tv/gallery"

export class PicartoArtwork extends Media {
  tags: string[]
  album: string

  constructor(item: any) {
    super(item.id, item.title, item.description, [`${GALLERY_URL}/${item.default_image.name}`], new Date(item.created_at))
    this.tags = item.tags || []
    this.album = item.album_name || "default"
  }
}

class PicatroScraper {
  private static async makeRequest(path, params: Record<string, any> = {}): Promise<any> {
    return new Promise(async (resolve, reject) => {
      let url = new URL(`${BASE_URL}/${path}`)

      for (let [key, value] of Object.entries(params)) {
        if (value !== null) url.searchParams.set(key, value)
      }

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

  public static async* getMedia(artistUrl: ArtistURL): AsyncGenerator<PicartoArtwork, void> {
    let page = 1
    while (true) {
      let data = await PicatroScraper.makeRequest("channel-gallery", {
        first: 100,
        page,
        "filter_params[channel_name]": artistUrl.urlIdentifier,
        "order_by[field]": "created_at",
        "order_by[order]": "DESC"
      })

      if (data.length == 0) return

      for (let post of data) {
        yield new PicartoArtwork(post)
      }

      page++
    }
  }

  public static async getApiIdentifier(urlIdentifier: string): Promise<string> {
    try {
      let data = await PicatroScraper.makeRequest(`channel/detail/${urlIdentifier}`)
      return data.channel.id.toString()
    } catch (e) {
      console.error(e)
      return ""
    }
  }
}

export default PicatroScraper