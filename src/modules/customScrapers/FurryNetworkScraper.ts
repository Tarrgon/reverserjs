import puppeteer from "puppeteer"
import Globals from "../Globals"
import ArtistURL from "../ArtistURL"
import E621IqdbChecker from "../E621IqdbChecker"
import { features } from "process"
import Utils from "../Utils"
import Media from "../Media"
import { parse } from "node-html-parser"
import DTextUtils from "../DTextUtils"

const BASE_URL = "https://furrynetwork.com/api"

export type FurryNetworkArtwork = {
  id: number
  character_id: number
  title: string
  description: string
  published?: string
  created: string
  images: {
    original: string
  }
}

class FurryNetworkScraper {
  private static async makeRequest(path, params: Record<string, any> = {}): Promise<Response> {
    return new Promise(async (resolve, reject) => {
      let url = new URL(`${BASE_URL}/${path}`)

      for (let [key, value] of Object.entries(params)) {
        if (value !== null) url.searchParams.set(key, value)
      }

      Globals.multiIPFetch.queueFetch({
        url: url.toString(),
        method: "GET",
        onResolve: async (res: Response) => {
          if (!res.ok) return reject(new Error(await res.text()))

          return resolve(res)
        },
        onReject: reject
      })
    })
  }

  public static async* getMedia(artistUrl: ArtistURL): AsyncGenerator<Media, void> {
    let path = `character/${artistUrl.urlIdentifier}/artwork`

    // This returns everything because FN's api is stupid.
    let res = await FurryNetworkScraper.makeRequest(path)
    let json = await res.json() as FurryNetworkArtwork[]

    json.sort((a, b) => new Date(b.published ?? b.created).getTime() - new Date(a.published ?? a.created).getTime())

    for (let post of json) {
      yield new Media(post.id.toString(), post.title, DTextUtils.markdownToDText(post.description), [post.images.original], new Date(post.created))
    }
  }

  public static async getApiIdentifier(urlIdentifier: string): Promise<string> {
    let path = `character/${urlIdentifier}`

    let res = await FurryNetworkScraper.makeRequest(path)
    try {
      let data = await res.json() as any
      return data.id
    } catch (e) {
      let path = `character/${urlIdentifier}/artwork`

      let res = await FurryNetworkScraper.makeRequest(path)
      let json = await res.json() as FurryNetworkArtwork[]

      return json[0]?.character_id?.toString() ?? ""
    }
  }
}

export default FurryNetworkScraper