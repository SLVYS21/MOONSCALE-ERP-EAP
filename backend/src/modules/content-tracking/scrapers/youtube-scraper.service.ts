import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios from 'axios'
import youtubeDl from 'youtube-dl-exec'
import {
  IPlatformScraper,
  ScrapedMetrics,
  ScrapedVideo,
  ScraperError,
} from './scraper.types'
import { TrackedPlatform } from '../schemas/tracked-account.schema'

type YtVideoFlat = {
  id: string
  title: string
  description?: string
  thumbnail?: string
  thumbnails?: Array<{ url: string }>
  url?: string
  webpage_url?: string
  duration?: number
  upload_date?: string
  timestamp?: number
  view_count?: number
  like_count?: number
  comment_count?: number
}

type YtFlatPlaylistOutput = {
  entries?: YtVideoFlat[]
}

type YtSingleVideoInfo = {
  id?: string
  title?: string
  description?: string
  view_count?: number
  like_count?: number
  comment_count?: number
  subtitles?: Record<string, YtCaptionFormat[]>
  automatic_captions?: Record<string, YtCaptionFormat[]>
}

type YtCaptionFormat = { url?: string; ext?: string; name?: string }

@Injectable()
export class YouTubeScraperService implements IPlatformScraper {
  readonly platform: TrackedPlatform = 'youtube'
  private readonly logger = new Logger(YouTubeScraperService.name)

  // Cache populated by listAccountVideos (when flat-playlist happens to return stats —
  // rare on YouTube, but cheap to support). For the common case getVideoStats falls
  // back to per-video full extraction.
  private statsCache = new Map<string, ScrapedMetrics>()

  constructor(_config: ConfigService) {
    // ConfigService kept for parity. yt-dlp does not require an API key.
  }

  async listAccountVideos(handle: string, limit = 30): Promise<ScrapedVideo[]> {
    const channelUrl = this.buildChannelUrl(handle)
    this.logger.log(`yt-dlp listing YouTube videos for ${channelUrl} (limit=${limit})`)

    let result: YtFlatPlaylistOutput
    try {
      result = (await youtubeDl(channelUrl, {
        flatPlaylist: true,
        dumpSingleJson: true,
        playlistEnd: limit,
        noWarnings: true,
        skipDownload: true,
      })) as YtFlatPlaylistOutput
    } catch (err) {
      this.logger.error(`yt-dlp YouTube listing failed for ${channelUrl}: ${(err as Error).message}`)
      throw new ScraperError(`yt-dlp YouTube listing failed: ${(err as Error).message}`, this.platform, err)
    }

    const entries = result.entries ?? []
    const scraped: ScrapedVideo[] = []
    for (const e of entries) {
      if (!e.id) continue
      const url = e.webpage_url ?? e.url ?? `https://www.youtube.com/watch?v=${e.id}`
      const thumb =
        e.thumbnail ??
        e.thumbnails?.[e.thumbnails.length - 1]?.url ??
        `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`
      scraped.push({
        platformVideoId: e.id,
        title: e.title,
        description: e.description,
        thumbnailUrl: thumb,
        videoUrl: url,
        durationSeconds: e.duration,
        publishedAt: parseYtPublishedAt(e.timestamp, e.upload_date),
      })

      if (typeof e.view_count === 'number') {
        this.statsCache.set(e.id, {
          platformVideoId: e.id,
          views: e.view_count,
          likes: e.like_count ?? 0,
          comments: e.comment_count ?? 0,
        })
      }
    }
    return scraped
  }

  async getVideoStats(platformVideoIds: string[]): Promise<ScrapedMetrics[]> {
    if (platformVideoIds.length === 0) return []
    const results: ScrapedMetrics[] = []
    const missing: string[] = []

    for (const id of platformVideoIds) {
      const cached = this.statsCache.get(id)
      if (cached) results.push(cached)
      else missing.push(id)
    }

    if (missing.length === 0) return results

    // Per-video yt-dlp full extraction. ~2-5s per video on YouTube — concurrency 4
    // keeps total wall time reasonable without spawning too many Python subprocesses.
    const fetched = await runWithConcurrency(missing, 4, async (id) => {
      const url = `https://www.youtube.com/watch?v=${id}`
      try {
        const info = (await youtubeDl(url, {
          dumpSingleJson: true,
          skipDownload: true,
          noWarnings: true,
        })) as YtSingleVideoInfo
        const metrics: ScrapedMetrics = {
          platformVideoId: id,
          views: info.view_count ?? 0,
          likes: info.like_count ?? 0,
          comments: info.comment_count ?? 0,
        }
        this.statsCache.set(id, metrics)
        return metrics
      } catch (err) {
        this.logger.warn(`yt-dlp YouTube stats failed for ${id}: ${(err as Error).message}`)
        return null
      }
    })

    for (const m of fetched) if (m) results.push(m)
    return results
  }

  /**
   * Fetch the transcript for a single YouTube video.
   * Tries user-provided subtitles first (better quality), falls back to auto-generated.
   * Returns plain text (no timecodes, no VTT markup). Empty string if no captions available.
   */
  async getVideoCaptions(videoIdOrUrl: string, lang = 'fr'): Promise<string> {
    const url = videoIdOrUrl.startsWith('http')
      ? videoIdOrUrl
      : `https://www.youtube.com/watch?v=${videoIdOrUrl}`

    this.logger.log(`yt-dlp fetching captions for ${url} (lang=${lang})`)

    let info: YtSingleVideoInfo
    try {
      info = (await youtubeDl(url, {
        dumpSingleJson: true,
        skipDownload: true,
        writeAutoSub: true,
        writeSub: true,
        subLang: `${lang},${lang}-orig,en`,
        noWarnings: true,
      })) as YtSingleVideoInfo
    } catch (err) {
      this.logger.warn(`yt-dlp captions metadata failed for ${url}: ${(err as Error).message}`)
      return ''
    }

    const subtitleTrack =
      pickCaptionTrack(info.subtitles, lang) ?? pickCaptionTrack(info.automatic_captions, lang)
    if (!subtitleTrack?.url) {
      this.logger.warn(`No captions found for ${url} in ${lang}`)
      return ''
    }

    try {
      const { data } = await axios.get<string>(subtitleTrack.url, {
        timeout: 20_000,
        responseType: 'text',
      })
      return subtitleTrack.ext === 'json3' ? cleanJson3(data) : cleanVtt(data)
    } catch (err) {
      this.logger.warn(`Captions fetch failed for ${url}: ${(err as Error).message}`)
      return ''
    }
  }

  private buildChannelUrl(handle: string): string {
    const h = handle.trim().replace(/^@/, '')
    if (h.startsWith('http')) return h
    return `https://www.youtube.com/@${h}/videos`
  }
}

function pickCaptionTrack(
  tracks: Record<string, YtCaptionFormat[]> | undefined,
  lang: string,
): YtCaptionFormat | null {
  if (!tracks) return null
  const candidates = [lang, `${lang}-orig`, 'en', 'en-orig']
  for (const code of candidates) {
    const list = tracks[code]
    if (!list?.length) continue
    return list.find((f) => f.ext === 'vtt') ?? list.find((f) => f.ext === 'json3') ?? list[0]
  }
  return null
}

function cleanVtt(raw: string): string {
  const lines = raw.split(/\r?\n/)
  const out: string[] = []
  let prev = ''
  for (const line of lines) {
    if (!line.trim()) continue
    if (line.startsWith('WEBVTT')) continue
    if (line.startsWith('Kind:') || line.startsWith('Language:') || line.startsWith('NOTE')) continue
    if (/^\d+$/.test(line.trim())) continue
    if (line.includes('-->')) continue
    const clean = line.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
    if (!clean || clean === prev) continue
    out.push(clean)
    prev = clean
  }
  return out.join(' ')
}

function cleanJson3(raw: string): string {
  try {
    const data = JSON.parse(raw) as { events?: Array<{ segs?: Array<{ utf8?: string }> }> }
    const parts: string[] = []
    for (const ev of data.events ?? []) {
      for (const seg of ev.segs ?? []) {
        if (seg.utf8) parts.push(seg.utf8)
      }
    }
    return parts.join('').replace(/\s+/g, ' ').trim()
  } catch {
    return ''
  }
}

function parseYtPublishedAt(timestamp?: number, uploadDate?: string): Date | undefined {
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
