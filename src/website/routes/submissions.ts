import express, { Express, Request, Response, Router } from "express"
import Submission, { WebifiedSubmission, WithIqdbHit } from "../../modules/Submission"
import IqdbHit, { WithHumanReadableSize } from "../../interfaces/IqdbHit"
import IqdbManager from "../../modules/IqdbManager"
import Artist from "../../modules/Artist"
import ArtistURL from "../../modules/ArtistURL"
import Aggregator from "../../interfaces/Aggregator"
import Globals from "../../modules/Globals"
import Utils, { VIDEO_EXTENSIONS } from "../../modules/Utils"
import { filesize } from "filesize"
import { JobPriority } from "../../modules/Job"
const router = express.Router()

router.get("/", async (req: Request, res: Response) => {
  let query = await Utils.processSubmissionSearchQuery(req.query)

  let { submissions, totalPages } = await req.account!.getAllWatchedSubmissions(query, true) ?? { totalPages: 0, submissions: [] }

  res.render("submissions/index", {
    submissions,
    totalPages,
    account: req.account,
    aggregators: Globals.aggregationManager.aggregators,
    humanSize: (size, options = {}) => {
      return filesize(size, { standard: "jedec", ...options })
    },
    utils: Utils,
    headers: req.headers
  })
})

router.get("/all", async (req: Request, res: Response) => {
  let query = await Utils.processSubmissionSearchQuery(req.query)

  let { submissions, totalPages } = await Submission.getAllSubmissions(req.account!, query, true) ?? { totalPages: 0, submissions: [] }

  res.render("submissions/listing", {
    submissions,
    totalPages,
    account: req.account,
    aggregators: Globals.aggregationManager.aggregators,
    humanSize: (size, options = {}) => {
      return filesize(size, { standard: "jedec", ...options })
    },
    utils: Utils,
    headers: req.headers
  })
})

router.get("/:id/upload-url", async (req: Request, res: Response) => {
  let id = parseInt(req.params.id)

  if (isNaN(id)) return res.status(400).send("Id is not a number.")

  let submission = await Submission.findById(id)

  if (!submission) return res.status(404).send(`Submission ${id} not found.`)

  let url = await submission.getUploadUrl(req.account!)
  return res.redirect(url)
})

router.delete("/:id/iqdbhits", async (req: Request, res: Response) => {
  let id = parseInt(req.params.id)

  if (isNaN(id)) return res.status(400).send("Id is not a number.")

  let submission = await Submission.findById(id)

  if (!submission) return res.status(404).send(`Submission ${id} not found.`)

  await submission.deleteIqdbHitWithPostId(req.body.postId)
  return res.sendStatus(200)
})

router.get("/:id.json", async (req: Request, res: Response) => {
  let id = parseInt(req.params.id)

  if (isNaN(id)) return res.status(400).send("Id is not a number.")

  let submission = await Submission.findById(id)

  if (!submission) return res.status(404).send(`Submission ${id} not found.`)

  let webified = await submission.webify(req.account!)

  //@ts-ignore
  webified.aggregator = { displayName: webified.aggregator?.displayName ?? "", index: webified.aggregator?.index ?? -1 }
  //@ts-ignore
  webified.webPath = submission.getWebPath()

  return res.json(webified)
})

router.get("/multiview", async (req: Request, res: Response) => {
  let ids: number[] = (req.query.ids as string)?.split(",").map(s => parseInt(s)) ?? []

  if (ids.length == 0) return res.sendStatus(400)

  let submissions: WebifiedSubmission[] = await Submission.findManyById(req.account!, ids, Number.MAX_SAFE_INTEGER, 1, true)

  res.render("submissions/multiview", {
    submissions: submissions,
    account: req.account,
    aggregators: Globals.aggregationManager.aggregators,
    humanSize: (size, options = {}) => {
      return filesize(size, { standard: "jedec", ...options })
    },
    utils: Utils,
    headers: req.headers
  })
})

// This deletes many
router.post("/delete/many", async (req: Request, res: Response) => {
  if (!req.body.ids) return res.status(400).send("No ids present")

  let submissions = await Submission.findByIds(req.body.ids)

  for (let submission of submissions) {
    submission.deleteSubmission(req.account!)
  }

  return res.sendStatus(200)
})

// This undeletes many
router.delete("/delete/many", async (req: Request, res: Response) => {
  if (!req.body.ids) return res.status(400).send("No ids present")

  let submissions = await Submission.findByIds(req.body.ids)

  for (let submission of submissions) {
    submission.undeleteSubmission(req.account!)
  }

  return res.sendStatus(200)
})

router.get("/:id", async (req: Request, res: Response) => {
  let id = parseInt(req.params.id)

  if (isNaN(id)) return res.status(400).send("Id is not a number.")

  let submission = await Submission.findById(id)

  if (!submission) return res.status(404).send(`Submission ${id} not found.`)

  let similar: IqdbHit[] = await submission.getSimilar()

  let similarSubmissions: (Partial<WithIqdbHit<WebifiedSubmission>>)[] = []

  for (let hit of similar) {
    let submission = await Submission.findById(hit.id) as Submission
    similarSubmissions.push(await submission.withIqdbHit(req.account!, hit, true))
  }

  similarSubmissions.sort((a: any, b: any) => {
    if (a.hit.score == b.hit.score) return b.creationDate.getTime() - a.creationDate.getTime()
    return b.hit.score - a.hit.score
  })

  res.render("submissions/submission", {
    submission: await submission.webify(req.account!),
    account: req.account,
    similar: similarSubmissions ?? [],
    aggregators: Globals.aggregationManager.aggregators,
    humanSize: (size, options = {}) => {
      return filesize(size, { standard: "jedec", ...options })
    },
    utils: Utils,
    headers: req.headers
  })
})

router.delete("/:id", async (req: Request, res: Response) => {
  let id = parseInt(req.params.id)

  if (isNaN(id)) return res.status(400).send("Id is not a number.")

  let submission = await Submission.findById(id)

  if (!submission) return res.status(404).send(`Submission ${id} not found.`)

  await submission.deleteSubmission(req.account!)

  return res.sendStatus(200)
})

router.post("/:id/undelete", async (req: Request, res: Response) => {
  let id = parseInt(req.params.id)

  if (isNaN(id)) return res.status(400).send("Id is not a number.")

  let submission = await Submission.findById(id)

  if (!submission) return res.status(404).send(`Submission ${id} not found.`)

  await submission.undeleteSubmission(req.account!)

  return res.sendStatus(200)
})

router.post("/:id/update", async (req: Request, res: Response) => {
  let id = parseInt(req.params.id)

  if (isNaN(id)) return res.status(400).send("Id is not a number.")

  let wait = req.query.wait != "false"

  let submission = await Submission.findById(id)

  if (!submission) return res.status(404).send(`Submission ${id} not found.`)

  if (wait) {
    await submission.purgeE621IqdbHits()

    let hits: WithHumanReadableSize<IqdbHit>[] = (await submission.queueE621IqdbCheckAndWait()).map(hit => Utils.addHumanReadableSize(hit))

    return res.json({ hits, submission })
  } else {
    await submission.purgeE621IqdbHits()
    submission.queueE621IqdbCheck(JobPriority.IMMEDIATE)
    return res.sendStatus(200)
  }
})

export default () => {
  return {
    router,
    path: "/submissions"
  }
}
