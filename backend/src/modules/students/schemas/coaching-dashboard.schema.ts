import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type CoachingDashboardDocument = CoachingDashboard & Document

@Schema({ timestamps: true })
export class CoachingDashboard {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId

  @Prop({ type: Number, default: null })
  circleId: number | null

  @Prop({ type: Boolean, default: true })
  messagingEnabled: boolean

  @Prop({ type: Date, default: null })
  paymentDate: Date | null

  @Prop({ type: Date, default: null })
  nextPaymentDate: Date | null

  @Prop({
    type: String,
    enum: ['RETIRER', 'INTÉGRER', '🤖 RETRAIT EFFECTUÉ', '🤖 INTÉGRÉ'],
    default: '🤖 INTÉGRÉ',
  })
  action: string

  @Prop({ type: String, enum: ['EN REGLE', 'EN RETARD'], default: 'EN REGLE' })
  paymentStatus: string

  @Prop({
    type: String,
    enum: ['EN RÈGLE', 'RELANCE 1', 'RELANCE 2'],
    default: 'EN RÈGLE',
  })
  autoFollowUpStatus: string

  @Prop({
    type: String,
    enum: ['EN RÈGLE', 'RELANCE 1', 'RELANCE 2'],
    default: 'EN RÈGLE',
  })
  manualFollowUpStatus: string

  @Prop({ default: '' })
  followUpNote: string

  // Plans Circle actifs sur ce membre
  @Prop({ type: [String], default: [] })
  tags: string[]

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Payment' }], default: [] })
  paymentIds: Types.ObjectId[]

  // Airtable sync
  @Prop({ type: String, default: null })
  airtableId: string | null
}

export const CoachingDashboardSchema = SchemaFactory.createForClass(CoachingDashboard)
CoachingDashboardSchema.index({ studentId: 1 }, { unique: true })
