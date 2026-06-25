import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type ConversationDocument = Conversation & Document

export type ConversationStatus = 'bot' | 'human' | 'paused' | 'closed'
export type ContactType = 'lead' | 'student' | 'unknown'

@Schema({ timestamps: true })
export class Conversation {
  @Prop({ required: true, index: true })
  phone: string

  @Prop({ type: String, default: null })
  phoneRaw: string | null

  @Prop({ type: String, default: null })
  contactName: string | null

  @Prop({ type: String, enum: ['lead', 'student', 'unknown'], default: 'unknown', index: true })
  contactType: ContactType

  @Prop({ type: Types.ObjectId, default: null, index: true })
  contactId: Types.ObjectId | null

  @Prop({ type: String, enum: ['bot', 'human', 'paused', 'closed'], default: 'bot', index: true })
  status: ConversationStatus

  @Prop({ type: Boolean, default: true })
  aiEnabled: boolean

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  lockedBy: Types.ObjectId | null

  @Prop({ type: Date, default: null })
  lockedAt: Date | null

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  assignedTo: Types.ObjectId | null

  @Prop({ type: [String], default: [] })
  tags: string[]

  @Prop({ type: Date, default: () => new Date(), index: true })
  lastMessageAt: Date

  @Prop({ type: String, default: '' })
  lastMessagePreview: string

  @Prop({ type: Number, default: 0 })
  unreadCount: number

  @Prop({ type: Boolean, default: false })
  typebotSessionActive: boolean

  @Prop({ type: String, default: null })
  typebotSessionId: string | null

  @Prop({ type: String, enum: ['fr', 'en'], default: 'fr' })
  language: 'fr' | 'en'

  @Prop({ type: String, default: null })
  category: string | null

  @Prop({ type: Object, default: {} })
  meta: Record<string, unknown>
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation)
ConversationSchema.index({ status: 1, lastMessageAt: -1 })
ConversationSchema.index({ phone: 1 }, { unique: true })
