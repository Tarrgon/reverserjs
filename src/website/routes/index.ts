import express, { Express, Request, Response, Router } from "express"
import Utils from "../../modules/Utils"
import Submission, { BetterVersion } from "../../modules/Submission"
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
    exactMatch: await Submission.getCountForQuery({ isDeleted: false, betterVersion: BetterVersion.EXACT }),
    potentiallyBetter: await Submission.getCountForQuery({ isDeleted: false, $and: [{ betterVersion: { $ne: 0 } }, { betterVersion: { $ne: BetterVersion.EXACT } }, { betterVersion: { $bitsAnyClear: BetterVersion.BETTER_FILE_TYPE | BetterVersion.BIGGER_DIMENSIONS } }] }),
    probableReplacement: await Submission.getCountForQuery({ isDeleted: false, betterVersion: { $bitsAllSet: BetterVersion.BETTER_FILE_TYPE | BetterVersion.BIGGER_DIMENSIONS } }),
    other: await Submission.getCountForQuery({ isDeleted: false, $and: [{ "e621IqdbHits.0": { $exists: true } }, { betterVersion: 0 }] })
  }

  res.render("index", {
    account: req.account,
    utils: Utils,
    headers: req.headers,
    submissionData
  })
})


export default () => {
  return {
    router,
    path: "/"
  }
}
