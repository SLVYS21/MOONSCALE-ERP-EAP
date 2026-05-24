import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type SubscriptionStatus = 'active' | 'expired' | 'cancelled'
export type SubscriptionDocument = Subscription & Document

@Schema({ timestamps: true })
export class Subscription {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true, index: true })
  studentId: Types.ObjectId

  @Prop({ lowercase: true, trim: true, index: true })
  studentEmail: string

  @Prop({ type: Types.ObjectId, ref: 'Offer', required: true })
  offerId: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'Payment', default: null })
  paymentId: Types.ObjectId | null

  // Snapshot de l'offre au moment de la souscription (les offres peuvent évoluer)
  @Prop({ required: true }) offerName: string
  @Prop({ required: true }) offerProduct: string
  @Prop({ type: String, default: null }) offerPlan: string | null
  @Prop({ required: true }) durationMonths: number

  @Prop({ type: Date, required: true }) startDate: Date
  @Prop({ type: Date, required: true }) endDate: Date

  @Prop({ type: String, enum: ['active', 'expired', 'cancelled'], default: 'active', index: true })
  status: SubscriptionStatus

  @Prop({ type: String, enum: ['Complet', 'Partiel'], required: true })
  modality: string

  @Prop({ default: 0 }) paidAmount: number
  @Prop({ default: 0 }) totalAmount: number
  @Prop({ type: String, default: 'F CFA' }) currency: string

  // Suivi paiement partiel
  @Prop({ type: Date, default: null }) nextPaymentDate: Date | null
  @Prop({ default: 0 }) remindersSent: number
  @Prop({ type: Date, default: null }) lastReminderAt: Date | null
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription)
SubscriptionSchema.index({ studentEmail: 1, status: 1 })
SubscriptionSchema.index({ endDate: 1, status: 1 })
SubscriptionSchema.index({ nextPaymentDate: 1, status: 1 })
