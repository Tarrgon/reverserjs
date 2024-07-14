import { Page, ScreenshotOptions } from "puppeteer"
import Utils from "./Utils"
import sharp from "sharp"

const SHOT_DELAY = 100
const CLICK_DELAY = 100
const TYPE_DELAY = 100

const SHOT_OPTS = {
  type: 'jpeg',
  quality: 90,
} as ScreenshotOptions

export interface PuppetClient {
  mjpeg: any,
  ip: string
}

export interface PuppetState {
  shooting: boolean
  closed: boolean
  latestShot: Buffer | null
  clients: PuppetClient[]
}

export class PuppetServer {
  static servers: PuppetServer[] = []

  name: string
  state: PuppetState
  page: Page
  interval: NodeJS.Timeout

  constructor(name: string, page: Page) {
    this.name = name
    this.page = page
    this.state = {
      shooting: false,
      closed: false,
      latestShot: null,
      clients: []
    }

    PuppetServer.servers.push(this)

    this.interval = setInterval(() => {
      if (this.state.closed) return
      this.broadcastShot()
    }, 50)
  }

  async destroy() {
    if (this.state.closed) return
    this.state.closed = true
    this.state.shooting = true
    this.state.latestShot = await sharp({ create: { width: 1920, height: 1080, channels: 4, background: { r: 0, g: 0, b: 0 } } }).toBuffer()
    this.state.clients.forEach(({ mjpeg, ip }) => {
      try {
        mjpeg.write(this.state.latestShot)
      } catch (e) {
        console.warn(`Error on send MJPEG frame to client`, e, { mjpeg, ip })
      }
    })
    clearInterval(this.interval)
    PuppetServer.servers.splice(PuppetServer.servers.findIndex(s => s.name == this.name), 1)
  }

  browserView() {
    return `
      <!DOCTYPE html>
      <meta name=viewport content=width=device-width,initial-scale=1>
      <link rel=stylesheet href=/puppet/${this.name}/probe-viewport.css>
      <style>
        :root, body, form {
          margin: 0;
          padding: 0;
          border: 0;
          min-height: 100%;
          height: 100%;
        }
  
        body {
          display: grid;
          grid-template-areas:
            "address input"
            "viewport viewport";
          grid-template-rows: 1.75rem 1fr;
          grid-template-columns: 61.799% 38.199%;
          max-width: 100vw;
          overflow: auto;
          max-height: calc(100vh - 1.75rem);
        }
  
        nav {
          display: contents;
        }
  
        form.address {
          grid-area: address;
          display: flex;
        }
  
        form.address input {
          flex-grow: 1;
        }
  
        iframe.input {
          grid-area: input;
          max-width: 100%;
          width: 100%;
          height: 100%;
          border: 0;
          padding: 0;
        }

        iframe {
          display: none;
        }
  
        form.viewport {
          grid-area: viewport;
        }
      </style>
      <body>
        <img src="/puppet/${this.name}/viewport.mjpeg" onclick="preventDefault(event)">
        <script>
          function preventDefault(event) {
            event.preventDefault()
            event.stopImmediatePropagation()
          }

          function post(data) {
            fetch("/puppet/${this.name}/carpediem", {
              headers: {
                "Content-Type": "application/json"
              },
              method: "POST",
              body: JSON.stringify(data)
            })
          }

          document.addEventListener("mousemove", (event) => {
            post({x: event.clientX, y: event.clientY, type: "mousemove"})
          })

          document.addEventListener("mousedown", (event) => {
            post({x: event.clientX, y: event.clientY, type: "mousedown"})
          })

          document.addEventListener("mouseup", (event) => {
            post({x: event.clientX, y: event.clientY, type: "mouseup"})
          })

          document.addEventListener("keypress", (event) => {
            post({key: event.key, type: "keypress"})
          })
        </script>
      </body>
    `
  }

  viewportProbes() {
    const bp: { w: number, h: number }[] = []
    for (let w = 300; w <= 1920; w += 32) {
      for (let h = 300; h <= 1080; h += 32) {
        bp.push({ w, h })
      }
    }

    const mr = bp.map(({ w, h }) => `
      @media screen and (min-width: ${w}px) and (min-height: ${h}px) {
        body {
          background-image: url("/puppet/${this.name}/set-viewport-dimensions/width/${w}/height/${h}/set.png") 
        }
      }
    `)

    return mr.join('\n')
  }

  private async broadcastShot() {
    try {
      if (this.state.shooting || this.state.closed) return
      this.state.shooting = true
      await Promise.race([Utils.wait(SHOT_DELAY), this.page.waitForNavigation({ timeout: SHOT_DELAY })])
      if (this.state.closed) return
      this.state.latestShot = await this.page.screenshot(SHOT_OPTS)
      this.state.shooting = false
      this.state.clients.forEach(({ mjpeg, ip }) => {
        try {
          mjpeg.write(this.state.latestShot)
        } catch (e) {
          console.warn(`Error on send MJPEG frame to client`, e, { mjpeg, ip })
        }
      })
    } catch (e) { }
  }

  async setEmulation(data: any) {
    if (this.state.closed) return
    await this.page.emulate(data)
  }

  async sendAction(action) {
    if (this.state.closed) return
    // send action to browser
    try {
      switch (action.type) {
        case "scrolldown":
          await this.page.mouse.wheel({ deltaY: 100 })
          //@ts-ignore
          await this.page.evaluate(() => window.scrollBy(0, 100))
          await Utils.wait(CLICK_DELAY)

          break
        case "scrollup":
          await this.page.mouse.wheel({ deltaY: -100 })
          //@ts-ignore
          await this.page.evaluate(() => window.scrollBy(0, -100))
          await Utils.wait(CLICK_DELAY)
          break
        case "click":
          {
            const { x, y } = action
            await this.page.mouse.click(x, y, { delay: CLICK_DELAY })
            break
          }
        case "mousemove":
          {
            const { x, y } = action
            await this.page.mouse.move(x, y)
            break
          }
        case "mousedown":
          {
            const { x, y } = action
            await this.page.mouse.down()
            break
          }
        case "mouseup":
          {
            const { x, y } = action
            await this.page.mouse.up()
            break
          }
        case "keypress":
          {
            await this.page.keyboard.press(action.key)
            break
          }
        default:
          console.warn(`Error with action`, action)
          throw new TypeError(`sendAction received unknown action of type: ${action.type}`)
      }
    } catch { }
  }
}

export default class Puppet {
  static puppetData: Record<string, PuppetServer> = {}
}