import { Injectable, OnModuleInit, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { AssistantConfig, AssistantConfigDocument } from './schemas/assistant-config.schema'
import { DEFAULT_PERSONA_PROMPT } from './persona'

@Injectable()
export class AssistantService implements OnModuleInit {
  private readonly logger = new Logger(AssistantService.name)
  private cached: AssistantConfigDocument | null = null

  constructor(@InjectModel(AssistantConfig.name) private readonly model: Model<AssistantConfigDocument>) {}

  async onModuleInit() {
    await this.ensureDefault()
  }

  private async ensureDefault() {
    const existing = await this.model.findOne({ key: 'default' })
    if (existing) {
      const decommissioned = ['qwen-2.5-32b', 'qwen-2.5-72b', 'qwen-qwq-32b']
      let mutated = false
      if (existing.primary?.provider === 'groq' && decommissioned.includes(existing.primary.model)) {
        existing.primary = { provider: 'groq', model: 'llama-3.3-70b-versatile' }
        mutated = true
      }
      if (existing.fallback?.provider === 'groq' && decommissioned.includes(existing.fallback.model)) {
        existing.fallback = { provider: 'groq', model: 'llama-3.3-70b-versatile' }
        mutated = true
      }
      if (mutated) {
        await existing.save()
        this.logger.log('AssistantConfig migrated off decommissioned Groq Qwen model → llama-3.3-70b-versatile')
      }
      this.cached = existing
      return
    }
    const created = await this.model.create({
      key: 'default',
      aiMasterEnabled: false,
      systemPrompt: DEFAULT_PERSONA_PROMPT,
      primary: { provider: 'groq', model: 'llama-3.3-70b-versatile' },
      fallback: null,
      temperature: 0.7,
      maxTokens: 600,
      languages: ['fr', 'en'],
      contextWindow: 16,
    })
    this.cached = created
    this.logger.log('AssistantConfig (default) initialized')
  }

  async getConfig(): Promise<AssistantConfigDocument> {
    if (this.cached) return this.cached
    const found = await this.model.findOne({ key: 'default' })
    if (!found) {
      await this.ensureDefault()
      return this.cached!
    }
    this.cached = found
    return found
  }

  async updateConfig(patch: Partial<AssistantConfig>): Promise<AssistantConfigDocument> {
    const updated = await this.model.findOneAndUpdate({ key: 'default' }, { $set: patch }, { new: true, upsert: true })
    this.cached = updated
    return updated!
  }

  isWithinBusinessHours(date: Date = new Date()): boolean {
    if (!this.cached?.businessHours?.enabled) return false
    const { startTime, endTime, days } = this.cached.businessHours
    if (!days.includes(date.getDay())) return false
    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)
    const minutes = date.getHours() * 60 + date.getMinutes()
    return minutes >= sh * 60 + sm && minutes < eh * 60 + em
  }

  shouldAiAnswer(date: Date = new Date()): boolean {
    if (!this.cached?.aiMasterEnabled) return false
    if (this.cached.businessHours?.enabled && this.cached.businessHours?.aiOffDuringHours && this.isWithinBusinessHours(date)) {
      return false
    }
    return true
  }
}
