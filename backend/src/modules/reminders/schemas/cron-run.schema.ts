import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type ReminderCronRunDocument = ReminderCronRun & Document

@Schema({ _id: false })
class CronRunEntry {
  @Prop({ type: String, required: true }) email: string
  @Prop({ type: String, default: null }) studentName: string | null
  @Prop({ type: String, required: true }) type: string
  @Prop({ type: Number, required: true }) daysBeforePayment: number
  @Prop({ type: String, enum: ['sent', 'failed'], required: true }) status: 'sent' | 'failed'
  @Prop({ type: Boolean, default: false }) restricted: boolean
  @Prop({ type: String, default: null }) error: string | null
}

@Schema({ timestamps: true })
export class ReminderCronRun {
  @Prop({ type: Date, required: true })
  runAt: Date

  @Prop({ type: Number, default: 0 })
  durationMs: number

  @Prop({ type: Number, default: 0 })
  totalReminders: number

  @Prop({ type: Number, default: 0 })
  emailsSent: number

  @Prop({ type: Number, default: 0 })
  emailsFailed: number

  @Prop({ type: Number, default: 0 })
  accessRestricted: number

  @Prop({ type: String, default: null })
  fatalError: string | null

  @Prop({ type: [CronRunEntry], default: [] })
  entries: CronRunEntry[]
}

export const ReminderCronRunSchema = SchemaFactory.createForClass(ReminderCronRun)
ReminderCronRunSchema.index({ runAt: -1 })
