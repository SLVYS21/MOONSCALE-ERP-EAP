import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type KnowledgeDocumentDocument = KnowledgeDocument & Document
export type KnowledgeDocType = 'pdf' | 'txt' | 'md' | 'image'

@Schema({ timestamps: true, collection: 'kb_documents' })
export class KnowledgeDocument {
  @Prop({ required: true })
  name: string

  @Prop({ type: String, enum: ['pdf', 'txt', 'md', 'image'], required: true })
  type: KnowledgeDocType

  @Prop({ required: true })
  url: string

  @Prop({ type: String, default: null })
  cloudinaryPublicId: string | null

  @Prop({ type: Number, default: 0 })
  bytes: number

  @Prop({ type: String, default: null })
  hash: string | null

  @Prop({ type: String, default: '' })
  extractedText: string

  @Prop({ type: Number, default: 0 })
  chunkCount: number

  @Prop({ type: Boolean, default: false })
  isAlwaysIncluded: boolean

  @Prop({ type: String, enum: ['fr', 'en', 'mixed'], default: 'fr' })
  language: 'fr' | 'en' | 'mixed'

  @Prop({ type: String, enum: ['pending', 'processing', 'ready', 'failed'], default: 'pending' })
  status: 'pending' | 'processing' | 'ready' | 'failed'

  @Prop({ type: String, default: null })
  errorMessage: string | null

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  uploadedBy: Types.ObjectId | null
}

export const KnowledgeDocumentSchema = SchemaFactory.createForClass(KnowledgeDocument)
KnowledgeDocumentSchema.index({ status: 1 })
KnowledgeDocumentSchema.index({ isAlwaysIncluded: 1 })
