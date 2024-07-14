import { md5 as jsmd5 } from "js-md5"
import fs from "fs"
import path from "path"
import Globals from "./Globals"
import ImageData from "../interfaces/ImageData"
import { Document, Filter, WithId } from "mongodb"
import Job from "./Job"
import sharp from "sharp"
import { exec, spawn, spawnSync } from "child_process"
import Submission, { BetterVersion } from "./Submission"
import { ArtistSearchQuery, SubmissionSearchQuery } from "../interfaces/SearchQueries"
import Account from "./Account"
import Artist from "./Artist"
import { filesize } from "filesize"
import { WithHumanReadableSize } from "../interfaces/IqdbHit"
import { HTMLElement, parse } from "node-html-parser"
import merge from "deepmerge-json"

const sizeOf = require("buffer-image-size")
const DetectFileType = require("./DetectFileType")
const WebmParser = require("./WebmParser")

const THUMBNAIL_SIZE = 300

export const VIDEO_EXTENSIONS = ["mp4", "m4p", "m4v", "webm", "mk4", "flv", "vob", "ogg", "ogv", "avi", "mov", "qt", "amv", "mpg", "mp2", "mpeg", "mpe", "mpv", "m2v", "m3u8"]
export const MIME_TYPE_TO_IGNORE = ["application/x-shockwave-flash", "video/x-flv", "application/vnd.adobe.flash.movie", "image/vnd.adobe.photoshop", "application/pdf", "application/zip", "application/vnd.rar", "audio/mpeg"]
export const E6_ALLOWED_EXTENSIONS = ["webm", "png", "jpg", "jpeg", "gif"]

// typescript things
const dynamicImport = new Function("specifier", "return import(specifier)")

let normalizeUrl: any
dynamicImport("normalize-url").then((a: any) => {
  normalizeUrl = a.default
})

function queryParseInt(input: any, def: number, minimum: number, maximum: number): number {
  let parsed = isNaN(input) ? def : parseInt(input)

  if (parsed < minimum) parsed = minimum
  if (parsed > maximum) parsed = maximum

  return parsed
}

function queryParseFloat(input: any, def: number, minimum: number, maximum: number): number {
  let parsed = isNaN(input) ? def : parseFloat(input)

  if (parsed < minimum) parsed = minimum
  if (parsed > maximum) parsed = maximum

  return parsed
}

class Utils {
  static wait(ms): Promise<void> {
    return new Promise(r => setTimeout(r, ms))
  }

  static async getRealFileType(buffer): Promise<{ ext: string, mime: string } | null> {
    try {
      return (await DetectFileType.fromBuffer(buffer))
    } catch (e) {
      console.error(e)
      return null
    }
  }

  static getDimensions(fileExtension, buffer, filePath): { width: number, height: number } {
    try {
      if (fileExtension == "m3u8") return { width: 0, height: 0 }
      if (!VIDEO_EXTENSIONS.includes(fileExtension)) {
        const dimensions = sizeOf(buffer)
        return { width: dimensions.width, height: dimensions.height }
      } else {
        let data = Utils.getVideoDimensions(filePath)

        if (!data) {
          return { width: -1, height: -1 }
        }

        return data
      }
    } catch (e) {
      console.error(e)
    }

    return { width: -1, height: -1 }
  }

  static async toImageData(arrayBuffer: ArrayBuffer, type: string | null | undefined): Promise<ImageData | null> {
    if (type && MIME_TYPE_TO_IGNORE.includes(type)) return null

    let buffer = Buffer.from(arrayBuffer)

    let md5 = jsmd5(arrayBuffer)
    let first = md5.slice(0, 2)
    let second = md5.slice(2, 4)
    let data = await this.getRealFileType(buffer)
    let realExt
    let realMime

    if (data) {
      realExt = data.ext
      realMime = data.mime
    }

    if (!realExt) {
      if (type == "application/x-mpegurl") {
        realExt = "m3u8"
      } else {
        console.error("Unable to find extension")
        return null
      }
    }

    if (MIME_TYPE_TO_IGNORE.includes(realMime)) return null

    let dir = path.join(Globals.config.imgDirectory as string, first, second)

    let p = path.join(dir, `${md5}.${realExt}`)

    fs.mkdirSync(dir, { recursive: true })

    if (!fs.existsSync(p)) fs.writeFileSync(p, buffer)

    let dimensions = Utils.getDimensions(realExt, buffer, p)

    if (dimensions.width == -1 && dimensions.height == -1) {
      console.error("Error fetching dimensions for")
      console.log(realExt, realMime)
    }

    return {
      md5,
      extension: realExt,
      absolutePath: p,
      width: dimensions.width,
      height: dimensions.height,
      fileSize: buffer.byteLength
    }
  }

  static async toImageDataFromBuffer(buffer: Buffer, type: string | null | undefined): Promise<ImageData | null> {
    if (type && MIME_TYPE_TO_IGNORE.includes(type)) return null

    let md5 = jsmd5(new Uint8Array(buffer).buffer)
    let first = md5.slice(0, 2)
    let second = md5.slice(2, 4)
    let data = await this.getRealFileType(buffer)
    let realExt
    let realMime

    if (data) {
      realExt = data.ext
      realMime = data.mime
    }

    if (!realExt) {
      if (type == "application/x-mpegurl") {
        realExt = "m3u8"
      } else {
        console.error("Unable to find extension")
        return null
      }
    }

    if (MIME_TYPE_TO_IGNORE.includes(realMime)) return null

    let dir = path.join(Globals.config.imgDirectory as string, first, second)

    let p = path.join(dir, `${md5}.${realExt}`)

    fs.mkdirSync(dir, { recursive: true })

    if (!fs.existsSync(p)) fs.writeFileSync(p, buffer)

    let dimensions = Utils.getDimensions(realExt, buffer, p)

    if (dimensions.width == -1 && dimensions.height == -1) {
      console.error("Error fetching dimensions for")
      console.log(realExt, realMime)
    }

    return {
      md5,
      extension: realExt,
      absolutePath: p,
      width: dimensions.width,
      height: dimensions.height,
      fileSize: buffer.byteLength
    }
  }

  static getVideoDimensions(filePath: string): { width: number, height: number } | null {
    try {
      let { stdout } = spawnSync("ffprobe", [
        "-v", "error",
        "-of", "flat=s=_",
        "-select_streams", "v:0",
        "-show_entries", "stream=height,width",
        filePath
      ])

      let width = /width=(\d+)/.exec(stdout.toString())
      let height = /height=(\d+)/.exec(stdout.toString())

      if (!width || !height) return null

      return {
        width: parseInt(width[1]),
        height: parseInt(height[1])
      }
    } catch (e) {
      console.error(e)
      return { width: -1, height: -1 }
    }
  }

  static async generateSample(submission: Submission): Promise<boolean> {
    if (submission.extension == "m3u8") {
      return await Utils.generateM3u8Thumbnail(submission)
    }

    if (VIDEO_EXTENSIONS.includes(submission.extension)) {
      return await Utils.generateVideoThumbnail(submission)
    } else {
      return await Utils.generateThumbnail(submission)
    }
  }

  static async generateThumbnail(submission: Submission): Promise<boolean> {
    try {
      fs.mkdirSync(path.dirname(submission.getThumbnailPath()), { recursive: true })
      await sharp(await submission.getFileBuffer()).resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: "inside" }).jpeg({ quality: 90 }).toFile(submission.getThumbnailPath())
      return true
    } catch (e) {
      console.error(`Error generating submission thumbnail for: ${submission.getFilePath()} (${submission._id}) (1)`)
      console.error(e)
      return false
    }
  }

  static generateVideoThumbnailFromPaths(input: string, output: string): Promise<boolean> {
    fs.mkdirSync(path.dirname(output), { recursive: true })

    return new Promise((resolve) => {
      const ffmpeg = spawn("ffmpeg", [
        "-y",
        "-ss",
        "0",
        "-i",
        input,
        "-frames",
        "1",
        output,
      ])

      let errorData = ""

      ffmpeg.stderr.on("data", (data) => {
        errorData += data.toString()
      })

      ffmpeg.on("exit", async () => {
        let buffer
        try {
          let tries = 0
          let exists = fs.existsSync(output)
          buffer = exists ? fs.readFileSync(output) : null
          while (!exists || buffer?.length == 0) {
            await Utils.wait(500)
            tries++
            if (tries > 5) break
            if (!exists) exists = fs.existsSync(output)
            buffer = exists ? fs.readFileSync(output) : null
          }

          if (exists && buffer?.length != 0) {
            await sharp(buffer as Buffer).resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: "inside" }).jpeg({ quality: 90 }).toFile(output)
          } else {
            console.error(`Error generating submission thumbnail for: ${input} (2)`)
            console.error(errorData)
          }

          return resolve(exists)
        } catch (e) {
          console.error(`Error generating submission thumbnail for: ${input} (3)`)
          console.error(buffer?.length)
          console.error(e)
          return resolve(false)
        }
      })
    })
  }

  static generateVideoThumbnail(submission: Submission): Promise<boolean> {
    fs.mkdirSync(path.dirname(submission.getThumbnailPath()), { recursive: true })

    return new Promise((resolve) => {
      const ffmpeg = spawn("ffmpeg", [
        "-y",
        "-ss",
        "0",
        "-i",
        submission.getFilePath(),
        "-frames",
        "1",
        submission.getThumbnailPath(),
      ])

      let errorData = ""

      ffmpeg.stderr.on("data", (data) => {
        errorData += data.toString()
      })

      ffmpeg.on("exit", async () => {
        let buffer
        try {
          let tries = 0
          let exists = fs.existsSync(submission.getThumbnailPath())
          buffer = exists ? fs.readFileSync(submission.getThumbnailPath()) : null
          while (!exists || buffer?.length == 0) {
            await Utils.wait(500)
            tries++
            if (tries > 5) break
            if (!exists) exists = fs.existsSync(submission.getThumbnailPath())
            buffer = exists ? fs.readFileSync(submission.getThumbnailPath()) : null
          }

          if (exists && buffer?.length != 0) {
            await sharp(buffer as Buffer).resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: "inside" }).jpeg({ quality: 90 }).toFile(submission.getThumbnailPath())
          } else {
            console.error(`Error generating submission thumbnail for: ${submission.getFilePath()} (${submission._id}) (2)`)
            console.error(errorData)
          }

          return resolve(exists)
        } catch (e) {
          console.error(`Error generating submission thumbnail for: ${submission.getFilePath()} (${submission._id}) (3)`)
          console.error(buffer?.length)
          console.error(e)
          return resolve(false)
        }
      })
    })
  }

  static async downloadM3u8(url: string): Promise<Blob | null> {
    fs.mkdirSync(path.join(Globals.config.sampleDirectory as string, "tmp"), { recursive: true })

    let id = Date.now() + Math.random() * 100000

    let tempPath = `${path.join(Globals.config.sampleDirectory as string, "tmp", id.toString())}.mp4`

    return new Promise(async (resolve) => {
      const ffmpeg = spawnSync("ffmpeg", [
        "-i",
        url,
        "-y",
        "-c",
        "copy",
        "-bsf:a",
        "aac_adtstoasc",
        tempPath
      ])

      await Utils.wait(500)

      if (fs.existsSync(tempPath)) {
        let buffer = fs.readFileSync(tempPath)
        resolve(new Blob([buffer], { type: "video/mp4" }))
      }
      else {
        console.error(`Error downloading m3u8 for ${url} (1)`)
        console.error(ffmpeg.stderr.toString())
        resolve(null)
      }

      try {
        fs.unlinkSync(tempPath)
      } catch { }
    })
  }

  static generateM3u8Thumbnail(submission: Submission): Promise<boolean> {
    fs.mkdirSync(path.join(Globals.config.sampleDirectory as string, "tmp"), { recursive: true })

    let tempPath = `${path.join(Globals.config.sampleDirectory as string, "tmp", submission.id.toString())}.mp4`

    return new Promise(async (resolve) => {
      const ffmpeg = spawnSync("ffmpeg", [
        "-i",
        submission.directLinkOffsite,
        "-y",
        "-c",
        "copy",
        "-bsf:a",
        "aac_adtstoasc",
        tempPath
      ])

      await Utils.wait(500)

      if (fs.existsSync(tempPath)) resolve(await Utils.generateVideoThumbnailFromPaths(tempPath, submission.getThumbnailPath()))
      else {
        console.error(`Error generating m3u8 thumbnail for ${submission._id} (1)`)
        console.error(ffmpeg.stderr.toString())
        resolve(false)
      }
      try {
        fs.unlinkSync(tempPath)
      } catch { }
    })
  }

  static async getNextId(type): Promise<number> {
    let doc = await Globals.db.collection("ids").findOneAndUpdate({ type }, { $inc: { next: 1 } }, { upsert: true, returnDocument: "after" }) as WithId<{ next: number }>
    return doc.next
  }

  static addFlag(bits, bitToAdd) {
    return bits | bitToAdd
  }

  static hasFlag(bits, testBit) {
    return (bits & testBit) == testBit
  }

  static async processSubmissionSearchQuery(query: any, defaults: Partial<SubmissionSearchQuery> = {}): Promise<SubmissionSearchQuery> {
    let { page, limit, status, statusType, fileSizeThresholdType, fileSizeThreshold, fileDimensionsThresholdType,
      fileDimensionsThreshold, contentType, sites, inBacklog, hidden, deleted, titleIncludes, descriptionIncludes, order } = query

    let pageParsed = queryParseInt(page, 1, 1, Number.MAX_SAFE_INTEGER)
    let limitParsed = queryParseInt(limit, 75, 1, 300)
    let fileSizeThresholdParsed = queryParseFloat(fileSizeThreshold, 0, 0, Number.MAX_SAFE_INTEGER)
    let fileDimensionsThresholdParsed = queryParseFloat(fileDimensionsThreshold, 0, 0, Number.MAX_SAFE_INTEGER)
    let artistId

    if (query.artist) {
      let artist = await Artist.findById(query.artist)

      if (artist) artistId = artist._id
    }

    if (titleIncludes && titleIncludes.trim().length == 0) titleIncludes = undefined
    if (descriptionIncludes && descriptionIncludes.trim().length == 0) descriptionIncludes = undefined
    if (!order) order = "newestFirst"


    let data = {
      page: pageParsed, limit: limitParsed, status, statusType,
      fileSizeThresholdType, fileSizeThreshold: fileSizeThresholdParsed,
      fileDimensionsThresholdType, fileDimensionsThreshold: fileDimensionsThresholdParsed,
      contentType, sites: sites ? sites.map(s => parseInt(s)) : undefined, inBacklog: inBacklog ? inBacklog.toLowerCase() == "true" : undefined, hidden, deleted,
      artistId, titleIncludes, descriptionIncludes, order
    }

    for (let [key, value] of Object.entries(defaults)) {
      if (data[key] === undefined) {
        data[key] = value
      }
    }

    return data
  }

  static buildSubmissionQuery(account: Account, query: SubmissionSearchQuery, defaultQuery: Filter<Document> = { isDeleted: false }): Filter<Document> {
    let q: Filter<Document> = defaultQuery

    if (query.status) {
      if (query.status.includes("notUploaded")) {
        q.e621IqdbHits = { $size: 0 }
      } else {
        let bits = 0
        let negatedBits = 0
        if (query.status.includes("alreadyUploaded")) {
          q["e621IqdbHits.0"] = { $exists: true }
        }

        if (query.status.includes("exactMatch")) {
          bits |= BetterVersion.EXACT
        }

        if (query.status.includes("-exactMatch")) {
          negatedBits |= BetterVersion.EXACT
        }

        if (query.status.includes("largerDimensions")) {
          bits |= BetterVersion.BIGGER_DIMENSIONS
        }

        if (query.status.includes("largerFileSize")) {
          bits |= BetterVersion.BIGGER_FILE_SIZE
        }

        if (query.status.includes("betterFileType")) {
          bits |= BetterVersion.BETTER_FILE_TYPE
        }

        if (query.status.includes("sameFileType")) {
          bits |= BetterVersion.SAME_FILE_TYPE
        }

        if (bits != 0) {
          if (query.statusType == "excludeDeleted") {
            q.betterVersionNotDeleted = { $bitsAllSet: bits }
          } else {
            q.betterVersion = { $bitsAllSet: bits }
          }
        }

        if (negatedBits != 0) {
          if (query.statusType == "excludeDeleted") {
            if (!q.betterVersionNotDeleted) q.betterVersionNotDeleted = { $bitsAllClear: negatedBits }
            else q.betterVersionNotDeleted["$bitsAllClear"] = negatedBits
          } else {
            if (!q.betterVersion) q.betterVersion = { $bitsAllClear: negatedBits }
            else q.betterVersion["$bitsAllClear"] = negatedBits
          }
        }
      }
    }

    if (query.contentType) {
      switch (query.contentType) {
        case "animationOnly":
          q.extension = { $in: VIDEO_EXTENSIONS }
          break

        case "picturesOnly":
          q.extension = { $nin: VIDEO_EXTENSIONS }
          break
      }
    }

    if (query.sites && query.sites.length > 0) {
      q.aggregatorIndex = { $in: query.sites }
    }

    if (query.inBacklog !== undefined) {
      if (query.inBacklog) {
        q._id = { $in: account.submissionsBacklog }
      } else {
        q._id = { $nin: account.submissionsBacklog }
      }
    }

    if (query.hidden) {
      switch (query.hidden) {
        case "hiddenOnly":
          if (q._id && q._id["$in"]) {
            q._id["$in"] = q._id["$in"].filter(id => account.ignoredSubmissions.find(s => s.equals(id)))
          } else {
            q._id = { $in: account.ignoredSubmissions }
          }

          break

        case "include":
          // do nothing
          break
      }
    } else {
      if (q._id && q._id["$nin"]) q._id["$nin"].push(...account.ignoredSubmissions)
      else {
        if (q._id) {
          q._id["$nin"] = account.ignoredSubmissions
        } else {
          q._id = { $nin: account.ignoredSubmissions }
        }
      }
    }

    if (query.deleted) {
      switch (query.deleted) {
        case "deletedOnly":
          q.isDeleted = true
          break

        case "include":
          delete q.isDeleted
          break
      }
    }

    if (query.artistId) {
      q.artistId = query.artistId
    }

    if (query.titleIncludes) {
      q.title = { $regex: `.*${Utils.escapeRegexCharacters(query.titleIncludes)}.*`, $options: "i" }
    }

    if (query.descriptionIncludes) {
      q.description = { $regex: `.*${Utils.escapeRegexCharacters(query.descriptionIncludes)}.*`, $options: "i" }
    }

    return q
  }

  static async processArtistSearchQuery(query: any, defaults: Partial<ArtistSearchQuery> = {}): Promise<ArtistSearchQuery> {
    let { page, nameIncludes, order } = query

    let pageParsed = queryParseInt(page, 1, 1, Number.MAX_SAFE_INTEGER)

    if (nameIncludes && nameIncludes.trim().length == 0) nameIncludes = undefined
    if (!order) order = "newestFirst"

    let data = {
      page: pageParsed, nameIncludes, order
    }

    for (let [key, value] of Object.entries(defaults)) {
      if (data[key] === undefined) {
        data[key] = value
      }
    }

    return data
  }

  static buildArtistQuery(query: ArtistSearchQuery, defaultQuery: Filter<Document> = {}): Filter<Document> {
    let q: Filter<Document> = defaultQuery

    if (query.nameIncludes) {
      q.name = { $regex: `.*${Utils.escapeRegexCharacters(query.nameIncludes)}.*`, $options: "i" }
    }

    return q
  }

  static normalizeUrl(url: string, options: any = undefined): string {
    try {
      return normalizeUrl(url, options)
    } catch (e) {
      console.error(`ERROR NORMALIZING URL: ${url}`)
      console.error(e)
      return "INVALID_URL"
    }
  }

  static escapeRegexCharacters(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }

  static isValidUrl(url: string): boolean {
    try {
      if (url.trim().length == 0) return false
      new URL(url)
      return true
    } catch {
      return false
    }
  }

  static addHumanReadableSize<T>(data: T & { fileSize: number }) {
    let d: any = data
    d.humanReadableSize = filesize(data.fileSize, { standard: "jedec" })
    return d as WithHumanReadableSize<T>
  }

  static sanitizeHtml(html: string): string {
    try {
      let doc = parse(html)

      return doc.textContent ?? ""
    } catch (e) {
      console.error("ERROR PARSING HTML:")
      console.error(html)
      console.error(e)
      return ""
    }
  }

  static getHtmlElement(html: string): HTMLElement {
    try {
      return parse(html)
    } catch (e) {
      console.error("ERROR PARSING HTML:")
      console.error(html)
      console.error(e)
      return parse("")
    }
  }

  static mergeObjects(o1: any, o2: any): any {
    return merge(o1, o2)
  }
}

export default Utils