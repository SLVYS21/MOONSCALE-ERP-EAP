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
  | 'cron_schedule'
  | 'subscription_created'
  | 'subscription_expiring'
  | 'partial_payment_due'
  | 'audience_based'

export type StepType =
  | 'send_email'
  | 'http_request'
  | 'wait'
  | 'condition'
  | 'notify_team'
  | 'add_note'
  | 'update_student'
  | 'create_task'
  | 'create_payment'
  | 'create_student'
  | 'circle_invite'
  | 'circle_tag_add'
  | 'circle_tag_remove'
  | 'create_subscription'

export interface AudienceFilter {
  field: string
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'is_empty' | 'is_not_empty' | 'gt' | 'lt'
  value?: string
}

export interface AudienceConfig {
  entity: 'student' | 'payment'
  filters: AudienceFilter[]
}

export interface AutomationTrigger {
  type: TriggerType
  config: {
    formId?: string        // for form_submitted
    webhookKey?: string    // for incoming_webhook (auto-generated UUID)
    schedulePreset?: string // for cron_schedule
    audience?: AudienceConfig // for audience_based
  }
}

export interface StepCondition {
  field: string      // dot-path in context, e.g. "student.debtStatus"
  operator: string   // equals | not_equals | contains | not_contains | is_empty | is_not_empty | gt | lt
  value: string      // comparison value (ignored for is_empty / is_not_empty)
}

export interface AutomationStep {
  id: string
  type: StepType
  name?: string
  conditions?: StepCondition[]  // ALL must pass — step is skipped (not aborted) if any fails
  config: {
    // send_email
    to?: string
    subject?: string
    body?: string
    // http_request
    url?: string
    method?: string
    headers?: { key: string; value: string }[]
    requestBody?: string
    // wait
    duration?: number
    unit?: 'seconds' | 'minutes' | 'hours'
    // condition
    field?: string
    operator?: string
    value?: string
    // notify_team
    recipients?: string
    // add_note
    note?: string
    // update_student
    studentField?: string
    studentValue?: string
    // create_task
    taskTitle?: string
    taskDescription?: string
    taskPriority?: string
    // create_payment / create_student / circle_*
    // Expressions : valeurs statiques ou {{interpolation}}
    emailExpr?: string
    nameExpr?: string
    whatsappExpr?: string
    amountExpr?: string
    currency?: string
    product?: string
    modality?: string
    gateway?: string
    plan?: string
    // circle_tag_add / circle_tag_remove
    circleTagId?: number    // ID du tag Circle (depuis l'API — stable)
    circleTagName?: string  // Nom affiché (peut changer)
    circlePlanKey?: string  // Legacy — clé CIRCLE_PLANS hardcodée
    // create_subscription
    matchMode?: 'auto' | 'manual'  // auto = match by payment.product+plan, manual = explicit ids
    offerId?: string
    planName?: string
    // send_email block editor
    blocks?: unknown[]
    // circle_tag_add / circle_tag_remove (shorthand)
    tag?: string
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
