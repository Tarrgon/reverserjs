import express, { Express, Request, Response, Router } from "express"
import Account from "../../modules/Account"
import DeviantArtScraper from "../../modules/customScrapers/DeviantArtScraper"
const router = express.Router()

router.get("/get_deviantart_download/:id", async (req: Request, res: Response) => {
  let link = await DeviantArtScraper.getDownloadLink(req.params.id, 1000)
  if (req.query.redirect) {
    return res.redirect((req.query.redirect as string).replace("{value}", link))
  }
  return res.redirect(link)
})

export default () => {
  return {
    router,
    path: "/utils"
  }
}
