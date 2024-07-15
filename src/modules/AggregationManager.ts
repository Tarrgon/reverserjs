import path from "path"
import Aggregator from "../interfaces/Aggregator"
import fs from "fs"
import Globals from "./Globals"
import { NonObjectIdLikeDocument, ObjectId, WithId } from "mongodb"
import Utils from "./Utils"
import ArtistURL, { ArtistURLStatus } from "./ArtistURL"
import submissions from "../website/routes/submissions"
import Job, { JobPriority, JobStatus } from "./Job"
import JobQueue from "./JobQueue"

export type AggregationJobData = {
  artistUrlId: ObjectId
}

class AggregationManager {
  aggregators: Aggregator[] = []

  ready: boolean = false
  processing: boolean = false

  queue: JobQueue<AggregationJobData> = new JobQueue<AggregationJobData>()

  constructor() {
    let temp: Aggregator[] = []
    for (let p of fs.readdirSync(path.join(__dirname, "aggregators"))) {
      if (!p.endsWith("js")) continue

      let aggregator: Aggregator = new (require(path.join(__dirname, "aggregators", p)).default)(this) as Aggregator
      temp.push(aggregator)
    }

    temp.sort((a, b) => a.index - b.index)

    for (let i = temp[0].index; i <= temp[temp.length - 1].index; i++) {
      let aggregator = temp.find(a => a.index == i)
      if (aggregator) this.aggregators.push(aggregator)
      else this.aggregators.push(null as any) // :)
    }

    this.setupQueue()
  }

  async setupQueue() {
    for (let job of await Globals.db.collection("aggregationQueue").find({}).toArray()) {
      this.queue.addJob(await Job.findByObjectId(job.jobId) as Job<any>)
    }

    if (this.queue.hasMoreJobs()) this.processQueue()

    this.checkForAutoQueue()

    this.ready = true
  }

  async checkForAutoQueue() {
    let date = new Date(Date.now() - 86400000)
    for await (let artistUrl of ArtistURL.findByQuery({ status: ArtistURLStatus.DONE, aggregator: { $ne: -1 }, urlIdentifier: { $ne: "" }, lastScrapedAt: { $lte: date } })) {
      // console.log(`Auto queueing: ${artistUrl.url}`)
      if (artistUrl.status == ArtistURLStatus.DONT_AUTO_QUEUE) continue
      await ArtistURL.fromDoc(artistUrl).queue()
    }

    setTimeout(() => {
      this.checkForAutoQueue()
    }, 60000)
  }

  async addToQueue(artistUrl: ArtistURL, priority = JobPriority.NORMAL) {
    while (!this.ready) await Utils.wait(500)

    console.log("ADDING TO QUEUE")

    let existingJobIndex = this.queue.findIndex(job => job.jobData.artistUrlId == artistUrl._id)

    if (existingJobIndex != -1) {
      let job = this.queue.queue[existingJobIndex]

      if (priority > job.priority) {
        job.setPriority(priority)
        this.queue.removeAt(existingJobIndex)
        this.queue.addJob(job)
        if (!this.processing) this.processQueue()
      }

      return
    }

    let job = await Job.create(await (artistUrl.getAggregator() as Aggregator).createJobData(artistUrl), priority)

    await Globals.db.collection("aggregationQueue").insertOne({ jobId: job._id })

    this.queue.addJob(job)

    if (!this.processing) this.processQueue()
  }

  async retryJob(job: Job<AggregationJobData>) {
    while (!this.ready) await Utils.wait(500)

    this.queue.addJob(job)

    if (!this.processing) this.processQueue()
  }

  async processQueue() {
    if (!this.queue.hasMoreJobs()) {
      this.processing = false
      return
    }

    this.processing = true

    let job = this.queue.pop()

    let jobData = job.jobData

    let artistURL = await ArtistURL.findByObjectId(jobData.artistUrlId) as ArtistURL
    // console.log(`FETCHING ALL FOR ${artistURL.url}`)

    if (!artistURL) {
      await Globals.db.collection("aggregationQueue").deleteOne({ jobId: job._id })
      await job.setErrorData("Artist URL not found")
      return this.processQueue()
    }

    artistURL.fetchAll(job).then(async () => {
      await Globals.db.collection("aggregationQueue").deleteOne({ jobId: job._id })
      await job.setStatus(JobStatus.COMPLETE)
    }).catch(async (e) => {
      console.error(`Error fetching all for ${artistURL.urlIdentifier} (${artistURL._id})`)
      console.error(e)
      if (job.retryNumber >= 10) {
        artistURL.setStatus(ArtistURLStatus.DONT_AUTO_QUEUE)
        await Globals.db.collection("aggregationQueue").deleteOne({ jobId: job._id })
        await job.setErrorData(e.toString())
        this.processQueue()
        return
      }

      await job.retry()
      await this.retryJob(job)
    })

    this.processQueue()
  }

  async getIdentifiers(url: string): Promise<{ urlIdentifier: string, apiIdentifier: string } | null> {
    for (let aggregator of this.aggregators) {
      if (!aggregator) continue

      let match = aggregator.matchUrl(url)
      if (match && match.groups) {
        let id = await aggregator.getApiIdentifier(match.groups.artistIdentifier)

        if (!id) {
          console.error(`Could not get ID of: ${match.groups.artistIdentifier} for ${url}`)
          return null
        }

        return { urlIdentifier: match.groups.artistIdentifier, apiIdentifier: id }
      }
    }

    return null
  }

  getAggregator(url: string): Aggregator | null {
    for (let aggregator of this.aggregators) {
      if (!aggregator) continue
      let match = aggregator.matchUrl(url)
      if (match && match.groups) {
        return aggregator
      }
    }

    return null
  }
}

export default AggregationManager