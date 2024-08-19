import Globals from "./Globals"
import IqdbHit from "../interfaces/IqdbHit"
import E621IqdbChecker from "./E621IqdbChecker"
import { ObjectId, WithId, Document, FindCursor } from "mongodb"
import ArtistURL from "./ArtistURL"
import Utils, { E6_ALLOWED_EXTENSIONS, VIDEO_EXTENSIONS } from "./Utils"
import path from "path"
import Aggregator from "../interfaces/Aggregator"
import fs from "fs"
import Artist, { WithUrlReferences } from "./Artist"
import { filesize } from "filesize"
import IqdbManager from "./IqdbManager"
import { SubmissionSearchQuery } from "../interfaces/SearchQueries"
import { JobPriority } from "./Job"
import Account from "./Account"
import he from "he"
import DeviantArtScraper from "./customScrapers/DeviantArtScraper"
const { DateTime } = require("luxon")

const IQDB_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "tiff", "webp", "webm", "mp4"]

export const enum BetterVersion {
  UNKNOWN = 0,
  EXACT = 1 << 0,
  BIGGER_DIMENSIONS = 1 << 1,
  BETTER_FILE_TYPE = 1 << 2,
  BIGGER_FILE_SIZE = 1 << 3,
  SAME_FILE_TYPE = 1 << 4
}

export type AdditionalData = {
  tags?: string[]
  sources?: string[]
  deletedBy?: ObjectId
  undeletedBy?: ObjectId
}

export type WebifiedSubmission = Partial<Submission> & Partial<{ artistReference: Partial<WithUrlReferences<Artist>>, artistUrlReference: ArtistURL, aggregator: Aggregator | null, dateTime: any }>
export type WithIqdbHit<T> = T & { hit: IqdbHit }

class Submission {
  _id: ObjectId
  id: number
  aggregatorIndex: number
  offsiteId: string
  artistUrlId: ObjectId
  isDeleted: boolean
  md5: string
  title: string
  description: string
  scrapeDate: Date
  creationDate: Date
  extension: string
  width: number
  height: number
  fileSize: number
  sourceUrl: string
  directLinkOffsite: string
  betterVersion: BetterVersion
  betterVersionNotDeleted: BetterVersion
  sampleGenerated: boolean
  additionalData?: AdditionalData

  e621IqdbHits: IqdbHit[]

  constructor(_id: ObjectId, id: number, aggregatorIndex: number, offsiteId: string, artistUrlId: ObjectId, isDeleted: boolean, md5: string, title: string, description: string, scrapeDate: Date, creationDate: Date, width: number, height: number, fileSize: number, sourceUrl: string, directLinkOffsite: string, extension: string, betterVersion: BetterVersion, betterVersionNotDeleted: BetterVersion, sampleGenerated: boolean, e621IqdbHits: IqdbHit[] = [], additionalData: AdditionalData = {}) {
    this._id = _id
    this.id = id
    this.aggregatorIndex = aggregatorIndex
    this.offsiteId = offsiteId
    this.artistUrlId = artistUrlId
    this.isDeleted = isDeleted
    this.md5 = md5
    this.title = title
    this.description = description
    this.scrapeDate = scrapeDate
    this.creationDate = creationDate
    this.extension = extension
    this.width = width
    this.height = height
    this.fileSize = fileSize
    this.sourceUrl = sourceUrl
    this.directLinkOffsite = directLinkOffsite
    this.betterVersion = betterVersion
    this.betterVersionNotDeleted = betterVersionNotDeleted
    this.sampleGenerated = sampleGenerated
    this.e621IqdbHits = e621IqdbHits
    this.additionalData = additionalData
  }

  async addE621IqdbHits(...hits: IqdbHit[]): Promise<void> {
    let hitsToInsert: IqdbHit[] = []

    for (let hit of hits) {
      let existingHit = this.e621IqdbHits.find(h => h.id == hit.id)
      if (existingHit) continue

      let hitIsDeleted = !hit.fileType

      hitsToInsert.push(hit)
      if (this.md5 == hit.md5) {
        await this.addBetterVersionFlag(BetterVersion.EXACT, hitIsDeleted)
      }

      if (this.fileSize > hit.fileSize) {
        await this.addBetterVersionFlag(BetterVersion.BIGGER_FILE_SIZE, hitIsDeleted)
      }

      if (this.width * this.height > hit.width * hit.height) {
        await this.addBetterVersionFlag(BetterVersion.BIGGER_DIMENSIONS, hitIsDeleted)
      }

      if (((this.extension == "png" || this.extension == "webp") && hit.fileType == "jpg") || (this.extension == "webm" && hit.fileType == "gif")) {
        await this.addBetterVersionFlag(BetterVersion.BETTER_FILE_TYPE, hitIsDeleted)
      }

      if (this.extension == hit.fileType) {
        await this.addBetterVersionFlag(BetterVersion.SAME_FILE_TYPE, hitIsDeleted)
      }
    }

    this.e621IqdbHits.push(...hitsToInsert)
    await Globals.db.collection("submissions").updateOne({ _id: this._id }, { $push: { e621IqdbHits: { $each: hitsToInsert } } })
  }

  async recalculateBetterVersionFlags() {
    let flags: BetterVersion = 0
    let nonDeletedFlags: BetterVersion = 0

    for (let hit of this.e621IqdbHits) {
      let hitIsDeleted = !hit.fileType

      if (this.md5 == hit.md5) {
        flags |= BetterVersion.EXACT

        if (!hitIsDeleted) {
          nonDeletedFlags |= BetterVersion.EXACT
        }
      }

      if (this.fileSize > hit.fileSize) {
        flags |= BetterVersion.BIGGER_FILE_SIZE

        if (!hitIsDeleted) {
          nonDeletedFlags |= BetterVersion.BIGGER_FILE_SIZE
        }
      }

      if (this.width * this.height > hit.width * hit.height) {
        flags |= BetterVersion.BIGGER_DIMENSIONS

        if (!hitIsDeleted) {
          nonDeletedFlags |= BetterVersion.BIGGER_DIMENSIONS
        }
      }

      if (((this.extension == "png" || this.extension == "webp") && hit.fileType == "jpg") || (this.extension == "webm" && hit.fileType == "gif")) {
        flags |= BetterVersion.BETTER_FILE_TYPE

        if (!hitIsDeleted) {
          nonDeletedFlags |= BetterVersion.BETTER_FILE_TYPE
        }
      }

      if (this.extension == hit.fileType) {
        flags |= BetterVersion.SAME_FILE_TYPE

        if (!hitIsDeleted) {
          nonDeletedFlags |= BetterVersion.SAME_FILE_TYPE
        }
      }
    }

    this.betterVersion = flags
    this.betterVersionNotDeleted = nonDeletedFlags
    await Globals.db.collection("submissions").updateOne({ _id: this._id }, { $set: { betterVersion: this.betterVersion, betterVersionNotDeleted: this.betterVersionNotDeleted } })
  }

  async deleteIqdbHitWithPostId(id: number) {
    let index = this.e621IqdbHits.findIndex(hit => hit.id == id)
    if (index == -1) return

    this.e621IqdbHits.splice(index, 1)

    await Globals.db.collection("submissions").updateOne({ _id: this._id }, { $set: { e621IqdbHits: this.e621IqdbHits, betterVersionNotDeleted: this.betterVersionNotDeleted } })

    await this.recalculateBetterVersionFlags()
  }

  async purgeE621IqdbHits() {
    this.e621IqdbHits = []
    this.betterVersion = BetterVersion.UNKNOWN
    this.betterVersionNotDeleted = BetterVersion.UNKNOWN
    await Globals.db.collection("submissions").updateOne({ _id: this._id }, { $set: { e621IqdbHits: [], betterVersion: this.betterVersion, betterVersionNotDeleted: this.betterVersionNotDeleted } })
  }

  async setSampleGenerated(sampleGenerated: boolean): Promise<void> {
    this.sampleGenerated = sampleGenerated
    await Globals.db.collection("submissions").updateOne({ _id: this._id }, { $set: { sampleGenerated } })

    if (sampleGenerated) {
      await IqdbManager.addToQueue(this._id)
    }
  }

  async addBetterVersionFlag(betterVersion: BetterVersion, isDeleted: boolean): Promise<void> {
    this.betterVersion |= betterVersion

    if (!isDeleted) {
      this.betterVersionNotDeleted |= betterVersion
    }

    await Globals.db.collection("submissions").updateOne({ _id: this._id }, { $set: { betterVersion: this.betterVersion, betterVersionNotDeleted: this.betterVersionNotDeleted } })
  }

  async getArtistUrl(): Promise<ArtistURL> {
    return await ArtistURL.findByObjectId(this.artistUrlId) as ArtistURL
  }

  async getArtist(): Promise<Artist> {
    return await (await this.getArtistUrl()).getArtist() as Artist
  }

  async getSimilar(cutoff: number = 85): Promise<IqdbHit[]> {
    return this.sampleGenerated ? (await IqdbManager.queryImage(VIDEO_EXTENSIONS.includes(this.extension) ? this.getThumbnailBuffer() : this.getFileBuffer(), cutoff)).filter(hit => hit.id != this.id) : []
  }

  isUploadable(): boolean {
    return E6_ALLOWED_EXTENSIONS.includes(this.extension)
  }

  async getUploadUrl(forAccount: Account | null): Promise<string> {
    if (!this || !this.isUploadable?.()) return ""
    let description = forAccount?.settings?.descriptionTemplate ?? "{title}\n\n{description}"

    if (this.title) description = description.replaceAll("{title}", he.decode(this.title))
    else description = description.split("{title}").slice(1).join()

    if (this.description) description = description.replaceAll("{description}", he.decode(this.description))
    else description = description.replaceAll("{description}", "")

    description = description.trim()

    let artist = await this.getArtist()

    let tags = [artist.name?.replaceAll(" ", "_")?.toLowerCase() ?? ""]

    let sources: Set<string> = new Set([this.sourceUrl])

    let allSimilar: Submission[] = [this]

    if (forAccount?.settings?.sourceSimilarityCutoff == null || forAccount.settings.sourceSimilarityCutoff < 100) {
      let similar = await this.getSimilar(forAccount?.settings?.sourceSimilarityCutoff ?? 90)

      for (let hit of similar) {
        let sub = await Submission.findById(hit.id)
        if (sub) {
          sources.add(sub.sourceUrl)
          allSimilar.push(sub)
        }
      }
    }

    if (forAccount?.settings?.autoAddDateTag) tags.push(allSimilar.sort((a, b) => a.creationDate.getTime() - b.creationDate.getTime())[0].creationDate.getFullYear().toString())

    let url = this.directLinkOffsite ?? ""

    if (this.directLinkOffsite.startsWith("/utils/get_deviantart_download")) {
      url = await DeviantArtScraper.getDownloadLink(this.directLinkOffsite.slice(31), 9999)
    }

    return `https://e621.net/uploads/new?upload_url=${encodeURIComponent(url)}&tags=${tags.map(t => encodeURIComponent(t)).join("%20")}&sources=${Array.from(sources).map(s => encodeURIComponent(s)).join("%2C")}&description=${encodeURIComponent(description)}`
    // return `https://e621.net/uploads/new?upload_url=${encodeURIComponent(url)}&tags-artist=${artist.name?.replaceAll(" ", "_")?.toLowerCase() ?? ""}&tags=${tags.map(t => encodeURIComponent(t)).join("%20")}&sources=${Array.from(sources).map(s => encodeURIComponent(s)).join("%2C")}&description=${encodeURIComponent(description)}`
  }

  queueE621IqdbCheck(priority: JobPriority = JobPriority.NORMAL): void {
    if (!IQDB_EXTENSIONS.includes(this.extension)) return

    if (!this.isQueuedForE621IqdbCheck()) E621IqdbChecker.queueSubmission(this, priority)
  }

  isCheckingE621Iqdb(): boolean {
    if (!IQDB_EXTENSIONS.includes(this.extension)) return false

    return E621IqdbChecker.isCheckingNow(this.md5)
  }

  isQueuedForE621IqdbCheck(): boolean {
    if (!IQDB_EXTENSIONS.includes(this.extension)) return false

    return E621IqdbChecker.isQueued(this.md5)
  }

  e621IqdbCheckIndex(): number {
    if (!IQDB_EXTENSIONS.includes(this.extension)) return -1

    return E621IqdbChecker.indexFor(this.md5)
  }

  async queueE621IqdbCheckAndWait(): Promise<IqdbHit[]> {
    if (!IQDB_EXTENSIONS.includes(this.extension)) return []

    return new Promise((resolve) => {
      E621IqdbChecker.queueSubmission(this, JobPriority.IMMEDIATE, resolve)
    })
  }

  getFilePath(): string {
    let first = this.md5.slice(0, 2)
    let second = this.md5.slice(2, 4)

    let dir = path.join(Globals.config.imgDirectory as string, first, second)

    return path.join(dir, `${this.md5}.${this.extension}`)
  }

  getThumbnailPath(): string {
    let first = this.md5.slice(0, 2)
    let second = this.md5.slice(2, 4)

    let dir = path.join(Globals.config.sampleDirectory as string, first, second)

    return path.join(dir, `${this.md5}.jpg`)
  }

  getWebPath(): string {
    return `/data/imgs/${this.md5}.${this.extension}`
  }

  getThumbnailWebPath(): string {
    if (!this.sampleGenerated) return "/img/no_sample.jpg"

    return `/data/thumbs/${this.md5}.jpg`
  }

  getFileBuffer(): Buffer {
    return fs.readFileSync(this.getFilePath())
  }

  getThumbnailBuffer(): Buffer {
    return fs.readFileSync(this.getThumbnailPath())
  }

  getHumanFileSize(): string {
    return filesize(this.fileSize, { standard: "jedec" })
  }

  getIqdbHitData(score: number): IqdbHit {
    return {
      id: this.id,
      sourceUrl: `/submissions/${this.id}`,
      directLink: this.getWebPath(),
      score,
      md5: this.md5,
      fileSize: this.fileSize,
      width: this.width,
      height: this.height,
      fileType: this.extension
    }
  }

  async destroy() {
    if (fs.existsSync(this.getFilePath())) fs.unlinkSync(this.getFilePath())
    if (fs.existsSync(this.getThumbnailPath())) fs.unlinkSync(this.getThumbnailPath())

    for await (let acc of Account.findByQuery({})) {
      let account = Account.fromDoc(acc)
      await account.removeReferenceToSubmission(this._id)
    }

    await Globals.db.collection("submissions").deleteOne({ _id: this._id })
  }

  async deleteSubmission(deletedBy: Account) {
    let additionalData = this.additionalData || {}
    additionalData.deletedBy = deletedBy._id

    this.additionalData = additionalData
    this.isDeleted = true

    await Globals.db.collection("submissions").updateOne({ _id: this._id }, { $set: { isDeleted: true, additionalData } })
  }

  async undeleteSubmission(undeletedBy: Account) {
    let additionalData = this.additionalData || {}
    additionalData.undeletedBy = undeletedBy._id

    this.additionalData = additionalData
    this.isDeleted = false

    await Globals.db.collection("submissions").updateOne({ _id: this._id }, { $set: { isDeleted: false, additionalData } })
  }

  async withIqdbHit(forAccount: Account | null, hit: IqdbHit, andWebify = false): Promise<WithIqdbHit<Submission> | Partial<WithIqdbHit<WebifiedSubmission>>> {
    if (!andWebify) {
      let clone: any = new Submission(this._id, this.id, this.aggregatorIndex, this.offsiteId, this.artistUrlId, this.isDeleted, this.md5, this.title, this.description, this.scrapeDate, this.creationDate, this.width, this.height, this.fileSize, this.sourceUrl, this.directLinkOffsite, this.extension, this.betterVersion, this.betterVersionNotDeleted, this.sampleGenerated, this.e621IqdbHits, this.additionalData)
      clone.hit = hit

      return clone
    } else {
      return await this.webifyWithIqdbHit(forAccount, hit)
    }
  }

  async webifyWithIqdbHit(forAccount: Account | null, hit: IqdbHit): Promise<Partial<WithIqdbHit<WebifiedSubmission>>> {
    // @ts-ignore
    let doc: Partial<WithIqdbHit<WebifiedSubmission>> = new Submission()
    for (let [key, value] of Object.entries(this)) {
      doc[key] = value
    }

    doc.artistUrlReference = await this.getArtistUrl()
    doc.artistReference = await doc.artistUrlReference.getArtist()
    doc.artistReference!.urlReferences = await doc.artistReference!.getArtistUrls!()
    doc.aggregator = await this.getAggregator()
    doc.dateTime = DateTime.fromJSDate(doc.creationDate)
    doc.hit = hit

    return doc
  }

  async webify(forAccount: Account | null): Promise<WebifiedSubmission> {
    // @ts-ignore
    let doc: Partial<WebifiedSubmission> = new Submission()
    for (let [key, value] of Object.entries(this)) {
      doc[key] = value
    }

    doc.artistUrlReference = await this.getArtistUrl()
    doc.artistReference = await doc.artistUrlReference.getArtist()
    doc.artistReference!.urlReferences = await doc.artistReference!.getArtistUrls!()
    doc.aggregator = await this.getAggregator()
    doc.dateTime = DateTime.fromJSDate(doc.creationDate)

    return doc
  }

  async getAggregator(): Promise<Aggregator | null> {
    return this.aggregatorIndex == -1 ? null : Globals.aggregationManager.aggregators[this.aggregatorIndex]
  }

  static fromDoc(doc) {
    /* @ts-ignore */
    let submission = new Submission()

    for (let [key, value] of Object.entries(doc)) {
      submission[key] = value
    }

    return submission
  }

  static async create(artistUrlId: ObjectId, offsiteId: string, sourceUrl: string, md5: string, title: string, description: string, creationDate: Date, width: number, height: number, fileSize: number, directLinkOffsite: string, extension: string, additionalData?: AdditionalData): Promise<Submission | null> {
    let artistUrl = await ArtistURL.findByObjectId(artistUrlId)

    if (!artistUrl) {
      console.error(`Unable to find artist url with id: ${artistUrlId}.`)
      return null
    }

    let aggregator = artistUrl.getAggregator() as Aggregator

    offsiteId = `${aggregator.host.toLowerCase()}_${offsiteId}`

    let existing = await Submission.findByOffsiteId(offsiteId)

    if (existing) return existing

    let _id = new ObjectId()
    let id = await Utils.getNextId("submissions")

    let submission = new Submission(_id, id, artistUrl.aggregator ?? -1, offsiteId, artistUrlId, false, md5, title.trim(), description.trim(), new Date(), creationDate, width, height, fileSize, sourceUrl, directLinkOffsite, extension, BetterVersion.UNKNOWN, BetterVersion.UNKNOWN, false, [], additionalData)
    await Globals.db.collection("submissions").insertOne(submission)

    let generatedSample = await Utils.generateSample(submission)
    if (generatedSample) {
      await submission.setSampleGenerated(true)
    }

    await artistUrl.addSubmission(_id)
    // await (await artistUrl.getArtist())?.addSubmission(_id)

    submission.queueE621IqdbCheck()
    return submission
  }

  static async findById(id: number): Promise<Submission | undefined> {
    let doc = await Globals.db.collection("submissions").findOne({ id })

    if (!doc) return

    return Submission.fromDoc(doc)
  }

  static async findByIds(ids: number[]): Promise<Submission[]> {
    let submissions: Submission[] = []

    for await (let sub of Globals.db.collection("submissions").find({ id: { $in: ids } })) {
      submissions.push(Submission.fromDoc(sub))
    }

    return submissions
  }

  static async findByMd5(md5: string): Promise<Submission | undefined> {
    let doc = await Globals.db.collection("submissions").findOne({ md5 })

    if (!doc) return

    return Submission.fromDoc(doc)
  }

  static async findManyByMd5(md5: string): Promise<Submission[]> {
    let docs = await Globals.db.collection("submissions").find({ md5 }).toArray()

    let submissions: Submission[] = []

    for (let submission of docs) {
      submissions.push(Submission.fromDoc(submission))
    }

    return submissions
  }

  static async findByObjectId(_id: ObjectId): Promise<Submission | undefined> {
    let doc = await Globals.db.collection("submissions").findOne({ _id })

    if (!doc) return

    return Submission.fromDoc(doc)
  }

  static async findByOffsiteId(offsiteId: string): Promise<Submission | undefined> {
    let doc = await Globals.db.collection("submissions").findOne({ offsiteId })

    if (!doc) return

    return Submission.fromDoc(doc)
  }

  static findByQuery(query: any): FindCursor<Document> {
    return Globals.db.collection("submissions").find(query)
  }

  static async findManyByObjectId(ids: ObjectId[], additionalQuery: any = {}): Promise<Submission[]> {
    return (await Globals.db.collection("submissions").find({ _id: { $in: ids }, ...additionalQuery }).toArray()).map(s => Submission.fromDoc(s))
  }

  static async findManyById(forAccount: Account | null, ids: number[], limit: number, page: number, andWebify: boolean = false): Promise<Submission[] | WebifiedSubmission[]> {
    if (!andWebify) return (await Globals.db.collection("submissions").find({ id: { $in: ids } }).sort({ creationDate: -1 }).skip((page - 1) * limit).limit(limit).toArray()).map(s => Submission.fromDoc(s))
    else {
      let submissions = (await Globals.db.collection("submissions").find({ id: { $in: ids } }).sort({ creationDate: -1 }).skip((page - 1) * limit).limit(limit).toArray()).map(s => Submission.fromDoc(s))

      let s: WebifiedSubmission[] = []

      for (let submission of submissions) {
        s.push(await submission.webify(forAccount))
      }

      return s
    }
  }

  static async getCountForQuery(query: any): Promise<number> {
    let count = await Globals.db.collection("submissions").countDocuments(query)
    return count
  }

  static async deleteMany(ids: ObjectId[]) {
    for (let sub of await Submission.findManyByObjectId(ids)) {
      let submission = Submission.fromDoc(sub)
      await submission.destroy()
    }
  }

  static async getAllSubmissions(forAccount: Account, query: SubmissionSearchQuery, andWebify: boolean = false): Promise<{ submissions: (Submission | WebifiedSubmission)[], totalPages: number }> {
    let q = Utils.buildSubmissionQuery(forAccount, query, {
      isDeleted: false
    })
    let submissions: (Submission | WebifiedSubmission)[] = []

    for await (let submission of Submission.findByQuery(q).sort(query.order == "newestFirst" ? { creationDate: -1 } : { creationDate: 1 }).skip((query.page - 1) * query.limit).limit(query.limit)) {
      let s = Submission.fromDoc(submission)
      if (andWebify) {
        submissions.push(await s.webify(forAccount))
      } else {
        submissions.push(s)
      }
    }

    let totalPages = Math.ceil(await Submission.getCountForQuery(q) / query.limit)
    return { submissions, totalPages }
  }
}

export default Submission