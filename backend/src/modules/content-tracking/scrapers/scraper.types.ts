import { TrackedPlatform } from '../schemas/tracked-account.schema'

export interface ScrapedVideo {
  platformVideoId: string
  title: string
  description?: string
  thumbnailUrl: string
  videoUrl: string
  publishedAt?: Date
  durationSeconds?: number
  hashtags?: string[]
}

export interface ScrapedMetrics {
  platformVideoId: string
  views: number
  likes: number
  comments: number
  shares?: number
}

export interface IPlatformScraper {
  readonly platform: TrackedPlatform
  listAccountVideos(handle: string, limit?: number): Promise<ScrapedVideo[]>
  getVideoStats(platformVideoIds: string[]): Promise<ScrapedMetrics[]>
}

export class ScraperError extends Error {
  constructor(message: string, readonly platform: TrackedPlatform, readonly cause?: unknown) {
    super(message)
    this.name = 'ScraperError'
  }
}
