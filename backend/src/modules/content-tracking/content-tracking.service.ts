import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { LlmService } from '../llm/llm.service'
import { TrackedAccount, TrackedAccountDocument, TrackedPlatform, TrackedAccountType } from './schemas/tracked-account.schema'
import { TrackedVideo, TrackedVideoDocument } from './schemas/tracked-video.schema'
import { VideoMetricsSnapshot, VideoMetricsSnapshotDocument } from './schemas/video-metrics-snapshot.schema'
import { DailyReport, DailyReportDocument } from './schemas/daily-report.schema'
import { CreatorAnalysis, CreatorAnalysisDocument, AnalyzedVideoSnapshot } from './schemas/creator-analysis.schema'
import { YouTubeScraperService } from './scrapers/youtube-scraper.service'
import { TikTokScraperService } from './scrapers/tiktok-scraper.service'
import { IPlatformScraper } from './scrapers/scraper.types'

export interface CreateTrackedAccountDto {
  name: string
  platform: TrackedPlatform
  handle: string
  channel_url?: string
  type?: TrackedAccountType
}

export interface UpdateTrackedAccountDto {
  name?: string
  is_active?: boolean
  channel_url?: string
}

type ReportPayload = {
  summary: string
  improvement_ideas: string[]
  new_content_ideas: string[]
  top_videos: Array<{ platform_video_id: string; reason: string }>
  underperforming_videos: Array<{ platform_video_id: string; reason: string }>
}

const PRIMARY_PROVIDER = { provider: 'groq' as const, model: 'openai/gpt-oss-120b' }
const FALLBACK_PROVIDER = { provider: 'anthropic' as const, model: 'claude-haiku-4-5-20251001' }

@Injectable()
export class ContentTrackingService {
  private readonly logger = new Logger(ContentTrackingService.name)

  constructor(
    @InjectModel(TrackedAccount.name) private readonly accountModel: Model<TrackedAccountDocument>,
    @InjectModel(TrackedVideo.name) private readonly videoModel: Model<TrackedVideoDocument>,
    @InjectModel(VideoMetricsSnapshot.name) private readonly snapshotModel: Model<VideoMetricsSnapshotDocument>,
    @InjectModel(DailyReport.name) private readonly reportModel: Model<DailyReportDocument>,
    @InjectModel(CreatorAnalysis.name) private readonly creatorAnalysisModel: Model<CreatorAnalysisDocument>,
    private readonly youtube: YouTubeScraperService,
    private readonly tiktok: TikTokScraperService,
    private readonly llm: LlmService,
  ) {}

  // ── Accounts CRUD ─────────────────────────────────────────────────────────

  listAccounts(userId: string): Promise<TrackedAccountDocument[]> {
    return this.accountModel
      .find({ created_by: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec()
  }

  async getAccount(id: string, userId: string): Promise<TrackedAccountDocument> {
    const account = await this.accountModel.findOne({
      _id: new Types.ObjectId(id),
      created_by: new Types.ObjectId(userId),
    })
    if (!account) throw new NotFoundException('Compte trackè introuvable')
    return account
  }

  async createAccount(dto: CreateTrackedAccountDto, userId: string): Promise<TrackedAccountDocument> {
    const handle = dto.handle.trim().replace(/^@/, '')
    if (!handle) throw new BadRequestException('Handle requis')
    const channelUrl = dto.channel_url?.trim() || this.buildChannelUrl(dto.platform, handle)

    return this.accountModel.create({
      name: dto.name.trim(),
      platform: dto.platform,
      handle,
      channel_url: channelUrl,
      type: dto.type ?? 'own',
      is_active: true,
      created_by: new Types.ObjectId(userId),
    })
  }

  async updateAccount(id: string, dto: UpdateTrackedAccountDto, userId: string): Promise<TrackedAccountDocument> {
    const account = await this.accountModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), created_by: new Types.ObjectId(userId) },
      dto,
      { new: true },
    )
    if (!account) throw new NotFoundException('Compte trackè introuvable')
    return account
  }

  async deleteAccount(id: string, userId: string): Promise<void> {
    const account = await this.getAccount(id, userId)
    await this.videoModel.deleteMany({ account_id: account._id })
    await this.snapshotModel.deleteMany({ account_id: account._id })
    await this.reportModel.deleteMany({ account_id: account._id })
    await account.deleteOne()
  }

  // ── Read videos / snapshots / reports ─────────────────────────────────────

  async listAccountVideos(accountId: string, userId: string) {
    const account = await this.getAccount(accountId, userId)
    const videos = await this.videoModel
      .find({ account_id: account._id })
      .sort({ published_at: -1 })
      .lean()

    const videoIds = videos.map((v) => v._id)
    const latestSnapshots = await this.snapshotModel.aggregate<{
      _id: Types.ObjectId
      latest: VideoMetricsSnapshot
    }>([
      { $match: { video_id: { $in: videoIds } } },
      { $sort: { captured_at: -1 } },
      { $group: { _id: '$video_id', latest: { $first: '$$ROOT' } } },
    ])
    const byVideo = new Map<string, VideoMetricsSnapshot>(
      latestSnapshots.map((s) => [String(s._id), s.latest]),
    )

    return videos.map((v) => ({
      ...v,
      latest_snapshot: byVideo.get(String(v._id)) ?? null,
    }))
  }

  async getVideoWithHistory(videoId: string, userId: string) {
    const video = await this.videoModel.findById(videoId).lean()
    if (!video) throw new NotFoundException('Vidéo introuvable')
    const account = await this.getAccount(String(video.account_id), userId)
    const snapshots = await this.snapshotModel
      .find({ video_id: video._id })
      .sort({ captured_at: 1 })
      .lean()
    return { video, account, snapshots }
  }

  listReports(accountId: string, userId: string, limit = 30): Promise<DailyReportDocument[]> {
    return this.reportModel
      .find({
        account_id: new Types.ObjectId(accountId),
        created_by: new Types.ObjectId(userId),
      })
      .sort({ report_date: -1 })
      .limit(limit)
      .exec()
  }

  // ── Scrape orchestration ──────────────────────────────────────────────────

  async scrapeAccount(accountId: string, userId?: string): Promise<{ videos_added: number; snapshots_added: number }> {
    const account = userId
      ? await this.getAccount(accountId, userId)
      : await this.accountModel.findById(accountId)
    if (!account) throw new NotFoundException('Compte trackè introuvable')

    const scraper = this.scraperFor(account.platform)
    let videosAdded = 0
    let snapshotsAdded = 0

    try {
      const scrapedVideos = await scraper.listAccountVideos(account.handle)

      for (const sv of scrapedVideos) {
        const upserted = await this.videoModel.findOneAndUpdate(
          { account_id: account._id, platform_video_id: sv.platformVideoId },
          {
            $setOnInsert: {
              account_id: account._id,
              platform_video_id: sv.platformVideoId,
              first_seen_at: new Date(),
              video_url: sv.videoUrl,
              published_at: sv.publishedAt ?? null,
            },
            $set: {
              title: sv.title,
              description: sv.description ?? '',
              thumbnail_url: sv.thumbnailUrl,
              duration_seconds: sv.durationSeconds ?? null,
              hashtags: sv.hashtags ?? [],
            },
          },
          { upsert: true, new: true, rawResult: true },
        ) as unknown as { value: TrackedVideoDocument; lastErrorObject?: { updatedExisting?: boolean } }

        if (upserted.lastErrorObject?.updatedExisting === false) videosAdded++
      }

      const allVideos = await this.videoModel
        .find({ account_id: account._id })
        .select('_id platform_video_id video_url')
        .lean()
      // TikTok needs the canonical video URL to refresh stats of older videos
      // that have fallen past the last-30 window served by /tiktok/users/videos.
      if (account.platform === 'tiktok') {
        this.tiktok.primeUrlCache(
          allVideos.map((v) => ({ platform_video_id: v.platform_video_id, video_url: v.video_url })),
        )
      }
      const ids = allVideos.map((v) => v.platform_video_id)
      const stats = await scraper.getVideoStats(ids)

      const today = todayString()
      for (const stat of stats) {
        const video = allVideos.find((v) => v.platform_video_id === stat.platformVideoId)
        if (!video) continue
        const engagementRate = stat.views > 0
          ? Math.round(((stat.likes + stat.comments + (stat.shares ?? 0)) / stat.views) * 10_000) / 100
          : 0
        try {
          await this.snapshotModel.create({
            video_id: video._id,
            account_id: account._id,
            captured_at: new Date(),
            captured_date: today,
            views: stat.views,
            likes: stat.likes,
            comments: stat.comments,
            shares: stat.shares ?? 0,
            engagement_rate: engagementRate,
          })
          snapshotsAdded++
        } catch (err) {
          if ((err as { code?: number }).code !== 11000) throw err
          // unique violation (already a snapshot today) → skip silently
        }
      }

      account.last_scraped_at = new Date()
      account.last_scrape_error = null
      await account.save()
    } catch (err) {
      account.last_scrape_error = (err as Error).message
      await account.save()
      throw err
    }

    return { videos_added: videosAdded, snapshots_added: snapshotsAdded }
  }

  // ── Report generation (LLM) ───────────────────────────────────────────────

  async generateDailyReport(accountId: string, userId?: string): Promise<DailyReportDocument> {
    const account = userId
      ? await this.getAccount(accountId, userId)
      : await this.accountModel.findById(accountId)
    if (!account) throw new NotFoundException('Compte trackè introuvable')

    const today = todayString()
    const yesterday = dateString(daysAgo(1))
    const sevenDaysAgo = daysAgo(7)

    const videos = await this.videoModel.find({ account_id: account._id }).lean()
    if (videos.length === 0) {
      throw new BadRequestException('Aucune vidéo trackée pour ce compte. Lance un scrape d\'abord.')
    }
    const videoIds = videos.map((v) => v._id)

    const snapshots = await this.snapshotModel
      .find({ video_id: { $in: videoIds }, captured_at: { $gte: sevenDaysAgo } })
      .sort({ captured_at: 1 })
      .lean()

    const byVideo = new Map<string, { latest?: VideoMetricsSnapshot; previous?: VideoMetricsSnapshot }>()
    for (const snap of snapshots) {
      const key = String(snap.video_id)
      const entry = byVideo.get(key) ?? {}
      if (snap.captured_date === today) entry.latest = snap
      else if (snap.captured_date === yesterday) entry.previous = snap
      else if (!entry.previous) entry.previous = snap
      byVideo.set(key, entry)
    }

    const perVideoSummary = videos.map((v) => {
      const e = byVideo.get(String(v._id)) ?? {}
      const todayViews = e.latest?.views ?? 0
      const yesterdayViews = e.previous?.views ?? 0
      const delta = todayViews - yesterdayViews
      return {
        platform_video_id: v.platform_video_id,
        title: v.title,
        published_at: v.published_at?.toISOString().slice(0, 10) ?? 'N/A',
        views_today: todayViews,
        views_yesterday: yesterdayViews,
        views_delta: delta,
        likes_today: e.latest?.likes ?? 0,
        comments_today: e.latest?.comments ?? 0,
        engagement_rate: e.latest?.engagement_rate ?? 0,
      }
    })

    const totalsToday = perVideoSummary.reduce((acc, v) => acc + v.views_today, 0)
    const totalsYesterday = perVideoSummary.reduce((acc, v) => acc + v.views_yesterday, 0)

    const userPrompt = buildReportPrompt(account, perVideoSummary, totalsToday, totalsYesterday)
    const systemPrompt =
      'Tu es un analyste expert en performance de contenu social pour le e-commerce africain. Tu réponds UNIQUEMENT en JSON valide (aucun markdown, aucun texte avant/après).'

    const result = await this.llm.generate(
      PRIMARY_PROVIDER,
      {
        messages: [{ role: 'user', content: userPrompt }],
        systemPrompt,
        temperature: 0.5,
        maxTokens: 2048,
      },
      FALLBACK_PROVIDER,
    )

    let data: ReportPayload
    try {
      data = JSON.parse(stripJsonFence(result.text)) as ReportPayload
    } catch {
      throw new BadRequestException(`LLM ${result.provider} a renvoyé un JSON invalide. Réessaie.`)
    }

    const idByPlatformId = new Map(videos.map((v) => [v.platform_video_id, v._id]))
    const mapHighlight = (h: { platform_video_id: string; reason: string }) => {
      const id = idByPlatformId.get(h.platform_video_id)
      const video = videos.find((v) => v.platform_video_id === h.platform_video_id)
      const e = video ? byVideo.get(String(video._id)) : undefined
      return {
        video_id: id,
        title: video?.title ?? h.platform_video_id,
        reason: h.reason,
        views_delta: e ? (e.latest?.views ?? 0) - (e.previous?.views ?? 0) : 0,
      }
    }

    const existing = await this.reportModel.findOne({ account_id: account._id, report_date: today })
    const payload = {
      account_id: account._id,
      created_by: account.created_by,
      report_date: today,
      summary: data.summary ?? '',
      top_videos: (data.top_videos ?? []).map(mapHighlight),
      underperforming_videos: (data.underperforming_videos ?? []).map(mapHighlight),
      improvement_ideas: data.improvement_ideas ?? [],
      new_content_ideas: data.new_content_ideas ?? [],
      total_views_today: totalsToday,
      total_views_yesterday: totalsYesterday,
      total_views_delta: totalsToday - totalsYesterday,
      llm_provider: result.provider,
      llm_model: result.model,
      llm_cost_usd: result.costUsd,
    }

    if (existing) {
      Object.assign(existing, payload)
      return existing.save()
    }
    return this.reportModel.create(payload)
  }

  // ── On-demand creator analysis ────────────────────────────────────────────

  async analyzeCreator(
    userId: string,
    platform: TrackedPlatform,
    handle: string,
    options: { withTranscripts?: boolean; videoLimit?: number } = {},
  ): Promise<CreatorAnalysisDocument> {
    const scraper = this.scraperFor(platform)
    const cleanHandle = handle.trim().replace(/^@/, '')
    const videoLimit = options.videoLimit ?? 15

    const scrapedVideos = await scraper.listAccountVideos(cleanHandle, videoLimit)
    const ids = scrapedVideos.map((v) => v.platformVideoId)
    const stats = await scraper.getVideoStats(ids).catch((err) => {
      this.logger.warn(`Stats fetch failed during creator analysis: ${(err as Error).message}`)
      return []
    })
    const statsById = new Map(stats.map((s) => [s.platformVideoId, s]))

    const videos: AnalyzedVideoSnapshot[] = scrapedVideos.map((v) => {
      const s = statsById.get(v.platformVideoId)
      return {
        platform_video_id: v.platformVideoId,
        title: v.title,
        url: v.videoUrl,
        thumbnail_url: v.thumbnailUrl,
        published_at: v.publishedAt ?? null,
        views: s?.views ?? 0,
        likes: s?.likes ?? 0,
        comments: s?.comments ?? 0,
        caption: v.description ?? v.title,
        hashtags: v.hashtags ?? [],
      }
    })

    // Sort top 5 by views for the prompt context
    const topVideos = [...videos].sort((a, b) => b.views - a.views).slice(0, 5)
    const recentVideos = videos.slice(0, 10)

    const userPrompt = buildCreatorAnalysisPrompt(platform, cleanHandle, topVideos, recentVideos)
    const systemPrompt =
      "Tu es un analyste de contenu social pour le e-commerce africain. Tu identifies des patterns actionnables. Tu réponds UNIQUEMENT en JSON valide (aucun markdown)."

    const result = await this.llm.generate(
      PRIMARY_PROVIDER,
      {
        messages: [{ role: 'user', content: userPrompt }],
        systemPrompt,
        temperature: 0.5,
        maxTokens: 2048,
      },
      FALLBACK_PROVIDER,
    )

    type CreatorInsights = {
      summary: string
      recurring_hooks: string[]
      recurring_formats: string[]
      recurring_hashtags: string[]
      tone: string
      angle: string
      what_works_for_them: string[]
      gaps_to_exploit: string[]
      idea_seeds: string[]
    }
    let insights: CreatorInsights
    try {
      insights = JSON.parse(stripJsonFence(result.text)) as CreatorInsights
    } catch {
      throw new BadRequestException(`LLM ${result.provider} a renvoyé un JSON invalide. Réessaie.`)
    }

    return this.creatorAnalysisModel.create({
      handle: cleanHandle,
      platform,
      display_name: cleanHandle,
      channel_url: this.buildChannelUrl(platform, cleanHandle),
      bio: '',
      videos,
      summary: insights.summary ?? '',
      recurring_hooks: insights.recurring_hooks ?? [],
      recurring_formats: insights.recurring_formats ?? [],
      recurring_hashtags: insights.recurring_hashtags ?? [],
      tone: insights.tone ?? '',
      angle: insights.angle ?? '',
      what_works_for_them: insights.what_works_for_them ?? [],
      gaps_to_exploit: insights.gaps_to_exploit ?? [],
      idea_seeds: insights.idea_seeds ?? [],
      llm_provider: result.provider,
      llm_model: result.model,
      llm_cost_usd: result.costUsd,
      created_by: new Types.ObjectId(userId),
    })
  }

  listCreatorAnalyses(userId: string, limit = 30): Promise<CreatorAnalysisDocument[]> {
    return this.creatorAnalysisModel
      .find({ created_by: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec()
  }

  async getCreatorAnalysis(id: string, userId: string): Promise<CreatorAnalysisDocument> {
    const doc = await this.creatorAnalysisModel.findOne({
      _id: new Types.ObjectId(id),
      created_by: new Types.ObjectId(userId),
    })
    if (!doc) throw new NotFoundException('Analyse introuvable')
    return doc
  }

  // ── Captions exposed for other modules (project pipeline analyze-references) ──

  async fetchYouTubeCaptions(videoIdOrUrl: string, lang = 'fr'): Promise<string> {
    return this.youtube.getVideoCaptions(videoIdOrUrl, lang)
  }

  // ── Best-performing videos for "suggest publish time" ─────────────────────

  async getOwnAccountsBestVideos(userId: string, limit = 20) {
    const ownAccounts = await this.accountModel
      .find({ created_by: new Types.ObjectId(userId), type: 'own', is_active: true })
      .select('_id platform')
      .lean()
    if (ownAccounts.length === 0) return []

    const accountIds = ownAccounts.map((a) => a._id)
    const videos = await this.videoModel
      .find({ account_id: { $in: accountIds } })
      .select('_id account_id platform_video_id title published_at')
      .lean()
    const videoIds = videos.map((v) => v._id)

    const snapshots = await this.snapshotModel.aggregate<{
      _id: Types.ObjectId
      latest: VideoMetricsSnapshot
    }>([
      { $match: { video_id: { $in: videoIds } } },
      { $sort: { captured_at: -1 } },
      { $group: { _id: '$video_id', latest: { $first: '$$ROOT' } } },
    ])
    const viewsByVideo = new Map(snapshots.map((s) => [String(s._id), s.latest.views ?? 0]))

    const accountPlatformById = new Map(ownAccounts.map((a) => [String(a._id), a.platform]))
    return videos
      .map((v) => ({
        title: v.title,
        published_at: v.published_at,
        platform: accountPlatformById.get(String(v.account_id)) ?? 'youtube',
        views: viewsByVideo.get(String(v._id)) ?? 0,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, limit)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private scraperFor(platform: TrackedPlatform): IPlatformScraper {
    if (platform === 'youtube') return this.youtube
    if (platform === 'tiktok') return this.tiktok
    throw new BadRequestException(`Plateforme ${platform} non supportée pour le moment.`)
  }

  private buildChannelUrl(platform: TrackedPlatform, handle: string): string {
    if (platform === 'youtube') return `https://www.youtube.com/@${handle}`
    if (platform === 'tiktok') return `https://www.tiktok.com/@${handle}`
    return `https://www.facebook.com/${handle}`
  }

  /**
   * Returns only OWN accounts for the daily scrape cron.
   * Competitor accounts are analyzed on-demand via analyzeCreator(), not tracked daily.
   */
  async listActiveAccounts(): Promise<TrackedAccountDocument[]> {
    return this.accountModel.find({ is_active: true, type: 'own' })
  }
}

// ── Standalone helpers ────────────────────────────────────────────────────

function todayString(): string {
  return dateString(new Date())
}

function dateString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('```')) return trimmed
  return trimmed.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
}

function buildReportPrompt(
  account: TrackedAccountDocument,
  videos: Array<{
    platform_video_id: string
    title: string
    published_at: string
    views_today: number
    views_yesterday: number
    views_delta: number
    likes_today: number
    comments_today: number
    engagement_rate: number
  }>,
  totalsToday: number,
  totalsYesterday: number,
): string {
  const videoLines = videos
    .slice(0, 30)
    .map(
      (v, i) =>
        `${i + 1}. [${v.platform_video_id}] "${v.title}" — publié ${v.published_at} | vues aujourd'hui: ${v.views_today} (delta +${v.views_delta}) | likes: ${v.likes_today} | commentaires: ${v.comments_today} | engagement: ${v.engagement_rate}%`,
    )
    .join('\n')

  return `Analyse les performances du compte ${account.platform.toUpperCase()} "${account.name}" (@${account.handle}) pour la journée.

CONTEXTE :
- Niche : e-commerce, infopreneuriat, marché africain francophone
- Type de compte : ${account.type === 'own' ? 'NOTRE compte' : 'compte concurrent'}
- Vues totales aujourd'hui (somme des vidéos trackées) : ${totalsToday}
- Vues totales hier : ${totalsYesterday}
- Delta : ${totalsToday - totalsYesterday}

VIDÉOS TRACKÉES (${videos.length}) :
${videoLines}

Rends-moi une analyse complète et actionnable, en JSON strict :
{
  "summary": "2-3 paragraphes markdown : état général aujourd'hui, ce qui marche, ce qui inquiète, tendance globale",
  "top_videos": [
    { "platform_video_id": "...", "reason": "Pourquoi cette vidéo performe — angle, format, hook" }
  ],
  "underperforming_videos": [
    { "platform_video_id": "...", "reason": "Pourquoi elle sous-performe — hypothèse claire" }
  ],
  "improvement_ideas": [
    "3 à 5 idées concrètes pour optimiser les vidéos existantes (titre, miniature, description, hashtags, CTA...)"
  ],
  "new_content_ideas": [
    "3 à 5 nouvelles idées de vidéos à produire, inspirées de ce qui marche, alignées niche e-commerce Afrique"
  ]
}

Sois précis, chiffré, et orienté action. Pas de banalités.`
}

function buildCreatorAnalysisPrompt(
  platform: TrackedPlatform,
  handle: string,
  topVideos: AnalyzedVideoSnapshot[],
  recentVideos: AnalyzedVideoSnapshot[],
): string {
  const fmtVideo = (v: AnalyzedVideoSnapshot, i: number) =>
    `${i + 1}. "${v.title}" — vues: ${v.views.toLocaleString('fr-FR')} | likes: ${v.likes} | commentaires: ${v.comments}${v.hashtags.length ? ` | hashtags: ${v.hashtags.slice(0, 6).join(', ')}` : ''}\n   Caption/desc: ${(v.caption || '').slice(0, 240)}`

  return `Analyse le créateur ${platform.toUpperCase()} @${handle}.

TOP 5 VIDÉOS PAR VUES :
${topVideos.map(fmtVideo).join('\n\n')}

DERNIÈRES VIDÉOS (chronologique) :
${recentVideos.slice(0, 10).map(fmtVideo).join('\n\n')}

Identifie les patterns récurrents et rends-moi une analyse actionnable pour un créateur e-commerce africain francophone qui veut s'en inspirer (PAS copier).

JSON strict :
{
  "summary": "2 paragraphes : qui est ce créateur, son positionnement, pourquoi il marche",
  "recurring_hooks": ["3-5 types d'accroches qu'il réutilise — formules concrètes"],
  "recurring_formats": ["2-4 formats récurrents — talking head face cam, voiceover B-roll, etc."],
  "recurring_hashtags": ["hashtags qu'il réutilise systématiquement"],
  "tone": "1 phrase : ton et style (pédagogique direct, énergique, calme et premium, etc.)",
  "angle": "1-2 phrases : l'angle unique qui le différencie",
  "what_works_for_them": ["3-5 raisons concrètes du succès des top vidéos"],
  "gaps_to_exploit": ["3-5 sujets/angles qu'il ne couvre PAS et que NOUS pourrions exploiter"],
  "idea_seeds": ["5 idées de vidéos inspirées de son style mais adaptées au marché africain"]
}

Sois concret. Pas de blabla générique.`
}
