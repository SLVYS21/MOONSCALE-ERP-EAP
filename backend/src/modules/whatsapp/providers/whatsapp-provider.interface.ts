export type WhatsAppMediaType = 'image' | 'video' | 'audio' | 'document'

export interface OutgoingMessagePayload {
  to: string
  text?: string
  mediaUrl?: string
  mediaType?: WhatsAppMediaType
  mediaName?: string
}

export interface ProviderSendResult {
  providerMessageId: string | null
  acceptedAt: Date
}

export interface IncomingMessageEvent {
  from: string
  fromName?: string | null
  text?: string
  mediaUrl?: string | null
  mediaType?: WhatsAppMediaType | null
  mediaName?: string | null
  providerMessageId?: string | null
  receivedAt?: Date
}

export interface IWhatsAppProvider {
  readonly name: string
  send(payload: OutgoingMessagePayload): Promise<ProviderSendResult>
}
