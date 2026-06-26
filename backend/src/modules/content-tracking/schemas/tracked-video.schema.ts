import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type TrackedVideoDocument = TrackedVideo & Document

@Schema({ timestamps: true })
export class TrackedVideo {
  @Prop({ type: Types.ObjectId, ref: 'TrackedAccount', required: true, index: true })
  account_id: Types.ObjectId

  @Prop({ required: true }) platform_video_id: string

  @Prop({ required: true }) title: string

  @Prop({ default: '' }) description: string

  @Prop({ default: '' }) thumbnail_url: string

  @Prop({ required: true }) video_url: string

  @Prop({ type: Date, default: null }) published_at: Date | null

  @Prop({ type: Number, default: null }) duration_seconds: number | null

  @Prop({ type: [String], default: [] }) hashtags: string[]

  @Prop({ type: Date, default: () => new Date() }) first_seen_at: Date
}

export const TrackedVideoSchema = SchemaFactory.createForClass(TrackedVideo)
TrackedVideoSchema.index({ account_id: 1, platform_video_id: 1 }, { unique: true })
TrackedVideoSchema.index({ account_id: 1, published_at: -1 })
