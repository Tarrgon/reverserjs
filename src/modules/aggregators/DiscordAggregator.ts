import Aggregator from "../../interfaces/Aggregator"
import Globals from "../Globals"
import Submission from "../Submission"
import Utils from "../Utils"
import SourceData from "../../interfaces/SourceData"
import ImageData from "../../interfaces/ImageData"
import { ObjectId, WithId, Document } from "mongodb"
import AggregationManager, { AggregationJobData } from "../AggregationManager"
import ArtistURL from "../ArtistURL"
import ImageDownloader from "../ImageDownloader"
import Job from "../Job"
import { ChildProcess, fork } from "child_process"
import Artist from "../Artist"
import Account from "../Account"
import DTextUtils from "../DTextUtils"

const BASE_URL = "https://discord.com/users"

type SerializedBuffer = { type: "Buffer", data: number[] }

interface Message {
  type: string
  fromUserId: string
}

interface ImportMediaMessage extends Message {
  type: "IMPORT_MEDIA"
  artistDiscordId: string
  sourceUrl: string
  content: string
  createdAt: number
  images: {
    directUrl: string,
    type: string,
    offsiteId: string,
    buffer: SerializedBuffer
  }[]
}

interface AddArtistMessage extends Message {
  type: "ADD_USER_TO_ARTIST"
  artistDiscordId: string
  artistName: string
}

interface GetLinkedArtistIdMessage extends Message {
  type: "GET_LINKED_ARTIST_ID",
  discordId: string
}

class DiscordAggregator implements Aggregator {
  index: number = 26
  manager: AggregationManager

  host: string = "discord"
  displayName: string = "Discord"
  homepage: string = "https://discord.com"

  galleryTemplates: RegExp[] = [
    `discord\\.com\\/users\\/${Globals.siteArtistIdentifier}`,
  ].map(r => new RegExp(`${Globals.prefix}${r}\\/?${Globals.remaining}\\??${Globals.remaining}#?${Globals.remaining}`))

  usernameIdentifierRegex: RegExp = /^.{2,32}/

  submissionTemplate: string = ""

  ready: boolean = false
  inUse: boolean = false
  canFetch: boolean = false
  canSearch: boolean = true

  discordBot: ChildProcess

  constructor(manager: AggregationManager) {
    this.manager = manager

    this.discordBot = fork(`${__dirname}/../../discord/index.js`, {
      stdio: "inherit"
    })

    this.discordBot.on("message", async (message: { id: number, data: Message }) => {
      if (!message.data.fromUserId) return this.discordBot.send({ id: message.id, unauthorized: true })
      let fromAccount = await Account.findByDiscordId(message.data.fromUserId)
      if (!fromAccount) return this.discordBot.send({ id: message.id, unauthorized: true })

      switch (message.data.type) {
        case "GET_LINKED_ARTIST_ID":
          {
            let artistUrl = await ArtistURL.findByUrl(`${BASE_URL}/${(message.data as GetLinkedArtistIdMessage).discordId}`)
            if (artistUrl) {
              let artist = await Artist.findByObjectId(artistUrl.artistId)
              return this.discordBot.send({ id: message.id, data: { id: artist?.id } })
            }

            return this.discordBot.send({ id: message.id, data: { id: null } })
          }

        case "ADD_USER_TO_ARTIST":
          {
            let addArtistMessage = message.data as AddArtistMessage
            let url = `${BASE_URL}/${addArtistMessage.artistDiscordId}`
            let artistUrl = await ArtistURL.findByUrl(url)
            if (artistUrl) return this.discordBot.send({ id: message.id, data: { id: artistUrl.id } })

            let artist = await Artist.findByName(addArtistMessage.artistName)
            if (!artist) artist = await Artist.create(fromAccount, addArtistMessage.artistName, [url])
            else {
              await artist.addArtistUrl(fromAccount, url)
            }

            return this.discordBot.send({ id: message.id, data: { id: artist.id } })
          }
        case "IMPORT_MEDIA":
          {
            let importMediaMessage = message.data as ImportMediaMessage

            let url = `${BASE_URL}/${importMediaMessage.artistDiscordId}`
            let artistUrl = await ArtistURL.findByUrl(url)
            if (!artistUrl) return this.discordBot.send({ id: message.id, data: { code: 404 } })

            let promises: Promise<void>[] = []
            let added = 0
            let existing = 0

            for (let discordImageData of importMediaMessage.images) {
              let buffer = Buffer.from(discordImageData.buffer.data)
              promises.push(new Promise(async resolve => {
                let exists = await Submission.findByOffsiteId(discordImageData.offsiteId)
                if (exists) {
                  existing++
                  return resolve()
                }

                let id = await Utils.toImageDataFromBuffer(buffer, discordImageData.type)
                if (!id) return resolve()
                let imageData = { ...id, source: importMediaMessage.sourceUrl, offsiteId: discordImageData.offsiteId }
                await Submission.create(artistUrl._id, imageData.offsiteId, imageData.source, imageData.md5, "", DTextUtils.markdownToDText(importMediaMessage.content), new Date(importMediaMessage.createdAt), imageData.width, imageData.height, imageData.fileSize, discordImageData.directUrl, imageData.extension)
                added++
                resolve()
              }))
            }

            await Promise.all(promises)

            return this.discordBot.send({ id: message.id, data: { added, existing } })
          }
      }
    })
  }

  async createJobData(artistUrl: ArtistURL): Promise<AggregationJobData> {
    return { artistUrlId: artistUrl._id }
  }

  async fetchAll(artistUrlId: ObjectId): Promise<boolean> {
    return false
  }

  testUrl(url: string): boolean {
    for (let regex of this.galleryTemplates) {
      if (regex.test(url)) return true
    }

    return false
  }

  matchUrl(url: string): RegExpExecArray | null {
    for (let regex of this.galleryTemplates) {
      let match = regex.exec(url)
      if (match) return match
    }

    return null
  }

  async getApiIdentifier(urlIdentifier: string): Promise<string | null> {
    return urlIdentifier
  }
}

export default DiscordAggregator