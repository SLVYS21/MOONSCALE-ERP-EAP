import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'
import type { ContentCategory, ContentFormat, DurationType } from './video-project.schema'

export type ContentSuggestionDocument = ContentSuggestion & Document
export type SuggestionStatus = 'new' | 'saved' | 'dismissed'

@Schema({ timestamps: true })
export class ContentSuggestion {
  @Prop({ required: true }) title: string
  @Prop({ default: '' }) rationale: string

  @Prop({ type: String, enum: ['educatif', 'preuve-sociale', 'viral', 'podcast'], default: 'educatif' })
  category: ContentCategory

  @Prop({
    type: String,
    enum: [
      'talking-head', 'valeur-ecommerce', 'mindset', 'etude-de-cas', 'erreurs-lecons',
      'interview-etudiant', 'challenge', 'comparatif', 'vision-marche', 'coulisses',
      'personnalite', 'podcast',
    ],
    default: 'talking-head',
  })
  format: ContentFormat

  @Prop({ type: String, enum: ['court', 'long'], default: 'long' })
  duration_type: DurationType

  @Prop({ default: '' }) creator_inspiration: string

  @Prop({ type: String, enum: ['new', 'saved', 'dismissed'], default: 'new' })
  status: SuggestionStatus

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  created_by: Types.ObjectId
}

export const ContentSuggestionSchema = SchemaFactory.createForClass(ContentSuggestion)
ContentSuggestionSchema.index({ created_by: 1, status: 1 })
ContentSuggestionSchema.index({ created_by: 1, createdAt: -1 })
