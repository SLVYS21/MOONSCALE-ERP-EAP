import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type UserRole = 'superadmin' | 'admin' | 'member'

export interface Permissions {
  students: { view: boolean; edit: boolean; delete: boolean }
  finances: { view: boolean; edit: boolean }
  automations: { view: boolean; edit: boolean }
  forms: { view: boolean; edit: boolean }
  team: { view: boolean; manage: boolean }
}

export const DEFAULT_PERMISSIONS: Permissions = {
  students: { view: true, edit: false, delete: false },
  finances: { view: false, edit: false },
  automations: { view: true, edit: false },
  forms: { view: true, edit: false },
  team: { view: true, manage: false },
}

export const ADMIN_PERMISSIONS: Permissions = {
  students: { view: true, edit: true, delete: false },
  finances: { view: true, edit: true },
  automations: { view: true, edit: true },
  forms: { view: true, edit: true },
  team: { view: true, manage: false },
}

export type UserDocument = User & Document

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string

  @Prop({ required: false, select: false })
  password: string

  @Prop({ required: true, trim: true })
  firstName: string

  @Prop({ required: true, trim: true })
  lastName: string

  @Prop({ type: String, enum: ['superadmin', 'admin', 'member'], default: 'member' })
  role: UserRole

  @Prop({ type: Object, default: DEFAULT_PERMISSIONS })
  permissions: Permissions

  @Prop({ default: false })
  isActive: boolean

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  invitedBy: Types.ObjectId | null

  @Prop({ type: String, default: null })
  refreshToken: string | null

  @Prop({ type: Date, default: null })
  lastActivity: Date | null
}

export const UserSchema = SchemaFactory.createForClass(User)
