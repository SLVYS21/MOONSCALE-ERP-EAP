import { Injectable, Logger, BadRequestException } from '@nestjs/common'
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

const YT_DATA_API = 'https://www.googleapis.com/youtube/v3'

type YtVideoFlat = {
  id: string
  title: string
  thumbnail?: string
  thumbnails?: Array<{ url: string }>
  url?: string
  webpage_url?: string
  duration?: number
  upload_date?: string
  view_count?: number
}

type YtFlatPlaylistOutput = {
  entries?: YtVideoFlat[]
}

type YtDataApiVideo = {
  id: string
  snippet?: {
    title?: string
    description?: string
    publishedAt?: string
    thumbnails?: { high?: { url: string }; default?: { url: string } }
    tags?: string[]
  }
  contentDetails?: { duration?: string }
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string }
}

type YtDataApiResponse = { items?: YtDataApiVideo[] }

type YtCaptionFormat = { url?: string; ext?: string; name?: string }
type YtSingleVideoInfo = {
  id?: string
  title?: string
  description?: string
  subtitles?: Record<string, YtCaptionFormat[]>
  automatic_captions?: Record<string, YtCaptionFormat[]>
}

@Injectable()
export class YouTubeScraperService implements IPlatformScraper {
  readonly platform: TrackedPlatform = 'youtube'
  private readonly logger = new Logger(YouTubeScraperService.name)

  constructor(private readonly config: ConfigService) {}

  async listAccountVideos(handle: string, limit = 30): Promise<ScrapedVideo[]> {
    const channelUrl = this.buildChannelUrl(handle)
    this.logger.log(`yt-dlp listing videos for ${channelUrl}`)

    try {
      const result = (await youtubeDl(channelUrl, {
        flatPlaylist: true,
        dumpSingleJson: true,
        playlistEnd: limit,
        noWarnings: true,
        skipDownload: true,
      })) as YtFlatPlaylistOutput

      const entries = result.entries ?? []
      return entries.map((e) => {
        const url = e.webpage_url ?? e.url ?? `https://www.youtube.com/watch?v=${e.id}`
        const thumb =
          e.thumbnail ??
          e.thumbnails?.[e.thumbnails.length - 1]?.url ??
          `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`
        return {
          platformVideoId: e.id,
          title: e.title,
          thumbnailUrl: thumb,
          videoUrl: url,
          durationSeconds: e.duration ?? undefined,
          publishedAt: parseYtUploadDate(e.upload_date),
        }
      })
    } catch (err) {
      this.logger.error(`yt-dlp failed for ${channelUrl}: ${(err as Error).message}`)
      throw new ScraperError(`yt-dlp failed: ${(err as Error).message}`, this.platform, err)
    }
  }

  async getVideoStats(platformVideoIds: string[]): Promise<ScrapedMetrics[]> {
    if (platformVideoIds.length === 0) return []
    const apiKey = this.config.get<string>('YOUTUBE_API_KEY')
    if (!apiKey) throw new BadRequestException('YOUTUBE_API_KEY non configuré dans .env')

    const results: ScrapedMetrics[] = []
    for (let i = 0; i < platformVideoIds.length; i += 50) {
      const batch = platformVideoIds.slice(i, i + 50)
      try {
        const { data } = await axios.get<YtDataApiResponse>(`${YT_DATA_API}/videos`, {
          params: { part: 'statistics', id: batch.join(','), key: apiKey },
          timeout: 15_000,
        })
        for (const item of data.items ?? []) {
          results.push({
            platformVideoId: item.id,
            views: Number(item.statistics?.viewCount ?? 0),
            likes: Number(item.statistics?.likeCount ?? 0),
            comments: Number(item.statistics?.commentCount ?? 0),
          })
        }
      } catch (err) {
        this.logger.error(`YT Data API stats failed: ${(err as Error).message}`)
        throw new ScraperError(`YT Data API failed: ${(err as Error).message}`, this.platform, err)
      }
    }
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

function parseYtUploadDate(raw?: string): Date | undefined {
  if (!raw || raw.length !== 8) return undefined
  const y = Number(raw.slice(0, 4))
  const m = Number(raw.slice(4, 6)) - 1
  const d = Number(raw.slice(6, 8))
  const date = new Date(Date.UTC(y, m, d))
  return Number.isNaN(date.getTime()) ? undefined : date
}
