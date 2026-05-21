import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Cron } from '@nestjs/schedule'
import axios from 'axios'
import { VideoStat, VideoStatDocument } from './schemas/video-stat.schema'
import { MetaAdsStat, MetaAdsStatDocument } from './schemas/meta-ads-stat.schema'
import { YouTubeConfig, YouTubeConfigDocument } from './schemas/youtube-config.schema'
import { Lead, LeadDocument } from '../leads/schemas/lead.schema'

// ── TikTok CSV Parser ─────────────────────────────────────────────────────────

function parseTikTokCsv(content: string): Array<{ video_id: string; title: string; date: Date; views: number; likes: number; comments: number; shares: number; published_at: Date | null }> {
  const cleaned = content.replace(/^﻿/, '').trim()
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim())

  const parseRow = (line: string): string[] => {
    const fields: string[] = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"' && !inQ) { inQ = true; continue }
      if (ch === '"' && inQ) {
        if (line[i + 1] === '"') { cur += '"'; i++ } else { inQ = false }
        continue
      }
      if ((ch === ',' || ch === ';' || ch === '\t') && !inQ) { fields.push(cur.trim()); cur = ''; continue }
      cur += ch
    }
    fields.push(cur.trim())
    return fields
  }

  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

  // Find the header row (first row with "views" or "vues" column)
  let headerIdx = -1
  let headers: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const row = parseRow(lines[i]).map(normalize)
    if (row.some((h) => h.includes('view') || h.includes('vue') || h.includes('play'))) {
      headerIdx = i
      headers = row
      break
    }
  }

  if (headerIdx === -1) return []

  const findIdx = (aliases: string[]) => {
    for (const a of aliases) {
      const idx = headers.findIndex((h) => h.includes(a))
      if (idx !== -1) return idx
    }
    return -1
  }

  const titleIdx   = findIdx(['title', 'video', 'titre', 'name'])
  const dateIdx    = findIdx(['publish', 'date published', 'date de publication', 'date publi'])
  const viewsIdx   = findIdx(['view', 'vue', 'play', 'lecture'])
  const likesIdx   = findIdx(['like', 'j\'aime'])
  const commIdx    = findIdx(['comment'])
  const sharesIdx  = findIdx(['share', 'partage'])

  const results = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const row = parseRow(lines[i])
    if (!row.length || row.every((c) => !c)) continue

    const title = titleIdx >= 0 ? (row[titleIdx] ?? '').replace(/^["']|["']$/g, '').trim() : `Vidéo ${i}`
    const dateStr = dateIdx >= 0 ? row[dateIdx]?.trim() : ''
    const publishedAt = dateStr ? new Date(dateStr) : null

    results.push({
      video_id: `tiktok_${title.slice(0, 30).replace(/\W+/g, '_')}_${i}`,
      title,
      date: new Date(),
      views:    viewsIdx  >= 0 ? Number(row[viewsIdx]?.replace(/[^0-9]/g, '') || 0) : 0,
      likes:    likesIdx  >= 0 ? Number(row[likesIdx]?.replace(/[^0-9]/g, '') || 0) : 0,
      comments: commIdx   >= 0 ? Number(row[commIdx]?.replace(/[^0-9]/g, '')  || 0) : 0,
      shares:   sharesIdx >= 0 ? Number(row[sharesIdx]?.replace(/[^0-9]/g, '')|| 0) : 0,
      published_at: publishedAt,
    })
  }
  return results
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name)

  constructor(
    @InjectModel(VideoStat.name) private videoStatModel: Model<VideoStatDocument>,
    @InjectModel(MetaAdsStat.name) private metaAdsModel: Model<MetaAdsStatDocument>,
    @InjectModel(YouTubeConfig.name) private ytConfigModel: Model<YouTubeConfigDocument>,
    @InjectModel(Lead.name) private leadModel: Model<LeadDocument>,
  ) {}

  // ── TikTok CSV import ─────────────────────────────────────────────────────

  async importTikTokCsv(buffer: Buffer, importDate?: string): Promise<{ upserted: number; errors: number }> {
    const rows = parseTikTokCsv(buffer.toString('utf8'))
    const snapshotDate = importDate ? new Date(importDate) : new Date()
    snapshotDate.setHours(0, 0, 0, 0)

    let upserted = 0, errors = 0

    for (const row of rows) {
      try {
        await this.videoStatModel.findOneAndUpdate(
          { platform: 'tiktok', video_id: row.video_id, date: snapshotDate },
          {
            platform: 'tiktok',
            title: row.title,
            published_at: row.published_at,
            date: snapshotDate,
            views: row.views,
            likes: row.likes,
            comments: row.comments,
            shares: row.shares,
          },
          { upsert: true, new: true },
        )
        upserted++
      } catch {
        errors++
      }
    }

    return { upserted, errors }
  }

  // ── Meta Ads ──────────────────────────────────────────────────────────────

  @Cron('0 8 * * *')
  async scheduledMetaPull() {
    const token = process.env.META_ACCESS_TOKEN
    if (!token) return
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const dateStr = yesterday.toISOString().split('T')[0]
    await this.pullMetaAds(dateStr).catch((e: Error) =>
      this.logger.error(`Meta Ads cron error: ${e.message}`),
    )
  }

  async pullMetaAds(dateStr?: string): Promise<{ pulled: number; date: string }> {
    const token = process.env.META_ACCESS_TOKEN
    const adAccountId = process.env.META_AD_ACCOUNT_ID

    if (!token || !adAccountId) {
      throw new BadRequestException('META_ACCESS_TOKEN et META_AD_ACCOUNT_ID requis dans .env')
    }

    const date = dateStr ?? new Date(Date.now() - 86400000).toISOString().split('T')[0]

    const response = await axios.get(
      `https://graph.facebook.com/v19.0/${adAccountId}/insights`,
      {
        params: {
          fields: 'campaign_id,campaign_name,adset_id,adset_name,spend,impressions,clicks,actions',
          time_range: JSON.stringify({ since: date, until: date }),
          level: 'adset',
          access_token: token,
          limit: 100,
        },
      },
    )

    const campaigns = (response.data?.data ?? []) as Array<Record<string, unknown>>
    let pulled = 0

    for (const c of campaigns) {
      const actions = (c.actions as Array<{ action_type: string; value: string }>) ?? []
      const convAction = actions.find((a) =>
        a.action_type.includes('messaging_conversation') || a.action_type === 'onsite_conversion.messaging_first_reply',
      )
      const conversations = convAction ? Number(convAction.value) : 0
      const spend = Number(c.spend ?? 0)

      await this.metaAdsModel.findOneAndUpdate(
        { date: new Date(date), campaign_id: String(c.campaign_id ?? ''), adset_id: String(c.adset_id ?? '') },
        {
          date: new Date(date),
          campaign_id: String(c.campaign_id ?? ''),
          campaign_name: String(c.campaign_name ?? ''),
          adset_id: String(c.adset_id ?? ''),
          adset_name: String(c.adset_name ?? ''),
          spend,
          impressions: Number(c.impressions ?? 0),
          clicks: Number(c.clicks ?? 0),
          conversations,
          cost_per_conversation: conversations > 0 ? +(spend / conversations).toFixed(2) : null,
        },
        { upsert: true, new: true },
      )
      pulled++
    }

    const config = await this.ytConfigModel.findOne()
    if (config) await this.ytConfigModel.updateOne({ _id: config._id }, { last_meta_synced: new Date() })

    return { pulled, date }
  }

  async getMetaStats(dateFrom?: string, dateTo?: string, campaignId?: string) {
    const filter: Record<string, unknown> = {}
    if (dateFrom || dateTo) {
      filter.date = {}
      if (dateFrom) (filter.date as Record<string, Date>)['$gte'] = new Date(dateFrom)
      if (dateTo)   (filter.date as Record<string, Date>)['$lte'] = new Date(dateTo)
    }
    if (campaignId) filter.campaign_id = campaignId

    const [stats, totals] = await Promise.all([
      this.metaAdsModel.find(filter).sort({ date: 1 }).lean(),
      this.metaAdsModel.aggregate([
        { $match: filter },
        { $group: {
          _id: null,
          total_spend: { $sum: '$spend' },
          total_conversations: { $sum: '$conversations' },
          total_clicks: { $sum: '$clicks' },
          total_impressions: { $sum: '$impressions' },
        }},
      ]),
    ])

    const t = totals[0] ?? { total_spend: 0, total_conversations: 0, total_clicks: 0, total_impressions: 0 }
    return {
      stats,
      totals: {
        spend: t.total_spend,
        conversations: t.total_conversations,
        clicks: t.total_clicks,
        impressions: t.total_impressions,
        cost_per_conversation: t.total_conversations > 0 ? +(t.total_spend / t.total_conversations).toFixed(2) : null,
      },
    }
  }

  // ── YouTube OAuth2 & pull ──────────────────────────────────────────────────

  getYouTubeAuthUrl(): string {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? `${process.env.BACKEND_URL ?? 'http://localhost:3001'}/api/analytics/youtube/callback`
    if (!clientId) throw new BadRequestException('GOOGLE_CLIENT_ID requis dans .env')

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly',
      access_type: 'offline',
      prompt: 'consent',
    })
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  async handleYouTubeCallback(code: string): Promise<{ success: boolean }> {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? `${process.env.BACKEND_URL ?? 'http://localhost:3001'}/api/analytics/youtube/callback`

    if (!clientId || !clientSecret) throw new BadRequestException('GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET requis')

    const r = await axios.post('https://oauth2.googleapis.com/token', null, {
      params: { code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' },
    })

    const { refresh_token, access_token } = r.data
    const channelId = await this.fetchChannelId(access_token)

    await this.ytConfigModel.findOneAndUpdate(
      {},
      { refresh_token: refresh_token ?? '', channel_id: channelId },
      { upsert: true, new: true },
    )

    return { success: true }
  }

  private async getYouTubeAccessToken(): Promise<string> {
    const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    // Prefer env var; fallback to DB
    const config = await this.ytConfigModel.findOne()
    const token = refreshToken || config?.refresh_token

    if (!token || !clientId || !clientSecret) {
      throw new BadRequestException('YouTube non configuré (refresh_token, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET requis)')
    }

    const r = await axios.post('https://oauth2.googleapis.com/token', null, {
      params: { refresh_token: token, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' },
    })
    return r.data.access_token
  }

  private async fetchChannelId(accessToken: string): Promise<string> {
    const r = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
      params: { part: 'id', mine: 'true' },
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    return r.data?.items?.[0]?.id ?? ''
  }

  @Cron('0 9 * * *')
  async scheduledYouTubePull() {
    const config = await this.ytConfigModel.findOne()
    if (!config?.refresh_token && !process.env.YOUTUBE_REFRESH_TOKEN) return
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const dateStr = yesterday.toISOString().split('T')[0]
    await this.pullYouTube(dateStr).catch((e: Error) =>
      this.logger.error(`YouTube cron error: ${e.message}`),
    )
  }

  async pullYouTube(dateStr?: string): Promise<{ pulled: number; date: string }> {
    const date = dateStr ?? new Date(Date.now() - 86400000).toISOString().split('T')[0]
    const accessToken = await this.getYouTubeAccessToken()

    const config = await this.ytConfigModel.findOne()
    const channelId = process.env.YOUTUBE_CHANNEL_ID || config?.channel_id
    if (!channelId) throw new BadRequestException('YOUTUBE_CHANNEL_ID requis')

    // 1. Get uploads playlist ID
    const channelR = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
      params: { part: 'contentDetails', id: channelId },
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const uploadsPlaylistId = channelR.data?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
    if (!uploadsPlaylistId) throw new BadRequestException('Playlist uploads introuvable')

    // 2. Get all video IDs from uploads playlist
    const videoIds: string[] = []
    let pageToken: string | undefined
    do {
      const r = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
        params: { part: 'contentDetails', playlistId: uploadsPlaylistId, maxResults: 50, pageToken },
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      for (const item of r.data.items ?? []) {
        videoIds.push(item.contentDetails.videoId)
      }
      pageToken = r.data.nextPageToken
    } while (pageToken)

    if (!videoIds.length) return { pulled: 0, date }

    // 3. Get stats for all videos (batches of 50)
    const videoInfoMap = new Map<string, { title: string; published_at: Date | null; views: number; likes: number; comments: number }>()
    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50)
      const r = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
        params: { part: 'snippet,statistics', id: batch.join(',') },
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      for (const item of r.data.items ?? []) {
        videoInfoMap.set(item.id, {
          title: item.snippet?.title ?? '',
          published_at: item.snippet?.publishedAt ? new Date(item.snippet.publishedAt) : null,
          views: Number(item.statistics?.viewCount ?? 0),
          likes: Number(item.statistics?.likeCount ?? 0),
          comments: Number(item.statistics?.commentCount ?? 0),
        })
      }
    }

    // 4. Try to get Analytics data (watch time, subscribers) — optional
    const analyticsMap = new Map<string, { watch_time: number; subscribers: number }>()
    try {
      const r = await axios.get('https://youtubeanalytics.googleapis.com/v2/reports', {
        params: {
          ids: 'channel==MINE',
          startDate: date,
          endDate: date,
          metrics: 'estimatedMinutesWatched,subscribersGained',
          dimensions: 'video',
          maxResults: 200,
        },
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const colHeaders = r.data?.columnHeaders?.map((c: { name: string }) => c.name) ?? []
      const vidIdx = colHeaders.indexOf('video')
      const watchIdx = colHeaders.indexOf('estimatedMinutesWatched')
      const subIdx = colHeaders.indexOf('subscribersGained')
      for (const row of r.data?.rows ?? []) {
        if (vidIdx >= 0) {
          analyticsMap.set(row[vidIdx], {
            watch_time: watchIdx >= 0 ? Number(row[watchIdx]) : 0,
            subscribers: subIdx >= 0 ? Number(row[subIdx]) : 0,
          })
        }
      }
    } catch {
      this.logger.warn('YouTube Analytics API unavailable — only basic stats stored')
    }

    // 5. Upsert VideoStat
    let pulled = 0
    for (const [videoId, info] of videoInfoMap) {
      const analytics = analyticsMap.get(videoId)
      await this.videoStatModel.findOneAndUpdate(
        { platform: 'youtube', video_id: videoId, date: new Date(date) },
        {
          platform: 'youtube',
          video_id: videoId,
          title: info.title,
          published_at: info.published_at,
          date: new Date(date),
          views: info.views,
          likes: info.likes,
          comments: info.comments,
          shares: 0,
          watch_time_minutes: analytics?.watch_time ?? null,
          subscribers_gained: analytics?.subscribers ?? null,
        },
        { upsert: true, new: true },
      )
      pulled++
    }

    if (config) await this.ytConfigModel.updateOne({ _id: config._id }, { last_synced: new Date() })
    return { pulled, date }
  }

  async getYouTubeStats(dateFrom?: string, dateTo?: string, videoId?: string) {
    return this.getVideoStats('youtube', dateFrom, dateTo, videoId)
  }

  async getTikTokStats(dateFrom?: string, dateTo?: string, videoId?: string) {
    return this.getVideoStats('tiktok', dateFrom, dateTo, videoId)
  }

  private async getVideoStats(platform: 'youtube' | 'tiktok', dateFrom?: string, dateTo?: string, videoId?: string) {
    const filter: Record<string, unknown> = { platform }
    if (dateFrom || dateTo) {
      filter.date = {}
      if (dateFrom) (filter.date as Record<string, Date>)['$gte'] = new Date(dateFrom)
      if (dateTo)   (filter.date as Record<string, Date>)['$lte'] = new Date(dateTo)
    }
    if (videoId) filter.video_id = videoId

    const stats = await this.videoStatModel.find(filter).sort({ date: 1 }).lean()

    // Compute daily view deltas per video
    const byVideo = new Map<string, typeof stats>()
    for (const s of stats) {
      const key = s.video_id
      if (!byVideo.has(key)) byVideo.set(key, [])
      byVideo.get(key)!.push(s)
    }

    const withDelta = stats.map((s) => {
      const videoStats = byVideo.get(s.video_id)!
      const idx = videoStats.indexOf(s)
      const prev = idx > 0 ? videoStats[idx - 1] : null
      return { ...s, views_delta: prev ? Math.max(0, s.views - prev.views) : 0 }
    })

    return withDelta
  }

  // ── Corrélation vues / leads ───────────────────────────────────────────────

  async getViewsLeadsCorrelation(dateFrom?: string, dateTo?: string, platform?: string) {
    const filter: Record<string, unknown> = {}
    if (dateFrom || dateTo) {
      filter.date = {}
      if (dateFrom) (filter.date as Record<string, Date>)['$gte'] = new Date(dateFrom)
      if (dateTo)   (filter.date as Record<string, Date>)['$lte'] = new Date(dateTo)
    }
    if (platform) filter.platform = platform

    const [videoStats, leadsPerDay] = await Promise.all([
      this.videoStatModel.find(filter).sort({ date: 1 }).lean(),
      this.leadModel.aggregate([
        {
          $match: {
            createdAt: {
              $gte: dateFrom ? new Date(dateFrom) : new Date('2020-01-01'),
              $lte: dateTo ? new Date(dateTo) : new Date(),
            },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            leads: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ])

    // Aggregate video views per day (sum delta)
    const viewsByDay = new Map<string, number>()
    const byVideo = new Map<string, typeof videoStats>()
    for (const s of videoStats) {
      if (!byVideo.has(s.video_id)) byVideo.set(s.video_id, [])
      byVideo.get(s.video_id)!.push(s)
    }
    for (const [, vStats] of byVideo) {
      for (let i = 0; i < vStats.length; i++) {
        const dateKey = new Date(vStats[i].date).toISOString().split('T')[0]
        const delta = i > 0 ? Math.max(0, vStats[i].views - vStats[i - 1].views) : 0
        viewsByDay.set(dateKey, (viewsByDay.get(dateKey) ?? 0) + delta)
      }
    }

    const leadsMap = new Map(leadsPerDay.map((l: { _id: string; leads: number }) => [l._id, l.leads]))

    const allDates = new Set([...viewsByDay.keys(), ...leadsMap.keys()])
    const correlation = Array.from(allDates).sort().map((date) => ({
      date,
      views_delta: viewsByDay.get(date) ?? 0,
      leads: leadsMap.get(date) ?? 0,
    }))

    return { platform: platform ?? 'all', data: correlation }
  }

  // ── Overview ──────────────────────────────────────────────────────────────

  async getOverview(dateFrom?: string, dateTo?: string) {
    const [meta, ytStats, ttStats, totalLeads, config] = await Promise.all([
      this.getMetaStats(dateFrom, dateTo),
      this.getVideoStats('youtube', dateFrom, dateTo),
      this.getVideoStats('tiktok', dateFrom, dateTo),
      this.leadModel.countDocuments(
        dateFrom || dateTo
          ? { createdAt: { ...(dateFrom ? { $gte: new Date(dateFrom) } : {}), ...(dateTo ? { $lte: new Date(dateTo) } : {}) } }
          : {},
      ),
      this.ytConfigModel.findOne().lean(),
    ])

    const ytTotal = ytStats.reduce((acc, s) => acc + ((s as { views_delta?: number }).views_delta ?? 0), 0)
    const ttTotal = ttStats.reduce((acc, s) => acc + ((s as { views_delta?: number }).views_delta ?? 0), 0)

    return {
      leads: { total: totalLeads },
      meta: { spend: meta.totals.spend, conversations: meta.totals.conversations, cost_per_conversation: meta.totals.cost_per_conversation },
      youtube: { views_delta: ytTotal, last_synced: config?.last_synced ?? null },
      tiktok: { views_delta: ttTotal },
    }
  }

  async getYouTubeConfig() {
    const config = await this.ytConfigModel.findOne().lean()
    const hasRefreshToken = !!(process.env.YOUTUBE_REFRESH_TOKEN || config?.refresh_token)
    return {
      channel_id: process.env.YOUTUBE_CHANNEL_ID || config?.channel_id || '',
      has_refresh_token: hasRefreshToken,
      last_synced: config?.last_synced ?? null,
      last_meta_synced: config?.last_meta_synced ?? null,
    }
  }
}
