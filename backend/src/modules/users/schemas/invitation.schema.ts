import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type InvitationDocument = Invitation & Document

@Schema({ timestamps: true })
export class Invitation {
  @Prop({ required: true, lowercase: true })
  email: string

  @Prop({ required: true, unique: true })
  token: string

  @Prop({ type: String, enum: ['admin', 'member'], default: 'member' })
  role: 'admin' | 'member'

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  invitedBy: Types.ObjectId

  @Prop({ required: true })
  expiresAt: Date

  @Prop({ default: false })
  used: boolean
}

export const InvitationSchema = SchemaFactory.createForClass(Invitation)
