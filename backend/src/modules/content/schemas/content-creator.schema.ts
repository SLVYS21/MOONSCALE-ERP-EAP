import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type ContentCreatorDocument = ContentCreator & Document

@Schema({ timestamps: true })
export class ContentCreator {
  @Prop({ required: true }) name: string
  @Prop({ required: true }) channel_url: string

  @Prop({ type: String, enum: ['youtube', 'tiktok', 'instagram'], default: 'youtube' })
  platform: 'youtube' | 'tiktok' | 'instagram'

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  created_by: Types.ObjectId
}

export const ContentCreatorSchema = SchemaFactory.createForClass(ContentCreator)
ContentCreatorSchema.index({ created_by: 1 })
