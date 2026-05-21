import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type TriggerType =
  | 'form_submitted'
  | 'payment_created'
  | 'payment_treated'
  | 'student_created'
  | 'manual'
  | 'incoming_webhook'
  | 'reminder_due'
  | 'debt_detected'
  | 'lead_created'
  | 'lead_stage_changed'
  | 'lead_won'
  | 'call_completed'

export type StepType =
  | 'send_email'
  | 'http_request'
  | 'wait'
  | 'condition'
  | 'notify_team'
  | 'add_note'
  | 'update_student'
  | 'create_task'

export interface AutomationTrigger {
  type: TriggerType
  config: {
    formId?: string      // for form_submitted
    webhookKey?: string  // for incoming_webhook (auto-generated UUID)
  }
}

export interface AutomationStep {
  id: string
  type: StepType
  name?: string
  config: {
    // send_email
    to?: string
    subject?: string
    body?: string       // HTML, supports {{variable}} interpolation
    // http_request
    url?: string
    method?: string
    headers?: { key: string; value: string }[]
    requestBody?: string  // JSON template
    // wait
    duration?: number
    unit?: 'seconds' | 'minutes' | 'hours'
    // condition (gate — stops execution if condition is false)
    field?: string      // dot-path e.g. "student.email"
    operator?: string
    value?: string
    // notify_team
    recipients?: string     // 'all_admins' or comma-separated emails
    // add_note
    note?: string           // note content, supports {{interpolation}}
    // update_student
    studentField?: string   // field name to update (e.g. 'infoStatus')
    studentValue?: string   // new value, supports interpolation
    // create_task
    taskTitle?: string
    taskDescription?: string
    taskPriority?: string   // 'low' | 'medium' | 'high' | 'urgent'
  }
}

export type AutomationDocument = Automation & Document

@Schema({ timestamps: true })
export class Automation {
  @Prop({ type: String, required: true })
  name: string

  @Prop({ type: String, default: '' })
  description: string

  @Prop({ default: false })
  isActive: boolean

  @Prop({ type: Object, required: true })
  trigger: AutomationTrigger

  @Prop({ type: [Object], default: [] })
  steps: AutomationStep[]

  @Prop({ default: 0 })
  runCount: number

  @Prop({ type: Date, default: null })
  lastRunAt: Date | null

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId
}

export const AutomationSchema = SchemaFactory.createForClass(Automation)
