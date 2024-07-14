import puppeteer from "puppeteer"
import Globals from "../Globals"
import ArtistURL from "../ArtistURL"
import E621IqdbChecker from "../E621IqdbChecker"
import { features } from "process"
import Utils from "../Utils"
import Media from "../Media"
import { PuppetServer } from "../Puppet"

const BEARER_TOKEN = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"
const API_BASE_URL = "https://x.com/i/api/graphql"

export class TweetMedia extends Media {
  private static expandDescription(tweet) {
    // let range = tweet.display_text_range
    let description = tweet.full_text
    let media = tweet.extended_entities?.media?.[0]
    if (media) {
      description = description.replace(media.url, "")
    }
    return description.trim()
  }

  private static extractUrlFromMedia(media) {
    switch (media.type) {
      case "photo":
        {
          let regex = /media\/(\S*)\.(\S*)$/
          let data = regex.exec(media.media_url_https)
          return `https://pbs.twimg.com/media/${data?.[1]}?format=${data?.[2]}&name=orig`
        }

      case "video":
        {
          let variant = media.video_info.variants.sort((a, b) => parseInt(b.bitrate) - parseInt(a.bitrate))[0]
          return variant.url
        }

      case "animated_gif":
        {
          return media.video_info.variants[0].url
        }
    }
  }

  constructor(tweet) {
    super(tweet.id_str, "", TweetMedia.expandDescription(tweet), tweet.extended_entities.media.map(media => TweetMedia.extractUrlFromMedia(media)), new Date(tweet.created_at))
  }
}

class TwitterScraper {
  private static fetchNewTokensAt: Date = new Date()
  private static fetchingTokens: boolean = false
  private static authToken: string = ""
  private static csrfToken: string = ""

  private static getRandomUserAgent(): string {
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.${~~(Math.random() * 9999)} Safari/537.${~~(Math.random() * 99)}`
  }

  static async getTokens(bypassCheck: boolean = false): Promise<{ authToken: string, csrfToken: string }> {
    let browser
    try {
      if (new Date() < TwitterScraper.fetchNewTokensAt) {
        return { authToken: TwitterScraper.authToken, csrfToken: TwitterScraper.csrfToken }
      }

      if (!bypassCheck && TwitterScraper.fetchingTokens) {
        while (TwitterScraper.fetchingTokens) await Utils.wait(1000)
        return { authToken: TwitterScraper.authToken, csrfToken: TwitterScraper.csrfToken }
      }

      TwitterScraper.fetchingTokens = true

      TwitterScraper.authToken = ""
      TwitterScraper.csrfToken = ""

      browser = await puppeteer.launch({
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      })
      let page = await browser.newPage()

      await page.goto("https://twitter.com/i/flow/login")

      // let server = new PuppetServer("twitter", page)

      let usernameInput = await page.waitForSelector("input[autocomplete='username']", { timeout: 15000 })
      await usernameInput?.type(Globals.config.twitterAuth.username, { delay: 100 })

      let next = await page.waitForSelector("::-p-xpath(//*[text()='Next'])")
      await next?.click()

      let requireEmail = false

      try {
        await page.waitForSelector("::-p-xpath(//*[text()='Phone or email'])", { timeout: 5000 })
        requireEmail = true
      } catch { }

      if (requireEmail) {
        // autocapitalize="none" autocomplete="on" autocorrect="off" inputmode="text" name="text" spellcheck="false" type="text"
        let emailInput = await page.waitForSelector("input[autocomplete='on']")
        await emailInput?.type(Globals.config.twitterAuth.email as string, { delay: 100 })
        next = await page.waitForSelector("::-p-xpath(//*[text()='Next'])")
        await next?.click()
      }

      let passwordInput = await page.waitForSelector("input[type='password']")
      await passwordInput?.type(Globals.config.twitterAuth.password, { delay: 100 })

      let login = await page.waitForSelector("::-p-xpath(//*[text()='Log in'])")
      await login?.click()

      do {
        TwitterScraper.authToken = ""
        TwitterScraper.csrfToken = ""

        await Utils.wait(500)
        let cookies = await page.cookies()

        for (let cookie of cookies) {
          if (cookie.name == "auth_token") {
            TwitterScraper.authToken = cookie.value
          } else if (cookie.name == "ct0") {
            TwitterScraper.csrfToken = cookie.value
          }
        }
      } while (!TwitterScraper.csrfToken || !TwitterScraper.authToken)

      // await server.destroy()
      await browser.close()

      if (TwitterScraper.csrfToken == "" || TwitterScraper.authToken == "") {
        return await TwitterScraper.getTokens(true)
      }

      console.log("GOT TWITTER TOKENS")

      TwitterScraper.fetchNewTokensAt = new Date(Date.now() + 3300000)

      setTimeout(() => {
        TwitterScraper.getTokens()
      }, 3300000)

      TwitterScraper.fetchingTokens = false

      return { authToken: TwitterScraper.authToken, csrfToken: TwitterScraper.csrfToken }
    } catch (e) {
      await browser.close()
      console.error(`RETRYING TWITTER AUTH`)
      console.error(e)
      return await TwitterScraper.getTokens(true)
    }
  }

  private static async getHeaders(urlIdentifier: string) {
    let { authToken, csrfToken } = await TwitterScraper.getTokens()
    return {
      "User-Agent": TwitterScraper.getRandomUserAgent(),
      "Authorization": `Bearer ${BEARER_TOKEN}`,
      "Referer": `https://twitter.com/${urlIdentifier}/media`,
      "Accept-Language": "en-US,en;q=0.5",
      "x-csrf-token": csrfToken,
      "Cookie": `ct0=${csrfToken}; auth_token=${authToken}`,
    }
  }

  private static async makeRequest(path, params: Record<string, any>, urlIdentifier: string): Promise<any> {
    return new Promise(async (resolve, reject) => {
      let url = new URL(`${API_BASE_URL}/${path}`)

      for (let [key, value] of Object.entries(params)) {
        url.searchParams.set(key, JSON.stringify(value))
      }

      Globals.multiIPFetch.queueFetch({
        url: url.toString(),
        method: "GET",
        headers: await TwitterScraper.getHeaders(urlIdentifier),
        onResolve: async (res: Response) => {
          if (!res.ok) return reject(new Error(await res.text()))

          return resolve(await res.json())
        },
        onReject: reject
      })
    })
  }

  static async getApiIdentifier(urlIdentifier: string): Promise<string | null> {
    try {
      let variables = {
        screen_name: urlIdentifier,
        withSafetyModeUserFields: true
      }

      let features = {
        hidden_profile_subscriptions_enabled: true,
        rweb_tipjar_consumption_enabled: true,
        responsive_web_graphql_exclude_directive_enabled: true,
        verified_phone_label_enabled: false,
        subscriptions_verification_info_is_identity_verified_enabled: true,
        subscriptions_verification_info_verified_since_enabled: true,
        highlights_tweets_tab_ui_enabled: true,
        responsive_web_twitter_article_notes_tab_enabled: true,
        subscriptions_feature_can_gift_premium: false,
        creator_subscriptions_tweet_preview_api_enabled: true,
        responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
        responsive_web_graphql_timeline_navigation_enabled: true
      }

      let fieldToggles = {
        withAuxiliaryUserLabels: false,
      }

      let json = await TwitterScraper.makeRequest("xmU6X_CKVnQ5lSrCbAmJsg/UserByScreenName", { variables, features, field_toggles: fieldToggles }, urlIdentifier)
      return json?.data?.user?.result?.rest_id
    } catch (e) {
      console.error(`ERROR IN TWITTER SCRAPER`)
      console.error(e)
      return null
    }
  }

  private static instructionByType(instructions: any, type: string) {
    return instructions?.find(i => i.type == type)
  }

  private static entriesByType(entries: any, type: string) {
    return entries?.filter(i => i.entryType == type)
  }

  private static extractItems(instructions: any, timelineAddEntries: any) {
    let addToModule
    let timelineModule
    if ((addToModule = TwitterScraper.instructionByType(instructions, "TimelineAddToModule")) != null) {
      return addToModule.moduleItems
    } else if ((timelineModule = TwitterScraper.entriesByType(timelineAddEntries, "TimelineTimelineModule")) != null) {
      return timelineModule.map(c => c.items).filter(c => c).flat()
    } else {
      return []
    }
  }

  private static extractTweetsAndCursorEntry(json: any) {
    // require("fs").writeFileSync(`test-${Date.now()}.json`, JSON.stringify(json, null, 4))
    let instructions = json?.data?.user?.result?.timeline_v2?.timeline?.instructions
    let timelineAddEntries = TwitterScraper.instructionByType(instructions, "TimelineAddEntries")?.entries?.map(e => e.content)
    if (!timelineAddEntries) return { tweets: [] }
    let items = TwitterScraper.extractItems(instructions, timelineAddEntries)
    let itemContent = items.map(i => i?.item?.itemContent).filter(c => c)
    let tweets = itemContent.filter(c => !c.promotedMetadata).map(c => c?.tweet_results?.result?.tweet ?? (c?.tweet_results?.result?.__typename == "Tweet" ? c?.tweet_results?.result : null)).filter(c => c)
    tweets = tweets.filter(tweet => tweet.__typename != "TweetTombstone")
    tweets = tweets.filter(tweet => tweet?.legacy?.extended_entities?.media)
    let cursor = TwitterScraper.entriesByType(timelineAddEntries, "TimelineTimelineCursor").find(c => c.cursorType == "Bottom")

    return { tweets, cursor: cursor.value }
  }

  static async* getMedia(artistUrl: ArtistURL): AsyncGenerator<Media, void> {
    let variables: any = {
      userId: artistUrl.apiIdentifier,
      count: 200,
      includePromotedContent: false,
      withClientEventToken: false,
      withBirdwatchNotes: false,
      withVoice: true,
      withV2Timeline: true
    }

    let features = {
      rweb_tipjar_consumption_enabled: true,
      responsive_web_graphql_exclude_directive_enabled: true,
      verified_phone_label_enabled: false,
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_timeline_navigation_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      communities_web_enable_tweet_community_results_fetch: true,
      c9s_tweet_anatomy_moderator_badge_enabled: true,
      articles_preview_enabled: true,
      tweetypie_unmention_optimization_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_consumption_enabled: true,
      responsive_web_twitter_article_tweet_consumption_enabled: true,
      tweet_awards_web_tipping_enabled: false,
      creator_subscriptions_quote_tweet_preview_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
      rweb_video_timestamps_enabled: true,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      responsive_web_enhance_cards_enabled: false
    }

    let fieldToggles = {
      withArticlePlainText: false
    }

    let cursor: string | null = null

    while (true) {
      if (cursor) variables.cursor = cursor
      let json = await TwitterScraper.makeRequest("MOLbHrtk8Ovu7DUNOLcXiA/UserMedia", { variables, features, fieldToggles }, artistUrl.urlIdentifier)
      // console.log(`GOT JSON`)

      if (json?.data?.user?.result?.__typename == "UserUnavailable") {
        console.log(`BREAK, NO USER`)
        break
      }

      let { tweets, cursor: curs } = TwitterScraper.extractTweetsAndCursorEntry(json)

      if (tweets.length == 0) {
        console.log(`BREAK, NO TWEETS`)
        break
      }

      cursor = curs

      // console.log("START YIELD")
      for (let tweet of tweets) {
        yield new TweetMedia(tweet.legacy)
      }
      // console.log("YIELDED ALL")
    }
  }
}

export default TwitterScraper