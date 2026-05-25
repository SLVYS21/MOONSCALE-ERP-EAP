import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

// ── Plan sub-document ─────────────────────────────────────────────────────────

@Schema({ _id: true })
export class OfferPlan {
  @Prop({ required: true, trim: true })
  name: string

  @Prop({ required: true, min: 1 })
  durationMonths: number

  @Prop({ default: 0, min: 0 })
  price: number

  @Prop({ type: String, enum: ['F CFA', 'USD', 'EURO'], default: 'F CFA' })
  currency: string

  @Prop({ default: 30, min: 1 })
  partialDueAfterDays: number

  @Prop({ default: true })
  isActive: boolean
}

export const OfferPlanSchema = SchemaFactory.createForClass(OfferPlan)

// ── Offer ─────────────────────────────────────────────────────────────────────

export type OfferDocument = Offer & Document

@Schema({ timestamps: true })
export class Offer {
  @Prop({ type: String, required: true, trim: true })
  name: string

  @Prop({ type: [OfferPlanSchema], default: [] })
  plans: OfferPlan[]

  @Prop({ default: true })
  isActive: boolean

  @Prop({ default: '' })
  description: string

  @Prop({ type: [String], default: [] })
  features: string[]
}

export const OfferSchema = SchemaFactory.createForClass(Offer)
OfferSchema.index({ product: 1, isActive: 1 })
