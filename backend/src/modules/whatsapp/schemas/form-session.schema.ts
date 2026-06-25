import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type FormSessionDocument = FormSession & Document
export type FormSessionStatus = 'active' | 'completed' | 'abandoned'

@Schema({ timestamps: true })
export class FormSession {
  @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true, index: true })
  conversationId: Types.ObjectId

  @Prop({ required: true })
  formKey: string

  @Prop({ type: Number, default: 0 })
  currentStepIdx: number

  @Prop({ type: Object, default: {} })
  answers: Record<string, string>

  @Prop({ type: Object, default: {} })
  prefilled: Record<string, string>

  @Prop({ type: String, enum: ['active', 'completed', 'abandoned'], default: 'active', index: true })
  status: FormSessionStatus

  @Prop({ type: Date, default: null })
  completedAt: Date | null
}

export const FormSessionSchema = SchemaFactory.createForClass(FormSession)
FormSessionSchema.index({ conversationId: 1, status: 1 })
