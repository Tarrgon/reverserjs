import express, { Express, Request, Response, Router } from "express"
import Globals from "../../modules/Globals"
import Utils from "../../modules/Utils"
import { filesize } from "filesize"
const router = express.Router()

router.get("/", async (req: Request, res: Response) => {
  let query = await Utils.processSubmissionSearchQuery(req.query)

  let r = await req.account!.getBackloggedSubmissions(query, true) ?? { totalPages: 0, submissions: [] }

  res.render("backlog/index", {
    submissions: r.submissions,
    totalPages: r.totalPages,
    account: req.account,
    aggregators: Globals.aggregationManager.aggregators,
    humanSize: (size, options = {}) => {
      return filesize(size, { standard: "jedec", ...options })
    },
    utils: Utils,
    headers: req.headers
  })
})

export default () => {
  return {
    router,
    path: "/backlog"
  }
}
