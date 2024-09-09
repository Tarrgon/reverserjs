import sharp from "sharp"
import Globals from "./Globals"
import Submission from "./Submission"
import IqdbHit from "../interfaces/IqdbHit"
import Utils from "./Utils"
import JobQueue from "./JobQueue"
import { ObjectId } from "mongodb"
import Job, { JobPriority, JobStatus } from "./Job"

const VIDEO_EXTENSIONS = ["mp4", "m4p", "m4v", "webm", "mk4", "flv", "vob", "ogg", "ogv", "avi", "mov", "qt", "amv", "mpg", "mp2", "mpeg", "mpe", "mpv", "m2v", "m3u8"]
const VALID_CONTENT_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"]
const IQDB_PIXELS = 128

export async function getChannelInfo(input: string | Buffer): Promise<{ r: number[], b: number[], g: number[] } | { error: boolean, message: string }> {
  let { data, info } = await sharp(input).resize(IQDB_PIXELS, IQDB_PIXELS, { fit: "fill" }).jpeg({ quality: 90 }).raw().toBuffer({ resolveWithObject: true })

  if (info.channels == 2) {
    return {
      error: true,
      message: "Wrong number of channels."
    }
  }

  let pixelArray = new Uint8ClampedArray(data.buffer)

  let r: number[] = []
  let g: number[] = []
  let b: number[] = []

  for (let i = 0; i < pixelArray.length; i += info.channels) {
    if (info.channels == 1) {
      r.push(pixelArray[i])
      g.push(pixelArray[i])
      b.push(pixelArray[i])
    } else {
      r.push(pixelArray[i])
      g.push(pixelArray[i + 1])
      b.push(pixelArray[i + 2])
    }
  }

  return { r, g, b }
}

async function processIqdbResponse(data: any, scoreCutoff = 85): Promise<IqdbHit[]> {
  if (data.message) throw new Error(data.message)

  let results: IqdbHit[] = []

  data = data.filter(d => d.post_id && d.score >= scoreCutoff)

  let submissions = await Submission.findManyById(null, data.map(d => d.post_id), Number.MAX_SAFE_INTEGER, 1, false)

  for (let res of data) {
    let hit = (submissions.find(s => s.id == res.post_id) as Submission)?.getIqdbHitData(res.score)
    if (hit) results.push(hit)
  }

  results.sort((a, b) => b.score - a.score)

  return results
}

class IqdbManager {
  static queue: JobQueue<ObjectId> = new JobQueue<ObjectId>()
  static processing: boolean = false
  static ready: boolean = false

  static async setup() {
    IqdbManager.ready = false

    for (let job of await Globals.db.collection("iqdbQueue").find({}).toArray()) {
      IqdbManager.queue.addJob(await Job.findByObjectId(job.jobId) as Job<ObjectId>)
    }

    IqdbManager.ready = true

    IqdbManager.processQueue()
  }

  private static async retryJob(job: Job<ObjectId>) {
    while (!IqdbManager.ready) await Utils.wait(500)

    IqdbManager.queue.addJob(job)

    if (!IqdbManager.processing) IqdbManager.processQueue()
  }

  private static async processQueue() {
    if (!IqdbManager.queue.hasMoreJobs()) {
      IqdbManager.processing = false
      return
    }

    IqdbManager.processing = true

    let job = IqdbManager.queue.pop()

    let submission = await Submission.findByObjectId(job.jobData) as Submission

    if (!submission) {
      await Globals.db.collection("iqdbQueue").deleteOne({ jobId: job._id })
      await job.setErrorData("Submission not found")
      return IqdbManager.processQueue()
    }

    try {
      let success = await IqdbManager.addSubmission(submission)
      if (!success) {
        if (job.retryNumber >= 10) {
          await Globals.db.collection("iqdbQueue").deleteOne({ jobId: job._id })
          await job.setErrorData("")
          await Utils.wait(50)
          IqdbManager.processQueue()
          return
        }

        await job.retry()
        await IqdbManager.retryJob(job)
      } else {
        await Globals.db.collection("iqdbQueue").deleteOne({ jobId: job._id })
      }
    } catch (e) {
      console.error(`Error adding submission to iqdb (${submission.id})`)
      console.error(e)
      if (job.retryNumber >= 10) {
        await Globals.db.collection("iqdbQueue").deleteOne({ jobId: job._id })
        await job.setErrorData(e)
        await Utils.wait(50)
        IqdbManager.processQueue()
        return
      }

      await job.retry()
      await IqdbManager.retryJob(job)
    }

    await Utils.wait(50)
    IqdbManager.processQueue()
  }

  static async addToQueue(submissionId: ObjectId, priority = JobPriority.NORMAL) {
    while (!IqdbManager.ready) await Utils.wait(500)

    let existingJobIndex = IqdbManager.queue.findIndex(job => job.jobData == submissionId)

    if (existingJobIndex != -1) {
      let job = IqdbManager.queue.queue[existingJobIndex]

      if (priority > job.priority) {
        job.setPriority(priority)
        IqdbManager.queue.removeAt(existingJobIndex)
        IqdbManager.queue.addJob(job)
        if (!IqdbManager.processing) IqdbManager.processQueue()
      }

      return
    }

    let job = await Job.create(submissionId, priority)

    await Globals.db.collection("iqdbQueue").insertOne({ jobId: job._id })

    IqdbManager.queue.addJob(job)

    if (!IqdbManager.processing) IqdbManager.processQueue()
  }

  static async addSubmission(submission: Submission): Promise<boolean> {
    try {
      if (!submission.sampleGenerated) return false

      let data: any
      if (!VIDEO_EXTENSIONS.includes(submission.extension)) data = await getChannelInfo(submission.getFilePath())
      else data = await getChannelInfo(submission.getThumbnailPath())

      if (data.error) {
        console.error(`Cannot create IQDB data for ${submission._id}. ${data.message}`)
        return false
      }

      let { r, g, b } = data

      let res = await fetch(`http://localhost:${Globals.config.iqdb.port}/images/${submission.id}`, {
        method: "POST",
        body: JSON.stringify({ channels: { r, g, b } })
      })

      if (!res.ok) {
        console.error(`Error posting IQDB data for ${submission._id}:`)
        console.error(await res.text())
        return false
      }

      // console.log(`ADDED SUBMISSION ${submission.id} TO IQDB`)

      return true
    } catch (e) {
      console.error(`FAILED TO ADD SUBMISSION ${submission.id} TO IQDB`)
      console.error(e)
      return false
    }
  }

  static async removeId(id: number): Promise<boolean> {
    try {
      let res = await fetch(`http://localhost:${Globals.config.iqdb.port}/images/${id}`, {
        method: "DELETE"
      })

      if (!res.ok) {
        console.error(`Error deleting IQDB data for ${id}:`)
        console.error(await res.text())
        return false
      }

      return true
    } catch (e) {
      console.error(`FAILED TO REMOVE SUBMISSION ${id} FROM IQDB`)
      console.error(e)
      return false
    }
  }

  static async queryUrl(url: string, scoreCutoff: number = 85): Promise<IqdbHit[]> {
    try {
      let match
      if ((match = /https:\/\/(?:e621|e926)\.net\/posts\/(\d*)\??/.exec(url)) != null) {
        let id = match[1]
        let res = await fetch(`https://e621.net/posts/${id}.json`, {
          headers: {
            "User-Agent": "Reverser JS (v1/Tarrgon)"
          }
        })
        let data: any = await res.json()
        url = `https://static1.e621.net/data/${data.post.file.md5.slice(0, 2)}/${data.post.file.md5.slice(2, 4)}/${data.post.file.md5}.${data.post.file.ext}`
      }

      let res = await fetch(url)
      if (!res.ok) throw new Error(`Error while fetching ${url}\n${await res.text()}`)

      let buffer = Buffer.from(await res.arrayBuffer())

      return await IqdbManager.queryImage(buffer, scoreCutoff)
    } catch (e) {
      console.error("QUERY URL FAILED")
      console.error(e)
      throw e
    }
  }

  static async queryImage(buffer: Buffer, scoreCutoff: number = 85): Promise<IqdbHit[]> {
    try {
      let type = await Utils.getRealFileType(buffer)
      if (!type || !VALID_CONTENT_TYPES.includes(type.mime)) throw new Error("Cannot query provided file. Invalid content type.")

      let data: any = await getChannelInfo(buffer)

      if (data.error) throw new Error(`Cannot create IQDB data for query. ${data.message}`)

      let { r, g, b } = data

      let res = await fetch(`http://localhost:${Globals.config.iqdb.port}/query`, {
        method: "POST",
        body: JSON.stringify({ channels: { r, g, b } })
      })

      if (!res.ok) {
        throw new Error(await res.text())
      }

      return processIqdbResponse(await res.json(), scoreCutoff)
    } catch (e) {
      console.error("QUERY IMAGE FAILED")
      console.error(e)
      throw e
    }
  }
}

export default IqdbManager