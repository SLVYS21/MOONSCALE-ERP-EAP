import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type AppSettingsDocument = AppSettings & Document

@Schema({ timestamps: true })
export class AppSettings {
  @Prop({
    type: [String],
    default: ['Formations Gratuite', 'Ressources Gratuite', 'Webinaires', 'Challenges'],
  })
  lead_magnets: string[]

  @Prop({
    type: [String],
    default: ['YouTube', 'TikTok', 'Facebook', 'Instagram'],
  })
  lead_sources: string[]
}

export const AppSettingsSchema = SchemaFactory.createForClass(AppSettings)
