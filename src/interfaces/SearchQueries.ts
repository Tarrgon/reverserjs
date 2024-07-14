import { ObjectId } from "mongodb"

export interface SearchQuery {
  page: number,
}

export interface SubmissionSearchQuery extends SearchQuery {
  limit: number,
  status: ("notUploaded" | "alreadyUploaded" | "exactMatch" | "-exactMatch" | "largerDimensions" | "largerFileSize" | "betterFileType" | "sameFileType")[] | undefined,
  statusType: "includeDeleted" | "excludeDeleted" | undefined,
  fileSizeThresholdType: "percent" | "kb" | "mb" | undefined,
  fileSizeThreshold: number | undefined,
  fileDimensionsThresholdType: "percent" | "width" | "height" | undefined,
  fileDimensionsThreshold: number | undefined,
  contentType: "picturesOnly" | "animationOnly" | undefined,
  sites: number[] | undefined,
  inBacklog: boolean | undefined,
  hidden: "hiddenOnly" | "include" | undefined,
  deleted: "deletedOnly" | "include" | undefined,
  artistId: ObjectId | undefined,
  titleIncludes: string | undefined
  descriptionIncludes: string | undefined,
  order: "newestFirst" | "oldestFirst" | undefined
}

export interface ArtistSearchQuery extends SearchQuery {
  nameIncludes: string | undefined,
  order: "newestFirst" | "oldestFirst" | undefined
}