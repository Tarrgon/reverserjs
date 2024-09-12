import { ObjectId } from "mongodb"
import Globals from "./Globals"
import Utils from "./Utils"

export const enum JobStatus {
  QUEUED = 0,
  COMPLETE = 1,
  ERRORED = 2
}

export const enum JobPriority {
  LOW = -500,
  NORMAL = 0,
  IMMEDIATE = 10000
}


function wait(ms): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

class Job<T> {
  _id: ObjectId
  status: JobStatus
  priority: number
  retryNumber: number
  creationDate: Date
  completionDate: Date | null
  lastAttemptDate: Date | null
  jobData: T
  errorData: any

  constructor(_id: ObjectId, status: JobStatus, priority: number, retryNumber: number, creationDate: Date, lastAttemptDate: Date | null, jobData: T, completionDate: Date | null = null, errorData: any = null) {
    this._id = _id
    this.status = status
    this.priority = priority
    this.retryNumber = retryNumber
    this.creationDate = creationDate
    this.completionDate = completionDate
    this.lastAttemptDate = lastAttemptDate
    this.jobData = jobData
    this.errorData = errorData
  }

  async retry() {
    this.retryNumber++

    await Globals.db.collection("jobs").updateOne({ _id: this._id }, { $inc: { retryNumber: 1 }, $set: { lastAttemptDate: new Date() } })
  }

  async setJobData(jobData: T) {
    this.jobData = jobData
    await Globals.db.collection("jobs").updateOne({ _id: this._id }, { $set: { jobData } })
  }

  async setStatus(status: JobStatus) {
    this.status = status

    if (status == JobStatus.COMPLETE) {
      this.completionDate = new Date()
      await Globals.db.collection("jobs").updateOne({ _id: this._id }, { $set: { status, completionDate: this.completionDate } })
    } else {
      await Globals.db.collection("jobs").updateOne({ _id: this._id }, { $set: { status } })
    }
  }

  async setPriority(priority: number) {
    this.priority = priority
    await Globals.db.collection("jobs").updateOne({ _id: this._id }, { $set: { priority } })
  }

  async setErrorData(errorData: any) {
    this.errorData = errorData
    this.status = JobStatus.ERRORED

    await Globals.db.collection("jobs").updateOne({ _id: this._id }, { $set: { errorData, status: JobStatus.ERRORED } })
  }

  static fromDoc<T>(doc): Job<T> {
    /* @ts-ignore */
    let job = new Job<T>()

    for (let [key, value] of Object.entries(doc)) {
      job[key] = value
    }

    return job
  }

  static async findByObjectId<T>(_id: ObjectId): Promise<Job<T> | undefined> {
    /* @ts-ignore */
    let doc = await Globals.db.collection("jobs").findOne({ _id })
    if (!doc) return

    return Job.fromDoc<T>(doc)
  }

  static async create<T>(jobData: T, priority: number = JobPriority.NORMAL): Promise<Job<T>> {
    let _id = new ObjectId()

    let now = new Date()

    let job = new Job<T>(_id, JobStatus.QUEUED, priority, 0, now, null, jobData)

    await Globals.db.collection("jobs").insertOne(job)

    return job
  }

  // static async purgeOldCompletedJobs(): Promise<void> {
  //   while (!Globals.db) await wait(1000)
  //   await Globals.db.collection("jobs").deleteMany({ status: JobStatus.COMPLETE })
  //   setTimeout(() => {
  //     Job.purgeOldCompletedJobs()
  //   }, 86400000)
  // }
}

// Job.purgeOldCompletedJobs()

export default Job