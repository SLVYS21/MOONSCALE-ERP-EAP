import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type PaymentStatus = 'NON TRAITÉ' | 'TRAITÉ' | 'REJETÉ'
export type PaymentModality = 'Complet' | 'Partiel'
export type PaymentProduct = string
export type PaymentCurrency = 'F CFA' | 'FCFA' | 'USD' | 'EURO'
export type PaymentGateway = string
export type CirclePlan = string

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

  @Prop({ type: String, required: true })
  product: PaymentProduct

  @Prop({ type: String, default: null })
  gateway: string | null

  @Prop({ type: String, default: null })
  plan: CirclePlan | null

  @Prop({ default: 0 })
  validityMonths: number

  // Cloudinary URLs des preuves de paiement
  @Prop({ type: [String], default: [] })
  proofImages: string[]

  @Prop({ default: '' })
  notes: string

  // Date réelle du paiement (depuis Airtable DATE DE PAIEMENT ou Tally submittedAt)
  @Prop({ type: Date, default: null })
  paidAt: Date | null

  // Qui a traité ce paiement
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  processedBy: Types.ObjectId | null

  @Prop({ type: Date, default: null })
  processedAt: Date | null

  // Airtable sync
  @Prop({ type: String, default: null })
  airtableId: string | null

  // Source du paiement (tally, chariow, manual)
  @Prop({ type: String, enum: ['tally', 'chariow', 'manual', 'form'], default: 'manual' })
  source: string

  // Identifiant Tally pour déduplication lors de l'import des soumissions
  @Prop({ type: String, default: null })
  tallySubmissionId: string | null

  // Lien vers la réponse formulaire interne dont ce paiement est issu
  @Prop({ type: Types.ObjectId, ref: 'FormResponse', default: null })
  responseId: Types.ObjectId | null

  // OCR des preuves de paiement
  @Prop({ type: String, enum: ['pending', 'done', 'failed', null], default: null })
  ocrStatus: 'pending' | 'done' | 'failed' | null

  @Prop({
    type: [{
      imageUrl: String,
      extractedAmount: { type: Number, default: null },
      extractedCurrency: { type: String, default: null },
      transactionDate: { type: String, default: null },
      transactionId: { type: String, default: null },
      sender: { type: String, default: null },
      paymentService: { type: String, default: null },
      rawText: { type: String, default: '' },
      error: { type: String, default: null },
    }],
    default: [],
  })
  ocrResults: Array<{
    imageUrl: string
    extractedAmount: number | null
    extractedCurrency: string | null
    transactionDate: string | null
    transactionId: string | null
    sender: string | null
    paymentService: string | null
    rawText: string
    error: string | null
  }>
}

export const PaymentSchema = SchemaFactory.createForClass(Payment)
PaymentSchema.index({ studentEmail: 1 })
PaymentSchema.index({ status: 1 })
PaymentSchema.index({ createdAt: -1 })
PaymentSchema.index({ tallySubmissionId: 1 }, { sparse: true })
