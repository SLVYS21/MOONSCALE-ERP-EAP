import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type QuickReplyDocument = QuickReply & Document

@Schema({ timestamps: true })
export class QuickReply {
  @Prop({ required: true })
  shortcut: string

  @Prop({ required: true })
  content: string

  @Prop({ type: String, default: '' })
  label: string

  @Prop({ type: Boolean, default: true })
  shared: boolean

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  ownerId: Types.ObjectId | null
}

export const QuickReplySchema = SchemaFactory.createForClass(QuickReply)
QuickReplySchema.index({ ownerId: 1, shortcut: 1 })
