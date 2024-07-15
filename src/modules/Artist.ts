import { Document, FindCursor, ObjectId } from "mongodb"
import Globals from "./Globals"
import AggregationManager from "./AggregationManager"
import ArtistURL, { WebifiedArtistURL } from "./ArtistURL"
import Utils from "./Utils"
import Submission, { WebifiedSubmission } from "./Submission"
import { ArtistSearchQuery, SubmissionSearchQuery } from "../interfaces/SearchQueries"
import Account from "./Account"
import Logs, { ArtistRemovalLog, LogType } from "./Logs"

export const ARTIST_LISTING_LIMIT: number = 20

export type WebifiedArtist = Partial<Artist> & Partial<{ submissionReferences: Submission[], urlReferences: WebifiedArtistURL[], noteReferences: { noter: string, content: string }[], lastScrapedAt: Date | null }>

export type ArtistNote = {
  noter: ObjectId
  content: string
}

class Artist {
  _id: ObjectId
  createdBy: ObjectId
  createdAt: Date
  purgeBefore?: Date | null
  id: number
  name: string
  urls: ObjectId[]
  // submissions: ObjectId[]
  notes: ArtistNote[]

  constructor(_id: ObjectId, createdBy: ObjectId, createdAt: Date, purgeBefore: Date | null, id: number, name: string, urls: ObjectId[] = [], /*submissions: ObjectId[] = [],*/ notes: ArtistNote[] = []) {
    this._id = _id
    this.createdBy = createdBy
    this.createdAt = createdAt
    this.purgeBefore = purgeBefore
    this.id = id
    this.name = name
    this.urls = urls
    // this.submissions = submissions
    this.notes = notes
  }

  async webify(): Promise<WebifiedArtist> {
    // @ts-ignore
    let doc: WebifiedArtist = new Artist()
    for (let [key, value] of Object.entries(this)) {
      doc[key] = value
    }

    doc.submissionReferences = await this.getSubmissions()
    doc.urlReferences = await this.getArtistUrls()
    let lastScrapedAt = [...doc.urlReferences].filter(u => u.lastScrapedAt && u.lastScrapedAt.getFullYear() > 2020 && u.getAggregator?.()?.canFetch).sort((a, b) => (a.lastScrapedAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.lastScrapedAt?.getTime() ?? Number.MAX_SAFE_INTEGER))[0]?.lastScrapedAt
    doc.lastScrapedAt = !lastScrapedAt || doc.submissionReferences?.length == 0 ? null : lastScrapedAt?.getTime() == Number.MAX_SAFE_INTEGER ? null : lastScrapedAt

    let noters: Map<ObjectId, string> = new Map()

    for (let note of this.notes) {
      noters.set(note.noter, (await Account.findById(note.noter))?.username ?? "")
    }

    doc.noteReferences = this.notes.map(n => ({ noter: noters.get(n.noter) as string, content: n.content }))

    return doc
  }

  async setName(name: string): Promise<void> {
    this.name = name.trim()
    await Globals.db.collection("artists").updateOne({ _id: this._id }, { $set: { name: this.name } })
  }

  // async addSubmissions(ids: ObjectId[]): Promise<void> {
  //   this.submissions.push(...ids)
  //   await Globals.db.collection("artists").updateOne({ _id: this._id }, { $push: { submissions: { $each: ids } } })
  // }

  // async addSubmission(id: ObjectId): Promise<void> {
  //   this.submissions.push(id)
  //   await Globals.db.collection("artists").updateOne({ _id: this._id }, { $push: { submissions: id } })
  // }

  // async removeSubmission(id: ObjectId): Promise<void> {
  //   let index = this.submissions.findIndex(s => s.equals(id))

  //   if (index == -1) return

  //   this.submissions.splice(index, 1)
  //   await Globals.db.collection("artists").updateOne({ _id: this._id }, { $set: { submissions: this.submissions } })
  // }

  async getSubmissions(): Promise<Submission[]> {
    let urls = await this.getArtistUrls()

    let submissions: Submission[] = await Submission.findManyByObjectId(urls.map(u => u.submissions).flat())

    return submissions
  }

  async addNote(from: Account, content: string): Promise<void> {
    let note: ArtistNote = { noter: from._id, content }
    this.notes.push(note)
    await Globals.db.collection("artists").updateOne({ _id: this._id }, { $push: { notes: note } })
  }

  async removeNote(index: number): Promise<void> {
    if (index >= this.notes.length) return
    this.notes.splice(index, 1)
    await Globals.db.collection("artists").updateOne({ _id: this._id }, { $set: { notes: this.notes } })
  }

  async addArtistUrl(createdBy: Account, url: string, queue: boolean = true): Promise<ArtistURL> {
    let currentUrls: ArtistURL[] = await this.getArtistUrls() as ArtistURL[]

    let existingUrl: ArtistURL | undefined
    if ((existingUrl = currentUrls.find(u => u.url == url))) {
      if (queue) await existingUrl.queue()

      // await this.addSubmissions(existingUrl.submissions)

      return existingUrl
    }

    let identifiers = await Globals.aggregationManager.getIdentifiers(url)

    if (!identifiers) {
      console.error(`Could not get identifiers for: ${url}`)
    } else {
      let aggregatorIndex: number = Globals.aggregationManager.getAggregator(url)?.index ?? -1
      if (aggregatorIndex != -1 && (existingUrl = currentUrls.find(u => u.aggregator == aggregatorIndex && u.urlIdentifier == identifiers.urlIdentifier && u.apiIdentifier == identifiers.apiIdentifier))) {
        if (queue) await existingUrl.queue()
        return existingUrl
      }
    }

    let artistUrl = await ArtistURL.create(this._id, createdBy._id, url, queue) as ArtistURL

    await Globals.db.collection("artists").updateOne({ _id: this._id }, { $push: { urls: artistUrl._id } })

    return artistUrl
  }

  async addArtistUrls(createdBy: Account, urls: string[], queue: boolean = true): Promise<ArtistURL[]> {
    let artistUrls: ArtistURL[] = []

    for (let url of urls) {
      if (!Utils.isValidUrl(url)) continue

      let artistUrl = await this.addArtistUrl(createdBy, url, false)

      artistUrls.push(artistUrl)
    }

    if (queue) {
      for (let artistUrl of artistUrls) {
        await artistUrl.queue()
      }
    }

    return artistUrls
  }

  async removeArtistUrl(id: ObjectId, removedBy: ObjectId): Promise<boolean> {
    let index = this.urls.findIndex(u => u.equals(id))

    if (index == -1) return false

    // let artistUrl = (await ArtistURL.findByObjectId(id)) as ArtistURL

    // let submissionsToRemove = artistUrl.submissions

    // this.submissions = this.submissions.filter(s => !submissionsToRemove.some(s2 => s2.equals(s)))

    this.urls.splice(index, 1)
    await Globals.db.collection("artists").updateOne({ _id: this._id }, { $pull: { urls: id } })

    await Logs.addLog(LogType.ARTIST_URL_REMOVAL, new ArtistRemovalLog(removedBy, new Date()))

    return true
  }

  async deleteArtist() {
    // await Submission.deleteMany(this.submissions)
    let urls = await this.getArtistUrls()
    await Submission.deleteMany(urls.map(u => u.submissions).flat())
    await ArtistURL.deleteMany(await this.getArtistUrls())
    await Globals.db.collection("artists").deleteOne({ _id: this._id })

    for await (let acc of Account.findByQuery({})) {
      let account = Account.fromDoc(acc)
      if (account.artistIds.find(id => id.equals(this._id))) {
        account.removeWatchedArtist(this._id)
      }
    }
  }

  async removeArtistUrlById(id: number, removedBy: Account): Promise<boolean> {
    let url = await ArtistURL.findById(id)

    if (!url) return false

    return await this.removeArtistUrl(url._id, removedBy._id)
  }

  async getArtistUrls(): Promise<ArtistURL[]> {
    let urls: ArtistURL[] = []
    for (let url of this.urls) {
      let u = await ArtistURL.findByObjectId(url)
      if (u) urls.push(u)
    }

    return urls
  }

  async queueScraping() {
    for (let url of (await this.getArtistUrls() as ArtistURL[])) {
      await url.queue()
    }
  }

  async getAllSubmissions(from: Account, query: SubmissionSearchQuery, andWebify: boolean = false): Promise<{ submissions: (Submission | WebifiedSubmission)[], totalPages: number }> {
    let q = Utils.buildSubmissionQuery(from, query, {
      artistUrlId: { $in: this.urls },
      isDeleted: false
    })

    let submissions: (Submission | WebifiedSubmission)[] = []

    for await (let submission of Submission.findByQuery(q).sort(query.order == "newestFirst" ? { creationDate: -1 } : { creationDate: 1 }).skip((query.page - 1) * query.limit).limit(query.limit)) {
      let s = Submission.fromDoc(submission)
      if (andWebify) {
        submissions.push(await s.webify(from))
      } else {
        submissions.push(s)
      }
    }

    let totalPages = Math.ceil(await Submission.getCountForQuery(q) / query.limit)
    return { submissions, totalPages }
  }

  static fromDoc(doc): Artist {
    /* @ts-ignore */
    let artist = new Artist()

    for (let [key, value] of Object.entries(doc)) {
      artist[key] = value
    }

    return artist
  }

  static fromDocs(docs): Artist[] {
    let artists: Artist[] = []

    for (let doc of docs) {
      /* @ts-ignore */
      let artist = new Artist()

      for (let [key, value] of Object.entries(doc)) {
        artist[key] = value
      }

      artists.push(artist)
    }

    return artists
  }

  static async getTotalArtistPages(): Promise<number> {
    return Math.ceil((await Globals.db.collection("artists").countDocuments({})) / ARTIST_LISTING_LIMIT)
  }

  static async getAllArtists(page: number, andWebify: boolean = false): Promise<Artist[] | WebifiedArtist[]> {
    let artists = (await Globals.db.collection("artists").find({}).limit(ARTIST_LISTING_LIMIT).skip((page - 1) * ARTIST_LISTING_LIMIT).toArray()).map(doc => Artist.fromDoc(doc))

    if (andWebify) {
      let arts: WebifiedArtist[] = []

      let promises: Promise<any>[] = []

      for (let artist of artists) {
        let p = artist.webify()
        promises.push(p)
        p.then((a) => {
          arts.push(a)
        })
      }

      await Promise.all(promises)

      arts.sort((a, b) => (a.id as number) - (b.id as number))

      return arts
    } else {
      return artists
    }
  }

  static async getAllArtistsByQuery(query: ArtistSearchQuery, andWebify: boolean = false): Promise<{ artists: Artist[] | WebifiedArtist[], totalPages: number }> {
    let q = Utils.buildArtistQuery(query)
    let artists: (Artist | WebifiedArtist)[] = []

    for await (let artist of Artist.findByQuery(q).sort(query.order == "newestFirst" ? { id: -1 } : { id: 1 }).skip((query.page - 1) * ARTIST_LISTING_LIMIT).limit(ARTIST_LISTING_LIMIT)) {
      let a = Artist.fromDoc(artist)
      if (andWebify) {
        artists.push(await a.webify())
      } else {
        artists.push(a)
      }
    }

    let totalPages = Math.ceil(await Artist.getCountForQuery(q) / ARTIST_LISTING_LIMIT)
    return { artists, totalPages }
  }

  private static BEING_ADDED: Record<string, Promise<Artist>> = {}

  static async create(createdBy: Account, name: string, urls: string[], notes: string = "", purgeBefore = null): Promise<Artist> {
    let existing = await Artist.findByName(name.trim())

    urls = Array.from(new Set(urls.map(u => Utils.normalizeUrl(u))))

    if (existing) {
      await existing.addArtistUrls(createdBy, urls)

      return existing
    }

    console.log(`Creating artist: ${name} with ${urls.length} urls`)

    // @ts-ignore
    if (Artist.BEING_ADDED[name]) return await Artist.BEING_ADDED[name]

    let promise: Promise<Artist> = new Promise(async (resolve) => {
      let _id = new ObjectId()
      let id = await Utils.getNextId("artists")

      let artistUrls: ArtistURL[] = []

      for (let url of urls) {
        if (!Utils.isValidUrl(url)) continue
        let u = await ArtistURL.create(_id, createdBy._id, url, false) as ArtistURL
        artistUrls.push(u)
      }

      let artist = new Artist(_id, createdBy._id, new Date(), purgeBefore, id, name.trim(), artistUrls.map(a => a._id), /*[],*/ notes.length > 0 ? [{ noter: createdBy._id, content: notes }] : [])

      await Globals.db.collection("artists").insertOne(artist)

      await artist.queueScraping()

      return resolve(artist)
    })

    Artist.BEING_ADDED[name] = promise

    let artist = await promise

    delete Artist.BEING_ADDED[name]

    await createdBy?.addWatchedArtist(artist._id)

    for await (let account of Account.findByQuery({ "tempArtists.name": name })) {
      await Account.fromDoc(account).removeTempArtist(name)
    }

    return artist
  }

  static async findById(id: number): Promise<Artist | undefined> {
    let doc = await Globals.db.collection("artists").findOne({ id })

    if (!doc) return

    return Artist.fromDoc(doc)
  }

  static async findManyById(ids: number[]): Promise<Artist[]> {
    let docs = await Globals.db.collection("artists").find({ id: { $in: ids } }).toArray()

    return Artist.fromDocs(docs)
  }

  static async findByName(name: string): Promise<Artist | undefined> {
    let doc = await Globals.db.collection("artists").findOne({ name })

    if (!doc) return

    return Artist.fromDoc(doc)
  }

  static async findByObjectId(_id: ObjectId): Promise<Artist | undefined> {
    let doc = await Globals.db.collection("artists").findOne({ _id })

    if (!doc) return

    return Artist.fromDoc(doc)
  }

  static async findManyByObjectId(ids: ObjectId[], additionalQuery: any = {}): Promise<Artist[]> {
    return Artist.fromDocs(await Globals.db.collection("artists").find({ _id: { $in: ids }, ...additionalQuery }).toArray())
  }

  static findByQuery(query: any): FindCursor<Document> {
    return Globals.db.collection("artists").find(query)
  }

  static async getCountForQuery(query: any): Promise<number> {
    let count = await Globals.db.collection("artists").countDocuments(query)
    return count
  }
}

export default Artist