import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type ScoringRuleDocument = ScoringRule & Document

export type ScoringOperator = 'equals' | 'contains' | 'not_null' | 'is_empty'

@Schema({ timestamps: true })
export class ScoringRule {
  @Prop({ required: true }) name: string
  @Prop({ type: String, default: '' }) description: string

  // e.g. 'source_type', 'utm_source', 'motivation'
  @Prop({ required: true }) condition_field: string

  @Prop({ type: String, enum: ['equals', 'contains', 'not_null', 'is_empty'], required: true })
  condition_operator: ScoringOperator

  @Prop({ type: String, default: '' }) condition_value: string

  @Prop({ type: Number, required: true }) points: number
  @Prop({ type: Boolean, default: true }) is_active: boolean
}

export const ScoringRuleSchema = SchemaFactory.createForClass(ScoringRule)
