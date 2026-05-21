import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type CallDocument = Call & Document
export type CallStatus = 'planned' | 'completed' | 'cancelled'

@Schema({ timestamps: true })
export class Call {
  @Prop({ type: Types.ObjectId, ref: 'Lead', required: true })
  lead_id: Types.ObjectId

  @Prop({ type: Date, default: null }) date: Date | null
  @Prop({ type: Number, default: null }) duration: number | null // minutes

  @Prop({ type: String, default: '' }) google_meet_link: string
  @Prop({ type: String, default: '' }) transcript: string
  @Prop({ type: String, default: '' }) ai_summary: string
  @Prop({ type: String, default: '' }) manual_notes: string

  @Prop({ type: String, enum: ['planned', 'completed', 'cancelled'], default: 'planned' })
  status: CallStatus

  @Prop({ type: Types.ObjectId, ref: 'User', default: null }) closer_id: Types.ObjectId | null
  @Prop({ type: Types.ObjectId, ref: 'Offer', default: null }) offer_proposed_id: Types.ObjectId | null
}

export const CallSchema = SchemaFactory.createForClass(Call)
CallSchema.index({ lead_id: 1, createdAt: -1 })
