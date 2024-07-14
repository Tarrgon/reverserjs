export default class Media {
  id: string
  title: string
  description: string
  mediaUrls: string[]
  createdAt: Date

  constructor(id: string, title: string, description: string, mediaUrls: string[], createdAt: Date) {
    this.id = id.toString()
    this.title = title
    this.description = description
    this.mediaUrls = mediaUrls
    this.createdAt = createdAt
  }
}