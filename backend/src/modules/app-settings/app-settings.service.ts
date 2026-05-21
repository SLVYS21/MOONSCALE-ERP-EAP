import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { AppSettings, AppSettingsDocument } from './app-settings.schema'

@Injectable()
export class AppSettingsService {
  constructor(
    @InjectModel(AppSettings.name) private model: Model<AppSettingsDocument>,
  ) {}

  async get(): Promise<AppSettingsDocument> {
    let doc = await this.model.findOne()
    if (!doc) doc = await this.model.create({})
    return doc
  }

  async update(dto: { lead_magnets?: string[]; lead_sources?: string[] }): Promise<AppSettingsDocument> {
    let doc = await this.model.findOne()
    if (!doc) doc = await this.model.create({})
    if (dto.lead_magnets !== undefined) doc.lead_magnets = dto.lead_magnets
    if (dto.lead_sources !== undefined) doc.lead_sources = dto.lead_sources
    return doc.save()
  }
}
