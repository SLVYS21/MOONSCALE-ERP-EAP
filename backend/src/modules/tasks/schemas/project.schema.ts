import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type ProjectDocument = Project & Document

@Schema({ timestamps: true })
export class Project {
  @Prop({ required: true })
  title: string

  @Prop({ default: '' })
  description: string

  @Prop({ default: '#6366f1' })
  color: string

  @Prop({ default: '📁' })
  icon: string

  @Prop({ type: String, enum: ['active', 'completed', 'archived'], default: 'active' })
  status: string

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  memberIds: Types.ObjectId[]

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId

  @Prop({ type: Date, default: null })
  deadline: Date | null
}

export const ProjectSchema = SchemaFactory.createForClass(Project)
ProjectSchema.index({ status: 1 })
ProjectSchema.index({ memberIds: 1 })
