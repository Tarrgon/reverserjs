import express, { Express, Request, Response, Router } from "express"
import Account from "../../modules/Account"
const router = express.Router()

router.use(async (req, res, next) => {
  if (!req.account!.newAccount) return res.redirect("/")
  next()
})

router.get("/", async (req: Request, res: Response) => {
  res.render("setup")
})

router.post("/", async (req: Request, res: Response) => {
  let { password }: { password: string } = req.body
  await req.account!.setPassword(password)
  res.sendStatus(200)
})

export default () => {
  return {
    router,
    path: "/setup"
  }
}
