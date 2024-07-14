import express, { Express, Request, Response, Router } from "express"
import Artist from "../../modules/Artist"
import Submission from "../../modules/Submission"
import Account from "../../modules/Account"
const router = express.Router()

router.post("/artists", async (req: Request, res: Response) => {
  if (!req.body.id) return res.status(400).send("No id present")

  let artist = await Artist.findById(req.body.id)

  if (!artist) return res.sendStatus(404)

  await req.account!.addWatchedArtist(artist._id)

  return res.sendStatus(200)
})

router.delete("/artists", async (req: Request, res: Response) => {
  if (!req.body.id) return res.status(400).send("No id present")

  let artist = await Artist.findById(req.body.id)

  if (!artist) return res.sendStatus(404)

  await req.account!.removeWatchedArtist(artist._id)

  return res.sendStatus(200)
})

router.post("/artists/many", async (req: Request, res: Response) => {
  if (!req.body.ids) return res.status(400).send("No ids present")

  let artists = await Artist.findManyById(req.body.ids)

  for (let artist of artists) await req.account!.addWatchedArtist(artist._id)

  return res.sendStatus(200)
})

router.delete("/artists/many", async (req: Request, res: Response) => {
  if (!req.body.ids) return res.status(400).send("No ids present")

  let artists = await Artist.findManyById(req.body.ids)

  for (let artist of artists) await req.account!.removeWatchedArtist(artist._id)

  return res.sendStatus(200)
})

router.post("/backlog", async (req: Request, res: Response) => {
  if (!req.body.id) return res.status(400).send("No id present")

  let submission = await Submission.findById(req.body.id)

  if (!submission) return res.sendStatus(404)

  req.account!.addSubmissionToBacklog(submission._id)

  return res.sendStatus(200)
})

router.delete("/backlog", async (req: Request, res: Response) => {
  if (!req.body.id) return res.status(400).send("No id present")
  let submission = await Submission.findById(req.body.id)

  if (!submission) return res.sendStatus(404)

  req.account!.removeSubmissionFromBacklog(submission._id)

  return res.sendStatus(200)
})

router.post("/backlog/many", async (req: Request, res: Response) => {
  if (!req.body.ids) return res.status(400).send("No ids present")

  let submissions = await Submission.findByIds(req.body.ids)

  for (let submission of submissions) {
    req.account!.addSubmissionToBacklog(submission._id)
  }

  return res.sendStatus(200)
})

router.delete("/backlog/many", async (req: Request, res: Response) => {
  if (!req.body.ids) return res.status(400).send("No ids present")

  let submissions = await Submission.findByIds(req.body.ids)

  for (let submission of submissions) {
    req.account!.removeSubmissionFromBacklog(submission._id)
  }

  return res.sendStatus(200)
})

router.post("/hidden", async (req: Request, res: Response) => {
  if (!req.body.id) return res.status(400).send("No id present")

  let submission = await Submission.findById(req.body.id)

  if (!submission) return res.sendStatus(404)

  req.account!.hideSubmission(submission._id)

  return res.sendStatus(200)
})

router.delete("/hidden", async (req: Request, res: Response) => {
  if (!req.body.id) return res.status(400).send("No id present")

  let submission = await Submission.findById(req.body.id)

  if (!submission) return res.sendStatus(404)

  req.account!.unhideSubmission(submission._id)

  return res.sendStatus(200)
})

router.post("/hide/many", async (req: Request, res: Response) => {
  if (!req.body.ids) return res.status(400).send("No ids present")

  let submissions = await Submission.findByIds(req.body.ids)

  for (let submission of submissions) {
    req.account!.hideSubmission(submission._id)
  }

  return res.sendStatus(200)
})

router.delete("/hide/many", async (req: Request, res: Response) => {
  if (!req.body.ids) return res.status(400).send("No ids present")

  let submissions = await Submission.findByIds(req.body.ids)

  for (let submission of submissions) {
    req.account!.unhideSubmission(submission._id)
  }

  return res.sendStatus(200)
})

router.get("/new", async (req: Request, res: Response) => {
  if (!req.account || !req.account.admin) return res.redirect("/")

  return res.render("account/new", { headers: req.headers })
})

router.post("/new", async (req: Request, res: Response) => {
  if (!req.account || !req.account.admin) return res.sendStatus(401)

  let { username, password }: { username: string, password: string } = req.body

  if (!username || !password) return res.sendStatus(400)

  let existing = await Account.findByUsername(username)

  if (existing) return res.sendStatus(400)

  await Account.create(username, password)

  return res.sendStatus(201)
})

router.patch("/edit", async (req: Request, res: Response) => {
  if (!req.account) return res.sendStatus(401)

  let { descriptionTemplate, autoAddDateTag, sourceSimilarityCutoff, useSubmissionDateSyntax, discordId }: { descriptionTemplate?: string, autoAddDateTag?: boolean, sourceSimilarityCutoff?: number, useSubmissionDateSyntax?: boolean, discordId?: string } = req.body

  if (descriptionTemplate !== undefined) {
    await req.account!.setSetting("descriptionTemplate", descriptionTemplate)
  }

  if (autoAddDateTag !== undefined) {
    await req.account!.setSetting("autoAddDateTag", !!autoAddDateTag)
  }

  if (sourceSimilarityCutoff !== undefined) {
    let num = parseFloat(sourceSimilarityCutoff.toString())
    if (!isNaN(num)) await req.account!.setSetting("sourceSimilarityCutoff", num)
  }

  if (useSubmissionDateSyntax !== undefined) {
    await req.account!.setSetting("useSubmissionDateSyntax", !!useSubmissionDateSyntax)
  }

  if (discordId !== undefined) {
    await req.account!.setSetting("discordId", discordId)
  }

  return res.sendStatus(200)
})

export default () => {
  return {
    router,
    path: "/account"
  }
}
