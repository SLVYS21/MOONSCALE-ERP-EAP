import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type TypebotFormConfigDocument = TypebotFormConfig & Document

export interface TypebotFieldMapping {
  name?: string
  prenom?: string
  nom?: string
  email?: string
  phone?: string
  age?: string
  pays?: string
  budget?: string
  reseau_source?: string
  motivation?: string
  utm_source?: string
}

@Schema({ timestamps: true })
export class TypebotFormConfig {
  @Prop({ required: true, unique: true, index: true })
  typebot_id: string

  @Prop({ type: String, default: '' })
  typebot_name: string

  // Variable names fetched from Typebot API
  @Prop({ type: [String], default: [] })
  variables: string[]

  // Groq-generated field mapping: lead_field -> typebot_variable_name
  @Prop({ type: Object, default: {} })
  mapping: TypebotFieldMapping

  @Prop({ type: Date, default: null })
  last_synced_at: Date | null
}

export const TypebotFormConfigSchema = SchemaFactory.createForClass(TypebotFormConfig)
