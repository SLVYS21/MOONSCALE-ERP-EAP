import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type TaskDocument = Task & Document

export class ChecklistItem {
  text: string
  done: boolean
}

export class TaskComment {
  text: string
  authorId: Types.ObjectId
  createdAt: Date
}

@Schema({ timestamps: true })
export class Task {
  @Prop({ required: true })
  title: string

  @Prop({ default: '' })
  description: string

  @Prop({ type: Types.ObjectId, ref: 'Project', default: null })
  projectId: Types.ObjectId | null

  @Prop({
    type: String,
    enum: ['backlog', 'todo', 'in_progress', 'review', 'done'],
    default: 'todo',
  })
  status: string

  @Prop({
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  })
  priority: string

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  assignedTo: Types.ObjectId | null

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId

  @Prop({ type: Date, default: null })
  dueDate: Date | null

  @Prop({ type: [String], default: [] })
  tags: string[]

  @Prop({
    type: [{ text: String, done: { type: Boolean, default: false } }],
    default: [],
  })
  checklist: ChecklistItem[]

  @Prop({
    type: [{ text: String, authorId: Types.ObjectId, createdAt: { type: Date, default: Date.now } }],
    default: [],
  })
  comments: TaskComment[]

  @Prop({ default: 0 })
  order: number
}

export const TaskSchema = SchemaFactory.createForClass(Task)
TaskSchema.index({ projectId: 1, status: 1 })
TaskSchema.index({ assignedTo: 1, status: 1 })
TaskSchema.index({ dueDate: 1 })
