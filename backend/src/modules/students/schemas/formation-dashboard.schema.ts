import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type FormationDashboardDocument = FormationDashboard & Document

type FollowUpStatus = 'EN RÈGLE' | 'RELANCE 1' | 'RELANCE 2' | 'RELANCE 3'
type DashboardAction = 'RETIRER' | 'INTÉGRER' | '🤖 RETRAIT EFFECTUÉ' | '🤖 INTÉGRÉ'

@Schema({ timestamps: true })
export class FormationDashboard {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId

  @Prop({ type: Number, default: null })
  circleId: number | null

  @Prop({ type: String, enum: ['Partiel', 'Complet'] })
  paymentModality: string

  @Prop({ type: String, enum: ['EN RÈGLE', 'EN RETARD'], default: 'EN RÈGLE' })
  paymentStatus: string

  @Prop({ type: Date, default: null })
  nextPaymentDate: Date | null

  @Prop({
    type: String,
    enum: ['EN RÈGLE', 'RELANCE 1', 'RELANCE 2', 'RELANCE 3'],
    default: 'EN RÈGLE',
  })
  autoFollowUpStatus: FollowUpStatus

  @Prop({
    type: String,
    enum: ['EN RÈGLE', 'RELANCE 1', 'RELANCE 2', 'RELANCE 3'],
    default: 'EN RÈGLE',
  })
  manualFollowUpStatus: FollowUpStatus

  @Prop({
    type: String,
    enum: ['RETIRER', 'INTÉGRER', '🤖 RETRAIT EFFECTUÉ', '🤖 INTÉGRÉ'],
    default: '🤖 INTÉGRÉ',
  })
  action: DashboardAction

  @Prop({ default: '' })
  notes: string

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Payment' }], default: [] })
  paymentIds: Types.ObjectId[]

  // Airtable sync
  @Prop({ type: String, default: null })
  airtableId: string | null
}

export const FormationDashboardSchema = SchemaFactory.createForClass(FormationDashboard)
FormationDashboardSchema.index({ studentId: 1 }, { unique: true })
