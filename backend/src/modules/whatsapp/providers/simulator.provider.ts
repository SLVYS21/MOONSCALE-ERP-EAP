import { Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'crypto'
import type { IWhatsAppProvider, OutgoingMessagePayload, ProviderSendResult } from './whatsapp-provider.interface'

@Injectable()
export class SimulatorProvider implements IWhatsAppProvider {
  readonly name = 'simulator'
  private readonly logger = new Logger(SimulatorProvider.name)

  async send(payload: OutgoingMessagePayload): Promise<ProviderSendResult> {
    this.logger.log(`[SIM → ${payload.to}] ${payload.text?.slice(0, 80) ?? '(media)'}`)
    return {
      providerMessageId: `sim_${randomUUID()}`,
      acceptedAt: new Date(),
    }
  }
}
