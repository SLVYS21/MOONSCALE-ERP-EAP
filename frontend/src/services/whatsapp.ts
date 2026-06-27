import api from './api'

export type ConversationStatus = 'bot' | 'human' | 'paused' | 'closed'
export type ContactType = 'lead' | 'student' | 'unknown'
export type MessageDirection = 'in' | 'out'
export type MessageFromType = 'client' | 'bot' | 'closer' | 'system'
export type MessageMediaType = 'image' | 'video' | 'audio' | 'document'
export type LastSenderType = 'client' | 'bot' | 'closer' | 'admin' | 'system'

export interface Conversation {
  _id: string
  phone: string
  phoneRaw: string | null
  contactName: string | null
  contactType: ContactType
  contactId: string | null
  status: ConversationStatus
  aiEnabled: boolean
  lockedBy: string | null
  lockedAt: string | null
  assignedTo: string | null
  tags: string[]
  lastMessageAt: string
  lastMessagePreview: string
  lastSenderType: LastSenderType
  lastSenderName: string | null
  lastSenderUserId: string | null
  unreadCount: number
  typebotSessionActive: boolean
  language: 'fr' | 'en'
  category: string | null
  createdAt: string
  updatedAt: string
}

export interface Message {
  _id: string
  conversationId: string
  direction: MessageDirection
  fromType: MessageFromType
  fromUserId: string | null
  content: string
  mediaUrl: string | null
  mediaType: MessageMediaType | null
  mediaName: string | null
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  providerMessageId: string | null
  intent: string | null
  toolCalls: Array<{ name: string; args: Record<string, unknown>; result?: unknown; ms?: number }>
  tokensIn: number | null
  tokensOut: number | null
  costUsd: number | null
  llmProvider: string | null
  llmModel: string | null
  errorMessage?: string | null
  createdAt: string
  updatedAt: string
}

export type ComplaintCategory =
  | 'access_circle'
  | 'payment_issue'
  | 'formation_content'
  | 'coaching_session'
  | 'refund_request'
  | 'technical_other'
  | 'other'

export interface Complaint {
  _id: string
  conversationId: string
  category: ComplaintCategory
  description: string
  contactType: ContactType
  contactId: string | null
  contactName: string | null
  contactPhone: string | null
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  createdAt: string
}

export interface QuickReply {
  _id: string
  shortcut: string
  content: string
  label: string
  shared: boolean
  ownerId: string | null
}

export const COMPLAINT_LABELS: Record<ComplaintCategory, string> = {
  access_circle: 'Accès Circle non reçu',
  payment_issue: 'Problème de paiement',
  formation_content: 'Problème contenu formation',
  coaching_session: 'Séance coaching',
  refund_request: 'Demande de remboursement',
  technical_other: 'Autre problème technique',
  other: 'Autre',
}

export const whatsapp = {
  listConversations(params?: { status?: ConversationStatus; search?: string; tag?: string; contactType?: ContactType; pending?: boolean }) {
    return api.get<Conversation[]>('/whatsapp/conversations', { params }).then((r) => r.data)
  },
  getConversation(id: string) {
    return api.get<Conversation>(`/whatsapp/conversations/${id}`).then((r) => r.data)
  },
  listMessages(conversationId: string, limit = 200) {
    return api.get<Message[]>(`/whatsapp/conversations/${conversationId}/messages`, { params: { limit } }).then((r) => r.data)
  },
  sendMessage(conversationId: string, body: { text?: string; mediaUrl?: string; mediaType?: MessageMediaType; mediaName?: string }) {
    return api.post<Message>(`/whatsapp/conversations/${conversationId}/messages`, body).then((r) => r.data)
  },
  markRead(conversationId: string) {
    return api.post(`/whatsapp/conversations/${conversationId}/read`).then((r) => r.data)
  },
  toggleAi(conversationId: string, enabled: boolean) {
    return api.patch<Conversation>(`/whatsapp/conversations/${conversationId}/ai`, { enabled }).then((r) => r.data)
  },
  setStatus(conversationId: string, status: ConversationStatus) {
    return api.patch<Conversation>(`/whatsapp/conversations/${conversationId}/status`, { status }).then((r) => r.data)
  },
  lock(conversationId: string) {
    return api.post<Conversation>(`/whatsapp/conversations/${conversationId}/lock`).then((r) => r.data)
  },
  unlock(conversationId: string) {
    return api.post<Conversation>(`/whatsapp/conversations/${conversationId}/unlock`).then((r) => r.data)
  },
  addTag(conversationId: string, tag: string) {
    return api.post<Conversation>(`/whatsapp/conversations/${conversationId}/tags`, { tag }).then((r) => r.data)
  },
  removeTag(conversationId: string, tag: string) {
    return api.delete<Conversation>(`/whatsapp/conversations/${conversationId}/tags/${encodeURIComponent(tag)}`).then((r) => r.data)
  },
  createComplaint(conversationId: string, body: { category: ComplaintCategory; description: string }) {
    return api.post<Complaint>(`/whatsapp/conversations/${conversationId}/complaints`, body).then((r) => r.data)
  },
  listComplaints() {
    return api.get<Complaint[]>('/whatsapp/complaints').then((r) => r.data)
  },
  listQuickReplies() {
    return api.get<QuickReply[]>('/whatsapp/quick-replies').then((r) => r.data)
  },
  createQuickReply(body: { shortcut: string; content: string; label?: string; shared?: boolean }) {
    return api.post<QuickReply>('/whatsapp/quick-replies', body).then((r) => r.data)
  },
  deleteQuickReply(id: string) {
    return api.delete(`/whatsapp/quick-replies/${id}`).then((r) => r.data)
  },
  simulateInbound(body: { from: string; text: string; fromName?: string }) {
    return api.post('/whatsapp/simulator/inbound', body).then((r) => r.data)
  },
  resetSimulatedConversation(phone: string) {
    return api.post('/whatsapp/simulator/reset', { phone }).then((r) => r.data)
  },
  getStats(range: '24h' | '7d' | '30d' | 'all' = '7d') {
    return api.get<WhatsAppStats>('/whatsapp/stats', { params: { range } }).then((r) => r.data)
  },
}

export interface WhatsAppStats {
  range: '24h' | '7d' | '30d' | 'all'
  newConversations: number
  totalConversations: number
  activeHumanConversations: number
  messagesIn: number
  messagesOut: number
  aiReplies: number
  escalations: number
  complaintsTotal: number
  complaintsByCategory: Record<ComplaintCategory, number>
  formsStarted: number
  formsCompleted: number
  formCompletionRate: number
  llmCostTotalUsd: number
  llmCostByProvider: Record<string, number>
  dailySeries: Array<{ date: string; newConvs: number; aiReplies: number; costUsd: number }>
}
