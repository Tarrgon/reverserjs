import Globals from "./Globals"
import Submission from "./Submission"
import fs from "fs"
import IqdbHit from "../interfaces/IqdbHit"
import Utils, { VIDEO_EXTENSIONS } from "./Utils"
import Job, { JobPriority, JobStatus } from "./Job"
import { ObjectId } from "mongodb"
import JobQueue from "./JobQueue"
import https from "https"
import { FormDataEncoder } from "form-data-encoder"
import { Readable } from "stream"
import { IncomingMessage } from "http"
import sharp from "sharp"

class E621IqdbChecker {
  private static callbacks: Map<string, ((hits: IqdbHit[]) => void)[]> = new Map()
  private static queue: JobQueue<string> = new JobQueue<string>()

  private static ready: boolean = false
  private static processing: boolean = false

  private static checkingNow: Job<string>[] = []

  static async setup() {
    console.log("SETUP IQDB QUEUE")
    E621IqdbChecker.ready = false

    for (let job of await Globals.db.collection("e621IqdbQueue").find({}).toArray()) {
      let j = await Job.findByObjectId(job.jobId) as Job<string>
      E621IqdbChecker.queue.addJob(j)
    }

    E621IqdbChecker.ready = true

    E621IqdbChecker.processQueue()
  }

  static async queueSubmission(submission: Submission, priority = JobPriority.NORMAL, callback: ((hits: IqdbHit[]) => void) | null = null) {
    let existingJobIndex = E621IqdbChecker.queue.findIndex(job => job.jobData == submission.md5)

    if (existingJobIndex != -1) {
      let job = E621IqdbChecker.queue.queue[existingJobIndex]

      if (callback) {
        if (!E621IqdbChecker.callbacks.has(submission.md5)) E621IqdbChecker.callbacks.set(submission.md5, [callback])
        else E621IqdbChecker.callbacks.get(submission.md5)?.push(callback)
      }

      if (priority > job.priority) {
        await job.setPriority(priority)
        E621IqdbChecker.queue.removeAt(existingJobIndex)
        E621IqdbChecker.queue.addJob(job)
        if (!E621IqdbChecker.processing) E621IqdbChecker.processQueue()
      }

      return
    }

    let job: Job<string> = await Job.create<string>(submission.md5, priority)
    await Globals.db.collection("e621IqdbQueue").insertOne({ jobId: job._id })

    while (!E621IqdbChecker.ready) await Utils.wait(600 + Math.random() * 400)

    if (callback) {
      if (!E621IqdbChecker.callbacks.has(submission.md5)) E621IqdbChecker.callbacks.set(submission.md5, [callback])
      else E621IqdbChecker.callbacks.get(submission.md5)?.push(callback)
    }

    E621IqdbChecker.queue.addJob(job)

    if (!E621IqdbChecker.processing) E621IqdbChecker.processQueue()
  }

  private static async retryJob(job: Job<string>) {
    while (!E621IqdbChecker.ready) await Utils.wait(500)

    await job.retry()
    await job.setPriority(job.priority + 1)
    E621IqdbChecker.queue.addJob(job)

    if (!E621IqdbChecker.processing) E621IqdbChecker.processQueue()
  }

  private static async convertToProperSize(buffer: Buffer): Promise<Buffer> {
    return await sharp(buffer).withIccProfile("srgb").keepIccProfile().flatten({ background: "#000000" }).resize(150, 150, { fit: "inside" }).jpeg({ quality: 87 }).toBuffer()
  }

  private static async retryJobs(jobs: Job<string>[]) {
    while (!E621IqdbChecker.ready) await Utils.wait(500)

    for (let job of jobs) {
      if (job.status == JobStatus.COMPLETE) continue
      await job.retry()
      await job.setPriority(job.priority + 1)
      E621IqdbChecker.queue.addJob(job)
    }

    if (!E621IqdbChecker.processing) E621IqdbChecker.processQueue()
  }

  private static ipRotation: { ip: string, nextUseTime: number, inUse: boolean }[]

  private static async getNextIp(): Promise<string> {
    let ipRotationData: { ip: string, nextUseTime: number, inUse: boolean } | undefined

    do {
      ipRotationData = E621IqdbChecker.ipRotation.find(data => !data.inUse && Date.now() > data.nextUseTime)
    } while (!ipRotationData)

    return ipRotationData.ip
  }

  private static async makeRequest(localAddress: string, formData: FormData, path: string = "/iqdb_queries.json", method: string = "POST", useRateLimit: boolean = true) {
    let rateLimitData: { ip: string, nextUseTime: number, inUse: boolean }
    if (useRateLimit) {
      rateLimitData = E621IqdbChecker.ipRotation.find(i => i.ip == localAddress)!
      rateLimitData.inUse = true
    }

    return new Promise(async (resolve: (res: Response) => void, reject: (e: any) => void) => {
      let encoder = new FormDataEncoder(formData)

      let req = https.request({
        host: "e621.net",
        path,
        protocol: "https:",
        headers: {
          Authorization: Globals.config.e621Auth,
          "User-Agent": "Reverser JS (v1/Tarrgon)",
          ...encoder.headers
        },
        localAddress,
        family: 4,
        method,
      }, (res: IncomingMessage) => {
        let d = ""
        res.setEncoding("utf8")
        res.on("data", (chunk: any) => {
          d += chunk
        })

        res.on("end", () => {
          if (useRateLimit) {
            if (res.statusCode! < 500) {
              rateLimitData.inUse = false
              rateLimitData.nextUseTime = Date.now() + 2100
            } else {
              rateLimitData.inUse = false
              rateLimitData.nextUseTime = Date.now() + 60000
            }
          }

          resolve(new Response(d, { status: res.statusCode, headers: (res.headers as Record<string, string>) }))
        })
      })

      let arr: number[] = []

      for await (let chunk of encoder.encode()) {
        let data = Array.from(chunk)
        if (data.length == 0) {
          if (useRateLimit) {
            rateLimitData.inUse = false
            rateLimitData.nextUseTime = Date.now() + 2100
          }

          return reject("Bad data")
        }
        arr.push(...data)
      }

      if (arr.length == 0) {
        if (useRateLimit) {
          rateLimitData.inUse = false
          rateLimitData.nextUseTime = Date.now() + 2100
        }

        return reject("No data")
      }

      req.write(new Uint8Array(arr))

      req.on("error", (e) => {
        if (useRateLimit) {
          rateLimitData.inUse = false
          rateLimitData.nextUseTime = Date.now() + 2100
        }
        reject(e)
      })

      req.end()
    })
  }

  private static processQueue() {
    if (!E621IqdbChecker.ipRotation) {
      E621IqdbChecker.ipRotation = Globals.config.e621IqdbRotation.map(i => ({
        ip: i,
        nextUseTime: 0,
        inUse: false
      }))
    }

    if (E621IqdbChecker.checkingNow.length > 0) E621IqdbChecker.checkingNow = []
    if (!E621IqdbChecker.queue.hasMoreJobs()) {
      E621IqdbChecker.processing = false
      return
    }

    E621IqdbChecker.processing = true

    new Promise(async () => {
      let timesWaited = 0
      while (timesWaited < 3 && E621IqdbChecker.queue.length < 100) {
        await Utils.wait(1000)
        timesWaited++
      }

      let jobs = E621IqdbChecker.queue.popFirst(100)

      let submissions: Submission[] = []

      for (let job of jobs) {
        let submission = await Submission.findByMd5(job.jobData)
        if (!submission) {
          await Globals.db.collection("e621IqdbQueue").deleteOne({ jobId: job._id })
          await job.setErrorData("Submission not found")
        } else {
          submissions.push(submission)
        }
      }

      E621IqdbChecker.checkingNow = jobs

      let md5Hits: Map<string, IqdbHit[]> = new Map()

      try {
        let md5Form = new FormData()
        md5Form.append("tags", `md5:${submissions.map(s => s.md5).join(",")}`)
        md5Form.append("limit", "320")

        let res = await E621IqdbChecker.makeRequest(Globals.config.e621IqdbRotation[Globals.config.e621IqdbRotation.length - 1], md5Form, "/posts.json", "GET", false)

        if (res.ok) {
          let md5Data = await res.json() as any

          if (md5Data.posts) {
            for (let post of md5Data.posts) {
              if (!md5Hits.has(post.file.md5)) md5Hits.set(post.file.md5, [])

              let hit: IqdbHit = {
                id: post.id,
                sourceUrl: `https://e621.net/posts/${post.id}`,
                directLink: `https://static1.e621.net/data/${post.file.md5.slice(0, 2)}/${post.file.md5.slice(2, 4)}/${post.file.md5}.${post.file.ext}`,
                score: 100,
                md5: post.file.md5,
                fileSize: post.file.size,
                width: post.file.width,
                height: post.file.height,
                fileType: post.file.ext
              }

              md5Hits.get(post.file.md5)!.push(hit)
            }
          }
        } else {
          console.error(await res.text())
        }
      } catch (e) {
        console.error(`Error during md5 check for ${submissions.map(s => s.md5).join(",")}:`)
        console.error(e)
      }

      for (let submission of submissions) {
        let job: Job<string> = jobs.find(j => j.jobData == submission.md5)!
        let allSubmissions: Submission[] = await Submission.findManyByMd5(submission.md5)
        if (md5Hits.has(submission.md5)) {
          let index = E621IqdbChecker.checkingNow.findIndex(j => j.jobData == job.jobData)
          if (index != -1) E621IqdbChecker.checkingNow.splice(index, 1)

          let hits: IqdbHit[] = md5Hits.get(submission.md5)!
          for (let submission of allSubmissions) {
            await submission.addE621IqdbHits(...hits)
          }

          if (E621IqdbChecker.callbacks.has(submission.md5)) {
            for (let callback of E621IqdbChecker.callbacks.get(submission.md5) as ((hits: IqdbHit[]) => void)[]) {
              callback(hits)
            }

            E621IqdbChecker.callbacks.delete(submission.md5)
          }

          await job.setStatus(JobStatus.COMPLETE)
          await Globals.db.collection("e621IqdbQueue").deleteOne({ jobId: job._id })
        } else {
          let buffer = !VIDEO_EXTENSIONS.includes(submission.extension) ? submission.getFileBuffer() : submission.getThumbnailBuffer()

          let formData = new FormData()

          let imageBuffer: Buffer

          try {
            imageBuffer = await E621IqdbChecker.convertToProperSize(buffer)
          } catch (e) {
            console.error(`ERROR CONVERTING TO PROPER SIZE FOR IQDB WITH: ${submission._id}`)
            console.error(e)
            continue
          }

          formData.append("search[file]", new Blob([imageBuffer]))
          formData.append("search[score_cutoff]", "80")

          let data

          let hits: IqdbHit[] = []

          try {
            let res = await E621IqdbChecker.makeRequest(await E621IqdbChecker.getNextIp(), formData)

            let index = E621IqdbChecker.checkingNow.findIndex(j => j.jobData == job.jobData)
            if (index != -1) E621IqdbChecker.checkingNow.splice(index, 1)

            if (res.ok) {
              data = await res.json()
              if (!data.posts) {
                console.log(`Adding hits for ${submission.md5}`)

                for (let hit of E621IqdbChecker.getHitsFromData(data)) {
                  if (hits.find(h => h.id == hit.id)) continue
                  hits.push(hit)
                }
              } else {
                console.log(`No hits for ${submission.md5}`)
              }

              await job.setStatus(JobStatus.COMPLETE)
              await Globals.db.collection("e621IqdbQueue").deleteOne({ jobId: job._id })
            } else {
              if (res.status == 520 || res.status == 502 || res.status == 429) {
                E621IqdbChecker.checkingNow = []
                await E621IqdbChecker.retryJobs(jobs)
                await Utils.wait(120000)
                return E621IqdbChecker.processQueue()
              }

              let errorText = await res.text()
              console.error(`Error fetching e621 iqdb hits for: ${submission._id} (1)`)
              console.error(errorText)
              console.error(res.status)
              if (errorText.includes("Throttled")) {
                E621IqdbChecker.checkingNow = []
                await E621IqdbChecker.retryJobs(jobs)
                await Utils.wait(120000)
                return E621IqdbChecker.processQueue()
              }

              if (data) console.error(data)
              if (job.retryNumber >= 10) {
                if (E621IqdbChecker.callbacks.has(submission.md5)) {
                  for (let callback of E621IqdbChecker.callbacks.get(submission.md5) as ((hits: IqdbHit[]) => void)[]) {
                    callback([])
                  }

                  E621IqdbChecker.callbacks.delete(submission.md5)
                }

                await Globals.db.collection("e621IqdbQueue").deleteOne({ jobId: job._id })
                await job.setErrorData(errorText)
                continue
              }

              await E621IqdbChecker.retryJob(job)
            }
          } catch (e: any) {
            let index = E621IqdbChecker.checkingNow.findIndex(j => j.jobData == job.jobData)
            if (index != -1) E621IqdbChecker.checkingNow.splice(index, 1)

            console.error(`Error fetching e621 iqdb hits for: ${submission._id} (2)`)
            console.error(e)
            if (data) console.error(JSON.stringify(data))
            if (job.retryNumber >= 10) {
              if (E621IqdbChecker.callbacks.has(submission.md5)) {
                for (let callback of E621IqdbChecker.callbacks.get(submission.md5) as ((hits: IqdbHit[]) => void)[]) {
                  callback([])
                }

                E621IqdbChecker.callbacks.delete(submission.md5)
              }

              await Globals.db.collection("e621IqdbQueue").deleteOne({ jobId: job._id })
              await job.setErrorData(e)
              continue
            }

            await E621IqdbChecker.retryJob(job)
          }

          for (let submission of allSubmissions) {
            await submission.addE621IqdbHits(...hits)
          }

          if (E621IqdbChecker.callbacks.has(submission.md5)) {
            for (let callback of E621IqdbChecker.callbacks.get(submission.md5) as ((hits: IqdbHit[]) => void)[]) {
              callback(hits)
            }

            E621IqdbChecker.callbacks.delete(submission.md5)
          }
        }
      }

      E621IqdbChecker.checkingNow = []
      E621IqdbChecker.processQueue()
    })
  }

  public static isCheckingNow(md5: string): boolean {
    return this.checkingNow.find(data => data.jobData == md5) != null
  }

  public static isQueued(md5: string): boolean {
    return this.queue.queue.find(data => data.jobData == md5) != null
  }

  public static indexFor(md5: string): number {
    return this.queue.queue.findIndex(data => data.jobData == md5)
  }

  private static getHitsFromData(data: any[]): IqdbHit[] {
    return data.map(d => ({
      id: d.post_id,
      sourceUrl: `https://e621.net/posts/${d.post_id}`,
      directLink: d.post.posts.md5 ? `https://static1.e621.net/data/${d.post.posts.md5.slice(0, 2)}/${d.post.posts.md5.slice(2, 4)}/${d.post.posts.md5}.${d.post.posts.file_ext}` : null,
      score: d.score,
      md5: d.post.posts.md5,
      fileSize: d.post.posts.file_size,
      width: d.post.posts.image_width,
      height: d.post.posts.image_height,
      fileType: d.post.posts.file_ext
    }))
  }
}

export default E621IqdbChecker