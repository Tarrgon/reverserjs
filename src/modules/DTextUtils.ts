// **Our** code https://github.com/Sasquire/Idems-Sourcing-Suite/blob/master/source/utils/node_to_dtext.js

import { HTMLElement, Node, parse } from "node-html-parser"
import showdown from "showdown"
import Utils from "./Utils"

const markdownToHtmlConverter = new showdown.Converter()

class DTextUtils {
  private static getLink(element: HTMLElement, isDtext: boolean): string {
    const inner = DTextUtils.innerText(element)
    const link = element.getAttribute("href") as string

    // if node is like <a href="https://google.com">Yahoo</a>
    if (inner && inner !== link) {
      if (isDtext) {
        return `"${inner}":${link}`
      } else {
        return `${inner} ( ${link} )`
      }
    } else {
      return link
    }
  }

  private static innerText(element: HTMLElement | Node, options: any = {}) {
    if (element.childNodes.length > 0) {
      return Array.from(element.childNodes)
        .map((item) => {
          let text = DTextUtils.htmlToDText(item, options)
          if (options.bolden && text.trim().length > 0) {
            text = `[b] ${text} [/b]`
          }

          if (options.italicize && text.trim().length > 0) {
            text = `[i] ${text} [/i]`
          }

          if (options.underline && text.trim().length > 0) {
            text = `[u] ${text} [/u]`
          }

          if (options.o && text.trim().length > 0) {
            text = `[o] ${text} [/o]`
          }

          if (options.s && text.trim().length > 0) {
            text = `[s] ${text} [/s]`
          }

          if (options.super && text.trim().length > 0) {
            text = `[sup] ${text} [/sup]`
          }

          if (options.sub && text.trim().length > 0) {
            text = `[sub] ${text} [/sub]`
          }

          return text
        })
        .filter(e => e)
        .join(" ")
        .replace(/\n /ug, "\n")
    } else {
      return element.textContent.trim()
    }
  }

  public static markdownToDText(markdown: string): string {
    let html = markdownToHtmlConverter.makeHtml(markdown)
    let element = Utils.getHtmlElement(html)
    return DTextUtils.htmlToDText(element)
  }

  public static htmlToDText(entry: Node | null, options: any = {}): string {
    if (entry === null) {
      return ""
    } else if (typeof entry === "string") {
      return entry
    }

    switch (entry.rawTagName?.toUpperCase()) {
      case "B":
      case "STRONG": return `${DTextUtils.innerText(entry, { ...options, bolden: true })}`
      case "EM":
      case "I": return `${DTextUtils.innerText(entry, { ...options, italicize: true })}`
      case "U": return `${DTextUtils.innerText(entry, { ...options, underline: true })}`
      case "O": return `${DTextUtils.innerText(entry, { ...options, o: true })}`
      case "S": return `${DTextUtils.innerText(entry, { ...options, s: true })}`
      case "SUP": return `${DTextUtils.innerText(entry, { ...options, super: true })}`
      case "SUB": return `${DTextUtils.innerText(entry, { ...options, sub: true })}`

      case "A": return DTextUtils.getLink(entry as HTMLElement, true)

      case "PRE": return `[code] ${DTextUtils.innerText(entry)} [/code]`

      case "H1": return `h1. ${DTextUtils.innerText(entry).replace(/\n/gu, " ")}`
      case "H2": return `h2. ${DTextUtils.innerText(entry).replace(/\n/gu, " ")}`
      case "H3": return `h3. ${DTextUtils.innerText(entry).replace(/\n/gu, " ")}`
      case "H4": return `h4. ${DTextUtils.innerText(entry).replace(/\n/gu, " ")}`
      case "H5": return `h5. ${DTextUtils.innerText(entry).replace(/\n/gu, " ")}`
      case "H6": return `h6. ${DTextUtils.innerText(entry).replace(/\n/gu, " ")}`

      case "LI": return `* ${DTextUtils.innerText(entry)}`

      case "#comment":
      case "IMG": return "" // Images get destroyed :(
      case "BR":
        return "\n"
      case "HR":
        return "\n\n"
      case "P": return `${DTextUtils.innerText(entry)}\n`

      default: return DTextUtils.innerText(entry)
    }
  }

  public static nodeToPlainText(entry: HTMLElement | null): string {
    if (entry === null) {
      return ""
    } else if (typeof entry === "string") {
      return entry
    }

    switch (entry.tagName) {
      case "#comment":
      case "IMG": return "" // Images get destroyed :(
      case "BR":
        return "\n"
      case "HR":
        return "\n\n"

      case "A": return DTextUtils.getLink(entry, false)

      default: return DTextUtils.innerText(entry)
    }
  }
}

export default DTextUtils