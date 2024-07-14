import puppeteer from "puppeteer"
import Globals from "../Globals"
import ArtistURL from "../ArtistURL"
import E621IqdbChecker from "../E621IqdbChecker"
import { features } from "process"
import Utils from "../Utils"
import Media from "../Media"
import DTextUtils from "../DTextUtils"

const API_BASE_URL = "https://derpibooru.org/api/v1/json"

export type DerpibooruImage = {
  id: number
  description: string
  tags: string[]
  source_urls: string[]
  created_at: string
  representations: {
    full: string
  }
}

export type DerpibooruResponse = {
  total: number
  images: DerpibooruImage[]
  interactions: any[]
}

class DerpiMedia extends Media {
  additionalSources: string[] = []
  additionalTags: string[] = []
  constructor(image: DerpibooruImage) {
    super(image.id.toString(), "", DTextUtils.markdownToDText(image.description), [image.representations.full], new Date(image.created_at))

    this.additionalSources = image.source_urls
    this.additionalTags = image.tags
  }
}

class DerpibooruScraper {
  private static async makeRequest(path, params: Record<string, any>): Promise<any> {
    return new Promise(async (resolve, reject) => {
      let url = new URL(`${API_BASE_URL}/${path}`)

      for (let [key, value] of Object.entries(params)) {
        if (value !== null) url.searchParams.set(key, value)
      }

      Globals.multiIPFetch.queueFetch({
        url: url.toString(),
        method: "GET",
        headers: {
          "User-Agent": "Reverser v1",
          "Cookie": "filter_id=56027;"
        },
        onResolve: async (res: Response) => {
          if (!res.ok) return reject(new Error(await res.text()))

          return resolve(await res.json())
        },
        onReject: reject
      })
    })
  }

  public static async* getMedia(artistUrl: ArtistURL): AsyncGenerator<DerpiMedia, void> {
    let path = `search/images`

    let params: {
      page: number,
      q: string
    } = {
      page: 1,
      q: `artist:${artistUrl.urlIdentifier}`
    }

    while (true) {
      let data = await DerpibooruScraper.makeRequest(path, params) as DerpibooruResponse

      if (data.images.length == 0) break

      for (let image of data.images) {
        yield new DerpiMedia(image)
      }

      if (data.images.length < 15) break
      params.page++
    }
    // console.log("YIELDED ALL")
  }
}

export default DerpibooruScraper