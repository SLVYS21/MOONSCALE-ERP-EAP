import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export interface RunLog {
  stepId: string
  stepName: string
  status: 'ok' | 'error' | 'skipped'
  message: string
  timestamp: Date
}

export type AutomationRunDocument = AutomationRun & Document

@Schema({ timestamps: true })
export class AutomationRun {
  @Prop({ type: Types.ObjectId, ref: 'Automation', required: true, index: true })
  automationId: Types.ObjectId

  @Prop({ type: String, required: true })
  triggerType: string

  @Prop({ default: 'running' })
  status: 'running' | 'completed' | 'failed'

  @Prop({ type: [Object], default: [] })
  logs: RunLog[]

  @Prop({ type: Object, default: {} })
  context: Record<string, unknown>

  @Prop({ type: Date, default: null })
  completedAt: Date | null

  @Prop({ type: String, default: null })
  error: string | null
}

export const AutomationRunSchema = SchemaFactory.createForClass(AutomationRun)
