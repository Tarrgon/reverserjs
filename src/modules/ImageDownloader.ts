import ImageData from "../interfaces/ImageData"
import Utils from "./Utils"
import DeviantArtScraper from "./customScrapers/DeviantArtScraper"

const MAX_CONCURRENT_DOWNLOADS = 20

export type WithSource<T> = T & { source: string }

class ImageDownloader {
  private static queue: { source: string, headers: any, onResolve: (data: ImageData | null) => void, onReject: (e: any) => void, }[] = []
  private static currentlyDownloading: number = 0
  private static processingQueue: boolean = false

  private static async download(source, headers, retries = 0): Promise<ImageData | null> {
    try {
      // Hacky way to get deviant art original since the link may expire too quickly.
      if (source.startsWith("deviantart_download_")) {
        // sourceToReturn = `/utils/get_deviantart_download/${source.slice(20)}`
        source = await DeviantArtScraper.getDownloadLink(source.slice(20))
      }

      let res = await fetch(source, { headers })
      if (res.status == 404) return null
      if (!res.ok) throw new Error(await res.text())
      let blob: Blob | null = await res.blob()
      let type = blob.type

      if (blob.type == "application/x-mpegurl") {
        blob = await Utils.downloadM3u8(source)
        if (!blob) return null
        type = blob.type
      }

      let arrayBuffer = await blob.arrayBuffer()

      blob = null

      let data = await Utils.toImageData(arrayBuffer, type) as ImageData
      // data.source = sourceToReturn

      return data
    } catch (e: any) {
      console.error(`Error with: ${source} retry #${retries}`)
      console.error(e)

      if (e.message == "token validation failed") {
        throw e
      }
    }

    if (retries < 5) {
      await Utils.wait(1000)
      return await ImageDownloader.download(source, headers, ++retries)
    }

    return null
  }

  private static async processQueue() {
    if (ImageDownloader.queue.length == 0) {
      ImageDownloader.processingQueue = false
      return
    }

    ImageDownloader.processingQueue = true

    // console.log(`DOWNLOADING IMAGE ${ImageDownloader.queue.length}`)

    let item = ImageDownloader.queue.shift()

    if (!item) {
      // console.log("NO ITEM!!!")
      ImageDownloader.processingQueue = false
      return
    }

    ImageDownloader.currentlyDownloading++
    ImageDownloader.download(item?.source, item?.headers).then(id => {
      ImageDownloader.currentlyDownloading--
      item?.onResolve(id)
    }).catch((e) => {
      ImageDownloader.currentlyDownloading--
      item?.onReject(e)
    })

    while (ImageDownloader.currentlyDownloading >= MAX_CONCURRENT_DOWNLOADS) {
      // console.log("QUEUE FULL. WAITING")
      await Utils.wait(1000)
    }

    ImageDownloader.processQueue()
  }

  public static async queueDownload(source, headers = {}): Promise<ImageData | null> {
    if (!source || source.trim().length == 0) {
      console.error("EMPTY SOURCE")
      console.trace()
      return null
    }

    return new Promise((resolve, reject) => {
      ImageDownloader.queue.push({
        source,
        headers,
        onResolve: resolve,
        onReject: reject
      })

      if (!ImageDownloader.processingQueue) ImageDownloader.processQueue()
    })
  }
}

export default ImageDownloader