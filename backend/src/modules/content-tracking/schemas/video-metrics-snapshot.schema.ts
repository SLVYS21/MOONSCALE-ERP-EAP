import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type VideoMetricsSnapshotDocument = VideoMetricsSnapshot & Document

@Schema({ timestamps: true })
export class VideoMetricsSnapshot {
  @Prop({ type: Types.ObjectId, ref: 'TrackedVideo', required: true, index: true })
  video_id: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'TrackedAccount', required: true, index: true })
  account_id: Types.ObjectId

  @Prop({ type: Date, required: true, index: true }) captured_at: Date

  @Prop({ type: String, required: true }) captured_date: string

  @Prop({ default: 0 }) views: number
  @Prop({ default: 0 }) likes: number
  @Prop({ default: 0 }) comments: number
  @Prop({ default: 0 }) shares: number

  @Prop({ default: 0 }) engagement_rate: number
}

export const VideoMetricsSnapshotSchema = SchemaFactory.createForClass(VideoMetricsSnapshot)
VideoMetricsSnapshotSchema.index({ video_id: 1, captured_at: -1 })
VideoMetricsSnapshotSchema.index({ video_id: 1, captured_date: 1 }, { unique: true })
VideoMetricsSnapshotSchema.index({ account_id: 1, captured_at: -1 })
