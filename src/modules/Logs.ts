import { ObjectId } from "mongodb"
import Globals from "./Globals"

export const enum LogType {
  ARTIST_URL_REMOVAL = 1
}

export interface LogData { }

export class ArtistRemovalLog implements LogData {
  removedBy: ObjectId
  removedAt: Date

  constructor(removedBy: ObjectId, removedAt: Date) {
    this.removedBy = removedBy
    this.removedAt = removedAt
  }
}

export interface Log<T extends LogData> {
  _id: ObjectId
  type: LogType
  data: T
}

class Logs {
  public static async addLog(type: LogType, logData: LogData): Promise<void> {
    await Globals.db.collection("logs").insertOne({ type, logData })
  }
}

export default Logs