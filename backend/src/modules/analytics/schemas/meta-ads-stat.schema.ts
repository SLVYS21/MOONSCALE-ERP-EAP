import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type MetaAdsStatDocument = MetaAdsStat & Document

@Schema({ timestamps: false })
export class MetaAdsStat {
  @Prop({ type: Date, required: true }) date: Date

  @Prop({ default: '' }) campaign_id: string
  @Prop({ default: '' }) campaign_name: string
  @Prop({ default: '' }) adset_id: string
  @Prop({ default: '' }) adset_name: string

  @Prop({ type: Number, default: 0 }) spend: number
  @Prop({ type: String, default: 'XOF' }) currency: string
  @Prop({ type: Number, default: 0 }) impressions: number
  @Prop({ type: Number, default: 0 }) clicks: number

  // Click to WhatsApp conversations
  @Prop({ type: Number, default: 0 }) conversations: number
  @Prop({ type: Number, default: null }) cost_per_conversation: number | null
}

export const MetaAdsStatSchema = SchemaFactory.createForClass(MetaAdsStat)
MetaAdsStatSchema.index({ date: -1 })
MetaAdsStatSchema.index({ date: 1, campaign_id: 1 }, { unique: true })
