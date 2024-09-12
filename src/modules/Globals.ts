import { Db } from "mongodb"
import MultiIPFetch, { HostnameOptions } from "./MultiIPFetch"
import AggregationManager from "./AggregationManager"
import fs from "fs"
import SSE from "express-sse-ts"

export type SiteAuth = { username: string, password: string, email?: string }

export type Config = {
  mongo: { url: string, databaseName: string }
  sessions: { databaseName: string, secret: string }
  web: { port: number }
  iqdb: {
    dataDirectory: string
    port: number
  }
  baseDomain: string
  e621Auth: string
  multiIPFetchOptions: HostnameOptions[]
  imageDownloadIps: string[]
  e621IqdbRotation: string[]
  twitterAuth: SiteAuth
  furAffinityAuth: SiteAuth
  inkBunnyAuth: SiteAuth
  deviantArtAuth: { clientId: string, clientSecret: string }
  pixivRefreshToken: string
  blueSkyAuth: SiteAuth
  newgroundsAuth: SiteAuth
  artFightAuth: SiteAuth
  toyhouseAuth: SiteAuth
  cohostCookie: string
  weasylApiKey: string
  internal: { ssl: { privateKeyLocation: string, certificateLocation: string, chainLocation: string } }
  dataDirectory: string
  imgDirectory?: string
  sampleDirectory?: string
  secure: boolean
}

class Globals {
  static db: Db
  static configPath: string
  static config: Config

  static serverEvents: SSE

  static multiIPFetch: MultiIPFetch

  static aggregationManager: AggregationManager

  static siteArtistIdentifier: string = "(?<artistIdentifier>[^\\/?&#]*)"
  static prefix: string = "^(https?:\\/\\/)?(www\\.)?"
  static remaining: string = ".*?"
  static pixivLang: string = "([a-zA-Z]{2}\\/)?"

  static saveConfig() {
    fs.writeFileSync(Globals.configPath, JSON.stringify(Globals.config, null, 2))
  }
}

export default Globals