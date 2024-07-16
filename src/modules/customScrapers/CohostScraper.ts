import puppeteer from "puppeteer"
import Globals from "../Globals"
import ArtistURL from "../ArtistURL"
import E621IqdbChecker from "../E621IqdbChecker"
import { features } from "process"
import Utils from "../Utils"
import Media from "../Media"
import { parse } from "node-html-parser"

const BASE_URL = "https://cohost.org"

export type CohostAttachment = {
  attachmentId: string
  fileURL: string
}

export type AttachmentBlock = {
  type: "attachment"
  attachment: CohostAttachment
}

export type CohostBlock = {
  type: "attachment" | "markdown"
}

export type CohostPost = {
  postId: number
  headline: string
  publishedAt: string
  filename: string
  blocks: CohostBlock[]
  plainTextBody: string
}

export type PostQueryData = {
  posts: CohostPost[]
}

export type QueryState = {
  data: PostQueryData | any
}

export type CohostQuery = {
  state: QueryState
}

export type CohostDehydrated = {
  mutations: any[]
  queries: CohostQuery[]
}

class CohostScraper {

  // The cookie stays alive for a week unless a request is made using it.
  // This will keep it alive in the event no requests use it.
  static async keepAlive() {
    try {
      await this.makeRequest("", {})
    } catch (e) {
      console.error(e)
    }

    setTimeout(() => {
      this.keepAlive()
    }, 86400000)
  }

  private static async makeRequest(path, params: Record<string, any>): Promise<any> {
    return new Promise(async (resolve, reject) => {
      let url = new URL(`${BASE_URL}/${path}`)

      for (let [key, value] of Object.entries(params)) {
        if (value !== null) url.searchParams.set(key, value)
      }

      Globals.multiIPFetch.queueFetch({
        url: url.toString(),
        method: "GET",
        headers: {
          "Cookie": Globals.config.cohostCookie
        },
        onResolve: async (res: Response) => {
          if (!res.ok) return reject(new Error(await res.text()))

          return resolve(await res.text())
        },
        onReject: reject
      })
    })
  }

  public static async* getMedia(artistUrl: ArtistURL): AsyncGenerator<Media, void> {
    let path = `${artistUrl.urlIdentifier}`

    let params: {
      page: number,
      hideShares: string,
      hideReplies: string,
      hideAsks: string
    } = {
      page: 0,
      hideShares: "true",
      hideReplies: "true",
      hideAsks: "true",
    }

    while (true) {
      let html = parse(await CohostScraper.makeRequest(path, params))

      let element = html.getElementById("trpc-dehydrated-state")

      if (!element || element.innerText.trim().length == 0) break

      let json = JSON.parse(element.innerText.trim()) as CohostDehydrated

      let postQuery = json.queries.find(q => q?.state?.data?.posts != null)

      if (!postQuery || postQuery.state.data.posts.length == 0) break

      let postQueryData = postQuery.state.data.posts as CohostPost[]

      for (let post of postQueryData) {
        let urls: string[] = []

        for (let block of post.blocks) {
          if (block.type != "attachment") continue
          urls.push((block as AttachmentBlock).attachment.fileURL)
        }

        yield new Media(post.filename, post.headline, post.plainTextBody, urls, new Date(post.publishedAt))
      }

      params.page++
    }
    // console.log("YIELDED ALL")
  }
}

export default CohostScraper