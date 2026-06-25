import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type AssistantConfigDocument = AssistantConfig & Document

export type LlmProviderName = 'groq' | 'gemini' | 'anthropic'

@Schema({ _id: false })
class BusinessHours {
  @Prop({ type: Boolean, default: false }) enabled: boolean
  @Prop({ type: String, default: '09:00' }) startTime: string
  @Prop({ type: String, default: '18:00' }) endTime: string
  @Prop({ type: [Number], default: [1, 2, 3, 4, 5] }) days: number[]
  @Prop({ type: Boolean, default: false }) aiOffDuringHours: boolean
}

@Schema({ _id: false })
class ProviderChoice {
  @Prop({ type: String, enum: ['groq', 'gemini', 'anthropic'], required: true }) provider: LlmProviderName
  @Prop({ type: String, required: true }) model: string
}

@Schema({ timestamps: true, collection: 'assistant_config' })
export class AssistantConfig {
  @Prop({ type: String, default: 'default', unique: true })
  key: string

  @Prop({ type: Boolean, default: false })
  aiMasterEnabled: boolean

  @Prop({ type: String, default: '' })
  systemPrompt: string

  @Prop({ type: ProviderChoice, required: true })
  primary: ProviderChoice

  @Prop({ type: ProviderChoice, default: null })
  fallback: ProviderChoice | null

  @Prop({ type: Number, default: 0.7 })
  temperature: number

  @Prop({ type: Number, default: 600 })
  maxTokens: number

  @Prop({ type: [String], default: ['fr', 'en'] })
  languages: string[]

  @Prop({ type: BusinessHours, default: () => ({}) })
  businessHours: BusinessHours

  @Prop({ type: Number, default: 16 })
  contextWindow: number
}

export const AssistantConfigSchema = SchemaFactory.createForClass(AssistantConfig)
