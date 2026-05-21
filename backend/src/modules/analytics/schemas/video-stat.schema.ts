import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type VideoStatDocument = VideoStat & Document

@Schema({ timestamps: false })
export class VideoStat {
  @Prop({ type: String, enum: ['youtube', 'tiktok'], required: true }) platform: 'youtube' | 'tiktok'
  @Prop({ required: true }) video_id: string
  @Prop({ default: '' }) title: string
  @Prop({ type: Date, default: null }) published_at: Date | null
  @Prop({ type: Date, required: true }) date: Date // snapshot date

  @Prop({ type: Number, default: 0 }) views: number     // cumulative on this date
  @Prop({ type: Number, default: 0 }) likes: number
  @Prop({ type: Number, default: 0 }) comments: number
  @Prop({ type: Number, default: 0 }) shares: number

  // YouTube only
  @Prop({ type: Number, default: null }) watch_time_minutes: number | null
  @Prop({ type: Number, default: null }) subscribers_gained: number | null
}

export const VideoStatSchema = SchemaFactory.createForClass(VideoStat)
VideoStatSchema.index({ platform: 1, video_id: 1, date: 1 }, { unique: true })
VideoStatSchema.index({ platform: 1, date: -1 })
