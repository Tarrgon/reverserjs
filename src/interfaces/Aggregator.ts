import { ObjectId } from "mongodb"
import Submission from "../modules/Submission"
import ArtistURL from "../modules/ArtistURL"
import { AggregationJobData } from "../modules/AggregationManager"
import Job from "../modules/Job"

interface Aggregator {
  index: number
  host: string
  displayName: string
  homepage: string
  galleryTemplates: RegExp[]
  submissionTemplate: string
  ready: boolean
  inUse: boolean
  canFetch: boolean
  canSearch: boolean

  fetchAll(artistId: ObjectId, job: Job<any>): Promise<boolean>
  testUrl(url: string): boolean
  matchUrl(url: string): RegExpExecArray | null
  getApiIdentifier(urlIdentifier: string): Promise<string | null> | string
  createJobData(artistUrl: ArtistURL): Promise<AggregationJobData>
}

export default Aggregator