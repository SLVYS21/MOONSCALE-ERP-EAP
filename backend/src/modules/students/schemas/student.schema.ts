import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type StudentDocument = Student & Document

export type DebtStatus = 'ok' | 'potential' | 'confirmed'

@Schema({ _id: true })
class SuccessProof {
  @Prop({ required: true }) url: string
  @Prop({ type: String, enum: ['image', 'video', 'link'], default: 'image' }) type: string
  @Prop({ default: '' }) caption: string
  @Prop({ type: Types.ObjectId, ref: 'User', default: null }) addedBy: Types.ObjectId | null
  @Prop({ type: Date, default: () => new Date() }) createdAt: Date
}
const SuccessProofSchema = SchemaFactory.createForClass(SuccessProof)

@Schema({ timestamps: true })
export class Student {
  @Prop({ required: true })
  name: string

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string

  @Prop({ type: String, default: null })
  whatsapp: string | null

  @Prop({ type: String, default: null })
  occupation: string | null

  @Prop({ type: String, default: null })
  source: string | null

  @Prop({ type: String, enum: ['EXACTE', 'ERRONÉE', 'NON VÉRIFIÉ'], default: 'NON VÉRIFIÉ' })
  infoStatus: string

  @Prop({ type: String, default: '' })
  notes: string

  // ── Circle enrichment ─────────────────────────────────────────────
  @Prop({ type: Number, default: null })
  circleId: number | null

  @Prop({ type: Date, default: null })
  circleJoinedAt: Date | null

  @Prop({ type: Date, default: null })
  circleAcceptedAt: Date | null

  @Prop({ type: [{ id: Number, name: String }], default: [] })
  circleTags: { id: number; name: string }[]

  @Prop({ type: Boolean, default: null })
  circleIsActive: boolean | null

  @Prop({ type: Date, default: null })
  circleLastSync: Date | null

  @Prop({type: String, default: ''})
  circleProfile: string | null

  // ── Debt tracking ─────────────────────────────────────────────────
  @Prop({ type: String, enum: ['ok', 'potential', 'confirmed'], default: 'ok' })
  debtStatus: DebtStatus

  @Prop({ type: Date, default: null })
  debtSince: Date | null

  // ── Success proofs (preuves de réussite) ──────────────────────────
  @Prop({ type: [SuccessProofSchema], default: [] })
  successProofs: SuccessProof[]

  // ── Airtable sync ─────────────────────────────────────────────────
  @Prop({ type: String, default: null })
  airtableId: string | null

  @Prop({ type: String, default: null })
  airtableEtudiantId: string | null
}

export const StudentSchema = SchemaFactory.createForClass(Student)
StudentSchema.index({ email: 1 })
StudentSchema.index({ debtStatus: 1 })
