import express, { Express, Request, Response, Router } from "express"
import Account from "../../modules/Account"
import DeviantArtScraper from "../../modules/customScrapers/DeviantArtScraper"
import Submission from "../../modules/Submission"
const router = express.Router()

router.get("/get_deviantart_download/:id", async (req: Request, res: Response) => {
  let link = await DeviantArtScraper.getDownloadLink(req.params.id, 1000)

  if (req.query.redirect) {
    return res.redirect((req.query.redirect as string).replace("{value}", link))
  }

  return res.redirect(link)
})

router.get("/get_discord_media/:id", async (req: Request, res: Response) => {
  let id = parseInt(req.params.id)
  let submission = await Submission.findById(id)
  if (!submission) return res.sendStatus(404)

  return res.redirect(await submission.regenerateDirectUrl())
})

export default () => {
  return {
    router,
    path: "/utils"
  }
}
