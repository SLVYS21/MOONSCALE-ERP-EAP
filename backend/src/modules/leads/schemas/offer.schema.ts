import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type OfferDocument = Offer & Document
export type OfferType = 'online' | 'presentiel' | 'one_to_one' | 'bootcamp'

@Schema({ timestamps: true })
export class Offer {
  @Prop({ required: true }) name: string

  @Prop({ type: String, default: '' }) description: string

  @Prop({ type: [String], default: [] }) features: string[]

  @Prop({ type: String, enum: ['online', 'presentiel', 'one_to_one', 'bootcamp'], default: 'online' })
  type: OfferType

  @Prop({ type: Number, default: 0 }) price: number
  @Prop({ type: String, default: 'XOF' }) currency: string
  @Prop({ type: Boolean, default: true }) is_active: boolean
  @Prop({ type: Boolean, default: false }) can_be_coupled: boolean
}

export const OfferSchema = SchemaFactory.createForClass(Offer)
