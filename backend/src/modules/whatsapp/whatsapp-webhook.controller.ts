import { Controller, Post, Body, Logger, HttpCode, HttpStatus } from '@nestjs/common'
import { WhatsAppService } from './whatsapp.service'
import type { IncomingMessageEvent, WhatsAppMediaType } from './providers/whatsapp-provider.interface'

/**
 * Webhook entry point for Evolution API v2.
 * Mounted at POST /api/webhooks/whatsapp (registered via global prefix).
 *
 * Evolution v2 sends events with shape:
 *   { event: 'messages.upsert', instance, data: { key, pushName, message, messageTimestamp } }
 */
@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name)

  constructor(private readonly service: WhatsAppService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(@Body() body: any) {
    const eventType = body?.event
    if (eventType !== 'messages.upsert') {
      return { ok: true, ignored: eventType }
    }

    const data = body.data ?? {}
    const key = data.key ?? {}
    if (key.fromMe) return { ok: true, ignored: 'self' }

    const remoteJid: string = key.remoteJid ?? ''
    const from = remoteJid.split('@')[0]
    if (!from) return { ok: true, ignored: 'no_from' }

    const message = data.message ?? {}
    const text =
      message.conversation ??
      message.extendedTextMessage?.text ??
      message.imageMessage?.caption ??
      message.videoMessage?.caption ??
      ''

    let mediaUrl: string | null = null
    let mediaType: WhatsAppMediaType | null = null
    if (message.imageMessage) mediaType = 'image'
    else if (message.videoMessage) mediaType = 'video'
    else if (message.audioMessage) mediaType = 'audio'
    else if (message.documentMessage) mediaType = 'document'

    const event: IncomingMessageEvent = {
      from,
      fromName: data.pushName ?? null,
      text,
      mediaUrl,
      mediaType,
      providerMessageId: key.id ?? null,
      receivedAt: data.messageTimestamp ? new Date(Number(data.messageTimestamp) * 1000) : new Date(),
    }

    try {
      await this.service.handleIncomingMessage(event)
    } catch (err) {
      this.logger.error(`Failed to handle inbound: ${(err as Error).message}`)
    }
    return { ok: true }
  }
}
