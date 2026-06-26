import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import youtubeDl from 'youtube-dl-exec'
import {
  IPlatformScraper,
  ScrapedMetrics,
  ScrapedVideo,
  ScraperError,
} from './scraper.types'
import { TrackedPlatform } from '../schemas/tracked-account.schema'

// Shape of yt-dlp output for a TikTok user page (flat-playlist mode).
// TikTok is unusual: even in flat-playlist mode, yt-dlp returns full stats
// (view_count, like_count, comment_count, repost_count) per entry. So a single
// listAccountVideos() call already gives us everything getVideoStats() needs.
type TikTokFlatEntry = {
  id: string
  title?: string
  description?: string
  url?: string
  webpage_url?: string
  uploader?: string
  uploader_id?: string
  channel?: string
  channel_id?: string
  thumbnail?: string
  thumbnails?: Array<{ url: string }>
  duration?: number
  timestamp?: number
  upload_date?: string
  view_count?: number
  like_count?: number
  comment_count?: number
  repost_count?: number
}

type TikTokFlatPlaylistOutput = {
  entries?: TikTokFlatEntry[]
  uploader?: string
  uploader_id?: string
}

// Shape of yt-dlp output for a single TikTok video (full extraction)
type TikTokSingleVideoInfo = {
  id?: string
  title?: string
  description?: string
  thumbnail?: string
  thumbnails?: Array<{ url: string }>
  duration?: number
  timestamp?: number
  upload_date?: string
  uploader?: string
  uploader_id?: string
  webpage_url?: string
  view_count?: number
  like_count?: number
  comment_count?: number
  repost_count?: number
  tags?: string[]
  hashtags?: string[]
}

@Injectable()
export class TikTokScraperService implements IPlatformScraper {
  readonly platform: TrackedPlatform = 'tiktok'
  private readonly logger = new Logger(TikTokScraperService.name)

  // Caches populated during listAccountVideos so getVideoStats avoids a 2nd round-trip
  // (yt-dlp can be slow — extracting one video takes 1.5-3s).
  private statsCache = new Map<string, ScrapedMetrics>()
  private urlCache = new Map<string, string>()

  constructor(_config: ConfigService) {
    // ConfigService is kept for parity with other scrapers (no env needed for yt-dlp).
  }

  async listAccountVideos(handle: string, limit = 30): Promise<ScrapedVideo[]> {
    const h = handle.trim().replace(/^@/, '')
    const channelUrl = `https://www.tiktok.com/@${h}`
    this.logger.log(`yt-dlp listing TikTok videos for ${channelUrl} (limit=${limit})`)

    let result: TikTokFlatPlaylistOutput
    try {
      result = (await youtubeDl(channelUrl, {
        flatPlaylist: true,
        dumpSingleJson: true,
        playlistEnd: limit,
        noWarnings: true,
        skipDownload: true,
      })) as TikTokFlatPlaylistOutput
    } catch (err) {
      this.logger.error(`yt-dlp TikTok listing failed for ${channelUrl}: ${(err as Error).message}`)
      throw new ScraperError(`yt-dlp TikTok listing failed: ${(err as Error).message}`, this.platform, err)
    }

    const entries = result.entries ?? []
    const scraped: ScrapedVideo[] = []

    for (const e of entries) {
      if (!e.id) continue
      const entryHandle = e.uploader_id ?? e.channel_id ?? h
      const url = e.webpage_url ?? e.url ?? `https://www.tiktok.com/@${entryHandle}/video/${e.id}`
      const thumb = e.thumbnail ?? e.thumbnails?.[e.thumbnails.length - 1]?.url ?? ''
      const publishedAt = parseTikTokDate(e.timestamp, e.upload_date)
      const caption = e.description ?? e.title ?? ''
      scraped.push({
        platformVideoId: e.id,
        title: (e.title || caption.split('\n')[0] || '(sans titre)').slice(0, 120),
        description: caption,
        thumbnailUrl: thumb,
        videoUrl: url,
        durationSeconds: e.duration,
        publishedAt,
        hashtags: extractHashtags(caption),
      })

      this.urlCache.set(e.id, url)
      if (typeof e.view_count === 'number') {
        this.statsCache.set(e.id, {
          platformVideoId: e.id,
          views: e.view_count,
          likes: e.like_count ?? 0,
          comments: e.comment_count ?? 0,
          shares: e.repost_count ?? 0,
        })
      }
    }

    return scraped
  }

  async getVideoStats(platformVideoIds: string[]): Promise<ScrapedMetrics[]> {
    if (platformVideoIds.length === 0) return []
    const results: ScrapedMetrics[] = []
    const missing: string[] = []

    // Fast path: cache hits from the last list call
    for (const id of platformVideoIds) {
      const cached = this.statsCache.get(id)
      if (cached) results.push(cached)
      else missing.push(id)
    }

    if (missing.length === 0) return results

    // Slow path: per-video full extraction. Run with concurrency 4 to stay reasonable
    // (yt-dlp spawns a Python subprocess each call).
    const fetched = await runWithConcurrency(missing, 4, async (id) => {
      const url = this.urlCache.get(id)
      if (!url) {
        this.logger.warn(`TikTok getVideoStats: no URL cached for ${id}, skipping`)
        return null
      }
      try {
        const info = (await youtubeDl(url, {
          dumpSingleJson: true,
          skipDownload: true,
          noWarnings: true,
        })) as TikTokSingleVideoInfo
        const metrics: ScrapedMetrics = {
          platformVideoId: id,
          views: info.view_count ?? 0,
          likes: info.like_count ?? 0,
          comments: info.comment_count ?? 0,
          shares: info.repost_count ?? 0,
        }
        this.statsCache.set(id, metrics)
        return metrics
      } catch (err) {
        this.logger.warn(`yt-dlp TikTok stats failed for ${id}: ${(err as Error).message}`)
        return null
      }
    })

    for (const m of fetched) if (m) results.push(m)
    return results
  }

  /**
   * Seed the URL cache from DB-stored video URLs so getVideoStats can refresh
   * old videos that have fallen past the latest-N listing window.
   */
  primeUrlCache(entries: Array<{ platform_video_id: string; video_url: string }>) {
    for (const e of entries) {
      if (e.platform_video_id && e.video_url) this.urlCache.set(e.platform_video_id, e.video_url)
    }
  }
}

function parseTikTokDate(timestamp?: number, uploadDate?: string): Date | undefined {
  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    return new Date(timestamp * 1000)
  }
  if (uploadDate && uploadDate.length === 8) {
    const y = Number(uploadDate.slice(0, 4))
    const m = Number(uploadDate.slice(4, 6)) - 1
    const d = Number(uploadDate.slice(6, 8))
    const date = new Date(Date.UTC(y, m, d))
    return Number.isNaN(date.getTime()) ? undefined : date
  }
  return undefined
}

function extractHashtags(text: string): string[] {
  const tags = text.match(/#[\wÀ-ſ]+/g) ?? []
  return tags.map((t) => t.slice(1).toLowerCase())
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workerCount = Math.min(Math.max(concurrency, 1), items.length)
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) return
      results[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return results
}
