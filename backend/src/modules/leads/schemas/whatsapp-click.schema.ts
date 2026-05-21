import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type WhatsAppClickDocument = WhatsAppClick & Document

@Schema()
export class WhatsAppClick {
  @Prop({ type: Types.ObjectId, ref: 'WhatsAppLink', required: true }) link_id: Types.ObjectId
  @Prop({ required: true }) src: string
  @Prop({ type: String, default: '' }) user_agent: string
  @Prop({ type: Date, default: () => new Date() }) clicked_at: Date
}

export const WhatsAppClickSchema = SchemaFactory.createForClass(WhatsAppClick)
WhatsAppClickSchema.index({ link_id: 1 })
WhatsAppClickSchema.index({ src: 1 })
WhatsAppClickSchema.index({ clicked_at: -1 })
