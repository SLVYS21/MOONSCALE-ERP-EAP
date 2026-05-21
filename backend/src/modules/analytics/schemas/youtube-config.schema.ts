import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type YouTubeConfigDocument = YouTubeConfig & Document

// Singleton — always query with findOne()
@Schema({ timestamps: true })
export class YouTubeConfig {
  @Prop({ type: String, default: '' }) channel_id: string
  @Prop({ type: String, default: '' }) refresh_token: string
  @Prop({ type: Date, default: null }) last_synced: Date | null
  @Prop({ type: Date, default: null }) last_meta_synced: Date | null
}

export const YouTubeConfigSchema = SchemaFactory.createForClass(YouTubeConfig)
