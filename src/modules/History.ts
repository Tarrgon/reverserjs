import Globals from "./Globals"
import Submission, { BetterVersion } from "./Submission"

class History {

  private static async takeSnapshot(date: Date) {
    let snapshot = {
      deletedPosts: await Submission.getCountForQuery({ isDeleted: true }),
      notUploaded: await Submission.getCountForQuery({ isDeleted: false, e621IqdbHits: { $size: 0 } }),
      uploaded: await Submission.getCountForQuery({ isDeleted: false, "e621IqdbHits.0": { $exists: true } }),
      exactMatch: await Submission.getCountForQuery({ isDeleted: false, betterVersion: { $bitsAllSet: BetterVersion.EXACT } }),
      probableReplacement: await Submission.getCountForQuery({ isDeleted: false, "e621IqdbHits.0": { "$exists": true }, $or: [{ betterVersionNotDeleted: { $bitsAllSet: BetterVersion.BIGGER_DIMENSIONS | BetterVersion.SAME_FILE_TYPE, $bitsAllClear: BetterVersion.EXACT } }, { betterVersionNotDeleted: { $bitsAllSet: BetterVersion.BIGGER_DIMENSIONS | BetterVersion.BETTER_FILE_TYPE, $bitsAllClear: BetterVersion.EXACT } }] }),
      total: 0,
      other: 0
    }

    let total = snapshot.deletedPosts + snapshot.notUploaded + snapshot.uploaded
    snapshot.total = total
    snapshot.other = total - (snapshot.deletedPosts + snapshot.notUploaded + snapshot.exactMatch + snapshot.probableReplacement)

    await Globals.db.collection("history").updateOne({ type: "submissionData" }, { $push: { data: { takenAt: date, snapshot } } }, { upsert: true })

    // Just to make sure it doesn't start too early
    setTimeout(() => {
      History.startRoutine()
    }, 1000)
  }

  static startRoutine() {
    let date = new Date()

    date.setUTCMinutes(0)
    date.setUTCSeconds(0)
    date.setUTCMilliseconds(0)
    date.setUTCHours(24)

    setTimeout(() => {
      History.takeSnapshot(date)
    }, date.getTime() - Date.now())
  }
}

export default History