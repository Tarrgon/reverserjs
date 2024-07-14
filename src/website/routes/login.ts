import express, { Express, Request, Response, Router } from "express"
import Account from "../../modules/Account"
const router = express.Router()

router.get("/", async (req: Request, res: Response) => {
  res.render("login")
})

router.post("/", async (req: Request, res: Response) => {
  let { username, password }: { username: string, password: string } = req.body
  let account = await Account.authenticate(username, password)

  if (!account) return res.sendStatus(401)

  await account.linkToSessionId(req.session.id)
  res.sendStatus(200)
})

export default () => {
  return {
    router,
    path: "/login"
  }
}
