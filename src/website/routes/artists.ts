import express, { Express, Request, Response, Router } from "express"
import Artist, { WebifiedArtist } from "../../modules/Artist"
import Globals from "../../modules/Globals"
import Utils from "../../modules/Utils"
import Account from "../../modules/Account"
import ArtistURL from "../../modules/ArtistURL"
import { filesize } from "filesize"
const router = express.Router()

router.get("/", async (req: Request, res: Response) => {
  // let page = parseInt(req.query.page as string)
  // if (isNaN(page) || page < 1) page = 1
  // let artists = await req.account!.getWatchedArtists(page) as Artist[]
  // let arts: WebifiedArtist[] = []

  // let promises: Promise<any>[] = []

  // for (let artist of artists) {
  //   let p = artist.webify()
  //   promises.push(p)
  //   p.then((a) => {
  //     arts.push(a)
  //   })
  // }

  // await Promise.all(promises)

  // arts.sort((a, b) => (a.id as number) - (b.id as number))

  // let totalPages = await req.account!.getTotalArtistPages()

  // res.render("artists/index", {
  //   artists: arts,
  //   totalPages,
  //   account: req.account,
  //   headers: req.headers
  // })

  let query = await Utils.processArtistSearchQuery(req.query)

  let { artists, totalPages } = await req.account!.getWatchedArtists(query, true)
  res.render("artists/index", {
    artists,
    totalPages,
    account: req.account,
    aggregators: Globals.aggregationManager.aggregators,
    headers: req.headers
  })
})

router.get("/listing", async (req: Request, res: Response) => {
  let query = await Utils.processArtistSearchQuery(req.query)

  let { artists, totalPages } = await Artist.getAllArtistsByQuery(query, true)

  res.render("artists/listing", {
    artists,
    totalPages,
    account: req.account,
    aggregators: Globals.aggregationManager.aggregators,
    utils: Utils,
    headers: req.headers
  })
})

router.get("/new", async (req: Request, res: Response) => {
  res.render("artists/new", {
    headers: req.headers
  })
})

router.post("/new", async (req: Request, res: Response) => {
  let { name, urls, notes }: { name: string, urls: string[], notes: string } = req.body

  if (name.trim().length == 0) return res.status(400).send("No name provided")

  urls = urls.filter(s => s.trim().length > 0 && Utils.normalizeUrl(s) != "INVALID_URL")

  await req.account!.addTempArtist(name, urls)

  Artist.create(req.account!, name, urls, notes)

  return res.sendStatus(200)
})

router.get("/:id.json", async (req: Request, res: Response) => {
  let artist = await Artist.findById(parseInt(req.params.id))

  if (!artist) return res.sendStatus(404)

  return res.json(await artist.webify())
})

router.get("/:id", async (req: Request, res: Response) => {
  let artist = await Artist.findById(parseInt(req.params.id))

  if (!artist) return res.sendStatus(404)

  let query = await Utils.processSubmissionSearchQuery(req.query)

  let { submissions, totalPages } = await artist.getAllSubmissions(req.account as Account, query, true) ?? { totalPages: 0, submissions: [] }

  res.render("artists/artist", {
    artist: await artist.webify(),
    submissions,
    totalPages,
    account: req.account,
    aggregators: Globals.aggregationManager.aggregators,
    humanSize: (size, options = {}) => {
      return filesize(size, { standard: "jedec", ...options })
    },
    utils: Utils,
    headers: req.headers
  })
})

router.delete("/:id", async (req: Request, res: Response) => {
  let artist = await Artist.findById(parseInt(req.params.id))

  if (!artist) return res.sendStatus(404)

  await artist.deleteArtist()

  return res.sendStatus(200)
})


router.post("/queue", async (req: Request, res: Response) => {
  let artist = await Artist.findById(req.body.id)

  if (!artist) return res.sendStatus(404)

  await artist.queueScraping()
  return res.sendStatus(200)
})

router.post("/queue/many", async (req: Request, res: Response) => {
  let artists = await Artist.findManyById(req.body.ids)

  for (let artist of artists) await artist.queueScraping()
  return res.sendStatus(200)
})

router.patch("/:id/edit", async (req: Request, res: Response) => {
  let artist = await Artist.findById(parseInt(req.params.id))

  if (!artist) return res.sendStatus(404)

  if (req.body.name) {
    await artist.setName(req.body.name)
  }

  if (req.body.urlsToRemove) {
    for (let id of req.body.urlsToRemove) {
      if (isNaN(id)) continue
      await artist.removeArtistUrlById(id, req.account!)
    }
  }

  if (req.body.urlsToAdd) {
    let urls: string[] = []
    for (let url of req.body.urlsToAdd) {
      if (typeof url != "string" || url.trim().length == 0 || !Utils.isValidUrl(url)) continue
      urls.push(url)
    }
    await artist.addArtistUrls(req.account!, urls, true)
  }

  if (req.body.notesToAdd) {
    for (let note of req.body.notesToAdd) {
      await artist.addNote(req.account!, note.trim())
    }
  }

  if (req.body.notesToRemove) {
    for (let noteIndex of req.body.notesToRemove) {
      await artist.removeNote(noteIndex)
    }
  }

  return res.sendStatus(200)
})

router.post("/urls/:id/queue", async (req: Request, res: Response) => {
  let artistUrl = await ArtistURL.findById(parseInt(req.params.id))

  if (!artistUrl) return res.sendStatus(404)

  await artistUrl.queue()

  return res.sendStatus(200)
})

export default () => {
  return {
    router,
    path: "/artists"
  }
}
