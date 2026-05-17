import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type CategoryDocument = Category & Document

@Schema({ timestamps: true })
export class Category {
  @Prop({ type: String, required: true })
  name: string

  @Prop({ type: String, enum: ['income', 'expense', 'both'], default: 'both' })
  type: string

  @Prop({ default: '#6366f1' })
  color: string

  @Prop({ default: '💰' })
  icon: string
}

export const CategorySchema = SchemaFactory.createForClass(Category)
CategorySchema.index({ type: 1 })
