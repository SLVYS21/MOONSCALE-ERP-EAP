import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type KnowledgeChunkDocument = KnowledgeChunk & Document

@Schema({ timestamps: true, collection: 'kb_chunks' })
export class KnowledgeChunk {
  @Prop({ type: Types.ObjectId, ref: 'KnowledgeDocument', required: true, index: true })
  documentId: Types.ObjectId

  @Prop({ required: true })
  documentName: string

  @Prop({ required: true })
  text: string

  @Prop({ type: Number, default: 0 })
  position: number

  @Prop({ type: [Number], default: [] })
  embedding: number[]

  @Prop({ type: Number, default: 0 })
  tokenEstimate: number
}

export const KnowledgeChunkSchema = SchemaFactory.createForClass(KnowledgeChunk)
KnowledgeChunkSchema.index({ documentId: 1, position: 1 })
