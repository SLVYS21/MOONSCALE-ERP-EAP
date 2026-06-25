import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets'
import { Logger } from '@nestjs/common'
import { Server } from 'socket.io'
import type { ConversationDocument } from './schemas/conversation.schema'
import type { MessageDocument } from './schemas/message.schema'

@WebSocketGateway({
  namespace: '/ws/whatsapp',
  cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173', credentials: true },
})
export class WhatsAppGateway {
  @WebSocketServer() server!: Server
  private readonly logger = new Logger(WhatsAppGateway.name)

  emitNewMessage(conv: ConversationDocument, msg: MessageDocument) {
    this.server?.emit('message.new', {
      conversationId: String(conv._id),
      message: msg.toObject ? msg.toObject() : msg,
    })
    this.server?.emit('conversation.updated', this.serializeConv(conv))
  }

  emitConversationCreated(conv: ConversationDocument) {
    this.server?.emit('conversation.created', this.serializeConv(conv))
  }

  emitConversationUpdated(conv: ConversationDocument) {
    this.server?.emit('conversation.updated', this.serializeConv(conv))
  }

  emitConversationLocked(conv: ConversationDocument) {
    this.server?.emit('conversation.locked', {
      conversationId: String(conv._id),
      lockedBy: conv.lockedBy ? String(conv.lockedBy) : null,
      lockedAt: conv.lockedAt,
    })
  }

  emitConversationDeleted(conversationId: string) {
    this.server?.emit('conversation.deleted', { conversationId })
  }

  emitSimulatedOutbound(conv: ConversationDocument, msg: MessageDocument) {
    this.server?.emit('simulator.outbound', {
      phone: conv.phone,
      message: msg.toObject ? msg.toObject() : msg,
    })
  }

  private serializeConv(conv: ConversationDocument) {
    return conv.toObject ? conv.toObject() : conv
  }
}
