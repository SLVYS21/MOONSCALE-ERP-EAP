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

  @Prop({ type: [String], default: [] })
  custom_gateways: string[]

  @Prop({ default: '' })
  callBookingUrl: string

  @Prop({
    type: Map,
    of: Number,
    default: { XOF: 1, EUR: 655.957, USD: 610, MAD: 63.5, CAD: 450 },
  })
  exchangeRates: Map<string, number>
}

export const AppSettingsSchema = SchemaFactory.createForClass(AppSettings)
