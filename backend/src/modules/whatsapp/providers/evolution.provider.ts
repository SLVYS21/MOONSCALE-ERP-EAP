import { Injectable, Logger } from '@nestjs/common'
import axios, { type AxiosInstance } from 'axios'
import type { IWhatsAppProvider, OutgoingMessagePayload, ProviderSendResult } from './whatsapp-provider.interface'

@Injectable()
export class EvolutionProvider implements IWhatsAppProvider {
  readonly name = 'evolution'
  private readonly logger = new Logger(EvolutionProvider.name)
  private readonly http: AxiosInstance
  private readonly instance: string

  constructor() {
    const baseURL = process.env.EVOLUTION_API_URL
    const apiKey = process.env.EVOLUTION_API_KEY
    this.instance = process.env.EVOLUTION_INSTANCE ?? 'default'

    if (!baseURL || !apiKey) {
      this.logger.warn('Evolution API not configured (set EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE). send() will throw.')
    }

    this.http = axios.create({
      baseURL,
      headers: apiKey ? { apikey: apiKey } : {},
      timeout: 15000,
    })
  }

  async send(payload: OutgoingMessagePayload): Promise<ProviderSendResult> {
    if (!this.http.defaults.baseURL) {
      throw new Error('Evolution API not configured')
    }

    const number = payload.to.replace(/^\+/, '')

    let endpoint = `/message/sendText/${this.instance}`
    let body: Record<string, unknown> = { number, text: payload.text ?? '' }

    if (payload.mediaUrl && payload.mediaType) {
      endpoint = `/message/sendMedia/${this.instance}`
      body = {
        number,
        mediatype: payload.mediaType,
        media: payload.mediaUrl,
        caption: payload.text ?? '',
        fileName: payload.mediaName ?? undefined,
      }
    }

    const res = await this.http.post(endpoint, body)
    return {
      providerMessageId: (res.data?.key?.id as string) ?? null,
      acceptedAt: new Date(),
    }
  }
}
