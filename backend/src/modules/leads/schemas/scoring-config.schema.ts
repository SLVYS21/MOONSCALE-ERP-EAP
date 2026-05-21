import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type ScoringConfigDocument = ScoringConfig & Document

// Singleton document — always query with findOne(), create if missing
@Schema()
export class ScoringConfig {
  @Prop({ type: Number, default: 20 }) mql_threshold: number
  @Prop({ type: Number, default: 50 }) sql_threshold: number
}

export const ScoringConfigSchema = SchemaFactory.createForClass(ScoringConfig)
