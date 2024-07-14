import express, { Express, Request, Response, Router } from "express"
import { PuppetServer } from "../../modules/Puppet"
import mjpegServer from "mjpeg-server"
import Utils from "../../modules/Utils"

const router = express.Router()

const getIP = req => req.headers["x-forwarded-for"] || req.socket.remoteAddress

function testMobile(ua = "") {
  const toMatch = [
    /Android/i,
    /webOS/i,
    /iPhone/i,
    /iPad/i,
    /iPod/i,
    /BlackBerry/i,
    /Windows Phone/i
  ]

  return toMatch.some((toMatchItem) => {
    return ua.match(toMatchItem);
  })
}

router.use(async (req, res, next) => {
  if (!req.account || !req.account.admin) return res.redirect("/")

  next()
})

router.get("/:name", async (req: Request, res: Response) => {
  let puppetServer = PuppetServer.servers.find(s => s.name == req.params.name) as PuppetServer
  if (!puppetServer) return res.redirect("/")

  res.end(puppetServer.browserView())
})

router.post("/:name/carpediem", async (req, res) => {
  let puppetServer = PuppetServer.servers.find(s => s.name == req.params.name) as PuppetServer
  if (!puppetServer) return res.redirect("/")

  await puppetServer.sendAction(req.body)

  res.sendStatus(200)
})

router.get("/:name/probe-viewport.css", async (req: Request, res: Response) => {
  let puppetServer = PuppetServer.servers.find(s => s.name == req.params.name) as PuppetServer
  if (!puppetServer) return res.redirect("/")

  res.type("css")
  res.end(puppetServer.viewportProbes())
})

router.get("/:name/set-viewport-dimensions/width/:width/height/:height/set.png", async (req: Request, res: Response) => {
  let puppetServer = PuppetServer.servers.find(s => s.name == req.params.name) as PuppetServer
  if (!puppetServer) return res.redirect("/")

  let ua = req.headers["user-agent"]
  let isMobile = testMobile(ua)
  let { width, height } = req.params

  width = parseFloat(width) as any
  height = parseFloat(height) as any

  await puppetServer.setEmulation({
    viewport: {
      width,
      height,
      isMobile
    },
    userAgent: ua
  })

  res.type("png")
  res.end("PNG")
})

router.get("/:name/viewport.mjpeg", async (req: Request, res: Response, next) => {
  let puppetServer = PuppetServer.servers.find(s => s.name == req.params.name) as PuppetServer
  if (!puppetServer) return res.redirect("/")

  const mjpeg = mjpegServer.createReqHandler(req, res)
  puppetServer.state.clients.push({
    mjpeg, ip: getIP(req)
  })

  next()
})

export default () => {
  return {
    router,
    path: "/puppet"
  }
}
