import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type DailyReportDocument = DailyReport & Document

@Schema({ _id: false })
export class ReportVideoHighlight {
  @Prop({ type: Types.ObjectId, ref: 'TrackedVideo' }) video_id: Types.ObjectId
  @Prop() title: string
  @Prop() reason: string
  @Prop({ default: 0 }) views_delta: number
}
const ReportVideoHighlightSchema = SchemaFactory.createForClass(ReportVideoHighlight)

@Schema({ timestamps: true })
export class DailyReport {
  @Prop({ type: Types.ObjectId, ref: 'TrackedAccount', required: true, index: true })
  account_id: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  created_by: Types.ObjectId

  @Prop({ required: true }) report_date: string

  @Prop({ default: '' }) summary: string

  @Prop({ type: [ReportVideoHighlightSchema], default: [] })
  top_videos: ReportVideoHighlight[]

  @Prop({ type: [ReportVideoHighlightSchema], default: [] })
  underperforming_videos: ReportVideoHighlight[]

  @Prop({ type: [String], default: [] }) improvement_ideas: string[]

  @Prop({ type: [String], default: [] }) new_content_ideas: string[]

  @Prop({ default: 0 }) total_views_today: number
  @Prop({ default: 0 }) total_views_yesterday: number
  @Prop({ default: 0 }) total_views_delta: number

  @Prop({ default: 'groq' }) llm_provider: string
  @Prop({ default: '' }) llm_model: string
  @Prop({ default: 0 }) llm_cost_usd: number
}

export const DailyReportSchema = SchemaFactory.createForClass(DailyReport)
DailyReportSchema.index({ account_id: 1, report_date: 1 }, { unique: true })
DailyReportSchema.index({ created_by: 1, report_date: -1 })
