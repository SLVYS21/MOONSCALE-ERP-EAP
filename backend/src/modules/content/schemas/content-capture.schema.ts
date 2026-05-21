import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type ContentCaptureDocument = ContentCapture & Document

@Schema({ timestamps: true })
export class ContentCapture {
  @Prop({ required: true }) text: string

  @Prop({ type: String, enum: ['text', 'voice'], default: 'text' })
  source: 'text' | 'voice'

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  created_by: Types.ObjectId
}

export const ContentCaptureSchema = SchemaFactory.createForClass(ContentCapture)
ContentCaptureSchema.index({ created_by: 1, createdAt: -1 })
