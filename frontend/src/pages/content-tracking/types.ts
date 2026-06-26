export type TrackedPlatform = 'youtube' | 'tiktok' | 'facebook'
export type TrackedAccountType = 'own' | 'competitor'

export interface TrackedAccount {
  _id: string
  name: string
  platform: TrackedPlatform
  handle: string
  channel_url: string
  type: TrackedAccountType
  is_active: boolean
  last_scraped_at: string | null
  last_scrape_error: string | null
  createdAt: string
  updatedAt: string
}

export interface MetricsSnapshot {
  _id: string
  video_id: string
  captured_at: string
  captured_date: string
  views: number
  likes: number
  comments: number
  shares: number
  engagement_rate: number
}

export interface TrackedVideo {
  _id: string
  account_id: string
  platform_video_id: string
  title: string
  description: string
  thumbnail_url: string
  video_url: string
  published_at: string | null
  duration_seconds: number | null
  hashtags: string[]
  first_seen_at: string
}

export interface TrackedVideoWithLatest extends TrackedVideo {
  latest_snapshot: MetricsSnapshot | null
}

export interface VideoWithHistory {
  video: TrackedVideo
  account: TrackedAccount
  snapshots: MetricsSnapshot[]
}

export interface ReportHighlight {
  video_id: string
  title: string
  reason: string
  views_delta: number
}

export interface DailyReport {
  _id: string
  account_id: string
  report_date: string
  summary: string
  top_videos: ReportHighlight[]
  underperforming_videos: ReportHighlight[]
  improvement_ideas: string[]
  new_content_ideas: string[]
  total_views_today: number
  total_views_yesterday: number
  total_views_delta: number
  llm_provider: string
  llm_model: string
  llm_cost_usd: number
  createdAt: string
}
