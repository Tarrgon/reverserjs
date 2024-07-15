import express, { Express, Request, Response, Router } from "express"
import IqdbManager from "../../modules/IqdbManager"
import fileUpload from "express-fileupload"
const router = express.Router()

router.get("/", async (req: Request, res: Response) => {
  res.render("search")
})

router.post("/", async (req: Request, res: Response) => {
  let { score, url }: { score?: number, url?: string } = req.body
  if (score === undefined) score = 85

  let entries = Object.entries(req.files ?? {})

  try {
    if (entries.length > 0) {
      let file: fileUpload.UploadedFile = entries[0][1] as fileUpload.UploadedFile
      return res.json(await IqdbManager.queryImage(file.data, score))
    } else {
      if (!url) return res.sendStatus(400)

      return res.json(await IqdbManager.queryUrl(url, score))
    }
  } catch (e: any) {
    return res.status(400).send(e?.message ?? e)
  }

})

export default () => {
  return {
    router,
    path: "/search"
  }
}
