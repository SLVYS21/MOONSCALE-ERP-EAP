import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type LeadDocument = Lead & Document

export type PipelineStatus =
  | 'nouveau'
  | 'mql'
  | 'sql'
  | 'rdv_programme'
  | 'appel_diagnostic'
  | 'won'
  | 'lost'
  | 'nurturing'

export type QualificationStatus = 'mql' | 'sql' | 'non_qualifie'

export type LeadSourceType =
  | 'typebot'
  | 'meta_ads'
  | 'whatsapp_tracked'
  | 'whatsapp_direct'
  | 'manual'
  | 'import'

@Schema({ timestamps: true })
export class Lead {
  @Prop({ required: true }) name: string

  @Prop({ type: String, default: null, lowercase: true, trim: true })
  email: string | null

  @Prop({ type: String, default: null }) phone: string | null
  @Prop({ type: Number, default: null }) age: number | null

  @Prop({ type: String, default: null }) utm_source: string | null
  @Prop({ type: String, default: null }) reseau_source: string | null
  @Prop({ type: String, default: null }) lead_magnet: string | null
  @Prop({ type: String, default: '' }) motivation: string

  @Prop({ type: Object, default: {} })
  dynamic_fields: Record<string, unknown>

  @Prop({
    type: String,
    enum: ['typebot', 'meta_ads', 'whatsapp_tracked', 'whatsapp_direct', 'manual', 'import'],
    default: 'manual',
  })
  source_type: LeadSourceType

  @Prop({ type: String, enum: ['mql', 'sql', 'non_qualifie', null], default: null })
  qualification_status: QualificationStatus | null

  @Prop({ type: Number, default: 0 }) qualification_score: number

  @Prop({
    type: String,
    enum: ['nouveau', 'mql', 'sql', 'rdv_programme', 'appel_diagnostic', 'won', 'lost', 'nurturing'],
    default: 'nouveau',
  })
  pipeline_status: PipelineStatus

  @Prop({ type: Types.ObjectId, ref: 'User', default: null }) closer_id: Types.ObjectId | null
  @Prop({ type: String, default: '' }) lost_reason: string

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Offer' }], default: [] })
  offer_ids: Types.ObjectId[]

  @Prop({ type: Number, default: null }) opportunity_amount: number | null
  @Prop({ type: String, default: '' }) notes: string

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  created_by: Types.ObjectId | null

  @Prop({ type: String, default: null }) student_id: string | null
  @Prop({ type: String, default: null, index: true }) typebot_result_id: string | null

  @Prop({
    type: [{
      _id: false,
      type:     { type: String, required: true },
      message:  { type: String, default: '' },
      date:     { type: Date,   default: () => new Date() },
      actor_id: { type: String, default: null },
    }],
    default: [],
  })
  events: Array<{ type: string; message: string; date: Date; actor_id?: string | null }>
}

export const LeadSchema = SchemaFactory.createForClass(Lead)

LeadSchema.index({ pipeline_status: 1 })
LeadSchema.index({ qualification_status: 1 })
LeadSchema.index({ closer_id: 1 })
LeadSchema.index({ utm_source: 1 })
LeadSchema.index({ email: 1 })
LeadSchema.index({ createdAt: -1 })
