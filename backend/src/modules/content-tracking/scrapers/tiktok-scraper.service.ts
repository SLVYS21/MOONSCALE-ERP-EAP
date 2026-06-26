import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'
import {
  IPlatformScraper,
  ScrapedMetrics,
  ScrapedVideo,
  ScraperError,
} from './scraper.types'
import { TrackedPlatform } from '../schemas/tracked-account.schema'

// Shape returned by https://tiktok-scraper.omkar.cloud (cf. doc API)
type OmkarVideo = {
  video_id: string
  region?: string
  caption?: string
  created_at?: number // unix seconds
  duration_seconds?: number
  author?: {
    user_id?: string
    handle?: string
    display_name?: string
    avatar_url?: string
  }
  media?: {
    video_url?: string
    watermarked_video_url?: string
    hd_video_url?: string
  }
  thumbnails?: {
    cover_url?: string
    animated_cover_url?: string
    original_cover_url?: string
  }
  stats?: {
    views?: number
    likes?: number
    comments?: number
    shares?: number
    downloads?: number
    saves?: number
  }
  is_advertisement?: boolean
  is_pinned?: boolean
}

type OmkarUserVideosResponse = { videos: OmkarVideo[]; next_page_cursor?: number | string | null }
type OmkarVideoDetailsResponse = OmkarVideo

@Injectable()
export class TikTokScraperService implements IPlatformScraper {
  readonly platform: TrackedPlatform = 'tiktok'
  private readonly logger = new Logger(TikTokScraperService.name)
  private client: AxiosInstance | null = null
  private callCount = 0

  // Cache populated by listAccountVideos so getVideoStats can read fresh stats
  // without making a second omkar call per video.
  // Keyed by platform_video_id.
  private statsCache = new Map<string, ScrapedMetrics>()
  // Keyed by platform_video_id → canonical TikTok URL (needed by /videos/details fallback)
  private urlCache = new Map<string, string>()

  constructor(private readonly config: ConfigService) {}

  private getClient(): AxiosInstance {
    if (this.client) return this.client
    const apiKey = this.config.get<string>('TIKTOK_SCRAPER_API_KEY')
    if (!apiKey) {
      throw new BadRequestException('TIKTOK_SCRAPER_API_KEY non configuré dans .env')
    }
    const baseURL =
      this.config.get<string>('TIKTOK_SCRAPER_BASE_URL') ?? 'https://tiktok-scraper.omkar.cloud'

    this.client = axios.create({
      baseURL,
      headers: { 'API-Key': apiKey, Accept: 'application/json' },
      timeout: 30_000,
    })
    this.client.interceptors.request.use((req) => {
      this.callCount++
      this.logger.log(`TikTok scraper call #${this.callCount}: ${req.method?.toUpperCase()} ${req.url}`)
      return req
    })
    return this.client
  }

  async listAccountVideos(handle: string, limit = 30): Promise<ScrapedVideo[]> {
    const h = handle.trim().replace(/^@/, '')
    const max = Math.min(Math.max(limit, 1), 30) // omkar caps at 30
    try {
      const client = this.getClient()
      const { data } = await client.get<OmkarUserVideosResponse>('/tiktok/users/videos', {
        params: { handle: h, max_results: max },
      })
      const items = Array.isArray(data?.videos) ? data.videos : []
      const scraped: ScrapedVideo[] = []
      for (const v of items) {
        if (!v.video_id) continue
        const sv = mapToScrapedVideo(v, h)
        scraped.push(sv)
        // populate caches so subsequent getVideoStats() is free
        this.statsCache.set(v.video_id, extractMetrics(v.video_id, v))
        this.urlCache.set(v.video_id, sv.videoUrl)
      }
      return scraped
    } catch (err) {
      const msg = formatAxiosError(err)
      this.logger.error(`TikTok listAccountVideos(${h}) failed: ${msg}`)
      throw new ScraperError(`TikTok listAccountVideos failed: ${msg}`, this.platform, err)
    }
  }

  async getVideoStats(platformVideoIds: string[]): Promise<ScrapedMetrics[]> {
    if (platformVideoIds.length === 0) return []
    const results: ScrapedMetrics[] = []
    const missing: string[] = []

    // Fast path: use the cache populated by listAccountVideos
    for (const id of platformVideoIds) {
      const cached = this.statsCache.get(id)
      if (cached) results.push(cached)
      else missing.push(id)
    }

    // Slow path: per-video details call for ids absent from the latest listing
    // (e.g. older videos that have fallen past the 30-item window).
    // Skip if we don't have a known URL — omkar /videos/details requires a video_url.
    if (missing.length > 0) {
      const client = this.getClient()
      for (const id of missing) {
        const url = this.urlCache.get(id)
        if (!url) {
          this.logger.warn(`TikTok getVideoStats: no URL cached for ${id}, skipping`)
          continue
        }
        try {
          const { data } = await client.get<OmkarVideoDetailsResponse>('/tiktok/videos/details', {
            params: { video_url: url },
          })
          if (!data) continue
          const metrics = extractMetrics(id, data)
          results.push(metrics)
          this.statsCache.set(id, metrics)
        } catch (err) {
          this.logger.warn(`TikTok getVideoStats(${id}) failed: ${formatAxiosError(err)}`)
        }
      }
    }

    return results
  }

  /**
   * Allow callers (e.g. content-tracking.service.scrapeAccount) to seed the URL
   * cache from DB-stored video URLs so older videos can be refreshed via /videos/details.
   */
  primeUrlCache(entries: Array<{ platform_video_id: string; video_url: string }>) {
    for (const e of entries) {
      if (e.platform_video_id && e.video_url) this.urlCache.set(e.platform_video_id, e.video_url)
    }
  }
}

function mapToScrapedVideo(v: OmkarVideo, accountHandle: string): ScrapedVideo {
  const id = v.video_id
  const authorHandle = v.author?.handle?.trim() || accountHandle
  const canonicalUrl = `https://www.tiktok.com/@${authorHandle}/video/${id}`
  const thumb = v.thumbnails?.cover_url ?? v.thumbnails?.original_cover_url ?? ''
  const publishedAt = v.created_at ? new Date(v.created_at * 1000) : undefined
  const caption = v.caption ?? ''
  return {
    platformVideoId: id,
    title: caption.split('\n')[0]?.slice(0, 120) || '(sans titre)',
    description: caption,
    thumbnailUrl: thumb,
    videoUrl: canonicalUrl,
    durationSeconds: v.duration_seconds,
    publishedAt,
    hashtags: extractHashtags(caption),
  }
}

function extractMetrics(platformVideoId: string, v: OmkarVideo): ScrapedMetrics {
  const s = v.stats ?? {}
  return {
    platformVideoId,
    views: s.views ?? 0,
    likes: s.likes ?? 0,
    comments: s.comments ?? 0,
    shares: s.shares ?? 0,
  }
}

function extractHashtags(text: string): string[] {
  const tags = text.match(/#[\wÀ-ſ]+/g) ?? []
  return tags.map((t) => t.slice(1).toLowerCase())
}

function formatAxiosError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status
    const body = err.response?.data
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body ?? {}).slice(0, 200)
    return `HTTP ${status ?? '?'} — ${bodyStr || err.message}`
  }
  return (err as Error).message ?? 'erreur inconnue'
}
