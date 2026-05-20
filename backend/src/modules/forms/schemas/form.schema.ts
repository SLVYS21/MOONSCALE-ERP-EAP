import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type FieldType =
  | 'short_text' | 'long_text' | 'email' | 'number' | 'phone'
  | 'select' | 'radio' | 'checkbox' | 'date' | 'rating' | 'file'
  | 'heading' | 'paragraph'

export type ConditionOperator =
  | 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'is_empty' | 'is_not_empty'

export interface FieldCondition {
  fieldId: string
  operator: ConditionOperator
  value?: string
}

export interface FormField {
  id: string
  type: FieldType
  label: string
  placeholder?: string
  required: boolean
  options?: string[]
  content?: string
  validation?: { min?: number; max?: number }
  // file-specific
  accept?: string     // e.g. 'image/*', 'application/pdf', '*'
  maxFiles?: number
  // conditional logic
  condition?: FieldCondition | null
  order: number
}

export interface FormSettings {
  submitMessage: string
  redirectUrl?: string
  allowMultipleSubmissions: boolean
  notifyEmail?: string
}

export type FormDocument = Form & Document

@Schema({ timestamps: true })
export class Form {
  @Prop({ required: true })
  title: string

  @Prop({ default: '' })
  description: string

  @Prop({ required: true, unique: true, index: true })
  slug: string

  @Prop({ type: [Object], default: [] })
  fields: FormField[]

  @Prop({
    type: Object,
    default: () => ({ submitMessage: 'Merci pour votre réponse !', allowMultipleSubmissions: true }),
  })
  settings: FormSettings

  @Prop({ default: false })
  isPublished: boolean

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId
}

export const FormSchema = SchemaFactory.createForClass(Form)
