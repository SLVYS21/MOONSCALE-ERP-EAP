import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type WikiPageDocument = WikiPage & Document

@Schema({ timestamps: true })
export class WikiPage {
  @Prop({ required: true })
  title: string

  @Prop({ required: true, unique: true })
  slug: string

  // Contenu en Markdown
  @Prop({ default: '' })
  content: string

  @Prop({ type: Types.ObjectId, ref: 'WikiPage', default: null })
  parentId: Types.ObjectId | null

  // Ordre dans la sidebar parmi les frères
  @Prop({ default: 0 })
  order: number

  @Prop({ default: '📄' })
  icon: string

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  updatedBy: Types.ObjectId | null

  @Prop({ default: true })
  isPublished: boolean
}

export const WikiPageSchema = SchemaFactory.createForClass(WikiPage)
WikiPageSchema.index({ parentId: 1, order: 1 })
WikiPageSchema.index({ slug: 1 })
