// Dependencies
import { MongoClient, ObjectId } from "mongodb"
import express from "express"
import bodyParser from "body-parser"
import cors from "cors"
import path from "path"
import fs from "fs"

import Globals, { Config } from "../modules/Globals"
const config = JSON.parse(fs.readFileSync(path.resolve(path.join(__dirname, "..", "config.json")), { encoding: "utf-8" })) as Config
import MultiIPFetch from "../modules/MultiIPFetch"

import session from "express-session"
import MongoStore from "connect-mongo"
import Utils from "../modules/Utils"
import Account from "../modules/Account"
import AggregationManager from "../modules/AggregationManager"
import E621IqdbChecker from "../modules/E621IqdbChecker"
import JobQueue from "../modules/JobQueue"
import Job, { JobStatus } from "../modules/Job"
import ArtistURL from "../modules/ArtistURL"
import TwitterScraper from "../modules/customScrapers/TwitterScraper"
import Submission, { BetterVersion } from "../modules/Submission"
import { exec, execSync, spawn } from "child_process"
import IqdbManager from "../modules/IqdbManager"
import FurAffinityScraper from "../modules/customScrapers/FurAffinityScraper"
import { filesize } from "filesize"
import fileUpload from "express-fileupload"
import DeviantArtScraper from "../modules/customScrapers/DeviantArtScraper"
import PixivAggregator from "../modules/aggregators/PixivAggregator"
import NewgroundsScraper from "../modules/customScrapers/NewgroundsScraper"
import DTextUtils from "../modules/DTextUtils"
import Artist from "../modules/Artist"

declare global {
  namespace Express {
    export interface Request {
      session: { id }
      account?: Account
    }
  }

}

module.exports = async () => {
  console.log("Starting")
  try {
    fs.mkdirSync(path.resolve(path.join(__dirname, config.dataDirectory, "imgs")), { recursive: true })
    fs.mkdirSync(path.resolve(path.join(__dirname, config.dataDirectory, "samples")), { recursive: true })
    fs.mkdirSync(path.resolve(path.join(__dirname, config.iqdb.dataDirectory)), { recursive: true })

    let running = execSync("docker ps -a -q -f name=reverser_iqdb").toString() != ""
    if (!running) {
      spawn("docker", `run --rm --name reverser_iqdb -p ${config.iqdb.port}:${config.iqdb.port} -v ${path.resolve(path.join(__dirname, config.iqdb.dataDirectory))}:/iqdb ghcr.io/e621ng/iqdb:ad5e363879d4e4b80a0821253ae610b7859c5d32`.split(" "), { shell: true })
      console.log("SPAWNED REVERSER")
    }

    const client = new MongoClient(config.mongo.url)
    await client.connect()
    const database = client.db(config.mongo.databaseName)
    Globals.db = database

    await Globals.db.collection("submissions").createIndex({ id: 1 })
    await Globals.db.collection("submissions").createIndex({ isDeleted: 1 })
    await Globals.db.collection("submissions").createIndex({ md5: 1 })
    await Globals.db.collection("submissions").createIndex({ artistId: 1 })
    await Globals.db.collection("submissions").createIndex({ artistUrlId: 1 })

    await Globals.db.collection("artistUrls").createIndex({ id: 1 })

    await Globals.db.collection("artists").createIndex({ id: 1 })

    Globals.configPath = path.resolve(path.join(__dirname, "..", "config.json"))
    Globals.config = config
    Globals.config.imgDirectory = path.resolve(path.join(__dirname, config.dataDirectory, "imgs"))
    Globals.config.sampleDirectory = path.resolve(path.join(__dirname, config.dataDirectory, "samples"))

    if (!Globals.config.secure) {
      for (let col of ["aggregationQueue", "artistUrls", "artists", "e621IqdbQueue", "ids", "jobs", "submissions", "iqdbQueue", "deletedSubmissions", "logs"]) {
        try {
          await Globals.db.collection(col).drop()
        } catch (e) { }
      }
    }

    Globals.aggregationManager = new AggregationManager()
    Globals.multiIPFetch = new MultiIPFetch(Globals.config.multiIPFetchOptions)
    await E621IqdbChecker.setup()
    await IqdbManager.setup()

    TwitterScraper.getTokens()
    FurAffinityScraper.getTokens()
    DeviantArtScraper.getAccessToken()
    NewgroundsScraper.getCookie()

    const app = express()

    app.set("trust proxy", 1)
    app.set("views", path.join(__dirname, "views"))
    app.set("view engine", "ejs")

    // middleware setup
    app.use(session({
      secret: config.sessions.secret,
      store: MongoStore.create({
        client,
        dbName: config.sessions.databaseName
      }),
      resave: false,
      saveUninitialized: true
    }))

    app.use(bodyParser.urlencoded({ extended: true }))
    app.use(bodyParser.json({ limit: "1KB" }))
    app.use(fileUpload({
      limits: { fileSize: 1500 * 1024 * 1024 },
    }))

    app.use(express.static(path.join(__dirname, "public")))
    app.use(cors())

    app.use(async (req, res, next) => {
      if (req.path.startsWith("/js") || req.path.startsWith("/css") || req.path.startsWith("img") || req.path == "/favicon.ico") return

      let account = await Account.findBySessionId(req.session.id)

      if (!account && req.path != "/login") {
        return res.redirect("/login")
      }

      if (account?.newAccount && req.path != "/setup") {
        return res.redirect("/setup")
      }

      if (!account && req.path != "/login") return res.sendStatus(403)

      req.account = account

      if (account?.admin) {
        if (!req.path.startsWith("/puppet") && !req.path.startsWith("/data")) {
          if (FurAffinityScraper.needCaptchaDone) {
            return res.redirect("/puppet/furaffinity")
          }

          if (NewgroundsScraper.needsCode) {
            return res.redirect("/puppet/newgrounds")
          }

          if (DeviantArtScraper.needCaptchaDone) {
            return res.redirect("/puppet/deviantart")
          }
        }
      }

      next()
    })

    // routers
    for (let p of fs.readdirSync(path.join(__dirname, "routes"))) {
      if (!p.endsWith(".js")) continue
      let data = require(path.join(__dirname, "routes", p)).default()
      app.use(data.path, data.router)
    }

    return app
  } catch (e) {
    console.error("TOP LEVEL ERROR")
    console.error(e)
  }
}

process.on("exit", () => {
  execSync("docker stop reverser_iqdb")
})