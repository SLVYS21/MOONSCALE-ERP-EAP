import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type TrackedAccountDocument = TrackedAccount & Document
export type TrackedPlatform = 'youtube' | 'tiktok' | 'facebook'
export type TrackedAccountType = 'own' | 'competitor'

@Schema({ timestamps: true })
export class TrackedAccount {
  @Prop({ required: true }) name: string

  @Prop({ type: String, enum: ['youtube', 'tiktok', 'facebook'], required: true })
  platform: TrackedPlatform

  @Prop({ required: true }) handle: string

  @Prop({ required: true }) channel_url: string

  @Prop({ type: String, enum: ['own', 'competitor'], default: 'own' })
  type: TrackedAccountType

  @Prop({ default: true }) is_active: boolean

  @Prop({ type: Date, default: null }) last_scraped_at: Date | null

  @Prop({ type: String, default: null }) last_scrape_error: string | null

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  created_by: Types.ObjectId
}

export const TrackedAccountSchema = SchemaFactory.createForClass(TrackedAccount)
TrackedAccountSchema.index({ created_by: 1, platform: 1 })
TrackedAccountSchema.index({ created_by: 1, handle: 1, platform: 1 }, { unique: true })
