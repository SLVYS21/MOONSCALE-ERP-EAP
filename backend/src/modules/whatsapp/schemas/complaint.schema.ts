import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type ComplaintDocument = Complaint & Document

export const COMPLAINT_CATEGORIES = [
  'access_circle',
  'payment_issue',
  'formation_content',
  'coaching_session',
  'refund_request',
  'technical_other',
  'other',
] as const
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number]

export type ComplaintStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

@Schema({ timestamps: true })
export class Complaint {
  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true, index: true })
  conversationId: Types.ObjectId

  @Prop({ type: String, enum: COMPLAINT_CATEGORIES, required: true, index: true })
  category: ComplaintCategory

  @Prop({ required: true })
  description: string

  @Prop({ type: String, enum: ['lead', 'student', 'unknown'], default: 'unknown' })
  contactType: 'lead' | 'student' | 'unknown'

  @Prop({ type: Types.ObjectId, default: null })
  contactId: Types.ObjectId | null

  @Prop({ type: String, default: null })
  contactName: string | null

  @Prop({ type: String, default: null })
  contactPhone: string | null

  @Prop({ type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open', index: true })
  status: ComplaintStatus

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  resolvedBy: Types.ObjectId | null

  @Prop({ type: Date, default: null })
  resolvedAt: Date | null

  @Prop({ type: String, default: '' })
  resolutionNote: string

  @Prop({ type: String, enum: ['ai', 'closer'], default: 'ai' })
  createdByType: 'ai' | 'closer'

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  createdByUserId: Types.ObjectId | null
}

export const ComplaintSchema = SchemaFactory.createForClass(Complaint)
ComplaintSchema.index({ status: 1, createdAt: -1 })
