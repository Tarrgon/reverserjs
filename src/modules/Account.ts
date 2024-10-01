import { Document, Filter, FindCursor, ObjectId } from "mongodb"
import Globals from "./Globals"
import Artist, { ARTIST_LISTING_LIMIT, WebifiedArtist } from "./Artist"
import Submission, { BetterVersion, WebifiedSubmission } from "./Submission"
import ArtistURL from "./ArtistURL"
import { ArtistSearchQuery, SubmissionSearchQuery } from "../interfaces/SearchQueries"
import Utils, { VIDEO_EXTENSIONS } from "./Utils"
const bcrypt = require("bcrypt")

export interface SiteData {
  session: string
}

type TempArtist = {
  name: string
  urls: string[]
  notes: string
  isCommissioner: boolean
}

export type AccountSettings = {
  descriptionTemplate?: string
  autoAddDateTag?: boolean
  sourceSimilarityCutoff?: number
  useSubmissionDateSyntax?: boolean
  discordId?: string
}

const DEFAULT_SETTINGS: AccountSettings = {
  descriptionTemplate: "{title}\n\n{description}"
}

class Account {
  _id: ObjectId
  username: string
  passwordHash: string
  settings: AccountSettings
  artistIds: ObjectId[]
  tempArtists: TempArtist[]
  submissionsBacklog: ObjectId[]
  ignoredSubmissions: ObjectId[]
  site: SiteData
  newAccount: boolean
  admin: boolean

  constructor(_id: ObjectId, username: string, passwordHash: string, settings: AccountSettings, artistIds: ObjectId[], tempArtists: TempArtist[], submissionsBacklog: ObjectId[], ignoredSubmissions: ObjectId[], site: SiteData, newAccount: boolean = false, admin: boolean = false) {
    this._id = _id
    this.username = username
    this.passwordHash = passwordHash
    this.settings = settings
    this.artistIds = artistIds
    this.tempArtists = tempArtists || []
    this.submissionsBacklog = submissionsBacklog
    this.ignoredSubmissions = ignoredSubmissions
    this.site = site
    this.newAccount = newAccount
    this.admin = admin
  }

  async setSetting(settingName: string, value: any) {
    this.settings[settingName] = value
    await Globals.db.collection("accounts").updateOne({ _id: this._id }, { $set: { settings: this.settings } })
  }

  async addWatchedArtist(artistId: ObjectId): Promise<void> {
    if (this.artistIds.find(id => id.equals(artistId))) return
    this.artistIds.push(artistId)
    await Globals.db.collection("accounts").updateOne({ _id: this._id }, { $push: { artistIds: artistId } })
  }

  async removeWatchedArtist(artistId: ObjectId): Promise<void> {
    let index = this.artistIds.findIndex(a => a.equals(artistId))
    if (index == -1) return
    this.artistIds.splice(index, 1)
    await Globals.db.collection("accounts").updateOne({ _id: this._id }, { $pull: { artistIds: artistId } })
  }

  async addTempArtist(name: string, urls: string[], notes: string, isCommissioner: boolean ) {
    name = name.trim()
    if (this.tempArtists.find(a => a.name == name)) return

    let temp: TempArtist = { name, urls, notes, isCommissioner }
    this.tempArtists.push(temp)
    await Globals.db.collection("accounts").updateOne({ _id: this._id }, { $push: { tempArtists: temp } })
  }

  async removeTempArtist(name: string) {
    let index = this.tempArtists.findIndex(a => a.name == name)

    if (index == -1) return

    this.tempArtists.splice(index, 1)
    await Globals.db.collection("accounts").updateOne({ _id: this._id }, { $pull: { tempArtists: { name } } })
  }

  getTempArtist(name: string): TempArtist | undefined {
    return this.tempArtists.find(t => t.name == name)
  }

  async addSubmissionToBacklog(submissionId: ObjectId): Promise<void> {
    if (this.submissionsBacklog.find(id => id.equals(submissionId))) return
    this.submissionsBacklog.push(submissionId)
    await Globals.db.collection("accounts").updateOne({ _id: this._id }, { $push: { submissionsBacklog: submissionId } })
  }

  async removeSubmissionFromBacklog(submissionId: ObjectId): Promise<void> {
    let index = this.submissionsBacklog.findIndex(s => s.equals(submissionId))
    if (index == -1) return
    this.submissionsBacklog.splice(index, 1)
    await Globals.db.collection("accounts").updateOne({ _id: this._id }, { $pull: { submissionsBacklog: submissionId } })
  }

  async hideSubmission(submissionId: ObjectId): Promise<void> {
    if (this.ignoredSubmissions.find(id => id.equals(submissionId))) return
    this.ignoredSubmissions.push(submissionId)
    await Globals.db.collection("accounts").updateOne({ _id: this._id }, { $push: { ignoredSubmissions: submissionId } })
  }

  async unhideSubmission(submissionId: ObjectId): Promise<void> {
    let index = this.ignoredSubmissions.findIndex(s => s.equals(submissionId))
    if (index == -1) return
    this.ignoredSubmissions.splice(index, 1)
    await Globals.db.collection("accounts").updateOne({ _id: this._id }, { $pull: { ignoredSubmissions: submissionId } })
  }

  async removeReferenceToSubmission(submissionId: ObjectId): Promise<void> {
    let anyRemoved = false

    let ignoredIndex = this.ignoredSubmissions.findIndex(s => s.equals(submissionId))
    if (ignoredIndex != -1) {
      anyRemoved = true
      this.ignoredSubmissions.splice(ignoredIndex, 1)
    }

    let backloggedIndex = this.submissionsBacklog.findIndex(s => s.equals(submissionId))
    if (backloggedIndex != -1) {
      anyRemoved = true
      this.submissionsBacklog.splice(backloggedIndex, 1)
    }

    if (anyRemoved) await Globals.db.collection("accounts").updateOne({ _id: this._id }, { $set: { ignoredSubmissions: this.ignoredSubmissions, submissionsBacklog: this.submissionsBacklog } })
  }

  async linkToSessionId(sessionId: string): Promise<void> {
    this.site.session = sessionId
    await Globals.db.collection("accounts").updateOne({ _id: this._id }, { $set: { "site.session": sessionId } })
  }

  async setPassword(password): Promise<void> {
    let passwordHash = await Account.saltAndHashPassword(password)
    this.passwordHash = passwordHash
    this.newAccount = false
    await Globals.db.collection("accounts").updateOne({ _id: this._id }, { $set: { passwordHash, newAccount: false } })
  }

  async fullSave(): Promise<void> {
    await Globals.db.collection("accounts").replaceOne({ _id: this._id }, this)
  }

  async getAllWatchedSubmissions(query: SubmissionSearchQuery, andWebify: boolean = false): Promise<{ submissions: (Submission | WebifiedSubmission)[], totalPages: number }> {
    let q = Utils.buildSubmissionQuery(this, query, {
      artistUrlId: { $in: (await this.getArtists() as Artist[]).flatMap(a => a.urls) },
      isDeleted: false
    })
    let submissions: (Submission | WebifiedSubmission)[] = []

    for await (let submission of Submission.findByQuery(q).sort(query.order == "newestFirst" ? { creationDate: -1 } : { creationDate: 1 }).skip((query.page - 1) * query.limit).limit(query.limit)) {
      let s = Submission.fromDoc(submission)
      if (andWebify) {
        submissions.push(await s.webify(this))
      } else {
        submissions.push(s)
      }
    }

    let totalPages = Math.ceil(await Submission.getCountForQuery(q) / query.limit)
    return { submissions, totalPages }
  }

  async getBackloggedSubmissions(query: SubmissionSearchQuery, andWebify: boolean = false): Promise<{ submissions: (Submission | WebifiedSubmission)[], totalPages: number }> {
    let q = Utils.buildSubmissionQuery(this, query)
    let finalQuery = Utils.mergeObjects({ _id: { $in: this.submissionsBacklog } }, q)
    let count = await Submission.getCountForQuery(finalQuery)
    let totalPages = Math.ceil(count / query.limit)

    if (query.order == "oldestFirst") {
      let start = query.limit * (query.page - 1)
      if (start >= this.submissionsBacklog.length) return { submissions: [], totalPages }

      let submissions = await Submission.findManyByObjectId(this.submissionsBacklog, q)

      let s: (Submission | WebifiedSubmission)[] = []

      for (let i = start; i < this.submissionsBacklog.length; i++) {
        let sub = submissions.find(s => s._id.equals(this.submissionsBacklog[i]))
        if (sub) {
          if (andWebify) {
            s.push(await sub.webify(this))
          } else {
            s.push(sub)
          }
        }

        if (s.length >= query.limit) break
      }

      return { submissions: s, totalPages }
    } else {
      let start = (this.submissionsBacklog.length - 1) - (query.limit * (query.page - 1))
      if (start < 0) return { submissions: [], totalPages }

      let submissions = await Submission.findManyByObjectId(this.submissionsBacklog, q)

      let s: (Submission | WebifiedSubmission)[] = []

      for (let i = start; i >= 0; i--) {
        let sub = submissions.find(s => s._id.equals(this.submissionsBacklog[i]))
        if (sub) {
          if (andWebify) {
            s.push(await sub.webify(this))
          } else {
            s.push(sub)
          }
        }

        if (s.length >= query.limit) break
      }

      return { submissions: s, totalPages }
    }
  }

  // async webify(): Promise<Partial<Account> & Partial<{ artistReferences: WebifiedArtist[], submissionBacklogReferences: Submission[], ignoredSubmissionReferences: Submission[] }>> {
  //   // @ts-ignore
  //   let doc: Partial<Account> & Partial<{ artistReferences: WebifiedArtist[], submissionBacklogReferences: Submission[], ignoredSubmissionReferences: Submission[] }> = new Account()
  //   for (let [key, value] of Object.entries(this)) {
  //     doc[key] = value
  //   }

  //   doc.artistReferences = await this.getArtists()
  //   doc.submissionBacklogReferences = await this.getSubmissionBacklog()
  //   doc.ignoredSubmissionReferences = await this.getIgnoredSubmissions()

  //   return doc
  // }

  async getArtists(andWebify: boolean = false): Promise<(WebifiedArtist[] | Artist[])> {
    if (andWebify) {
      let artists: WebifiedArtist[] = []

      for (let id of this.artistIds) {
        artists.push(await ((await Artist.findByObjectId(id)) as Artist).webify())
      }

      return artists
    } else {
      let artists: Artist[] = []

      for (let id of this.artistIds) {
        artists.push((await Artist.findByObjectId(id)) as Artist)
      }

      return artists
    }
  }

  // async getWatchedArtists(page: number): Promise<Artist[]> {
  //   let start = (page - 1) * ARTIST_LISTING_LIMIT
  //   let sliced = this.artistIds.slice(start, start + ARTIST_LISTING_LIMIT)

  //   return Artist.findManyByObjectId(sliced)
  // }

  async getWatchedArtists(query: ArtistSearchQuery, andWebify: boolean = false): Promise<{ artists: (Artist | WebifiedArtist)[], totalPages: number }> {
    let q = Utils.buildArtistQuery(query)
    let finalQuery = Utils.mergeObjects({ _id: { $in: this.artistIds } }, q)
    let count = await Artist.getCountForQuery(finalQuery)
    let totalPages = Math.ceil(count / ARTIST_LISTING_LIMIT)

    if (query.order == "oldestFirst") {
      let start = ARTIST_LISTING_LIMIT * (query.page - 1)
      if (start >= this.artistIds.length) return { artists: [], totalPages }

      let artists = await Artist.findManyByObjectId(this.artistIds, q)

      let a: (Artist | Promise<WebifiedArtist>)[] = []

      for (let i = start; i < this.artistIds.length; i++) {
        let art = artists.find(a => a._id.equals(this.artistIds[i]))
        if (art) {
          if (andWebify) {
            a.push(art.webify())
          } else {
            a.push(art)
          }
        }

        if (a.length >= ARTIST_LISTING_LIMIT) break
      }

      return { artists: await Promise.all(a), totalPages }
    } else {
      let start = (this.artistIds.length - 1) - (ARTIST_LISTING_LIMIT * (query.page - 1))
      if (start < 0) return { artists: [], totalPages }

      let artists = await Artist.findManyByObjectId(this.artistIds, q)

      let a: (Artist | Promise<WebifiedArtist>)[] = []

      for (let i = start; i >= 0; i--) {
        let art = artists.find(a => a._id.equals(this.artistIds[i]))
        if (art) {
          if (andWebify) {
            a.push(art.webify())
          } else {
            a.push(art)
          }
        }

        if (a.length >= ARTIST_LISTING_LIMIT) break
      }

      return { artists: await Promise.all(a), totalPages }
    }
  }

  getTotalArtistPages(): number {
    return Math.ceil(this.artistIds.length / ARTIST_LISTING_LIMIT)
  }

  async getSubmissionBacklog(): Promise<Submission[]> {
    let submissions: Submission[] = []

    for (let id of this.submissionsBacklog) {
      submissions.push(await Submission.findByObjectId(id) as Submission)
    }

    return submissions
  }

  async getIgnoredSubmissions(): Promise<Submission[]> {
    let submissions: Submission[] = []

    for (let id of this.ignoredSubmissions) {
      submissions.push(await Submission.findByObjectId(id) as Submission)
    }

    return submissions
  }

  static fromDoc(doc): Account {
    /* @ts-ignore */
    let acc = new Account()

    for (let [key, value] of Object.entries(doc)) {
      acc[key] = value
    }

    return acc
  }

  static async findBySessionId(sessionId: string): Promise<Account | undefined> {
    let doc = await Globals.db.collection("accounts").findOne({ "site.session": sessionId })

    if (!doc) return

    return Account.fromDoc(doc)
  }

  static async findById(_id: ObjectId): Promise<Account | undefined> {
    let doc = await Globals.db.collection("accounts").findOne({ _id })

    if (!doc) return

    return Account.fromDoc(doc)
  }

  static async findByUsername(username: string): Promise<Account | undefined> {
    let doc = await Globals.db.collection("accounts").findOne({ username })

    if (!doc) return

    return Account.fromDoc(doc)
  }

  static findByQuery(query: any): FindCursor<Document> {
    return Globals.db.collection("accounts").find(query)
  }

  static async findByDiscordId(discordId: string): Promise<Account | undefined> {
    let doc = await Globals.db.collection("accounts").findOne({ "settings.discordId": discordId })

    if (!doc) return

    return Account.fromDoc(doc)
  }

  static async create(username: string, password: string): Promise<Account> {
    let existingAccount = await Account.findByUsername(username)
    if (existingAccount) return existingAccount

    let passwordHash = await Account.saltAndHashPassword(password)

    let _id = new ObjectId()
    let account = new Account(_id, username, passwordHash, DEFAULT_SETTINGS, [], [], [], [], { session: "" })
    account.newAccount = true
    await Globals.db.collection("accounts").insertOne(account)
    return account
  }

  static async authenticate(username: string, password: string): Promise<Account | undefined> {
    let account = await Account.findByUsername(username)
    if (!account) return
    if (await bcrypt.compare(password, account.passwordHash)) return account
  }

  static async saltAndHashPassword(password: string): Promise<string> {
    return await bcrypt.hash(password, 10)
  }
}

export default Account