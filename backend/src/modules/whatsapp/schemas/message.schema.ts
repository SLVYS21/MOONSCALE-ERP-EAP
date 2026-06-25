import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type MessageDocument = Message & Document

export type MessageDirection = 'in' | 'out'
export type MessageFromType = 'client' | 'bot' | 'closer' | 'system'
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
export type MessageMediaType = 'image' | 'video' | 'audio' | 'document' | null

export interface ToolCallLog {
  name: string
  args: Record<string, unknown>
  result?: unknown
  ms?: number
}

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true, index: true })
  conversationId: Types.ObjectId

  @Prop({ type: String, enum: ['in', 'out'], required: true })
  direction: MessageDirection

  @Prop({ type: String, enum: ['client', 'bot', 'closer', 'system'], required: true })
  fromType: MessageFromType

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  fromUserId: Types.ObjectId | null

  @Prop({ type: String, default: '' })
  content: string

  @Prop({ type: String, default: null })
  mediaUrl: string | null

  @Prop({ type: String, enum: ['image', 'video', 'audio', 'document', null], default: null })
  mediaType: MessageMediaType

  @Prop({ type: String, default: null })
  mediaName: string | null

  @Prop({ type: String, enum: ['pending', 'sent', 'delivered', 'read', 'failed'], default: 'sent' })
  status: MessageStatus

  @Prop({ type: String, default: null })
  providerMessageId: string | null

  @Prop({ type: String, default: null })
  intent: string | null

  @Prop({ type: [Object], default: [] })
  toolCalls: ToolCallLog[]

  @Prop({ type: Number, default: null })
  tokensIn: number | null

  @Prop({ type: Number, default: null })
  tokensOut: number | null

  @Prop({ type: Number, default: null })
  costUsd: number | null

  @Prop({ type: String, default: null })
  llmProvider: string | null

  @Prop({ type: String, default: null })
  llmModel: string | null

  @Prop({ type: String, default: null })
  errorMessage: string | null
}

export const MessageSchema = SchemaFactory.createForClass(Message)
MessageSchema.index({ conversationId: 1, createdAt: 1 })
