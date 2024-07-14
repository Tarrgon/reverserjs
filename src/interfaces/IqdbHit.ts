export type WithHumanReadableSize<T> = T & { humanReadableSize: string }

interface IqdbHit {
  id: number
  sourceUrl: string
  directLink: string | null
  score: number
  md5: string
  fileSize: number
  width: number
  height: number
  fileType: string
}

export default IqdbHit
