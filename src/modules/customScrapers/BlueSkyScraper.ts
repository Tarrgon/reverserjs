import Globals from "../Globals"
import ArtistURL from "../ArtistURL"
import E621IqdbChecker from "../E621IqdbChecker"
import Utils from "../Utils"
import Media from "../Media"
import { BlobRef, BskyAgent, ComAtprotoSyncNS, AtpServiceClient } from "@atproto/api"
import RateLimitedImageDownloader from "../RateLimitedImageDownloader"

class BlueSkyScraper {
  private static blueSkyAgent: BskyAgent
  private static loggingIn: boolean = false

  static async getApiIdentifier(urlIdentifier: string): Promise<string | null> {
    try {
      while (this.loggingIn) await Utils.wait(1000)

      if (!this.blueSkyAgent) {
        this.loggingIn = true
        this.blueSkyAgent = new BskyAgent({
          service: "https://bsky.social",
        })

        await this.blueSkyAgent.login({ identifier: Globals.config.blueSkyAuth.username, password: Globals.config.blueSkyAuth.password })
        await this.blueSkyAgent.setAdultContentEnabled(true)

        this.loggingIn = false
      }

      let data = await this.blueSkyAgent.getProfile({ actor: urlIdentifier })

      return data.data.did
    } catch (e) {
      console.error("ERROR GETTING BLUESKY API IDENTIFIER")
      console.error(e)
      return null
    }
  }

  static async* getMedia(artistUrl: ArtistURL): AsyncGenerator<Media, void> {
    try {
      while (this.loggingIn) await Utils.wait(1000)

      if (!this.blueSkyAgent) {
        this.loggingIn = true

        this.blueSkyAgent = new BskyAgent({
          service: "https://bsky.social",
        })

        await this.blueSkyAgent.login({ identifier: Globals.config.blueSkyAuth.username, password: Globals.config.blueSkyAuth.password })
        await this.blueSkyAgent.setAdultContentEnabled(true)

        this.loggingIn = false
      }
    } catch (e) {
      console.error("ERROR GETTING BLUESKY MEDIA")
      console.error(e)
      return
    }

    let cursor: string | undefined = undefined

    do {
      let feed = await this.blueSkyAgent.getAuthorFeed({ actor: artistUrl.apiIdentifier, filter: "posts_with_media", limit: 100, cursor })
      cursor = feed.data.cursor

      if (!feed.data.feed || feed.data.feed.length == 0) break

      for (let feedItem of feed.data.feed) {
        // if (feedItem.reply) continue
        let record = (feedItem.post.record as { createdAt: string, text: string, embed: { $type: string, video: BlobRef, media: { images: { image: BlobRef }[] }, images: { image: BlobRef }[] } })

        let description: string = record.text
        let id = feedItem.post.uri.slice(feedItem.post.uri.lastIndexOf("/") + 1)

        let mediaUrls: string[] = []

        if (record.embed.$type == "app.bsky.embed.video") {
          mediaUrls = [`https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${artistUrl.apiIdentifier}&cid=${record.embed.video.ref.toString()}`]
        } else if (record.embed.$type == "app.bsky.embed.recordWithMedia") {
          mediaUrls = record.embed.media.images.map(i => `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${artistUrl.apiIdentifier}&cid=${i.image.ref.toString()}`)
        } else {
          mediaUrls = record.embed.images.map(i => `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${artistUrl.apiIdentifier}&cid=${i.image.ref.toString()}`)
        }

        yield new Media(id, "", description, mediaUrls, new Date(record.createdAt))
      }
    } while (cursor)
  }
}

export default BlueSkyScraper