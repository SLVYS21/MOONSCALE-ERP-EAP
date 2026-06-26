export type ContentStatus = 'idee' | 'script' | 'tournage' | 'montage' | 'publie'
export type ContentCategory = 'educatif' | 'preuve-sociale' | 'viral' | 'podcast'
export type ContentFormat =
  | 'talking-head' | 'valeur-ecommerce' | 'mindset' | 'etude-de-cas' | 'erreurs-lecons'
  | 'interview-etudiant' | 'challenge'
  | 'comparatif' | 'vision-marche' | 'coulisses' | 'personnalite'
  | 'podcast'
export type DurationType = 'court' | 'long'
export type ContentPlatform = 'youtube' | 'tiktok' | 'facebook' | 'instagram' | 'whatsapp'

export interface ChecklistItem { id: string; label: string; done: boolean }
export interface Hook { text: string; selected: boolean }

export interface ReferenceVideo {
  url: string
  platform: 'youtube' | 'tiktok'
  title: string
  channel?: string
  views?: number
  transcript?: string
  keep_points: string[]
  discard_points: string[]
  why_it_works: string
  added_at: string
}

export interface ScriptCorrection {
  id: string
  instruction: string
  result: string
  at: string
}

export interface VideoProject {
  _id: string
  title: string
  description: string
  status: ContentStatus
  category: ContentCategory
  format: ContentFormat
  duration_type: DurationType
  platforms: ContentPlatform[]
  target_date: string | null
  published_url: string | null
  youtube_ref_url: string | null
  notes: string
  brain_dump: string
  value_proposition: string
  key_points: string[]
  guest_name: string | null
  guest_value: string
  analysis: string
  hooks: Hook[]
  script_outline: string
  full_script: string
  thumbnail_descriptions: string[]
  generated_thumbnails: string[]
  suggested_questions: string[]
  checklist: ChecklistItem[]
  reference_videos: ReferenceVideo[]
  script_correction_history: ScriptCorrection[]
  publish_time_suggestion: string
  publish_time_rationale: string
  analyzed_creator_id: string | null
  order: number
  createdAt: string
}

export interface ContentCapture {
  _id: string
  text: string
  source: 'text' | 'voice'
  createdAt: string
}

export interface ContentSuggestion {
  _id: string
  title: string
  rationale: string
  category: ContentCategory
  format: ContentFormat
  duration_type: DurationType
  creator_inspiration: string
  status: 'new' | 'saved' | 'dismissed'
  createdAt: string
}

export interface CreatorAnalysis {
  _id: string
  handle: string
  platform: 'youtube' | 'tiktok' | 'facebook'
  display_name: string
  channel_url: string
  bio: string
  videos: Array<{
    platform_video_id: string
    title: string
    url: string
    thumbnail_url: string
    published_at: string | null
    views: number
    likes: number
    comments: number
    caption: string
    hashtags: string[]
  }>
  summary: string
  recurring_hooks: string[]
  recurring_formats: string[]
  recurring_hashtags: string[]
  tone: string
  angle: string
  what_works_for_them: string[]
  gaps_to_exploit: string[]
  idea_seeds: string[]
  llm_provider: string
  llm_model: string
  llm_cost_usd: number
  createdAt: string
}

export const STATUS_CONFIG: Record<ContentStatus, { label: string; color: string; bg: string }> = {
  idee:     { label: 'Idée',     color: 'text-gray-700',    bg: 'bg-gray-100' },
  script:   { label: 'Script',   color: 'text-blue-700',    bg: 'bg-blue-50' },
  tournage: { label: 'Tournage', color: 'text-amber-700',   bg: 'bg-amber-50' },
  montage:  { label: 'Montage',  color: 'text-violet-700',  bg: 'bg-violet-50' },
  publie:   { label: 'Publié',   color: 'text-emerald-700', bg: 'bg-emerald-50' },
}

export const STATUS_ORDER: ContentStatus[] = ['idee', 'script', 'tournage', 'montage', 'publie']
