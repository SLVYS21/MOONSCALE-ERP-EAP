import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type PaymentStatus = 'NON TRAITÉ' | 'TRAITÉ' | 'REJETÉ'
export type PaymentModality = 'Complet' | 'Partiel'
export type PaymentProduct = 'ECOM AFRICA PRO' | 'COACHING' | 'ECOM REVOLUTION'
export type PaymentCurrency = 'F CFA' | 'FCFA' | 'USD' | 'EURO'
export type PaymentGateway = 'FedaPay' | 'Fedapay' | 'Carte Bancaire' | 'Carte Bancaire ' | 'Chariow' | 'Autres' | 'Autres (Paiement Cash, Western Union, MoneyGram, etc.)'
export type CirclePlan = 'Elite' | 'Premium' | 'Standard'

export type PaymentDocument = Payment & Document

@Schema({ timestamps: true })
export class Payment {
  @Prop({ type: Types.ObjectId, ref: 'Student', default: null })
  studentId: Types.ObjectId | null

  // Dénormalisé pour lookup rapide sans jointure
  @Prop({ lowercase: true, trim: true })
  studentEmail: string

  @Prop({ type: String, default: null })
  studentName: string | null

  @Prop({ type: String, enum: ['NON TRAITÉ', 'TRAITÉ', 'REJETÉ'], default: 'NON TRAITÉ' })
  status: PaymentStatus

  @Prop({ type: String, enum: ['Complet', 'Partiel'], required: true })
  modality: PaymentModality

  @Prop({ required: true })
  amount: number

  @Prop({ type: String, enum: ['F CFA', 'FCFA', 'USD', 'EURO'], default: 'F CFA' })
  currency: PaymentCurrency

  @Prop({ type: String, enum: ['ECOM AFRICA PRO', 'COACHING', 'ECOM REVOLUTION'], required: true })
  product: PaymentProduct

  @Prop({ type: String, default: null })
  gateway: string | null

  @Prop({ type: String, enum: ['Elite', 'Premium', 'Standard', null], default: null })
  plan: CirclePlan | null

  @Prop({ default: 0 })
  validityMonths: number

  // Cloudinary URLs des preuves de paiement
  @Prop({ type: [String], default: [] })
  proofImages: string[]

  @Prop({ default: '' })
  notes: string

  // Qui a traité ce paiement
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  processedBy: Types.ObjectId | null

  @Prop({ type: Date, default: null })
  processedAt: Date | null

  // Airtable sync
  @Prop({ type: String, default: null })
  airtableId: string | null

  // Source du paiement (tally, chariow, manual)
  @Prop({ type: String, enum: ['tally', 'chariow', 'manual'], default: 'manual' })
  source: string
}

export const PaymentSchema = SchemaFactory.createForClass(Payment)
PaymentSchema.index({ studentEmail: 1 })
PaymentSchema.index({ status: 1 })
PaymentSchema.index({ createdAt: -1 })
