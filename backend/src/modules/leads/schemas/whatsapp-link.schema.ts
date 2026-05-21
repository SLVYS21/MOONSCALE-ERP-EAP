import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type WhatsAppLinkDocument = WhatsAppLink & Document
export type TrackingLinkType = 'whatsapp' | 'typebot' | 'link'

@Schema({ timestamps: true })
export class WhatsAppLink {
  @Prop({ required: true, unique: true, trim: true }) src: string

  @Prop({ type: String, enum: ['whatsapp', 'typebot', 'link'], default: 'whatsapp' })
  type: TrackingLinkType

  @Prop({ type: String, default: '' }) description: string

  // For type='whatsapp'
  @Prop({ type: String, default: null }) whatsapp_number: string | null

  // For type='typebot' or 'link' — the destination URL
  @Prop({ type: String, default: null }) target_url: string | null

  // UTM params to inject in the redirect URL
  @Prop({ type: String, default: null }) utm_source: string | null
  @Prop({ type: String, default: null }) utm_campaign: string | null

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  created_by: Types.ObjectId | null
}

export const WhatsAppLinkSchema = SchemaFactory.createForClass(WhatsAppLink)
WhatsAppLinkSchema.index({ src: 1 }, { unique: true })
