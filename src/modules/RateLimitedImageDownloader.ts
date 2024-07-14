/* 
TODO:
MAKE ANOTHER ONE LIKE THIS CALLED RateLimitedImageDownloader
ALLOW FOR RATE LIMIT ENFORCING BASED ON HEADERS (PASS OPTIONS FOR RATE LIMIT REMAINING AND RESET) OR PASS A FUNCTION THAT GETS THE RESPONSE?
ALLOW MULTI-IP FETCHING!
DON'T SET RES ENCODING AND CONCAT BUFFERS TOGETHER
new Blob([buffer], {type: headers["content-type"]})
*/

import { ClientRequest, IncomingMessage } from "http"
import ImageData from "../interfaces/ImageData"
import https from "https"
import Utils from "./Utils"
import Globals from "./Globals"

const MAX_CONCURRENT_DOWNLOADS = 20

export type RateLimitedImageDownloaderOptions = {
  rateLimitRemainingHeader: string
  rateLimitResetHeader: string
}

class RateLimitedImageDownloader {
  private queue: { source: string, headers: any, onResolve: (data: ImageData | null) => void, onReject: (e: any) => void, }[] = []
  private currentlyDownloading: number = 0
  private processingQueue: boolean = false
  private nextIpIndex: number = 0

  private options: RateLimitedImageDownloaderOptions
  private rateLimitData: Record<string, { rateLimitRemaining: number, rateLimitReset: number }> = {}

  constructor(options: RateLimitedImageDownloaderOptions) {
    this.options = options
    for (let ip of Globals.config.imageDownloadIps) {
      this.rateLimitData[ip] = {
        rateLimitRemaining: Number.MAX_SAFE_INTEGER,
        rateLimitReset: Number.MIN_SAFE_INTEGER
      }
    }
  }

  private async download(localAddress, source, headers): Promise<ImageData | null> {
    return new Promise((resolve, reject) => {
      try {
        let url = new URL(source)
        let req: ClientRequest = https.request({
          host: url.host,
          path: `${url.pathname}${url.search}`,
          headers,
          localAddress,
          family: 4,
          method: "GET"
        }, (res: IncomingMessage) => {
          // console.log("INCOMING MESSAGE!")
          let d = Buffer.allocUnsafe(0)
          res.on("data", (chunk: Buffer) => {
            // console.log("ADD CHUNK")
            d = Buffer.concat([d, chunk])
          })

          res.on("end", async () => {
            if (res.statusCode as number >= 300 && res.statusCode as number < 400 && res.headers["location"]) {
              return this.download(localAddress, res.headers["location"], headers).then(resolve).catch(reject)
            }

            let blob: Blob | null = new Blob([d], { type: res.headers["content-type"] })
            let type = blob.type

            let reset = parseInt(res.headers[this.options.rateLimitResetHeader] as string) * 1000

            if (reset != this.rateLimitData[localAddress].rateLimitReset) {
              this.rateLimitData[localAddress].rateLimitRemaining = parseInt(res.headers[this.options.rateLimitRemainingHeader] as string)
              this.rateLimitData[localAddress].rateLimitReset = reset
            } else {
              let remaining = parseInt(res.headers[this.options.rateLimitRemainingHeader] as string)
              if (remaining < this.rateLimitData[localAddress].rateLimitRemaining) this.rateLimitData[localAddress].rateLimitRemaining = remaining
            }

            if (blob.type == "application/x-mpegurl") {
              blob = await Utils.downloadM3u8(source)
              if (!blob) return resolve(null)
              type = blob.type
            }

            let arrayBuffer = await blob.arrayBuffer()

            blob = null

            let data = await Utils.toImageData(arrayBuffer, type) as ImageData
            // data.source = sourceToReturn

            return resolve(data)
          })
        })

        req.on("error", (e) => {
          console.error("REQ ERROR (2)!!!!!!!!!!")
          return reject(null)
        })


        return req.end()
      } catch (e) {
        console.error(`Error with: ${source}`)
        console.error(e)
      }

      return reject(null)
    })
  }

  private async processQueue() {
    if (this.queue.length == 0) {
      this.processingQueue = false
      return
    }

    this.processingQueue = true

    // console.log(`DOWNLOADING IMAGE ${ImageDownloader.queue.length}`)

    let item = this.queue.shift()

    if (!item) {
      // console.log("NO ITEM!!!")
      this.processingQueue = false
      return
    }

    let address = Globals.config.imageDownloadIps[this.nextIpIndex]
    this.nextIpIndex = (this.nextIpIndex + 1) % Globals.config.imageDownloadIps.length

    // This ensures we'll never pass the rate limit with additional queued downloads
    if (this.rateLimitData[address].rateLimitRemaining <= MAX_CONCURRENT_DOWNLOADS) {
      await Utils.wait((this.rateLimitData[address].rateLimitReset - Date.now()) + 100)
    }

    this.currentlyDownloading++
    this.download(address, item?.source, item?.headers).then(id => {
      this.currentlyDownloading--
      item?.onResolve(id)
    }).catch((e) => {
      this.currentlyDownloading--
      item?.onReject(e)
    })

    while (this.currentlyDownloading >= MAX_CONCURRENT_DOWNLOADS) {
      // console.log("QUEUE FULL. WAITING")
      await Utils.wait(1000)
    }

    this.processQueue()
  }

  async queueDownload(source, headers = {}): Promise<ImageData | null> {
    if (!source || source.trim().length == 0) {
      console.error("EMPTY SOURCE")
      console.trace()
      return null
    }

    return new Promise((resolve, reject) => {
      this.queue.push({
        source,
        headers,
        onResolve: resolve,
        onReject: reject
      })

      if (!this.processingQueue) this.processQueue()
    })
  }
}

export default RateLimitedImageDownloader