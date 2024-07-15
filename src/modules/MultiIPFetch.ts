import { ClientRequest, IncomingMessage } from "http"

const https = require("https")

export type WithPriority<T> = T & { priority: number }

export interface RateLimitOptions {
  rateLimitRemainingHeader: string
  rateLimitResetHeader: string
}

export interface HostnameOptions {
  hostName: string
  aliases: string[]
  allowedIPs: string[]
  useRateLimit?: boolean
  rateLimitOptions?: RateLimitOptions
}

export interface IPData {
  ip: string
  inUse: boolean
  nextUseTime: number
}

export interface HostData {
  ipData: IPData[]
  aliases: (string | RegExp)[]
}

export interface RequestData {
  priority?: number
  url: string
  method?: string
  body?: any
  headers?: any
  onResolve: (res: Response) => void
  onReject: (e: any) => void
}

export interface QueueData {
  queue: WithPriority<RequestData>[]
  processing: boolean
}

export interface RateLimitData {
  rateLimitRemaining: number
  rateLimitReset: number
  rateLimitRemainingHeader: string
  rateLimitResetHeader: string
}

function wait(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

export function sortedIndex(array: WithPriority<any>[], value: WithPriority<any>): number {
  let low = 0,
    high = array.length

  while (low < high) {
    let mid = (low + high) >>> 1
    if (array[mid].priority! < value.priority!) {
      high = mid
    } else {
      low = mid + 1
    }
  }

  return low
}

class MultiIPFetch {
  hostData: { [hostName: string]: HostData }
  queue: { [hostName: string]: QueueData }
  rateLimitData: { [ip: string]: { [hostName: string]: RateLimitData } }

  private customFetch(options: RequestData, localAddress: string, hostName: string): Promise<void> {
    // console.log("Fetching")
    // console.log(options)
    // console.log(localAddress)
    return new Promise((resolve) => {
      try {
        let req: ClientRequest = https.request(options.url, {
          headers: options.headers,
          method: options.method,
          localAddress,
          family: 4
        }, (res: IncomingMessage) => {
          // console.log("INCOMING MESSAGE!")
          let d = ""
          res.setEncoding("utf8")
          res.on("data", (chunk: string) => {
            // console.log("ADD CHUNK")
            d += chunk
          })

          res.on("end", () => {
            // console.log(`RES END`)

            if (this.rateLimitData[localAddress] && this.rateLimitData[localAddress][hostName]) {
              this.rateLimitData[localAddress][hostName].rateLimitRemaining = parseInt(res.headers[this.rateLimitData[localAddress][hostName].rateLimitRemainingHeader] as string)

              let time = res.headers[this.rateLimitData[localAddress][hostName].rateLimitResetHeader] as string
              let properTime = -1

              // @ts-ignore
              if (isNaN(time)) properTime = (new Date(time)).getTime()
              else properTime = parseInt(time) * 1000

              if (properTime != -1) this.rateLimitData[localAddress][hostName].rateLimitReset = properTime
            }

            options.onResolve(new Response(d, { status: res.statusCode, headers: (res.headers as Record<string, string>) }))
            resolve()
          })
        })

        if (options.body) {
          // console.log(`WRITING BODY!`)
          req.write(options.body)
        }

        req.on("error", (e) => {
          console.error("REQ ERROR!!!!!!!!!!")
          options.onReject(e)
          resolve()
        })

        // console.log("REQ END")
        req.end()
      } catch (e) {
        console.error(e)
        options.onReject(e)
        resolve()
      }

    })
  }

  constructor(options: HostnameOptions[]) {
    this.hostData = {}
    this.queue = {}
    this.rateLimitData = {}

    for (let option of options) {
      this.hostData[option.hostName] = {
        ipData: option.allowedIPs.map(ip => ({
          ip,
          inUse: false,
          nextUseTime: 0
        })),
        aliases: option.aliases.map(s => s.startsWith("/") ? new RegExp(s.slice(1)) : s)
      }

      this.queue[option.hostName] = { queue: [], processing: false }

      if (option.useRateLimit) {
        for (let ip of option.allowedIPs) {
          if (!this.rateLimitData[ip]) this.rateLimitData[ip] = {}
          this.rateLimitData[ip][option.hostName] = {
            rateLimitRemaining: Number.MAX_SAFE_INTEGER,
            rateLimitReset: Number.MAX_SAFE_INTEGER,
            rateLimitRemainingHeader: option.rateLimitOptions!.rateLimitRemainingHeader as string,
            rateLimitResetHeader: option.rateLimitOptions!.rateLimitResetHeader as string
          }
        }
      }
    }
  }

  private async getNextOpenIP(hostName: string): Promise<IPData> {
    let ipData = this.hostData[hostName].ipData.find(d => !d.inUse && d.nextUseTime <= Date.now())

    while (!ipData) {
      // console.log(`ALL IN USE FOR: ${hostName}`)
      await wait(1000)
      // console.log("AFTER WAIT!")
      ipData = this.hostData[hostName].ipData.find(d => !d.inUse && d.nextUseTime <= Date.now())
    }

    return ipData
  }

  private async processQueue(hostName: string) {
    let properHostName = this.resolveHostAlias(hostName) as string
    let queueData = this.getQueueForHost(properHostName) as QueueData
    if (queueData.queue.length == 0) {
      queueData.processing = false
      return
    }

    let x = ~~(Math.random() * 1000000)

    // console.log(`PROCESSING QUEUE FOR  ${hostName} (${queueData.queue.length}) (${x})`)
    queueData.processing = true

    let ipData = await this.getNextOpenIP(properHostName)
    ipData.inUse = true

    // console.log(`GOT IP FOR ${hostName} (${x})`)

    this.customFetch(queueData.queue.shift() as RequestData, ipData.ip, properHostName).then(() => {
      // console.log(`FETCH DONE. (${x})`)

      if (this.rateLimitData[ipData.ip] && this.rateLimitData[ipData.ip][hostName]) {
        let rateLimitData = this.rateLimitData[ipData.ip][hostName]

        if (rateLimitData.rateLimitRemaining <= 0) {
          ipData.nextUseTime = rateLimitData.rateLimitReset + 50
          ipData.inUse = false
          return
        }
      }

      ipData.nextUseTime = Date.now() + Math.random() * 359
      ipData.inUse = false
    }).catch((e) => {
      if (this.rateLimitData[ipData.ip] && this.rateLimitData[ipData.ip][hostName]) {
        let rateLimitData = this.rateLimitData[ipData.ip][hostName]

        if (rateLimitData.rateLimitRemaining <= 0) {
          ipData.nextUseTime = rateLimitData.rateLimitReset + 50
          ipData.inUse = false
        } else {
          ipData.nextUseTime = Date.now() + Math.random() * 359
          ipData.inUse = false
        }
      } else {
        ipData.nextUseTime = Date.now() + Math.random() * 359
        ipData.inUse = false
      }

      console.error(`ERROR IN FETCH (${x}):`)
      console.error(e)
    })

    this.processQueue(properHostName)
  }

  private getQueueForHost(host: string): QueueData | null {
    if (this.queue[host]) return this.queue[host]

    for (let [hostName, hostData] of Object.entries(this.hostData)) {
      if (hostData.aliases.includes(host)) {
        return this.queue[hostName]
      }
    }

    return null
  }

  private resolveHostAlias(host: string): string | null {
    if (this.queue[host]) return host

    for (let [hostName, hostData] of Object.entries(this.hostData)) {
      for (let alias of hostData.aliases) {
        if (alias == host) {
          return hostName
        } else if (typeof (alias) != "string" && alias.test(host)) {
          return hostName
        }
      }
    }

    return null
  }

  queueFetch(options: RequestData) {
    if (options.priority === undefined || options.priority === null) options.priority = 0
    let url = new URL(options.url)
    let resolved = this.resolveHostAlias(url.hostname) as string
    let queueData = this.getQueueForHost(resolved) as QueueData
    let index = sortedIndex(queueData.queue, options as WithPriority<RequestData>)
    queueData.queue.splice(index, 0, options as WithPriority<RequestData>)

    if (!queueData.processing) this.processQueue(resolved)
  }
}

export default MultiIPFetch