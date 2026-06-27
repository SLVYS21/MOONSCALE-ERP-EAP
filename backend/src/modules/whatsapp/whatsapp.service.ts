import { Injectable, Inject, Logger, NotFoundException, ForbiddenException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Conversation, ConversationDocument, ConversationStatus } from './schemas/conversation.schema'
import { Message, MessageDocument, MessageFromType, MessageMediaType } from './schemas/message.schema'
import { Complaint, ComplaintDocument, ComplaintCategory } from './schemas/complaint.schema'
import { QuickReply, QuickReplyDocument } from './schemas/quick-reply.schema'
import { Lead, LeadDocument } from '../leads/schemas/lead.schema'
import { Student, StudentDocument } from '../students/schemas/student.schema'
import { User, UserDocument } from '../users/schemas/user.schema'
import { WHATSAPP_PROVIDER } from './providers/whatsapp-provider.factory'
import type { IWhatsAppProvider, IncomingMessageEvent } from './providers/whatsapp-provider.interface'
import { normalizePhone } from '../../common/utils/phone.util'
import { WhatsAppGateway } from './whatsapp.gateway'
import { AssistantService } from '../assistant/assistant.service'
import { LlmService } from '../llm/llm.service'
import { KbService } from '../assistant/kb/kb.service'
import { detectLanguage } from '../assistant/language'
import type { LlmMessage, LlmToolCall, ToolDef } from '../llm/llm-provider.interface'
import { ALL_TOOLS, getToolByName, type ToolContext } from './tools'
import { FormRunnerService } from './forms/form-runner.service'

const HARD_ESCALATION_KEYWORDS = ['remboursement', 'résiliation', 'resiliation', 'avocat', 'arnaque', 'porter plainte']
const MAX_TOOL_ITERATIONS = 5

export interface ListConversationsQuery {
  status?: ConversationStatus
  search?: string
  tag?: string
  contactType?: 'lead' | 'student' | 'unknown'
  /** true = client is waiting for a reply; false = team replied last */
  pending?: boolean
  limit?: number
}

export interface SendAsCloserPayload {
  text?: string
  mediaUrl?: string
  mediaType?: MessageMediaType
  mediaName?: string
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name)

  constructor(
    @InjectModel(Conversation.name) private readonly convModel: Model<ConversationDocument>,
    @InjectModel(Message.name) private readonly msgModel: Model<MessageDocument>,
    @InjectModel(Complaint.name) private readonly complaintModel: Model<ComplaintDocument>,
    @InjectModel(QuickReply.name) private readonly quickReplyModel: Model<QuickReplyDocument>,
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
    @InjectModel(Student.name) private readonly studentModel: Model<StudentDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: IWhatsAppProvider,
    private readonly gateway: WhatsAppGateway,
    private readonly assistant: AssistantService,
    private readonly llm: LlmService,
    private readonly formRunner: FormRunnerService,
    private readonly kb: KbService,
  ) {}

  // ── Incoming (from Evolution webhook OR simulator) ──────────────────────────

  async handleIncomingMessage(event: IncomingMessageEvent): Promise<{ conversation: ConversationDocument; message: MessageDocument }> {
    const norm = normalizePhone(event.from)
    if (!norm.e164) {
      this.logger.warn(`Inbound from invalid phone: ${event.from}`)
      throw new Error('Invalid phone number')
    }

    const aiShouldAnswer = this.assistant.shouldAiAnswer()

    let conv = await this.convModel.findOne({ phone: norm.e164 })
    let isNew = false
    if (!conv) {
      isNew = true
      const contact = await this.resolveContact(norm.e164)
      const detectedLang = event.text ? detectLanguage(event.text) : 'fr'
      const clientName = contact.name ?? event.fromName ?? null
      conv = await this.convModel.create({
        phone: norm.e164,
        phoneRaw: event.from,
        contactName: clientName,
        contactType: contact.type,
        contactId: contact.id,
        status: aiShouldAnswer ? 'bot' : 'human',
        aiEnabled: aiShouldAnswer,
        language: detectedLang,
        lastMessageAt: event.receivedAt ?? new Date(),
        lastMessagePreview: event.text?.slice(0, 100) ?? '(media)',
        lastSenderType: 'client',
        lastSenderName: clientName,
        lastSenderUserId: null,
        unreadCount: 1,
      })
      this.gateway.emitConversationCreated(conv)
    }

    const msg = await this.msgModel.create({
      conversationId: conv._id,
      direction: 'in',
      fromType: 'client' as MessageFromType,
      content: event.text ?? '',
      mediaUrl: event.mediaUrl ?? null,
      mediaType: event.mediaType ?? null,
      mediaName: event.mediaName ?? null,
      providerMessageId: event.providerMessageId ?? null,
      status: 'delivered',
    })

    conv.lastMessageAt = event.receivedAt ?? new Date()
    conv.lastMessagePreview = event.text?.slice(0, 100) ?? '(media)'
    conv.lastSenderType = 'client'
    conv.lastSenderName = conv.contactName ?? event.fromName ?? null
    conv.lastSenderUserId = null
    conv.unreadCount = (conv.unreadCount ?? 0) + 1
    await conv.save()

    this.gateway.emitNewMessage(conv, msg)

    // ── Routing: form session takes precedence over AI ──
    if (conv.typebotSessionActive) {
      void this.handleFormAnswer(String(conv._id), event.text ?? '').catch((err) =>
        this.logger.error(`Form runner failed for ${conv!.phone}: ${(err as Error).message}`),
      )
      return { conversation: conv, message: msg }
    }

    // Fire-and-forget AI reply (does not block webhook response)
    if (conv.aiEnabled && conv.status === 'bot' && aiShouldAnswer) {
      void this.tryAiReply(String(conv._id)).catch((err) =>
        this.logger.error(`AI reply failed for ${conv!.phone}: ${(err as Error).message}`),
      )
    }

    return { conversation: conv, message: msg }
  }

  // ── Form runner integration ──────────────────────────────────────────────────

  async handleFormAnswer(conversationId: string, text: string): Promise<MessageDocument | null> {
    const conv = await this.convModel.findById(conversationId)
    if (!conv) return null
    if (!conv.typebotSessionActive) return null

    const result = await this.formRunner.handleAnswer(conv, text)

    // Compose reply
    let reply = ''
    if (result.errorHint && result.question) {
      reply = `${result.errorHint}\n\n${result.question}`
    } else if (result.question) {
      reply = result.question
    } else if (result.done && result.finalSummary) {
      reply = result.finalSummary
    } else {
      return null
    }

    return this.sendBotMessage(conv, reply, { intent: result.done ? 'form_completed' : 'form_step' })
  }

  private async sendBotMessage(
    conv: ConversationDocument,
    text: string,
    opts: { intent?: string | null; fromType?: 'bot' | 'system' } = {},
  ): Promise<MessageDocument> {
    const sendRes = await this.provider.send({ to: conv.phone, text })
    const botMsg = await this.msgModel.create({
      conversationId: conv._id,
      direction: 'out',
      fromType: opts.fromType ?? 'bot',
      content: text,
      status: 'sent',
      providerMessageId: sendRes.providerMessageId,
      intent: opts.intent ?? null,
    })
    const refreshed = await this.convModel.findById(conv._id)
    if (refreshed) {
      refreshed.lastMessageAt = new Date()
      refreshed.lastMessagePreview = text.slice(0, 100)
      refreshed.lastSenderType = opts.fromType === 'system' ? 'system' : 'bot'
      refreshed.lastSenderName = opts.fromType === 'system' ? 'Système' : 'Assistant'
      refreshed.lastSenderUserId = null
      await refreshed.save()
      this.gateway.emitNewMessage(refreshed, botMsg)
      this.gateway.emitSimulatedOutbound(refreshed, botMsg)
    }
    return botMsg
  }

  // ── AI reply ─────────────────────────────────────────────────────────────────

  async tryAiReply(conversationId: string): Promise<MessageDocument | null> {
    const conv = await this.convModel.findById(conversationId)
    if (!conv) return null
    if (!conv.aiEnabled || conv.status !== 'bot' || conv.typebotSessionActive) return null

    const config = await this.assistant.getConfig()
    if (!config.aiMasterEnabled) return null

    const recent = await this.msgModel
      .find({ conversationId: conv._id })
      .sort({ createdAt: -1 })
      .limit(config.contextWindow ?? 16)
      .lean()
    const ordered = recent.reverse()

    // ── Hardcoded escalation check on most recent inbound ──
    const lastInbound = [...ordered].reverse().find((m) => m.direction === 'in')
    if (lastInbound?.content) {
      const lower = lastInbound.content.toLowerCase()
      if (HARD_ESCALATION_KEYWORDS.some((kw) => lower.includes(kw))) {
        return this.forceEscalation(conv, 'Mot-clé sensible détecté')
      }
    }

    const llmMessages: LlmMessage[] = ordered
      .filter((m) => m.content || m.mediaUrl)
      .map((m) => ({
        role: m.fromType === 'client' ? ('user' as const) : ('assistant' as const),
        content: m.content || (m.mediaUrl ? `[${m.mediaType ?? 'media'}]` : ''),
      }))

    const contextHeader = this.buildContextHeader(conv)

    // Build knowledge base context: always-included docs + retrieved chunks for current query
    const lastUserText = [...ordered].reverse().find((m) => m.fromType === 'client')?.content ?? ''
    const [alwaysIncluded, retrieved] = await Promise.all([
      this.kb.getAlwaysIncludedContext(6000).catch(() => ''),
      lastUserText ? this.kb.retrieveTopK(lastUserText, 3, 0.35).catch(() => []) : Promise.resolve([]),
    ])
    let kbSection = ''
    if (alwaysIncluded) kbSection += `\n\n# Base de connaissance — toujours pertinente\n${alwaysIncluded}`
    if (retrieved.length > 0) {
      kbSection += `\n\n# Base de connaissance — extraits pertinents pour ce message\n` +
        retrieved.map((r) => `--- ${r.documentName} (sim=${r.similarity.toFixed(2)}) ---\n${r.text}`).join('\n\n')
    }

    const systemPrompt = `${config.systemPrompt}${kbSection}\n\n# Contexte conversation\n${contextHeader}`

    const toolDefs: ToolDef[] = ALL_TOOLS.map((t) => t.def)
    const toolCtx: ToolContext = {
      conversation: conv,
      models: {
        Conversation: this.convModel,
        Complaint: this.complaintModel,
        Lead: this.leadModel,
        Student: this.studentModel,
      },
      services: {
        formRunner: this.formRunner,
      },
    }

    let cumTokensIn = 0
    let cumTokensOut = 0
    let cumCostUsd = 0
    let lastProvider: string | null = null
    let lastModel: string | null = null
    let fallbackUsed = false
    const cumToolCalls: { name: string; args: Record<string, unknown>; result?: unknown; ms?: number }[] = []
    let finalText = ''

    try {
      for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
        const result = await this.llm.generate(
          config.primary,
          {
            messages: llmMessages,
            systemPrompt,
            temperature: config.temperature,
            maxTokens: config.maxTokens,
            tools: toolDefs,
          },
          config.fallback ?? undefined,
        )

        cumTokensIn += result.tokensIn
        cumTokensOut += result.tokensOut
        cumCostUsd += result.costUsd
        lastProvider = result.provider
        lastModel = result.model
        if (result.fallbackUsed) fallbackUsed = true

        if (result.toolCalls.length === 0) {
          finalText = result.text
          break
        }

        // Push assistant message containing the tool calls
        llmMessages.push({
          role: 'assistant',
          content: result.text,
          toolCalls: result.toolCalls,
        })

        // Execute tools
        for (const tc of result.toolCalls) {
          const t0 = Date.now()
          const tool = getToolByName(tc.name)
          let toolResult: unknown
          if (!tool) {
            toolResult = { ok: false, error: `Unknown tool: ${tc.name}` }
          } else {
            try {
              toolResult = await tool.handler(tc.args, toolCtx)
            } catch (e) {
              toolResult = { ok: false, error: (e as Error).message }
            }
          }
          const ms = Date.now() - t0
          cumToolCalls.push({ name: tc.name, args: tc.args, result: toolResult, ms })

          llmMessages.push({
            role: 'tool',
            toolCallId: tc.id,
            toolName: tc.name,
            content: JSON.stringify(toolResult),
          })
        }

        // Re-fetch conv (in case a tool mutated status/typebotSessionActive)
        const refreshed = await this.convModel.findById(conv._id)
        if (!refreshed) break
        if (refreshed.status !== 'bot' || !refreshed.aiEnabled || refreshed.typebotSessionActive) {
          // Escalation or typebot started — let the AI finalize one short closing message next iteration
          // but if it was escalation/typebot we can break immediately if final text is meaningful.
        }
      }

      // If no final text and we have tool calls, the AI might have just executed tools without speaking.
      // Use a placeholder so we still persist + send something coherent.
      if (!finalText.trim()) {
        // Tool-only response — don't send to WhatsApp but persist the tool calls
        const botMsg = await this.msgModel.create({
          conversationId: conv._id,
          direction: 'out',
          fromType: 'bot' as MessageFromType,
          content: '',
          status: 'sent',
          tokensIn: cumTokensIn,
          tokensOut: cumTokensOut,
          costUsd: cumCostUsd,
          llmProvider: lastProvider,
          llmModel: lastModel,
          toolCalls: cumToolCalls,
        })
        this.gateway.emitNewMessage(conv, botMsg)
        return botMsg
      }

      const sendRes = await this.provider.send({ to: conv.phone, text: finalText })

      const botMsg = await this.msgModel.create({
        conversationId: conv._id,
        direction: 'out',
        fromType: 'bot' as MessageFromType,
        content: finalText,
        status: 'sent',
        providerMessageId: sendRes.providerMessageId,
        tokensIn: cumTokensIn,
        tokensOut: cumTokensOut,
        costUsd: cumCostUsd,
        llmProvider: lastProvider,
        llmModel: lastModel,
        toolCalls: cumToolCalls,
        intent: fallbackUsed ? 'fallback_used' : null,
      })

      const updated = await this.convModel.findById(conv._id)
      if (updated) {
        updated.lastMessageAt = new Date()
        updated.lastMessagePreview = finalText.slice(0, 100)
        updated.lastSenderType = 'bot'
        updated.lastSenderName = 'Assistant'
        updated.lastSenderUserId = null
        await updated.save()
        this.gateway.emitNewMessage(updated, botMsg)
        this.gateway.emitSimulatedOutbound(updated, botMsg)
      }

      // If a form was just started via send_typebot, post its intro+first question as a separate message
      const typebotCall = cumToolCalls.find((tc) => tc.name === 'send_typebot' && (tc.result as any)?.ok)
      const firstQuestion = (typebotCall?.result as any)?.data?.firstQuestion
      if (firstQuestion) {
        const refreshed = await this.convModel.findById(conv._id)
        if (refreshed) await this.sendBotMessage(refreshed, firstQuestion, { intent: 'form_start' })
      }

      return botMsg
    } catch (err) {
      this.logger.error(`LLM generation failed: ${(err as Error).message}`)
      await this.msgModel.create({
        conversationId: conv._id,
        direction: 'out',
        fromType: 'system' as MessageFromType,
        content: '',
        status: 'failed',
        errorMessage: (err as Error).message,
        toolCalls: cumToolCalls,
      })
      return null
    }
  }

  private async forceEscalation(conv: ConversationDocument, reason: string): Promise<MessageDocument> {
    await this.convModel.findByIdAndUpdate(conv._id, {
      $set: { status: 'human', aiEnabled: false },
      $addToSet: { tags: 'escaladé:keyword' },
    })
    const sysMsg = await this.msgModel.create({
      conversationId: conv._id,
      direction: 'out',
      fromType: 'system' as MessageFromType,
      content: `Escalade automatique : ${reason}`,
      status: 'sent',
      intent: 'hard_escalation',
    })
    const refreshed = await this.convModel.findById(conv._id)
    if (refreshed) this.gateway.emitConversationUpdated(refreshed)
    this.gateway.emitNewMessage(conv, sysMsg)
    return sysMsg
  }

  private buildContextHeader(conv: ConversationDocument): string {
    const parts: string[] = []
    parts.push(`- Numéro client: ${conv.phone}`)
    parts.push(`- Nom: ${conv.contactName ?? 'inconnu'}`)
    parts.push(`- Type contact: ${conv.contactType}`)
    parts.push(`- Langue détectée: ${conv.language}`)
    if (conv.tags?.length) parts.push(`- Tags: ${conv.tags.join(', ')}`)
    return parts.join('\n')
  }

  private async resolveContact(phoneE164: string): Promise<{
    type: 'lead' | 'student' | 'unknown'
    id: Types.ObjectId | null
    name: string | null
  }> {
    const student = await this.studentModel.findOne({ whatsapp: phoneE164 }).select({ _id: 1, name: 1 })
    if (student) return { type: 'student', id: student._id as Types.ObjectId, name: student.name }

    const lead = await this.leadModel.findOne({ phone: phoneE164 }).select({ _id: 1, name: 1 })
    if (lead) return { type: 'lead', id: lead._id as Types.ObjectId, name: lead.name }

    return { type: 'unknown', id: null, name: null }
  }

  // ── Outgoing (closer-initiated) ──────────────────────────────────────────────

  async sendAsCloser(conversationId: string, userId: string, payload: SendAsCloserPayload): Promise<MessageDocument> {
    const conv = await this.convModel.findById(conversationId)
    if (!conv) throw new NotFoundException('Conversation not found')

    if (conv.lockedBy && String(conv.lockedBy) !== userId) {
      throw new ForbiddenException(`Conversation is locked by another user`)
    }

    const sender = await this.userModel
      .findById(userId)
      .select({ firstName: 1, lastName: 1, role: 1 })
      .lean()
    const senderName = sender
      ? `${sender.firstName ?? ''} ${sender.lastName ?? ''}`.trim() || null
      : null
    const senderType: 'closer' | 'admin' =
      sender?.role === 'admin' || sender?.role === 'superadmin' ? 'admin' : 'closer'

    const sendRes = await this.provider.send({
      to: conv.phone,
      text: payload.text,
      mediaUrl: payload.mediaUrl,
      mediaType: payload.mediaType ?? undefined,
      mediaName: payload.mediaName,
    })

    const msg = await this.msgModel.create({
      conversationId: conv._id,
      direction: 'out',
      fromType: 'closer' as MessageFromType,
      fromUserId: new Types.ObjectId(userId),
      content: payload.text ?? '',
      mediaUrl: payload.mediaUrl ?? null,
      mediaType: payload.mediaType ?? null,
      mediaName: payload.mediaName ?? null,
      providerMessageId: sendRes.providerMessageId,
      status: 'sent',
    })

    conv.lastMessageAt = new Date()
    conv.lastMessagePreview = payload.text?.slice(0, 100) ?? '(media)'
    conv.lastSenderType = senderType
    conv.lastSenderName = senderName
    conv.lastSenderUserId = new Types.ObjectId(userId)
    conv.status = 'human'
    conv.aiEnabled = false
    await conv.save()

    this.gateway.emitNewMessage(conv, msg)
    this.gateway.emitSimulatedOutbound(conv, msg)
    return msg
  }

  // ── Queries ──────────────────────────────────────────────────────────────────

  async listConversations(q: ListConversationsQuery = {}) {
    const filter: Record<string, unknown> = {}
    if (q.status) filter.status = q.status
    if (q.tag) filter.tags = q.tag
    if (q.contactType) filter.contactType = q.contactType
    if (typeof q.pending === 'boolean') {
      filter.lastSenderType = q.pending ? 'client' : { $in: ['bot', 'closer', 'admin', 'system'] }
    }
    if (q.search) {
      const r = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [{ contactName: r }, { phone: r }, { lastMessagePreview: r }]
    }
    return this.convModel.find(filter).sort({ lastMessageAt: -1 }).limit(q.limit ?? 100).lean()
  }

  async getConversation(id: string) {
    const conv = await this.convModel.findById(id).lean()
    if (!conv) throw new NotFoundException('Conversation not found')
    return conv
  }

  async listMessages(conversationId: string, opts: { limit?: number; before?: Date } = {}) {
    const filter: Record<string, unknown> = { conversationId: new Types.ObjectId(conversationId) }
    if (opts.before) filter.createdAt = { $lt: opts.before }
    return this.msgModel.find(filter).sort({ createdAt: 1 }).limit(opts.limit ?? 200).lean()
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  async markRead(conversationId: string, userId: string) {
    const conv = await this.convModel.findByIdAndUpdate(
      conversationId,
      { $set: { unreadCount: 0 } },
      { new: true },
    )
    if (conv) this.gateway.emitConversationUpdated(conv)
    return conv
  }

  async toggleAi(conversationId: string, enabled: boolean) {
    const conv = await this.convModel.findByIdAndUpdate(
      conversationId,
      { $set: { aiEnabled: enabled, status: enabled ? 'bot' : 'human' } },
      { new: true },
    )
    if (!conv) throw new NotFoundException('Conversation not found')
    this.gateway.emitConversationUpdated(conv)
    return conv
  }

  async setStatus(conversationId: string, status: ConversationStatus) {
    const conv = await this.convModel.findByIdAndUpdate(conversationId, { $set: { status } }, { new: true })
    if (!conv) throw new NotFoundException('Conversation not found')
    this.gateway.emitConversationUpdated(conv)
    return conv
  }

  async lock(conversationId: string, userId: string) {
    const conv = await this.convModel.findOneAndUpdate(
      { _id: conversationId, $or: [{ lockedBy: null }, { lockedBy: new Types.ObjectId(userId) }] },
      { $set: { lockedBy: new Types.ObjectId(userId), lockedAt: new Date() } },
      { new: true },
    )
    if (!conv) {
      const existing = await this.convModel.findById(conversationId)
      if (!existing) throw new NotFoundException('Conversation not found')
      throw new ForbiddenException('Already locked by another user')
    }
    this.gateway.emitConversationLocked(conv)
    return conv
  }

  async unlock(conversationId: string, userId: string) {
    const conv = await this.convModel.findOneAndUpdate(
      { _id: conversationId, lockedBy: new Types.ObjectId(userId) },
      { $set: { lockedBy: null, lockedAt: null } },
      { new: true },
    )
    if (!conv) throw new NotFoundException('Lock not held by user')
    this.gateway.emitConversationLocked(conv)
    return conv
  }

  async addTag(conversationId: string, tag: string) {
    const conv = await this.convModel.findByIdAndUpdate(conversationId, { $addToSet: { tags: tag } }, { new: true })
    if (!conv) throw new NotFoundException('Conversation not found')
    this.gateway.emitConversationUpdated(conv)
    return conv
  }

  async removeTag(conversationId: string, tag: string) {
    const conv = await this.convModel.findByIdAndUpdate(conversationId, { $pull: { tags: tag } }, { new: true })
    if (!conv) throw new NotFoundException('Conversation not found')
    this.gateway.emitConversationUpdated(conv)
    return conv
  }

  // ── Complaints ───────────────────────────────────────────────────────────────

  async createComplaint(conversationId: string, dto: { category: ComplaintCategory; description: string }, userId: string) {
    const conv = await this.convModel.findById(conversationId)
    if (!conv) throw new NotFoundException('Conversation not found')

    const complaint = await this.complaintModel.create({
      conversationId: conv._id,
      category: dto.category,
      description: dto.description,
      contactType: conv.contactType,
      contactId: conv.contactId,
      contactName: conv.contactName,
      contactPhone: conv.phone,
      createdByType: 'closer',
      createdByUserId: new Types.ObjectId(userId),
    })

    await this.convModel.findByIdAndUpdate(conversationId, { $addToSet: { tags: `complaint:${dto.category}` } })
    return complaint
  }

  async listComplaints() {
    return this.complaintModel.find().sort({ createdAt: -1 }).limit(200).lean()
  }

  // ── Quick replies ────────────────────────────────────────────────────────────

  async listQuickReplies(userId: string) {
    return this.quickReplyModel
      .find({ $or: [{ shared: true }, { ownerId: new Types.ObjectId(userId) }] })
      .sort({ shortcut: 1 })
      .lean()
  }

  async createQuickReply(userId: string, dto: { shortcut: string; content: string; label?: string; shared?: boolean }) {
    return this.quickReplyModel.create({ ...dto, ownerId: new Types.ObjectId(userId), shared: dto.shared ?? false })
  }

  async deleteQuickReply(id: string, userId: string) {
    const reply = await this.quickReplyModel.findById(id)
    if (!reply) throw new NotFoundException('Quick reply not found')
    if (reply.ownerId && String(reply.ownerId) !== userId) throw new ForbiddenException('Not owner')
    await this.quickReplyModel.deleteOne({ _id: id })
    return { ok: true }
  }

  // ── Simulator helpers ────────────────────────────────────────────────────────

  async simulateInbound(from: string, text: string, fromName?: string) {
    return this.handleIncomingMessage({ from, text, fromName: fromName ?? null, receivedAt: new Date() })
  }

  async resetConversation(phoneE164: string) {
    const conv = await this.convModel.findOne({ phone: phoneE164 })
    if (!conv) return { ok: true, deleted: 0 }
    await this.msgModel.deleteMany({ conversationId: conv._id })
    await this.convModel.deleteOne({ _id: conv._id })
    this.gateway.emitConversationDeleted(String(conv._id))
    return { ok: true, deleted: 1 }
  }
}
