import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type TransactionDocument = Transaction & Document

@Schema({ timestamps: true })
export class Transaction {
  @Prop({ type: String, enum: ['income', 'expense'], required: true })
  type: string

  @Prop({ type: Number, required: true })
  amount: number

  @Prop({ type: String, enum: ['EUR', 'USD', 'XOF', 'MAD', 'CAD'], default: 'EUR' })
  currency: string

  @Prop({ type: String, required: true })
  description: string

  @Prop({ type: Types.ObjectId, ref: 'Category', default: null })
  categoryId: Types.ObjectId | null

  @Prop({ type: Date, required: true })
  date: Date

  @Prop({ type: String, default: 'manual' })
  gateway: string

  @Prop({ type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'completed' })
  status: string

  @Prop({ type: String, default: null })
  reference: string | null

  @Prop({ default: '' })
  notes: string

  @Prop({ type: [String], default: [] })
  attachments: string[]

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId

  // ── Customer info ──────────────────────────────────────────────────────────
  @Prop({ type: String, default: null }) customerEmail: string | null
  @Prop({ type: String, default: null }) customerName: string | null
  @Prop({ type: String, default: null }) customerPhone: string | null

  // ── Product / offer link ───────────────────────────────────────────────────
  @Prop({ type: String, default: null }) productName: string | null
  @Prop({ type: Types.ObjectId, ref: 'Offer', default: null }) offerId: Types.ObjectId | null
  @Prop({ type: String, default: null }) offerName: string | null

  // ── Entity links ───────────────────────────────────────────────────────────
  @Prop({ type: Types.ObjectId, ref: 'Student', default: null }) studentId: Types.ObjectId | null
  @Prop({ type: Types.ObjectId, ref: 'Lead', default: null }) leadId: Types.ObjectId | null
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction)
TransactionSchema.index({ type: 1, date: -1 })
TransactionSchema.index({ categoryId: 1 })
TransactionSchema.index({ date: -1 })
TransactionSchema.index({ gateway: 1 })
TransactionSchema.index({ status: 1 })
TransactionSchema.index({ productName: 1 })
TransactionSchema.index({ offerId: 1 })
TransactionSchema.index({ customerEmail: 1 })
TransactionSchema.index({ studentId: 1 })
TransactionSchema.index({ leadId: 1 })
