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

  @Prop({
    type: String,
    enum: ['stripe', 'chariow', 'pawapay', 'fedapay', 'wave', 'orange_money', 'virement', 'manual', 'bank_import'],
    default: 'manual',
  })
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
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction)
TransactionSchema.index({ type: 1, date: -1 })
TransactionSchema.index({ categoryId: 1 })
TransactionSchema.index({ date: -1 })
TransactionSchema.index({ gateway: 1 })
TransactionSchema.index({ status: 1 })
