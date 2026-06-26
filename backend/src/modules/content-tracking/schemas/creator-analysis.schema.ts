import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'
import type { TrackedPlatform } from './tracked-account.schema'

export type CreatorAnalysisDocument = CreatorAnalysis & Document

export interface AnalyzedVideoSnapshot {
  platform_video_id: string
  title: string
  url: string
  thumbnail_url: string
  published_at: Date | null
  views: number
  likes: number
  comments: number
  caption: string
  hashtags: string[]
}

@Schema({ timestamps: true })
export class CreatorAnalysis {
  @Prop({ required: true }) handle: string

  @Prop({ type: String, enum: ['youtube', 'tiktok', 'facebook'], required: true })
  platform: TrackedPlatform

  @Prop({ default: '' }) display_name: string
  @Prop({ default: '' }) channel_url: string
  @Prop({ default: '' }) bio: string

  @Prop({
    type: [{
      _id: false,
      platform_video_id: String,
      title: String,
      url: String,
      thumbnail_url: String,
      published_at: Date,
      views: { type: Number, default: 0 },
      likes: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      caption: { type: String, default: '' },
      hashtags: { type: [String], default: [] },
    }],
    default: [],
  })
  videos: AnalyzedVideoSnapshot[]

  // ── AI insights ─────────────────────────────────────────────────
  @Prop({ default: '' }) summary: string
  @Prop({ type: [String], default: [] }) recurring_hooks: string[]
  @Prop({ type: [String], default: [] }) recurring_formats: string[]
  @Prop({ type: [String], default: [] }) recurring_hashtags: string[]
  @Prop({ default: '' }) tone: string
  @Prop({ default: '' }) angle: string
  @Prop({ type: [String], default: [] }) what_works_for_them: string[]
  @Prop({ type: [String], default: [] }) gaps_to_exploit: string[]
  @Prop({ type: [String], default: [] }) idea_seeds: string[]

  @Prop({ default: 'groq' }) llm_provider: string
  @Prop({ default: '' }) llm_model: string
  @Prop({ default: 0 }) llm_cost_usd: number

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  created_by: Types.ObjectId
}

export const CreatorAnalysisSchema = SchemaFactory.createForClass(CreatorAnalysis)
CreatorAnalysisSchema.index({ created_by: 1, createdAt: -1 })
CreatorAnalysisSchema.index({ created_by: 1, platform: 1, handle: 1 })
