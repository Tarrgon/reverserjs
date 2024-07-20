import express, { Express, Request, Response, Router } from "express"
import Utils from "../../modules/Utils"
import Submission, { BetterVersion } from "../../modules/Submission"
import E621IqdbChecker from "../../modules/E621IqdbChecker"
const router = express.Router()

router.get("/", async (req: Request, res: Response) => {
  res.render("settings/index", {
    account: req.account,
    utils: Utils,
    headers: req.headers
  })
})

router.get("/home", async (req: Request, res: Response) => {
  let submissionData = {
    deletedPosts: await Submission.getCountForQuery({ isDeleted: true }),
    notUploaded: await Submission.getCountForQuery({ isDeleted: false, e621IqdbHits: { $size: 0 } }),
    uploaded: await Submission.getCountForQuery({ isDeleted: false, "e621IqdbHits.0": { $exists: true } }),
    exactMatch: await Submission.getCountForQuery({ isDeleted: false, betterVersion: { $bitsAllSet: BetterVersion.EXACT } }),
    probableReplacement: await Submission.getCountForQuery({ isDeleted: false, "e621IqdbHits.0": { "$exists": true }, $or: [{ betterVersionNotDeleted: { $bitsAllSet: BetterVersion.BIGGER_DIMENSIONS | BetterVersion.SAME_FILE_TYPE, $bitsAllClear: BetterVersion.EXACT } }, { betterVersionNotDeleted: { $bitsAllSet: BetterVersion.BIGGER_DIMENSIONS | BetterVersion.BETTER_FILE_TYPE, $bitsAllClear: BetterVersion.EXACT } }] })
  }

  let e621IqdbData = {
    queueLength: E621IqdbChecker.queueLength,
    currentBatchLength: E621IqdbChecker.currentBatchLength
  }

  res.render("index", {
    account: req.account,
    utils: Utils,
    headers: req.headers,
    submissionData,
    e621IqdbData
  })
})


export default () => {
  return {
    router,
    path: "/"
  }
}
