import express, { Express, Request, Response, Router } from "express"
import Account from "../../modules/Account"
const router = express.Router()

router.get("/", async (req: Request, res: Response) => {
  res.render("login")
})

router.post("/", async (req: Request, res: Response) => {
  let { username, password }: { username: string, password: string } = req.body
  let account = await Account.authenticate(username, password)

  if (account === false) {
    return res.status(401).send(`Unable to find a user with the name ${username}`)
  } else if (account === undefined) {
    return res.status(401).send("Password is incorrect")
  }

  await account.linkToSessionId(req.session.id)
  res.sendStatus(200)
})

export default () => {
  return {
    router,
    path: "/login"
  }
}
