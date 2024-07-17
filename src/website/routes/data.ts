import express, { Express, Request, Response, Router } from "express"
import path from "path"
import Globals from "../../modules/Globals"
import Submission from "../../modules/Submission"
import fs from "fs"
const router = express.Router()

router.get("/imgs/:md5.:ext", (req: Request, res: Response) => {
  let md5 = req.params.md5

  let first = md5.slice(0, 2)
  let second = md5.slice(2, 4)

  let dir = path.join(Globals.config.imgDirectory as string, first, second)

  for (let file of fs.readdirSync(dir)) {
    if (file.startsWith(md5)) {
      return res.sendFile(path.join(dir, file))
    }
  }

  return res.sendStatus(404)
})

router.get("/thumbs/:md5.:ext", (req: Request, res: Response) => {
  let md5 = req.params.md5

  let first = md5.slice(0, 2)
  let second = md5.slice(2, 4)

  let dir = path.join(Globals.config.sampleDirectory as string, first, second)

  let p = path.join(dir, `${md5}.jpg`)

  if (!fs.existsSync(p)) return res.sendStatus(404)

  res.sendFile(p)
})

export default () => {
  return {
    router,
    path: "/data"
  }
}
