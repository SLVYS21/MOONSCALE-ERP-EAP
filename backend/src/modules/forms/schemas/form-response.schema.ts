import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export interface FieldAnswer {
  fieldId: string
  value: unknown
}

export type FormResponseDocument = FormResponse & Document

@Schema({ timestamps: true })
export class FormResponse {
  @Prop({ type: Types.ObjectId, ref: 'Form', required: true, index: true })
  formId: Types.ObjectId

  @Prop({ type: [Object], default: [] })
  answers: FieldAnswer[]

  @Prop({ type: Object, default: {} })
  metadata: { ip?: string; userAgent?: string }
}

export const FormResponseSchema = SchemaFactory.createForClass(FormResponse)
