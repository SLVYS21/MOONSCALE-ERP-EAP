import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type ReminderDocument = Reminder & Document

@Schema()
class ReminderDate {
  @Prop({ type: Date, required: true })
  date: Date

  @Prop({ type: Number, required: true })
  daysBeforePayment: number

  @Prop({ type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' })
  status: 'pending' | 'sent' | 'failed'

  @Prop({ type: Date, default: null })
  sentAt: Date | null
}

@Schema({ timestamps: true })
export class Reminder {
  @Prop({ type: String, required: true, lowercase: true })
  email: string

  @Prop({ type: Types.ObjectId, ref: 'Student', default: null })
  studentId: Types.ObjectId | null

  @Prop({ type: String, enum: ['formation', 'coaching'], required: true })
  type: 'formation' | 'coaching'

  @Prop({ type: Date, required: true })
  paymentDate: Date

  @Prop({ type: [ReminderDate], default: [] })
  reminderDates: ReminderDate[]

  @Prop({ type: String, required: true })
  circlePlanTag: string

  @Prop({ type: String, enum: ['active', 'completed', 'cancelled'], default: 'active' })
  status: 'active' | 'completed' | 'cancelled'

  @Prop({ type: String, default: null })
  studentName: string | null

  @Prop({ type: String, default: null })
  whatsapp: string | null
}

export const ReminderSchema = SchemaFactory.createForClass(Reminder)
ReminderSchema.index({ email: 1, type: 1, status: 1 })
ReminderSchema.index({ 'reminderDates.date': 1, 'reminderDates.status': 1 })
