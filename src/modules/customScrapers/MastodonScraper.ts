import puppeteer from "puppeteer"
import Globals from "../Globals"
import ArtistURL from "../ArtistURL"
import E621IqdbChecker from "../E621IqdbChecker"
import { features } from "process"
import Utils from "../Utils"
import Media from "../Media"
import DTextUtils from "../DTextUtils"

type MastodonAttachment = {
  id: string
  type: string
  url: string
  description: string
}

type MastodonStatus = {
  id: string
  created_at: string
  url: string
  content: string
  media_attachments: MastodonAttachment[]
}

export class MastodonMedia {
  id: string
  description: string
  media: { id: string, url: string, description: string }[]
  createdAt: Date

  constructor(status: MastodonStatus) {
    this.id = status.id
    this.description = DTextUtils.htmlToDText(Utils.getHtmlElement(status.content))
    this.createdAt = new Date(status.created_at)
    this.media = []
    for (let attachment of status.media_attachments) {
      this.media.push({ id: attachment.id, url: attachment.url, description: DTextUtils.htmlToDText(Utils.getHtmlElement(attachment.description)) })
    }
  }
}

class MastodonScraper {
  baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private async makeRequest(path, params: Record<string, any>): Promise<any> {
    return new Promise(async (resolve, reject) => {
      let url = new URL(`${this.baseUrl}/${path}`)

      for (let [key, value] of Object.entries(params)) {
        if (value !== null) url.searchParams.set(key, value)
      }

      Globals.multiIPFetch.queueFetch({
        url: url.toString(),
        method: "GET",
        onResolve: async (res: Response) => {
          if (!res.ok) return reject(new Error(await res.text()))

          return resolve(await res.json())
        },
        onReject: reject
      })
    })
  }

  public async getApiIdentifier(urlIdentifier: string): Promise<string | null> {
    try {
      let data = await this.makeRequest("accounts/lookup", { acct: urlIdentifier })
      if (data && data.id) return data.id
      return null
    } catch (e) {
      console.error(`ERROR IN MASTODON SCRAPER`)
      console.error(e)
      return null
    }
  }

  async* getMedia(artistUrl: ArtistURL): AsyncGenerator<MastodonMedia, void> {
    let path = `accounts/${artistUrl.apiIdentifier}/statuses`

    let params: {
      max_id: string | null
      limit: number
      media_only: boolean
    } = {
      max_id: null,
      limit: 40,
      media_only: true
    }

    while (true) {
      let data = await this.makeRequest(path, params) as MastodonStatus[] | { error: string }

      //@ts-ignore
      if (data.error) {
        console.error(`ERROR MAKING MASTODON REQUEST:`)
        // @ts-ignore
        console.error(data.error)
        console.error(path, params)
        return
      } else {
        let statuses = (data as MastodonStatus[])

        if (statuses.length < 40) break

        for (let status of statuses) {
          yield new MastodonMedia(status)
        }

        params.max_id = statuses[statuses.length - 1].id
      }
      // console.log("YIELDED ALL")
    }
  }
}

export default MastodonScraper