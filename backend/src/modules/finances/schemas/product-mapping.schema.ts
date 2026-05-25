import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type ProductMappingDocument = ProductMapping & Document

@Schema({ timestamps: true })
export class ProductMapping {
  @Prop({ type: String, required: true, unique: true, trim: true })
  productName: string

  @Prop({ type: String, required: true })
  gateway: string // first gateway that reported this product

  @Prop({ type: String, enum: ['pending', 'confirmed', 'ignored'], default: 'pending' })
  status: string

  // Confirmed offer link (set by admin)
  @Prop({ type: Types.ObjectId, ref: 'Offer', default: null }) offerId: Types.ObjectId | null
  @Prop({ type: String, default: null }) offerName: string | null

  // Groq suggestion (auto-generated on first detection)
  @Prop({ type: Types.ObjectId, ref: 'Offer', default: null }) suggestedOfferId: Types.ObjectId | null
  @Prop({ type: String, default: null }) suggestedOfferName: string | null
  @Prop({ type: String, default: null }) groqReasoning: string | null

  @Prop({ type: Number, default: 1 }) seenCount: number
  @Prop({ type: Date, default: () => new Date() }) firstSeenAt: Date
  @Prop({ type: Date, default: () => new Date() }) lastSeenAt: Date
}

export const ProductMappingSchema = SchemaFactory.createForClass(ProductMapping)
ProductMappingSchema.index({ productName: 1 }, { unique: true })
ProductMappingSchema.index({ status: 1 })
