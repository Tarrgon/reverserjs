import { Document, FindCursor, ObjectId, WithId } from "mongodb"
import Globals from "./Globals"
import AggregationManager from "./AggregationManager"
import Utils from "./Utils"
import Aggregator from "../interfaces/Aggregator"
import Submission from "./Submission"
import Artist from "./Artist"
import Job from "./Job"

export const enum ArtistURLStatus {
  DONE = 0,
  QUEUED = 1,
  SCRAPING = 2,
  DONT_AUTO_QUEUE = 3
}

export type WebifiedArtistURL = Partial<ArtistURL> & Partial<{ aggregatorReference: Aggregator | null, submissionReferences: Submission[] }>

class ArtistURL {
  _id: ObjectId
  createdBy: ObjectId
  createdAt: Date
  id: number
  artistId: ObjectId
  url: string
  submissions: ObjectId[]
  urlIdentifier: string
  apiIdentifier: string
  lastScrapedAt: Date
  status: ArtistURLStatus
  aggregator: number

  constructor(_id: ObjectId, createdBy: ObjectId, createdAt: Date, id: number, artistId: ObjectId, url: string, submissions: ObjectId[], urlIdentifier: string, apiIdentifier: string, status: ArtistURLStatus, lastScrapedAt: Date = new Date(0)) {
    this._id = _id
    this.createdBy = createdBy
    this.createdAt = createdAt
    this.id = id
    this.artistId = artistId
    this.url = url
    this.submissions = submissions
    this.urlIdentifier = urlIdentifier
    this.apiIdentifier = apiIdentifier
    this.status = status
    this.lastScrapedAt = lastScrapedAt
    this.aggregator = Globals.aggregationManager.getAggregator(url)?.index ?? -1
  }

  async webify(): Promise<WebifiedArtistURL> {
    // @ts-ignore
    let doc: WebifiedArtistURL = new ArtistURL()
    for (let [key, value] of Object.entries(this)) {
      doc[key] = value
    }

    doc.submissionReferences = await this.getSubmissions()
    doc.aggregatorReference = await this.getAggregator()

    return doc
  }

  async getSubmissions(): Promise<Submission[]> {
    let submissions: Submission[] = []
    for (let submission of this.submissions) {
      let s = await Submission.findByObjectId(submission)
      if (s) submissions.push(s)
    }

    return submissions
  }

  async getArtist(): Promise<Artist | undefined> {
    return await Artist.findByObjectId(this.artistId)
  }

  async addSubmission(id: ObjectId) {
    this.submissions.push(id)
    await Globals.db.collection("artistUrls").updateOne({ _id: this._id }, { $push: { submissions: id } })
  }

  async removeSubmission(id: ObjectId): Promise<void> {
    let index = this.submissions.findIndex(s => s.equals(id))

    if (index == -1) return

    this.submissions.splice(index, 1)
    await Globals.db.collection("artistUrls").updateOne({ _id: this._id }, { $set: { submissions: this.submissions } })
  }

  async setStatus(status: ArtistURLStatus) {
    this.status = status
    await Globals.db.collection("artistUrls").updateOne({ _id: this._id }, { $set: { status } })
  }

  async backfillIdentifiers(): Promise<boolean> {
    if (this.aggregator == -1 || this.urlIdentifier == "" || this.apiIdentifier == "") {
      let identifiers = await Globals.aggregationManager.getIdentifiers(this.url)

      if (!identifiers) return false

      this.urlIdentifier = identifiers.urlIdentifier
      this.apiIdentifier = identifiers.apiIdentifier
      this.aggregator = (Globals.aggregationManager.getAggregator(this.url) as Aggregator).index
      await Globals.db.collection("artistUrls").updateOne({ _id: this._id }, { $set: { urlIdentifier: this.urlIdentifier, apiIdentifier: this.apiIdentifier, aggregator: this.aggregator } })
    }

    return true
  }

  async queue(): Promise<void> {
    if (this.aggregator == -1 || this.urlIdentifier == "" || this.apiIdentifier == "") {
      if (this.aggregator != -1 && !this.getAggregator()?.canFetch) return
      if (!await this.backfillIdentifiers()) {
        this.status = ArtistURLStatus.DONT_AUTO_QUEUE
        await Globals.db.collection("artistUrls").updateOne({ _id: this._id }, { $set: { status: ArtistURLStatus.DONE } })
        return
      }
    }

    if (!this.getAggregator()?.canFetch) {
      this.status = ArtistURLStatus.DONT_AUTO_QUEUE
      await Globals.db.collection("artistUrls").updateOne({ _id: this._id }, { $set: { status: ArtistURLStatus.DONE } })
      return
    }

    this.status = ArtistURLStatus.QUEUED
    await Globals.db.collection("artistUrls").updateOne({ _id: this._id }, { $set: { status: ArtistURLStatus.QUEUED } })
    await Globals.aggregationManager.addToQueue(this)
  }

  async fetchAll(job: Job<any>): Promise<void> {
    try {
      let aggregator = this.getAggregator()

      if (!aggregator?.canFetch) {
        await Globals.db.collection("artistUrls").updateOne({ _id: this._id }, { $set: { status: ArtistURLStatus.DONT_AUTO_QUEUE } })
        return
      }

      if (aggregator) {
        let now = new Date()
        await Globals.db.collection("artistUrls").updateOne({ _id: this._id }, { $set: { status: ArtistURLStatus.SCRAPING } })
        let updateLastScrapedAt = await aggregator.fetchAll(this._id, job)
        if (updateLastScrapedAt) await Globals.db.collection("artistUrls").updateOne({ _id: this._id }, { $set: { lastScrapedAt: now, status: ArtistURLStatus.DONE } })
        else await Globals.db.collection("artistUrls").updateOne({ _id: this._id }, { $set: { status: ArtistURLStatus.DONE } })
      }
    } catch (e) {
      console.error(`Error fetching all for: ${job.jobData}`)
      console.error(e)
      throw e
    }
  }

  getAggregator(): Aggregator | null {
    return this.aggregator == -1 ? null : Globals.aggregationManager.aggregators[this.aggregator]
  }

  static fromDoc(doc): ArtistURL {
    /* @ts-ignore */
    let artistUrl = new ArtistURL()

    for (let [key, value] of Object.entries(doc)) {
      artistUrl[key] = value
    }

    return artistUrl
  }

  static getAggregatorFromUrl(url: string) {
    for (let aggregator of Globals.aggregationManager.aggregators) {
      if (!aggregator) continue
      if (aggregator.testUrl(url)) return aggregator
    }
  }

  static async queueAll(): Promise<void> {
    for (let url of await ArtistURL.getAllArtistUrls()) {
      url.queue?.()
    }
  }

  static async getAllArtistUrls(andWebify: boolean = false): Promise<ArtistURL[] | WebifiedArtistURL[]> {
    let urls = (await Globals.db.collection("artistUrls").find({}).toArray()).map(doc => ArtistURL.fromDoc(doc))

    if (andWebify) {
      let us: WebifiedArtistURL[] = []

      for (let url of urls) {
        us.push(await url.webify())
      }

      return us
    } else {
      return urls
    }
  }

  static async create(artistId: ObjectId, createdBy: ObjectId, url: string, queue: boolean = true): Promise<ArtistURL | undefined> {
    if (!Utils.isValidUrl(url)) return

    url = Utils.normalizeUrl(url)
    let existingUrl = await ArtistURL.findByUrl(url)

    if (existingUrl) return existingUrl

    let identifiers = await Globals.aggregationManager.getIdentifiers(url)

    if (!identifiers) {
      console.error(`Could not get identifiers for: ${url}`)
    } else {
      existingUrl = await ArtistURL.findByIdentifiers(Globals.aggregationManager.getAggregator(url)?.index ?? -1, identifiers)

      if (existingUrl) return existingUrl
    }

    let _id = new ObjectId()
    let id = await Utils.getNextId("artistUrls")

    let artistUrl = new ArtistURL(_id, createdBy, new Date(), id, artistId, url, [], identifiers?.urlIdentifier ?? "", identifiers?.apiIdentifier ?? "", ArtistURLStatus.QUEUED)

    await Globals.db.collection("artistUrls").insertOne(artistUrl)

    if (queue) await artistUrl.queue()

    return artistUrl
  }

  static async findById(id: number): Promise<ArtistURL | undefined> {
    let doc = await Globals.db.collection("artistUrls").findOne({ id })

    if (!doc) return

    return ArtistURL.fromDoc(doc)
  }

  static async findByObjectId(_id: ObjectId): Promise<ArtistURL | undefined> {
    let doc = await Globals.db.collection("artistUrls").findOne({ _id })

    if (!doc) return

    return ArtistURL.fromDoc(doc)
  }

  static async findByStatus(status: ArtistURLStatus): Promise<ArtistURL[]> {
    return (await Globals.db.collection("artistUrls").find({ status }).toArray()).map(doc => ArtistURL.fromDoc(doc))
  }

  static async findByUrl(url: string): Promise<ArtistURL | undefined> {
    let u = await Globals.db.collection("artistUrls").findOne({ url })

    if (u) return ArtistURL.fromDoc(u)
  }

  static async findByIdentifiers(aggregatorIndex: number, identifiers: { apiIdentifier: string, urlIdentifier: string }): Promise<ArtistURL | undefined> {
    if (aggregatorIndex == -1) return undefined

    let u = await Globals.db.collection("artistUrls").findOne({ aggregator: aggregatorIndex, apiIdentifier: identifiers.apiIdentifier, urlIdentifier: identifiers.urlIdentifier })

    if (u) return ArtistURL.fromDoc(u)
  }

  static findByQuery(query: any): FindCursor<Document> {
    return Globals.db.collection("artistUrls").find(query)
  }

  static async deleteMany(artistUrls: ArtistURL[]) {
    for (let artistUrl of artistUrls) await Submission.deleteMany(artistUrl.submissions)

    await Globals.db.collection("artistUrls").deleteMany({ _id: { $in: artistUrls.map(a => a._id) } })
  }
}

export default ArtistURL