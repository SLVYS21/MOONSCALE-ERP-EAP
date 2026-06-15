import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type ScoringConfigDocument = ScoringConfig & Document

// Singleton document — always query with findOne(), create if missing
@Schema()
export class ScoringConfig {
  // Legacy thresholds — utilisés par l'ancien scoring générique
  @Prop({ type: Number, default: 20 }) mql_threshold: number
  @Prop({ type: Number, default: 50 }) sql_threshold: number

  // Seuils EAP (scoreEapLead) — qualifient le tier final du lead
  @Prop({ type: Number, default: 220 }) eap_hot_a_threshold: number
  @Prop({ type: Number, default: 150 }) eap_hot_b_threshold: number
  @Prop({ type: Number, default: 90 })  eap_warm_threshold: number
  @Prop({ type: Number, default: 50 })  eap_cold_threshold: number
}

export const ScoringConfigSchema = SchemaFactory.createForClass(ScoringConfig)
