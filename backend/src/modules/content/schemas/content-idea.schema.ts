import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type ContentIdeaDocument = ContentIdea & Document

@Schema({ timestamps: true })
export class ContentIdea {
  @Prop({ required: true }) idea_text: string
  @Prop({ type: String, default: null }) competitor_url: string | null
  @Prop({ type: String, default: '' }) context: string

  @Prop({ type: String, default: '' }) analysis: string
  @Prop({ type: [String], default: [] }) hooks: string[]
  @Prop({ type: String, default: '' }) script_outline: string
  @Prop({ type: String, default: '' }) full_script: string
  @Prop({ type: [String], default: [] }) thumbnail_descriptions: string[]
  @Prop({ type: [String], default: [] }) generated_thumbnails: string[]

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  created_by: Types.ObjectId | null
}

export const ContentIdeaSchema = SchemaFactory.createForClass(ContentIdea)
ContentIdeaSchema.index({ created_by: 1, createdAt: -1 })
