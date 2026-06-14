import { Injectable, Logger, NotFoundException, BadRequestException, OnApplicationBootstrap } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Cron } from '@nestjs/schedule'
import { Model, Types } from 'mongoose'
import axios from 'axios'
import ical from 'ical-generator'
import { Lead, LeadDocument, PipelineStatus, LeadSourceType, LeadQualification } from './schemas/lead.schema'
import { scoreEapLead, extractEapInputFromTypebot, nextPipelineStatus, EapScoringResult } from './eap-scoring'
import { Call, CallDocument } from './schemas/call.schema'
import { ScoringRule, ScoringRuleDocument } from './schemas/scoring-rule.schema'
import { ScoringConfig, ScoringConfigDocument } from './schemas/scoring-config.schema'
import { WhatsAppLink, WhatsAppLinkDocument } from './schemas/whatsapp-link.schema'
import { WhatsAppClick, WhatsAppClickDocument } from './schemas/whatsapp-click.schema'
import { TypebotFormConfig, TypebotFormConfigDocument, TypebotFieldMapping } from './schemas/typebot-form-config.schema'
import { AutomationsService } from '../automations/automations.service'
import { OffersService } from '../offers/offers.service'
import { MailService } from '../mail/mail.service'
import { CalComService } from '../calcom/calcom.service'
import { Student, StudentDocument } from '../students/schemas/student.schema'
import { User, UserDocument } from '../users/schemas/user.schema'
import { DEFAULT_SCORING_RULES } from './leads.seed'

// ── CSV Parser ────────────────────────────────────────────────────────────────

function parseCsv(content: string): Record<string, string>[] {
  // Normalize line endings + strip BOM
  const text = content.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Detect delimiter from first line (comma, semicolon, or tab)
  const firstLine = text.split('\n')[0]
  const commas = (firstLine.match(/,/g) ?? []).length
  const semis  = (firstLine.match(/;/g) ?? []).length
  const tabs   = (firstLine.match(/\t/g) ?? []).length
  const delim  = tabs > commas && tabs > semis ? '\t' : semis > commas ? ';' : ','

  // Parse entire content at once — handles quoted multi-line fields (RFC 4180)
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQ = false

  for (let i = 0; i <= text.length; i++) {
    const ch = i < text.length ? text[i] : '\n' // virtual trailing newline to flush last row

    if (inQ) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') { cur += '"'; i++ }
        else inQ = false
      } else {
        cur += ch // newlines inside quotes stay as part of the field
      }
    } else {
      if (ch === '"') {
        inQ = true
      } else if (ch === delim) {
        row.push(cur.trim()); cur = ''
      } else if (ch === '\n') {
        row.push(cur.trim()); cur = ''
        if (row.some((f) => f !== '')) rows.push(row)
        row = []
      } else {
        cur += ch
      }
    }
  }

  if (rows.length < 2) return []

  const normalize = (s: string) =>
    s.toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')

  const headers = rows[0].map(normalize)
  const result: Record<string, string>[] = []

  for (let i = 1; i < rows.length; i++) {
    const vals = rows[i]
    if (!vals.some((v) => v)) continue // skip fully empty rows
    const obj: Record<string, string> = {}
    headers.forEach((h, idx) => { obj[h] = vals[idx]?.trim() ?? '' })
    result.push(obj)
  }
  return result
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateLeadDto {
  name: string
  email?: string
  phone?: string
  age?: number
  pays?: string
  budget?: number
  utm_source?: string
  reseau_source?: string
  lead_magnet?: string
  motivation?: string
  dynamic_fields?: Record<string, unknown>
  source_type?: LeadSourceType
  offer_ids?: string[]
  opportunity_amount?: number
  notes?: string
  typebot_result_id?: string
  source_form_id?: string
  source_form_name?: string
  submitted_at?: Date
}

export interface UpdateLeadDto {
  name?: string
  email?: string
  phone?: string
  age?: number
  reseau_source?: string
  lead_magnet?: string
  motivation?: string
  dynamic_fields?: Record<string, unknown>
  offer_ids?: string[]
  opportunity_amount?: number
  notes?: string
}

export interface ListLeadsQuery {
  pipeline_status?: string
  closer_id?: string
  utm_source?: string
  source_type?: string
  search?: string
  date_from?: string
  date_to?: string
  page?: number
  limit?: number
}

export interface CreateCallDto {
  date?: string
  duration?: number
  google_meet_link?: string
  transcript?: string
  manual_notes?: string
  status?: 'planned' | 'completed' | 'cancelled'
  closer_id?: string
  offer_proposed_id?: string
  sendEmail?: boolean
}

export interface UpdateCallDto {
  date?: string
  duration?: number
  google_meet_link?: string
  transcript?: string
  ai_summary?: string
  manual_notes?: string
  status?: 'planned' | 'completed' | 'cancelled'
  closer_id?: string
  offer_proposed_id?: string
}

export interface CreateOfferDto {
  name: string
  description?: string
  features?: string[]
  type?: 'online' | 'presentiel' | 'one_to_one' | 'bootcamp'
  price?: number
  currency?: string
  is_active?: boolean
  can_be_coupled?: boolean
}

export interface CreateScoringRuleDto {
  name: string
  description?: string
  condition_field: string
  condition_operator: 'equals' | 'contains' | 'not_null' | 'is_empty'
  condition_value?: string
  points: number
  is_active?: boolean
}

export interface CreateTrackingLinkDto {
  src: string
  type?: 'whatsapp' | 'typebot' | 'link'
  description?: string
  whatsapp_number?: string
  target_url?: string
  utm_source?: string
  utm_campaign?: string
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class LeadsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LeadsService.name)
  private readonly bookingEmailPrefs = new Map<string, boolean>()

  constructor(
    @InjectModel(Lead.name) private leadModel: Model<LeadDocument>,
    @InjectModel(Call.name) private callModel: Model<CallDocument>,
    @InjectModel(ScoringRule.name) private scoringRuleModel: Model<ScoringRuleDocument>,
    @InjectModel(ScoringConfig.name) private scoringConfigModel: Model<ScoringConfigDocument>,
    @InjectModel(WhatsAppLink.name) private whatsappLinkModel: Model<WhatsAppLinkDocument>,
    @InjectModel(WhatsAppClick.name) private whatsappClickModel: Model<WhatsAppClickDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel(TypebotFormConfig.name) private typebotFormConfigModel: Model<TypebotFormConfigDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private automationsService: AutomationsService,
    private offersService: OffersService,
    private mailService: MailService,
    private calComService: CalComService,
  ) {}

  async onApplicationBootstrap() {
    const ruleCount = await this.scoringRuleModel.countDocuments()
    if (ruleCount === 0) {
      await this.scoringRuleModel.insertMany(DEFAULT_SCORING_RULES)
      this.logger.log('Seeded 7 default scoring rules')
    }
  }

  // ── Event log ─────────────────────────────────────────────────────────────

  private pushEvent(leadId: Types.ObjectId | string, type: string, message: string, actor_id?: string) {
    return this.leadModel.updateOne(
      { _id: leadId },
      { $push: { events: { type, message, date: new Date(), actor_id: actor_id ?? null } } },
    )
  }

  // ── Leads CRUD ────────────────────────────────────────────────────────────

  async createLead(dto: CreateLeadDto, userId?: string): Promise<LeadDocument> {
    const SOURCE_LABEL: Record<string, string> = {
      typebot: 'Typebot', meta_ads: 'Meta Ads', whatsapp_tracked: 'WhatsApp tracké',
      whatsapp_direct: 'WhatsApp direct', manual: 'création manuelle', import: 'import CSV',
    }

    // WhatsApp source → direct SQL
    const isWhatsApp =
      dto.utm_source?.toLowerCase().includes('whatsapp') ||
      dto.source_type === 'whatsapp_tracked' ||
      dto.source_type === 'whatsapp_direct'

    const lead = await this.leadModel.create({
      ...dto,
      ...(isWhatsApp ? { pipeline_status: 'sql' } : {}),
      offer_ids: dto.offer_ids?.map((id) => new Types.ObjectId(id)) ?? [],
      created_by: userId ? new Types.ObjectId(userId) : null,
      events: [{ type: 'created', message: `Lead créé via ${SOURCE_LABEL[dto.source_type ?? 'manual'] ?? dto.source_type}`, date: new Date(), actor_id: userId ?? null }],
    })

    this.automationsService.triggerEvent('lead_created', {
      lead: { _id: lead._id, name: lead.name, email: lead.email, source_type: lead.source_type, utm_source: lead.utm_source },
    })

    return lead
  }

  async listLeads(query: ListLeadsQuery) {
    const {
      pipeline_status, closer_id, utm_source,
      source_type, search, date_from, date_to,
      page = 1, limit = 50,
    } = query

    const filter: Record<string, unknown> = {}

    if (pipeline_status) filter.pipeline_status = pipeline_status
    if (closer_id) filter.closer_id = new Types.ObjectId(closer_id)
    if (utm_source) filter.utm_source = utm_source
    if (source_type) filter.source_type = source_type

    if (date_from || date_to) {
      filter.createdAt = {}
      if (date_from) (filter.createdAt as Record<string, Date>)['$gte'] = new Date(date_from)
      if (date_to) (filter.createdAt as Record<string, Date>)['$lte'] = new Date(date_to)
    }

    if (search) {
      const regex = new RegExp(search, 'i')
      filter['$or'] = [{ name: regex }, { email: regex }, { phone: regex }]
    }

    const skip = (page - 1) * limit
    const [data, total] = await Promise.all([
      this.leadModel
        .find(filter)
        .populate('closer_id', 'firstName lastName email')
        .populate('offer_ids', 'name description features isActive')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.leadModel.countDocuments(filter),
    ])

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async getLeadDocument(id: string): Promise<LeadDocument> {
    const lead = await this.leadModel.findById(id).exec()
    if (!lead) throw new NotFoundException('Lead introuvable')
    return lead
  }

  async getLead(id: string): Promise<LeadDocument> {
    const lead = await this.leadModel
      .findById(id)
      .populate('closer_id', 'firstName lastName email avatar')
      .populate('offer_ids', 'name description features isActive plans')
      .populate('created_by', 'firstName lastName')
      .lean() as unknown as LeadDocument

    if (!lead) throw new NotFoundException('Lead introuvable')
    return lead
  }

  async updateLead(id: string, dto: UpdateLeadDto): Promise<LeadDocument> {
    const update: Record<string, unknown> = { ...dto }
    if (dto.offer_ids) {
      update.offer_ids = dto.offer_ids.map((oid) => new Types.ObjectId(oid))
    }

    const lead = await this.leadModel.findByIdAndUpdate(id, update, { new: true }).lean() as unknown as LeadDocument
    if (!lead) throw new NotFoundException('Lead introuvable')
    return lead
  }

  async sendCallLink(leadId: string, bookingUrl: string, message: string): Promise<{ sent: boolean; to: string }> {
    const lead = await this.leadModel.findById(leadId).lean()
    if (!lead) throw new NotFoundException('Lead introuvable')
    if (!lead.email) throw new BadRequestException('Ce lead n\'a pas d\'adresse email')

    const safeMessage = message
      ? `<p style="color:#4b5563;line-height:1.6;margin-bottom:24px">${message}</p>`
      : '<p style="color:#4b5563">Nous vous invitons à réserver un créneau pour votre appel avec notre équipe.</p>'

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;background:#ffffff">
        <h2 style="color:#111827;margin-bottom:12px">Bonjour ${lead.name},</h2>
        ${safeMessage}
        <div style="text-align:center;margin:32px 0">
          <a href="${bookingUrl}" style="display:inline-block;padding:14px 32px;background:#6366f1;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">
            📅 Réserver mon créneau
          </a>
        </div>
        <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #f3f4f6;padding-top:16px">
          Si le bouton ne fonctionne pas, copiez ce lien :<br>
          <a href="${bookingUrl}" style="color:#6366f1">${bookingUrl}</a>
        </p>
      </div>
    `

    await this.mailService.sendCustom(lead.email, 'Réservez votre appel — Moonscale', html)
    return { sent: true, to: lead.email }
  }

  async deleteLead(id: string): Promise<void> {
    const result = await this.leadModel.findByIdAndDelete(id)
    if (!result) throw new NotFoundException('Lead introuvable')
    await this.callModel.deleteMany({ lead_id: new Types.ObjectId(id) })
  }

  async updatePipeline(id: string, status: PipelineStatus, lostReason?: string, userId?: string): Promise<LeadDocument> {
    const prev = await this.leadModel.findById(id).select('pipeline_status').lean()
    const update: Record<string, unknown> = { pipeline_status: status }
    if (status === 'lost' && lostReason) update.lost_reason = lostReason

    const lead = await this.leadModel.findByIdAndUpdate(id, update, { new: true }).lean() as unknown as LeadDocument
    if (!lead) throw new NotFoundException('Lead introuvable')

    const STAGE_LABEL: Record<string, string> = {
      nouveau: 'Nouveau', mql: 'MQL', sql: 'SQL', rdv_programme: 'RDV Programmé',
      appel_diagnostic: 'Appel Diagnostic', won: 'Won', lost: 'Lost', nurturing: 'Nurturing',
    }
    const prevLabel = STAGE_LABEL[prev?.pipeline_status ?? ''] ?? prev?.pipeline_status ?? '?'
    const msg = status === 'lost' && lostReason
      ? `Pipeline : ${prevLabel} → Lost (${lostReason})`
      : `Pipeline : ${prevLabel} → ${STAGE_LABEL[status] ?? status}`
    this.pushEvent(id, 'pipeline_changed', msg, userId)

    this.automationsService.triggerEvent('lead_stage_changed', {
      lead: { _id: lead._id, name: lead.name, email: lead.email },
      new_status: status,
      previous_status: status,
    })

    if (status === 'won') {
      this.automationsService.triggerEvent('lead_won', {
        lead: { _id: lead._id, name: lead.name, email: lead.email, opportunity_amount: (lead as unknown as Lead).opportunity_amount },
      })
    }

    return lead
  }

  async assignCloser(id: string, closerId: string | null): Promise<LeadDocument> {
    const update = closerId ? { closer_id: new Types.ObjectId(closerId) } : { closer_id: null }
    const lead = await this.leadModel.findByIdAndUpdate(id, update, { new: true })
      .populate('closer_id', 'firstName lastName email')
      .lean() as unknown as LeadDocument

    if (!lead) throw new NotFoundException('Lead introuvable')
    return lead
  }

  // ── Scoring ───────────────────────────────────────────────────────────────

  private async getOrCreateScoringConfig(): Promise<ScoringConfigDocument> {
    let config = await this.scoringConfigModel.findOne()
    if (!config) config = await this.scoringConfigModel.create({})
    return config
  }

  // ── Calls ─────────────────────────────────────────────────────────────────

  async createCall(leadId: string, dto: CreateCallDto, userId?: string): Promise<CallDocument> {
    const lead = await this.leadModel.findById(leadId)
    if (!lead) throw new NotFoundException('Lead introuvable')

    const call = await this.callModel.create({
      lead_id: new Types.ObjectId(leadId),
      date: dto.date ? new Date(dto.date) : null,
      duration: dto.duration ?? null,
      google_meet_link: dto.google_meet_link ?? '',
      transcript: dto.transcript ?? '',
      manual_notes: dto.manual_notes ?? '',
      status: dto.status ?? 'planned',
      closer_id: dto.closer_id ? new Types.ObjectId(dto.closer_id) : (userId ? new Types.ObjectId(userId) : null),
      offer_proposed_id: dto.offer_proposed_id ? new Types.ObjectId(dto.offer_proposed_id) : null,
    })

    const dateLabel = dto.date ? new Date(dto.date).toLocaleDateString('fr-FR') : 'date non définie'
    this.pushEvent(leadId, 'call_planned', `Appel planifié — ${dateLabel}`, userId)

    if (dto.sendEmail && dto.date && dto.google_meet_link && lead.email) {
      const closerId = dto.closer_id ?? userId
      const closer = closerId ? await this.userModel.findById(closerId).lean() : null
      if (closer) {
        const start = new Date(dto.date)
        const end = new Date(start.getTime() + (dto.duration ?? 60) * 60_000)
        await this.sendCalComConfirmationEmail(lead, closer as UserDocument, start.toISOString(), end.toISOString(), dto.google_meet_link)
      }
    }

    return call
  }

  async listCalls(leadId: string): Promise<CallDocument[]> {
    return this.callModel
      .find({ lead_id: new Types.ObjectId(leadId) })
      .populate('closer_id', 'firstName lastName email')
      .populate('offer_proposed_id', 'name description features isActive')
      .sort({ createdAt: -1 })
      .lean() as unknown as CallDocument[]
  }

  async updateCall(leadId: string, callId: string, dto: UpdateCallDto, userId?: string): Promise<CallDocument> {
    const update: Record<string, unknown> = {}
    if (dto.date !== undefined) update.date = dto.date ? new Date(dto.date) : null
    if (dto.duration !== undefined) update.duration = dto.duration
    if (dto.google_meet_link !== undefined) update.google_meet_link = dto.google_meet_link
    if (dto.transcript !== undefined) update.transcript = dto.transcript
    if (dto.ai_summary !== undefined) update.ai_summary = dto.ai_summary
    if (dto.manual_notes !== undefined) update.manual_notes = dto.manual_notes
    if (dto.status !== undefined) update.status = dto.status
    if (dto.closer_id !== undefined) update.closer_id = dto.closer_id ? new Types.ObjectId(dto.closer_id) : null
    if (dto.offer_proposed_id !== undefined) update.offer_proposed_id = dto.offer_proposed_id ? new Types.ObjectId(dto.offer_proposed_id) : null

    const call = await this.callModel.findOneAndUpdate(
      { _id: new Types.ObjectId(callId), lead_id: new Types.ObjectId(leadId) },
      update,
      { new: true },
    ).lean() as unknown as CallDocument

    if (!call) throw new NotFoundException('Appel introuvable')

    if (dto.status === 'completed') {
      const lead = await this.leadModel.findById(leadId).lean()
      this.automationsService.triggerEvent('call_completed', {
        lead: { _id: leadId, name: lead?.name, email: lead?.email },
        call: { _id: callId, date: (call as unknown as Call).date, duration: (call as unknown as Call).duration },
        userId,
      })
      const dur = (call as unknown as Call).duration ? ` (${(call as unknown as Call).duration} min)` : ''
      this.pushEvent(leadId, 'call_completed', `Appel complété${dur}`, userId)
    }

    return call
  }

  async generateCallSummary(leadId: string, callId: string): Promise<{ ai_summary: string }> {
    const call = await this.callModel.findOne({
      _id: new Types.ObjectId(callId),
      lead_id: new Types.ObjectId(leadId),
    })
    if (!call) throw new NotFoundException('Appel introuvable')
    if (!call.transcript) throw new BadRequestException('Aucune transcription disponible pour générer un résumé')

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new BadRequestException('ANTHROPIC_API_KEY non configuré')

    const prompt = `Tu es un assistant commercial expert. Voici la transcription d'un appel de diagnostic entre un closer et un prospect.

Transcription :
${call.transcript}

Génère un résumé structuré avec les sections suivantes :
1. Profil du prospect (situation actuelle, objectifs)
2. Problèmes identifiés
3. Offre(s) proposée(s) et réaction du prospect
4. Prochaine étape recommandée
5. Statut suggéré (Won / Lost / Nurturing) avec justification

Sois concis et factuel. Réponds en français.`

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 30000,
      },
    )

    const content = response.data?.content?.[0]?.text ?? ''
    await this.callModel.updateOne({ _id: call._id }, { ai_summary: content })

    return { ai_summary: content }
  }

  // ── Offers (delegated to OffersService / subscription-offers) ────────────────

  async listOffers(activeOnly = false) {
    return this.offersService.listOffers(activeOnly)
  }

  async createOffer(dto: CreateOfferDto) {
    return this.offersService.createOffer({ name: dto.name, description: dto.description, features: dto.features })
  }

  async updateOffer(id: string, dto: Partial<CreateOfferDto>) {
    return this.offersService.updateOffer(id, { name: dto.name, description: dto.description, features: dto.features, isActive: dto.is_active })
  }

  async deleteOffer(id: string) {
    return this.offersService.deleteOffer(id)
  }

  // ── Scoring Rules ─────────────────────────────────────────────────────────

  async listScoringRules(): Promise<ScoringRuleDocument[]> {
    return this.scoringRuleModel.find().sort({ points: -1 }).lean() as unknown as ScoringRuleDocument[]
  }

  async createScoringRule(dto: CreateScoringRuleDto): Promise<ScoringRuleDocument> {
    return this.scoringRuleModel.create(dto)
  }

  async updateScoringRule(id: string, dto: Partial<CreateScoringRuleDto>): Promise<ScoringRuleDocument> {
    const rule = await this.scoringRuleModel.findByIdAndUpdate(id, dto, { new: true }).lean() as unknown as ScoringRuleDocument
    if (!rule) throw new NotFoundException('Règle introuvable')
    return rule
  }

  async deleteScoringRule(id: string): Promise<void> {
    const result = await this.scoringRuleModel.findByIdAndDelete(id)
    if (!result) throw new NotFoundException('Règle introuvable')
  }

  async getScoringConfig() {
    return this.getOrCreateScoringConfig()
  }

  async updateScoringConfig(dto: { mql_threshold?: number; sql_threshold?: number }) {
    let config = await this.scoringConfigModel.findOne()
    if (!config) {
      config = await this.scoringConfigModel.create(dto)
    } else {
      if (dto.mql_threshold !== undefined) config.mql_threshold = dto.mql_threshold
      if (dto.sql_threshold !== undefined) config.sql_threshold = dto.sql_threshold
      await config.save()
    }
    return config
  }

  // ── WhatsApp Tracking ─────────────────────────────────────────────────────

  async listTrackingLinks() {
    const links = await this.whatsappLinkModel
      .find()
      .populate('created_by', 'firstName lastName')
      .sort({ createdAt: -1 })
      .lean()

    const clickCounts = await this.whatsappClickModel.aggregate([
      { $group: { _id: '$src', count: { $sum: 1 } } },
    ])
    const clickMap = new Map(clickCounts.map((c: { _id: string; count: number }) => [c._id, c.count]))

    return links.map((l) => ({
      ...l,
      click_count: clickMap.get((l as { src: string }).src) ?? 0,
    }))
  }

  async createTrackingLink(dto: CreateTrackingLinkDto, userId?: string) {
    return this.whatsappLinkModel.create({
      ...dto,
      created_by: userId ? new Types.ObjectId(userId) : null,
    })
  }

  async updateTrackingLink(id: string, dto: Partial<CreateTrackingLinkDto>) {
    const link = await this.whatsappLinkModel.findByIdAndUpdate(id, dto, { new: true }).lean()
    if (!link) throw new NotFoundException('Lien introuvable')
    return link
  }

  async deleteTrackingLink(id: string): Promise<void> {
    const result = await this.whatsappLinkModel.findByIdAndDelete(id)
    if (!result) throw new NotFoundException('Lien introuvable')
  }

  async handleRedirect(src: string, userAgent: string): Promise<{ type: string; destination: string } | null> {
    const link = await this.whatsappLinkModel.findOne({ src }).lean() as {
      _id: Types.ObjectId; type?: string; whatsapp_number?: string | null; target_url?: string | null;
      utm_source?: string | null; utm_campaign?: string | null;
    } | null
    if (!link) return null

    await this.whatsappClickModel.create({ link_id: link._id, src, user_agent: userAgent })

    const type = link.type ?? 'whatsapp'

    if (type === 'whatsapp') {
      const number = link.whatsapp_number
      if (!number) return null
      return { type: 'whatsapp', destination: number }
    }

    // typebot or generic link — build URL with optional UTM params
    let url = link.target_url ?? ''
    if (url) {
      const params = new URLSearchParams()
      if (link.utm_source) params.set('utm_source', link.utm_source)
      if (link.utm_campaign) params.set('utm_campaign', link.utm_campaign)
      params.set('src', src)
      const sep = url.includes('?') ? '&' : '?'
      url = `${url}${sep}${params.toString()}`
    }
    return { type, destination: url }
  }

  // ── Webhook handlers ──────────────────────────────────────────────────────

  async handleTypebotWebhook(
    payload: Record<string, unknown>,
    utmOverride?: string,
    formId?: string,
    formName?: string,
  ): Promise<LeadDocument> {
    const META_KEYS = new Set(['submittedAt', 'message', 'result_id', 'resultId', 'variables'])

    const srcFormId   = formId ?? (payload.typebot_id ?? (payload.typebot as Record<string, unknown>)?.id) as string | undefined
    const srcFormName = formName ?? (payload.typebot_name ?? (payload.typebot as Record<string, unknown>)?.name) as string | undefined

    // Resolve the field mapping (from DB or freshly synced)
    let formConfig: TypebotFormConfigDocument | null = null
    if (srcFormId) {
      formConfig = await this.typebotFormConfigModel.findOne({ typebot_id: srcFormId }).lean() as TypebotFormConfigDocument | null

      const receivedKeys = Object.keys(payload).filter(k => !META_KEYS.has(k))
      const needsSync = !formConfig || this.variablesMismatch(receivedKeys, formConfig.variables)
      if (needsSync) {
        formConfig = await this.syncTypebotVariables(srcFormId, srcFormName)
      }
    }

    // Parse payload: use stored mapping if available, else fallback to legacy parsers
    type ParsedPayload = {
      name: string; email: string | null; phone: unknown; age: unknown
      pays: string | null; motivation: unknown; reseau_source: unknown
      budget: number | null; utm_source: unknown; dynamic: Record<string, unknown>
      submitted_at: Date | null
    }
    let parsed: ParsedPayload
    if (formConfig && Object.keys(formConfig.mapping ?? {}).length > 0) {
      parsed = this.parseWithMapping(payload, formConfig.mapping)
    } else {
      const isFlatFormat = !Array.isArray(payload.variables) && (
        typeof payload['Email'] === 'string' ||
        typeof payload['Prenom'] === 'string' ||
        typeof payload['WhatsApp'] === 'string'
      )
      parsed = isFlatFormat
        ? this.parseTypebotFlatPayload(payload)
        : this.parseTypebotVariables((payload.variables as Array<{ name: string; value: unknown }>) ?? [])
    }

    const utm_source = utmOverride ?? parsed.utm_source ?? (payload.utm_source as string) ?? null

    // Budget fallback: if mapping returned nothing, extract from "Commentaire libre"
    let finalBudget = parsed.budget
    if (!finalBudget) {
      const commentaireRaw = (payload['Commentaire libre'] ?? payload['commentaire_libre']) as string | undefined
      if (commentaireRaw) finalBudget = await this.extractBudget(commentaireRaw) || null
    }

    // Réseau fallback: mapping → "Réseau" field → utm_source
    const finalReseau: any = parsed.reseau_source
      ? String(parsed.reseau_source)
      : ((payload['Réseau'] as string | undefined) ?? utm_source ?? null)

    const resultId = (payload.result_id ?? payload.resultId ?? (payload.result as Record<string, unknown>)?.id) as string | undefined
    const submittedRaw = parsed.submitted_at ?? (payload.submittedAt ?? payload.createdAt ?? null)
    const submittedAt = submittedRaw instanceof Date
      ? submittedRaw
      : (submittedRaw ? new Date(String(submittedRaw)) : null)

    // Compute EAP score from raw payload + parsed values
    const eapInput = extractEapInputFromTypebot(payload, {
      age: parsed.age,
      phone: parsed.phone,
      pays: parsed.pays,
      motivation: parsed.motivation,
    })
    const scoring = scoreEapLead(eapInput)

    // 1. Dedup by typebot_result_id — re-score existing lead too (re-submission)
    if (resultId) {
      const byResultId = await this.leadModel.findOne({ typebot_result_id: resultId }).exec()
      if (byResultId) {
        await this.applyScoringToLead(byResultId, scoring)
        return byResultId
      }
    }

    // 2. Dedup by email → upsert + re-score
    if (parsed.email) {
      const byEmail = await this.leadModel.findOne({ email: parsed.email }).exec()
      if (byEmail) {
        const upd: Record<string, unknown> = {}
        if (resultId && !byEmail.typebot_result_id)   upd['typebot_result_id'] = resultId
        if (srcFormId && !byEmail.source_form_id)     upd['source_form_id']   = srcFormId
        if (srcFormName && !byEmail.source_form_name) upd['source_form_name'] = srcFormName
        if (submittedAt && !byEmail.submitted_at)     upd['submitted_at']     = submittedAt
        if (!byEmail.pays   && parsed.pays)           upd['pays']   = parsed.pays
        if (!byEmail.budget && finalBudget)            upd['budget'] = finalBudget
        if (Object.keys(upd).length) await this.leadModel.updateOne({ _id: byEmail._id }, { $set: upd })
        await this.applyScoringToLead(byEmail, scoring)
        return byEmail
      }
    }

    // 3. Create new lead
    const created = await this.createLead({
      name: parsed.name,
      email: parsed.email ?? undefined,
      phone: parsed.phone ? String(parsed.phone) : undefined,
      age: parsed.age ? Number(parsed.age) : undefined,
      pays: parsed.pays ?? undefined,
      budget: finalBudget ?? undefined,
      utm_source: utm_source ? String(utm_source) : undefined,
      reseau_source: finalReseau ?? undefined,
      motivation: parsed.motivation ? String(parsed.motivation) : undefined,
      dynamic_fields: parsed.dynamic,
      source_type: 'typebot',
      typebot_result_id: resultId,
      source_form_id: srcFormId,
      source_form_name: srcFormName,
      submitted_at: submittedAt ?? undefined,
    })

    await this.applyScoringToLead(created, scoring)
    return created
  }

  // ── EAP Scoring application ────────────────────────────────────────────────

  /**
   * Persist scoring result on a lead + auto-promote pipeline_status (without
   * downgrading leads already past rdv_programme). Re-uses existing manual
   * bonuses so re-scoring doesn't wipe a closer's adjustments.
   */
  private async applyScoringToLead(
    lead: LeadDocument,
    scoring: EapScoringResult,
  ): Promise<void> {
    const prevQualif = (lead as Lead).qualification ?? null
    const prevPipeline = (lead as Lead).pipeline_status

    // Re-inject persisted manual bonuses so they stay in the breakdown / score
    const manualBonuses = (lead as Lead).manual_bonuses ?? []
    let finalScore = scoring.score
    const finalBreakdown = [...scoring.breakdown]
    if (!scoring.disqualified && manualBonuses.length > 0) {
      for (const mb of manualBonuses) {
        finalBreakdown.push({ rule: mb.rule, points: mb.points, detail: mb.reason ?? '' })
        finalScore += mb.points
      }
    }
    const finalQualif: LeadQualification = scoring.disqualified
      ? 'DISQUALIFIED'
      : (finalScore >= 220 ? 'HOT_A'
        : finalScore >= 150 ? 'HOT_B'
        : finalScore >= 90  ? 'WARM'
        : finalScore >= 50  ? 'COLD'
        : 'OUT_OF_TARGET')

    const newPipeline = nextPipelineStatus(prevPipeline, finalQualif)

    const upd: Record<string, unknown> = {
      score: finalScore,
      qualification: finalQualif,
      disqualified_reason: scoring.disqualified_reason,
      score_breakdown: finalBreakdown,
    }
    if (newPipeline !== prevPipeline) upd['pipeline_status'] = newPipeline

    await this.leadModel.updateOne({ _id: lead._id }, { $set: upd })

    // Audit trail
    if (prevQualif !== finalQualif) {
      const msg = scoring.disqualified
        ? `Disqualifié: ${scoring.disqualified_reason} (score ${finalScore})`
        : `Scoring EAP: ${finalQualif} (${finalScore} pts)`
      await this.pushEvent(lead._id as Types.ObjectId, 'lead_scored', msg)
    }
    if (newPipeline !== prevPipeline) {
      const STAGE_LABEL: Record<string, string> = {
        nouveau: 'Nouveau', mql: 'MQL', sql: 'SQL', rdv_programme: 'RDV Programmé',
        appel_diagnostic: 'Appel Diagnostic', won: 'Won', lost: 'Lost', nurturing: 'Nurturing',
      }
      await this.pushEvent(
        lead._id as Types.ObjectId,
        'pipeline_changed',
        `Pipeline auto: ${STAGE_LABEL[prevPipeline] ?? prevPipeline} → ${STAGE_LABEL[newPipeline] ?? newPipeline} (scoring EAP)`,
      )
    }
  }

  /**
   * Re-score every Typebot lead by rebuilding the EAP input from stored
   * fields (lead + dynamic_fields). Useful after rule changes or for backfill.
   */
  async recalculateAllScores(): Promise<{ updated: number; disqualified: number; errors: number }> {
    const leads = await this.leadModel.find({ source_type: 'typebot' }).exec()
    let updated = 0, disqualified = 0, errors = 0

    for (const lead of leads) {
      try {
        const dyn = (lead.dynamic_fields ?? {}) as Record<string, unknown>
        const str = (key: string): string | null => {
          const v = dyn[key]
          return v !== null && v !== undefined && String(v).trim() !== '' ? String(v).trim() : null
        }
        const scoring = scoreEapLead({
          age: lead.age,
          phone: lead.phone,
          pays: lead.pays,
          motivation: lead.motivation || null,
          q9_situation_pro:        str('Situation professionnelle'),
          q10_experience_ecom:     str('Expérience e-commerce Afrique'),
          q11_invest_formation:    str('Déjà investi en formation'),
          q12_connaissance_myril:  str('Connaissance Myril SEKOU') ?? lead.reseau_source ?? null,
          q14_objectif_gain:       str('Objectif gain 6 mois'),
          q15_pack_choisi:         str('Pack choisi'),
          q16_montant_acompte:     str('Montant mobilisable immédiatement') ?? (lead.budget ? String(lead.budget) : null),
          commentaire_libre:       str('Commentaire libre'),
        })
        await this.applyScoringToLead(lead, scoring)
        if (scoring.disqualified) disqualified++
        else updated++
      } catch (err) {
        this.logger.error(`recalculateAllScores: lead ${lead._id}: ${(err as Error).message}`)
        errors++
      }
    }

    this.logger.log(`recalculateAllScores: updated=${updated} disqualified=${disqualified} errors=${errors}`)
    return { updated, disqualified, errors }
  }

  /**
   * Add (or update) a manual bonus on a lead and re-apply scoring.
   * Used by closers from LeadDetailPage UI.
   */
  async addManualBonus(
    leadId: string,
    dto: { rule: string; points: number; reason?: string },
    userId?: string,
  ): Promise<LeadDocument> {
    const lead = await this.leadModel.findById(leadId).exec()
    if (!lead) throw new NotFoundException('Lead introuvable')

    const newBonus = {
      rule: dto.rule,
      points: dto.points,
      reason: dto.reason ?? '',
      author_id: userId ?? null,
      date: new Date(),
    }
    const bonuses = [...((lead as Lead).manual_bonuses ?? []), newBonus]
    await this.leadModel.updateOne({ _id: lead._id }, { $set: { manual_bonuses: bonuses } })
    await this.pushEvent(
      lead._id as Types.ObjectId,
      'bonus_added',
      `Bonus manuel: ${dto.rule} (${dto.points >= 0 ? '+' : ''}${dto.points} pts) — ${dto.reason ?? ''}`,
      userId,
    )

    // Re-run scoring with the new bonus list
    const refreshed = await this.leadModel.findById(leadId).exec()
    if (refreshed) await this.rescoreLead(refreshed)
    return (await this.leadModel.findById(leadId).lean()) as unknown as LeadDocument
  }

  async removeManualBonus(leadId: string, bonusIndex: number, userId?: string): Promise<LeadDocument> {
    const lead = await this.leadModel.findById(leadId).exec()
    if (!lead) throw new NotFoundException('Lead introuvable')
    const bonuses = [...((lead as Lead).manual_bonuses ?? [])]
    if (bonusIndex < 0 || bonusIndex >= bonuses.length) throw new BadRequestException('Bonus introuvable')
    const removed = bonuses.splice(bonusIndex, 1)[0]
    await this.leadModel.updateOne({ _id: lead._id }, { $set: { manual_bonuses: bonuses } })
    await this.pushEvent(
      lead._id as Types.ObjectId,
      'bonus_removed',
      `Bonus retiré: ${removed.rule} (${removed.points >= 0 ? '+' : ''}${removed.points} pts)`,
      userId,
    )
    const refreshed = await this.leadModel.findById(leadId).exec()
    if (refreshed) await this.rescoreLead(refreshed)
    return (await this.leadModel.findById(leadId).lean()) as unknown as LeadDocument
  }

  /**
   * Re-score a single lead from its stored fields. Public counterpart of
   * recalculateAllScores for one-off use.
   */
  async rescoreLead(lead: LeadDocument): Promise<void> {
    const dyn = (lead.dynamic_fields ?? {}) as Record<string, unknown>
    const str = (key: string): string | null => {
      const v = dyn[key]
      return v !== null && v !== undefined && String(v).trim() !== '' ? String(v).trim() : null
    }
    const scoring = scoreEapLead({
      age: lead.age,
      phone: lead.phone,
      pays: lead.pays,
      motivation: lead.motivation || null,
      q9_situation_pro:        str('Situation professionnelle'),
      q10_experience_ecom:     str('Expérience e-commerce Afrique'),
      q11_invest_formation:    str('Déjà investi en formation'),
      q12_connaissance_myril:  str('Connaissance Myril SEKOU') ?? lead.reseau_source ?? null,
      q14_objectif_gain:       str('Objectif gain 6 mois'),
      q15_pack_choisi:         str('Pack choisi'),
      q16_montant_acompte:     str('Montant mobilisable immédiatement') ?? (lead.budget ? String(lead.budget) : null),
      commentaire_libre:       str('Commentaire libre'),
    })
    await this.applyScoringToLead(lead, scoring)
  }

  // ── CSV Import (Typebot historique) ───────────────────────────────────────

  async importFromCsv(buffer: Buffer): Promise<{ created: number; updated: number; errors: number; messages: string[] }> {
    const rows = parseCsv(buffer.toString('utf8'))
    let created = 0, updated = 0, errors = 0
    const messages: string[] = []

    // Metadata columns to skip
    const skipCols = new Set(['result_id', 'submitted_at', 'created_at', 'id'])

    // Known column aliases → lead field
    const nameAliases  = ['nom', 'name', 'prenom_et_nom', 'full_name', 'prenom']
    const emailAliases = ['email', 'e-mail', 'mail', 'adresse_email', 'adresse_mail']
    const phoneAliases = ['telephone', 'tel', 'phone', 'numero', 'numero_de_telephone', 'whatsapp']
    const ageAliases   = ['age', 'âge']
    const reseauAliases= ['reseau_source', 'reseau', 'reseaux', 'comment_avez-vous_connu', 'source_declaree', 'comment_avez_vous_connu']
    const motivAliases = ['motivation', 'objectif', 'pourquoi', 'projet', 'besoin']
    const utmAliases   = ['utm_source', 'utm', 'source']

    const findCol = (row: Record<string, string>, aliases: string[]) => {
      for (const a of aliases) {
        const v = row[a]
        if (v !== undefined && v !== '') return v.trim()
      }
      return undefined
    }

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i]
        const email = findCol(row, emailAliases)?.toLowerCase() ?? null
        const name  = findCol(row, nameAliases) ?? email ?? `Lead #${i + 1}`

        // Collect dynamic fields: anything that's not a known alias and not a skip col
        const knownAliases = new Set([
          ...nameAliases, ...emailAliases, ...phoneAliases, ...ageAliases,
          ...reseauAliases, ...motivAliases, ...utmAliases, ...skipCols,
        ])
        const dynamic: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(row)) {
          if (!knownAliases.has(k) && v !== '') dynamic[k] = v
        }

        const dto: CreateLeadDto = {
          name,
          email: email ?? undefined,
          phone: findCol(row, phoneAliases),
          age: findCol(row, ageAliases) ? Number(findCol(row, ageAliases)) : undefined,
          utm_source: findCol(row, utmAliases),
          reseau_source: findCol(row, reseauAliases),
          motivation: findCol(row, motivAliases),
          dynamic_fields: Object.keys(dynamic).length > 0 ? dynamic : undefined,
          source_type: 'import',
        }

        // Upsert by email
        if (email) {
          const existing = await this.leadModel.findOne({ email })
          if (existing) {
            // Update only non-empty fields that are currently null/empty
            const upd: Record<string, unknown> = {}
            if (!existing.phone && dto.phone)          upd.phone = dto.phone
            if (!existing.age && dto.age)              upd.age = dto.age
            if (!existing.reseau_source && dto.reseau_source) upd.reseau_source = dto.reseau_source
            if (!existing.motivation && dto.motivation) upd.motivation = dto.motivation
            if (!existing.utm_source && dto.utm_source) upd.utm_source = dto.utm_source
            if (Object.keys(dynamic).length) {
              upd.dynamic_fields = { ...(existing.dynamic_fields ?? {}), ...dynamic }
            }
            if (Object.keys(upd).length > 0) {
              await this.leadModel.updateOne({ _id: existing._id }, upd)
            }
            updated++
          } else {
            await this.createLead(dto)
            created++
          }
        } else {
          // No email → always create
          await this.createLead(dto)
          created++
        }
      } catch (err: unknown) {
        errors++
        messages.push(`Ligne ${i + 2}: ${(err as Error).message}`)
      }
    }

    return { created, updated, errors, messages }
  }

  // ── Cal.com Slots & Booking ───────────────────────────────────────────────

  async getCalComSlots(leadId: string, closerUserId: string): Promise<Record<string, { time: string }[]>> {
    const closer = await this.userModel.findById(closerUserId).lean()
    if (!closer?.calcom_event_type_id) {
      throw new BadRequestException("Ce closer n'a pas de Cal.com event type configuré. Ajoutez calcom_event_type_id dans son profil.")
    }

    // Fetch slots for the next 14 days
    const startTime = new Date().toISOString()
    const endTime   = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

    return this.calComService.getSlots(closer.calcom_event_type_id, startTime, endTime)
  }

  async createCalComBooking(leadId: string, closerUserId: string, slot: string): Promise<CallDocument> {
    const [lead, closer] = await Promise.all([
      this.leadModel.findById(leadId),
      this.userModel.findById(closerUserId).lean(),
    ])

    if (!lead) throw new NotFoundException('Lead introuvable')
    if (!closer?.calcom_event_type_id) {
      throw new BadRequestException("calcom_event_type_id manquant sur ce closer")
    }
    if (!lead.email) throw new BadRequestException('Ce lead n\'a pas d\'adresse email')

    const booking = await this.calComService.createBooking({
      eventTypeId: closer.calcom_event_type_id,
      start:       slot,
      name:        lead.name,
      email:       lead.email,
      phone:       lead.phone ?? undefined,
    })

    // Update pipeline
    await this.updatePipeline(leadId, 'rdv_programme')

    // Create call record with calcom_booking_uid
    const call = await this.createCall(leadId, {
      date:              booking.startTime,
      google_meet_link:  booking.meetLink,
      status:            'planned',
      closer_id:         closerUserId,
    })

    // Store booking UID on the call
    await this.callModel.updateOne(
      { _id: (call as unknown as { _id: Types.ObjectId })._id },
      { $set: { calcom_booking_uid: booking.uid } },
    )

    // Generate .ics and send confirmation email
    await this.sendCalComConfirmationEmail(lead, closer as UserDocument, booking.startTime, booking.endTime, booking.meetLink)

    return call
  }

  private async sendCalComConfirmationEmail(
    lead: LeadDocument,
    closer: UserDocument,
    startTime: string,
    endTime: string,
    meetLink: string,
  ): Promise<void> {
    if (!lead.email) return

    const start = new Date(startTime)
    const end   = new Date(endTime)

    const cal = ical({ name: 'Moonscale' })
    cal.createEvent({
      start,
      end,
      summary:     `Appel avec ${closer.firstName} ${closer.lastName} — Moonscale`,
      description: `Rejoignez l'appel via ce lien :\n${meetLink}`,
      location:    meetLink,
      organizer:   { name: `${closer.firstName} ${closer.lastName}`, email: closer.email },
      attendees: [
        { name: lead.name, email: lead.email },
        { name: `${closer.firstName} ${closer.lastName}`, email: closer.email },
      ],
    })

    try {
      await this.mailService.sendBookingConfirmation({
        to:          lead.email,
        leadName:    lead.name,
        closerName:  `${closer.firstName} ${closer.lastName}`,
        startTime:   start,
        endTime:     end,
        meetLink,
        icsContent:  cal.toString(),
      })
    } catch (err) {
      this.logger.error(`Failed to send booking confirmation to ${lead.email}: ${(err as Error).message}`)
    }
  }

  // ── Cal.com Booking Email Pref ────────────────────────────────────────────

  setBookingEmailPref(leadId: string, sendEmail: boolean): void {
    this.bookingEmailPrefs.set(leadId, sendEmail)
    setTimeout(() => this.bookingEmailPrefs.delete(leadId), 30 * 60 * 1000)
  }

  // ── Cal.com Webhook ───────────────────────────────────────────────────────

  async handleCalComWebhook(payload: Record<string, unknown>): Promise<void> {
    const triggerEvent = payload.triggerEvent as string

    if (triggerEvent === 'BOOKING_CREATED') {
      await this.handleCalComBookingCreated(payload)
    } else if (triggerEvent === 'BOOKING_CANCELLED') {
      await this.handleCalComBookingCancelled(payload)
    } else if (triggerEvent === 'BOOKING_RESCHEDULED') {
      await this.handleCalComBookingRescheduled(payload)
    }
  }

  private async handleCalComBookingCreated(payload: Record<string, unknown>): Promise<void> {
    const bookingPayload = payload.payload as Record<string, unknown>
    if (!bookingPayload) return

    const attendees = (bookingPayload.attendees as Array<{ email: string; name: string }>) ?? []
    const attendee  = attendees[0]
    if (!attendee?.email) return

    const startTime    = bookingPayload.startTime as string
    const endTime      = bookingPayload.endTime as string
    const bookingUid   = bookingPayload.uid as string
    const videoCall    = bookingPayload.videoCallData as Record<string, unknown> | undefined
    const meetLink     = (videoCall?.url as string)
      ?? (bookingPayload.metadata as Record<string, string> | undefined)?.videoCallUrl
      ?? (bookingPayload.location as string)
      ?? ''

    const organizer = bookingPayload.organizer as { email?: string; name?: string } | undefined

    const lead = await this.leadModel.findOne({ email: attendee.email.toLowerCase() })
    if (!lead) {
      this.logger.warn(`Cal.com BOOKING_CREATED: no lead for email ${attendee.email}`)
      return
    }

    // Avoid duplicate if already booked via ERP (calcom_booking_uid already set)
    const existing = await this.callModel.findOne({ lead_id: lead._id, calcom_booking_uid: bookingUid })
    if (existing) return

    const BELOW_RDV: string[] = ['nouveau', 'mql', 'sql']
    if (BELOW_RDV.includes(lead.pipeline_status ?? '')) {
      await this.updatePipeline(String(lead._id), 'rdv_programme')
    }

    let closerId: string | undefined
    if (organizer?.email) {
      const closerUser = await this.userModel.findOne({ email: organizer.email.toLowerCase() }).lean()
      if (closerUser) closerId = String((closerUser as unknown as { _id: unknown })._id)
    }

    const call = await this.createCall(String(lead._id), {
      date:             startTime,
      google_meet_link: meetLink,
      status:           'planned',
      closer_id:        closerId,
    })

    await this.callModel.updateOne(
      { _id: (call as unknown as { _id: Types.ObjectId })._id },
      { $set: { calcom_booking_uid: bookingUid } },
    )

    // Check email pref stored by frontend before opening iframe (default: send)
    const leadIdStr = String(lead._id)
    const sendEmail = this.bookingEmailPrefs.has(leadIdStr)
      ? this.bookingEmailPrefs.get(leadIdStr)!
      : true
    this.bookingEmailPrefs.delete(leadIdStr)

    // Send confirmation email with .ics
    if (sendEmail && lead.email && endTime) {
      const closer = closerId
        ? await this.userModel.findById(closerId).lean() as UserDocument | null
        : null

      const cal = ical({ name: 'Moonscale' })
      const start = new Date(startTime)
      const end   = new Date(endTime)

      cal.createEvent({
        start,
        end,
        summary:     `Appel ${closer ? `avec ${closer.firstName} ${closer.lastName}` : ''} — Moonscale`,
        description: `Lien Google Meet : ${meetLink}`,
        location:    meetLink,
        organizer:   { name: organizer?.name ?? 'Moonscale', email: organizer?.email ?? 'noreply@moonscale.com' },
        attendees:   [{ name: attendee.name ?? lead.name, email: lead.email }],
      })

      try {
        await this.mailService.sendBookingConfirmation({
          to:         lead.email,
          leadName:   lead.name,
          closerName: closer ? `${closer.firstName} ${closer.lastName}` : (organizer?.name ?? 'notre équipe'),
          startTime:  start,
          endTime:    end,
          meetLink,
          icsContent: cal.toString(),
        })
      } catch (err) {
        this.logger.error(`Booking confirmation email failed for ${lead.email}: ${(err as Error).message}`)
      }
    }
  }

  async cancelCalComBooking(callId: string): Promise<void> {
    const call = await this.callModel.findById(callId)
    if (!call) throw new NotFoundException('Call introuvable')
    if (!call.calcom_booking_uid) throw new BadRequestException('Ce call n\'a pas de booking Cal.com associé')

    await this.calComService.cancelBooking(call.calcom_booking_uid)
    await this.callModel.updateOne({ _id: call._id }, { $set: { status: 'cancelled' } })
    await this.pushEvent(call.lead_id, 'call_cancelled', 'Appel annulé depuis l\'ERP')
  }

  private async handleCalComBookingCancelled(payload: Record<string, unknown>): Promise<void> {
    const bookingPayload = payload.payload as Record<string, unknown>
    const bookingUid = bookingPayload?.uid as string
    if (!bookingUid) return

    const call = await this.callModel.findOne({ calcom_booking_uid: bookingUid })
    if (!call) return

    await this.callModel.updateOne({ _id: call._id }, { $set: { status: 'cancelled' } })
    await this.pushEvent(call.lead_id, 'call_cancelled', 'Appel annulé via Cal.com')
    this.logger.log(`Cal.com BOOKING_CANCELLED: call ${call._id} marked cancelled`)
  }

  private async handleCalComBookingRescheduled(payload: Record<string, unknown>): Promise<void> {
    const bookingPayload = payload.payload as Record<string, unknown>
    const bookingUid  = bookingPayload?.uid as string
    const newStartTime = bookingPayload?.startTime as string
    const videoCall   = bookingPayload?.videoCallData as Record<string, unknown> | undefined
    const newMeetLink = (videoCall?.url as string)
      ?? (bookingPayload?.location as string)
      ?? ''

    if (!bookingUid || !newStartTime) return

    const call = await this.callModel.findOne({ calcom_booking_uid: bookingUid })
    if (!call) return

    const updates: Record<string, unknown> = { date: new Date(newStartTime), status: 'planned' }
    if (newMeetLink) updates.google_meet_link = newMeetLink

    await this.callModel.updateOne({ _id: call._id }, { $set: updates })
    await this.pushEvent(call.lead_id, 'call_rescheduled', `Appel reprogrammé → ${new Date(newStartTime).toLocaleString('fr-FR')}`)
  }

  // ── Analytics ─────────────────────────────────────────────────────────────

  async getFunnelStats(dateFrom?: string, dateTo?: string) {
    const matchFilter: Record<string, unknown> = {}
    if (dateFrom || dateTo) {
      matchFilter.createdAt = {}
      if (dateFrom) (matchFilter.createdAt as Record<string, Date>)['$gte'] = new Date(dateFrom)
      if (dateTo) (matchFilter.createdAt as Record<string, Date>)['$lte'] = new Date(dateTo)
    }

    const pipeline = [
      { $match: matchFilter },
      { $group: { _id: '$pipeline_status', count: { $sum: 1 } } },
    ]

    const [statusCounts, sourceCounts] = await Promise.all([
      this.leadModel.aggregate(pipeline),
      this.leadModel.aggregate([
        { $match: matchFilter },
        { $group: { _id: '$utm_source', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ])

    const total = await this.leadModel.countDocuments(matchFilter)

    return { total, by_pipeline: statusCounts, by_source: sourceCounts }
  }

  // ── Acquisition KPIs ──────────────────────────────────────────────────────

  async getAcquisitionKpis(dateFrom?: string, dateTo?: string) {
    const now = new Date()
    const ago7d  = new Date(now.getTime() - 7  * 86400000)
    const ago30d = new Date(now.getTime() - 30 * 86400000)

    const hasPeriod = Boolean(dateFrom || dateTo)
    const periodFilter: Record<string, unknown> = hasPeriod
      ? {
          createdAt: {
            ...(dateFrom ? { $gte: new Date(dateFrom) } : {}),
            ...(dateTo   ? { $lte: new Date(dateTo + 'T23:59:59.999Z') } : {}),
          },
        }
      : {}

    const [total, new7d, new30d, byPipeline, bySource, periodNew, periodWon] = await Promise.all([
      this.leadModel.countDocuments(),
      this.leadModel.countDocuments({ createdAt: { $gte: ago7d } }),
      this.leadModel.countDocuments({ createdAt: { $gte: ago30d } }),
      this.leadModel.aggregate([{ $group: { _id: '$pipeline_status', count: { $sum: 1 } } }]),
      this.leadModel.aggregate([
        { $group: { _id: '$source_type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      hasPeriod ? this.leadModel.countDocuments(periodFilter) : Promise.resolve(null),
      hasPeriod ? this.leadModel.countDocuments({ ...periodFilter, pipeline_status: 'won' }) : Promise.resolve(null),
    ])

    const pm = Object.fromEntries(byPipeline.map((r: { _id: string; count: number }) => [r._id, r.count]))
    const wonCount    = pm['won'] ?? 0
    const sqlPlus     = (pm['sql'] ?? 0) + (pm['rdv_programme'] ?? 0) + (pm['appel_diagnostic'] ?? 0) + wonCount
    const convRate    = total > 0 ? +((wonCount / total) * 100).toFixed(1) : 0

    return {
      total,
      new_last_7d: new7d,
      new_last_30d: new30d,
      won: wonCount,
      sql_plus: sqlPlus,
      conversion_rate: convRate,
      by_pipeline: pm,
      by_source: bySource,
      period_new: periodNew,
      period_won: periodWon,
    }
  }

  // ── Typebot variable sync & Groq mapping ─────────────────────────────────

  async syncTypebotVariables(typebotId: string, typebotName?: string): Promise<TypebotFormConfigDocument> {
    const { baseUrl, token } = this.typebotEnv()

    let variables: string[] = []
    let botName = typebotName ?? typebotId

    if (baseUrl && token) {
      try {
        const headers = { Authorization: `Bearer ${token}` }
        const info = await axios.get(`${baseUrl}/api/v1/typebots/${typebotId}`, { headers, timeout: 10000 })
        const typebot = info.data.typebot as Record<string, unknown> | undefined
        botName = (typebot?.name as string) ?? botName
        variables = this.extractTypebotVariables(typebot ?? {})
      } catch (err) {
        this.logger.warn(`syncTypebotVariables: cannot fetch typebot ${typebotId}: ${(err as Error).message}`)
      }
    }

    let mapping: TypebotFieldMapping = {}
    if (variables.length > 0) {
      mapping = await this.getGroqMapping(variables)
    }

    const config = await this.typebotFormConfigModel.findOneAndUpdate(
      { typebot_id: typebotId },
      { typebot_id: typebotId, typebot_name: botName, variables, mapping, last_synced_at: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean() as TypebotFormConfigDocument

    this.logger.log(`syncTypebotVariables [${botName}]: ${variables.length} variables, mapping keys: ${Object.keys(mapping).join(', ')}`)
    return config
  }

  private extractTypebotVariables(typebot: Record<string, unknown>): string[] {
    const vars = typebot.variables as Array<{ id: string; name: string }> | undefined
    if (!Array.isArray(vars)) return []
    return vars.map((v) => v.name).filter(Boolean)
  }

  private async getGroqMapping(variables: string[]): Promise<TypebotFieldMapping> {
    // Rotate through available keys to spread load
    const keys = [
      process.env.GROQ_API_KEY_1,
      process.env.GROQ_API_KEY_2,
      process.env.GROQ_API_KEY_3,
      process.env.GROQ_API_KEY,
    ].filter(Boolean) as string[]
    const apiKey = keys[Math.floor(Math.random() * keys.length)]
    if (!apiKey) return {}

    const prompt = `Tu es un expert en mapping de formulaires. Voici les variables d'un formulaire Typebot :
${variables.map((v) => `- "${v}"`).join('\n')}

Mappe-les aux champs lead suivants (utilise exactement ces noms de champs) :
- name : nom complet du prospect (si prénom et nom ne sont pas séparés)
- prenom : prénom seul (si variable séparée du nom de famille)
- nom : nom de famille seul (si variable séparée du prénom)
- email : adresse email
- phone : téléphone ou WhatsApp
- age : âge en années
- pays : pays de résidence
- budget : budget disponible (montant numérique)
- reseau_source : comment le prospect a connu la formation / la marque
- motivation : objectif ou motivation du prospect
- utm_source : source marketing (si présente)

Retourne UNIQUEMENT un objet JSON valide, sans texte ni markdown, exemple :
{"email":"Email","phone":"WhatsApp","age":"Age"}`

    try {
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.3-70b-versatile',
          max_tokens: 512,
          temperature: 0,
          messages: [{ role: 'user', content: prompt }],
        },
        {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          timeout: 15000,
        },
      )

      const text: string = response.data?.choices?.[0]?.message?.content ?? ''
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return {}
      return JSON.parse(jsonMatch[0]) as TypebotFieldMapping
    } catch (err) {
      this.logger.warn(`getGroqMapping failed: ${(err as Error).message}`)
      return {}
    }
  }

  private variablesMismatch(receivedKeys: string[], storedVariables: string[]): boolean {
    if (storedVariables.length === 0) return true
    const stored = new Set(storedVariables)
    const overlap = receivedKeys.filter((k) => stored.has(k))
    // Less than 40% of received keys are known → consider a different form version
    return overlap.length < receivedKeys.length * 0.4
  }

  private parseWithMapping(payload: Record<string, unknown>, mapping: TypebotFieldMapping) {
    // Support both original Typebot names ("WhatsApp") and normalized keys ("whatsapp")
    const normKey = (k: string) => k.toLowerCase().replace(/\s+/g, '_')
    const get = (key: string | undefined): string | null => {
      if (!key) return null
      const v = payload[key] ?? payload[normKey(key)]
      return v !== null && v !== undefined && String(v).trim() !== '' ? String(v).trim() : null
    }

    const prenom = get(mapping.prenom)
    const nom    = get(mapping.nom)
    const name   = (prenom || nom)
      ? [prenom, nom].filter(Boolean).join(' ')
      : get(mapping.name) ?? get(mapping.email) ?? 'Inconnu'

    const email  = get(mapping.email)?.toLowerCase() ?? null
    const phone  = get(mapping.phone)
    const ageRaw = get(mapping.age)
    const age    = ageRaw ? Number(ageRaw) || null : null

    const pays          = get(mapping.pays)
    const motivation    = get(mapping.motivation)
    const reseau_source = get(mapping.reseau_source)
    const utm_source    = get(mapping.utm_source)

    let budget: number | null = null
    const budgetRaw = get(mapping.budget)
    if (budgetRaw) {
      const n = Number(budgetRaw.replace(/[^0-9.]/g, ''))
      if (n > 0) budget = n
    }

    const knownValues = new Set(Object.values(mapping).filter(Boolean))
    const metaKeys    = new Set(['submittedAt', 'message', 'result_id', 'resultId', 'variables'])

    const dynamic: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(payload)) {
      if (!knownValues.has(k) && !metaKeys.has(k) && v !== null && v !== undefined && String(v).trim() !== '') {
        dynamic[k] = v
      }
    }

    const submittedAtRaw = payload['submittedAt'] as string | undefined
    const submitted_at   = submittedAtRaw ? new Date(submittedAtRaw) : null

    return { name, email, phone, age, pays, motivation, reseau_source, budget, utm_source, dynamic, submitted_at }
  }

  private async extractBudget(text: string): Promise<number> {
    if (!text || !text.trim()) return 0

    // Match thousands-separated values ("100.000f", "60.000") or plain 4+ digit numbers ("100000", "10000")
    const numPattern = /\b(\d{1,3}(?:[.\s]\d{3})+|\d{4,})\s*(?:[fF](?:cfa|CFA)?)?\b/
    const match = text.match(numPattern)
    if (match) {
      const n = parseInt(match[1].replace(/[.\s]/g, ''), 10)
      if (!isNaN(n) && n > 0) return n
    }

    // No digits at all → definitely zero
    if (!/\d/.test(text)) return 0

    // Has digits but ambiguous (e.g. "100mill") → delegate to Groq
    return this.extractBudgetWithGroq(text)
  }

  private async extractBudgetWithGroq(text: string): Promise<number> {
    const keys = [
      process.env.GROQ_API_KEY_1,
      process.env.GROQ_API_KEY_2,
      process.env.GROQ_API_KEY_3,
      process.env.GROQ_API_KEY,
    ].filter(Boolean) as string[]
    const apiKey = keys[Math.floor(Math.random() * keys.length)]
    if (!apiKey) return 0

    const prompt = `Extrait le montant financier depuis ce texte et retourne UNIQUEMENT un entier (en unités de base, ex: 100000 pour "100 000 F CFA"). Réponds 0 si aucun montant clair.\n\nTexte: "${text}"`

    try {
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.3-70b-versatile',
          max_tokens: 32,
          temperature: 0,
          messages: [{ role: 'user', content: prompt }],
        },
        {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          timeout: 10000,
        },
      )
      const raw: string = response.data?.choices?.[0]?.message?.content ?? '0'
      const n = parseInt(raw.trim(), 10)
      return isNaN(n) ? 0 : Math.max(0, n)
    } catch (err) {
      this.logger.warn(`extractBudgetWithGroq failed: ${(err as Error).message}`)
      return 0
    }
  }

  async listTypebotFormConfigs(): Promise<TypebotFormConfigDocument[]> {
    return this.typebotFormConfigModel.find().sort({ typebot_name: 1 }).lean() as unknown as TypebotFormConfigDocument[]
  }

  async resyncTypebotFormConfig(typebotId: string): Promise<TypebotFormConfigDocument> {
    return this.syncTypebotVariables(typebotId)
  }

  // Full resync: re-fetch ALL results from Typebot API, re-parse with Groq mapping,
  // update existing leads (force-overwrites core fields), and apply WhatsApp → SQL rule.
  async resyncFormLeads(
    formId: string,
    options: { utmSource?: string } = {},
  ): Promise<{ updated: number; created: number; skipped: number; errors: number }> {
    const { baseUrl, token } = this.typebotEnv()
    if (!baseUrl || !token) throw new BadRequestException('TYPEBOT_TOKEN et TYPEBOT_SELF_URL requis')

    // 1. Sync variables + Groq mapping for this form
    const config = await this.syncTypebotVariables(formId)
    const hasMapping = Object.keys(config.mapping ?? {}).length > 0
    const botName   = config.typebot_name ?? formId
    const headers   = { Authorization: `Bearer ${token}` }

    const utmSource  = options.utmSource ?? null
    const isWhatsApp = utmSource?.toLowerCase().includes('whatsapp') ?? false

    let updated = 0, created = 0, skipped = 0, errors = 0
    let cursor: string | undefined = undefined

    do {
      const url = `${baseUrl}/api/v1/typebots/${formId}/results?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}&timeFilter=allTime`
      let res: { data: { results?: unknown[]; nextCursor?: string } }
      try {
        res = await axios.get(url, { headers, timeout: 15000 })
      } catch (err) {
        this.logger.error(`resyncFormLeads: fetch error: ${(err as Error).message}`)
        break
      }

      const results = (res.data.results ?? []) as Array<{
        id: string
        isCompleted: boolean
        createdAt?: string
        variables: Array<{ name: string; value: unknown }>
      }>
      cursor = res.data.nextCursor

      for (const result of results) {
        if (!result.isCompleted) { skipped++; continue }

        try {
          // Build flat key→value map from variables (preserves original names like "WhatsApp", "Email")
          const flat: Record<string, unknown> = {}
          for (const v of result.variables ?? []) {
            if (v.value !== null && v.value !== undefined && v.value !== '') {
              flat[v.name] = v.value
            }
          }

          const parsed = hasMapping
            ? this.parseWithMapping(flat, config.mapping)
            : this.parseTypebotVariables(result.variables ?? [])

          const submittedAt = result.createdAt ? new Date(result.createdAt) : null

          // Find existing lead by result ID first, then email
          const existing =
            await this.leadModel.findOne({ typebot_result_id: result.id }).lean() ??
            (parsed.email ? await this.leadModel.findOne({ email: parsed.email }).lean() : null)

          const coreUpd: Record<string, unknown> = {
            typebot_result_id: result.id,
            source_form_id:    formId,
            source_form_name:  botName,
            dynamic_fields:    { ...(((existing as LeadDocument | null)?.dynamic_fields) ?? {}), ...flat },
          }
          if (submittedAt)                              coreUpd.submitted_at        = submittedAt
          if (utmSource)                                coreUpd.utm_source          = utmSource
          if (parsed.name && parsed.name !== 'Inconnu') coreUpd.name               = parsed.name
          if (parsed.email)                             coreUpd.email               = parsed.email
          if (parsed.phone)                             coreUpd.phone               = String(parsed.phone)
          if (parsed.age)                               coreUpd.age                 = Number(parsed.age)
          if (parsed.pays)                              coreUpd.pays                = parsed.pays
          // Budget: parsed → "Commentaire libre" fallback
          let loopBudget = parsed.budget ?? null
          if (!loopBudget) {
            const commentaire = (flat['Commentaire libre'] ?? flat['commentaire_libre']) as string | undefined
            if (commentaire) loopBudget = await this.extractBudget(commentaire) || null
          }
          if (loopBudget) coreUpd.budget = loopBudget

          // Réseau: parsed → flat "Réseau" → utmSource
          const loopReseau = parsed.reseau_source
            ? String(parsed.reseau_source)
            : ((flat['Réseau'] as string | undefined) ?? utmSource ?? null)
          if (loopReseau) coreUpd.reseau_source = loopReseau

          if (parsed.motivation)                        coreUpd.motivation          = String(parsed.motivation)

          if (existing) {
            const existingLead = existing as unknown as Lead & { _id: Types.ObjectId }
            if (isWhatsApp && existingLead.pipeline_status === 'nouveau') coreUpd.pipeline_status = 'sql'

            await this.leadModel.updateOne({ _id: existingLead._id }, { $set: coreUpd })
            updated++
          } else {
            const lead = await this.leadModel.create({
              name:             (parsed.name && parsed.name !== 'Inconnu') ? parsed.name : 'Inconnu',
              email:            parsed.email ?? null,
              phone:            parsed.phone ? String(parsed.phone) : null,
              age:              parsed.age ? Number(parsed.age) : null,
              pays:             parsed.pays ?? null,
              budget:           loopBudget ?? null,
              utm_source:       utmSource,
              reseau_source:    loopReseau,
              motivation:       parsed.motivation ? String(parsed.motivation) : '',
              dynamic_fields:   flat,
              source_type:      'typebot',
              typebot_result_id: result.id,
              source_form_id:   formId,
              source_form_name: botName,
              submitted_at:     submittedAt,
              pipeline_status:  isWhatsApp ? 'sql' : 'nouveau',
              events: [{ type: 'created', message: `Lead importé depuis Typebot (${botName})`, date: submittedAt ?? new Date(), actor_id: null }],
            })
            created++
          }
        } catch (err) {
          this.logger.error(`resyncFormLeads: result ${result.id}: ${(err as Error).message}`)
          errors++
        }
      }
    } while (cursor)

    this.logger.log(`resyncFormLeads [${botName}]: updated=${updated} created=${created} skipped=${skipped} errors=${errors}`)
    return { updated, created, skipped, errors }
  }

  // Migration: ensure a TypebotFormConfig exists for every known source_form_id
  async migrateTypebotConfigs(): Promise<{ synced: number; skipped: number }> {
    const formIds = await this.leadModel.distinct('source_form_id', {
      source_type: 'typebot',
      source_form_id: { $ne: null },
    })

    let synced = 0, skipped = 0

    for (const formId of formIds as string[]) {
      const existing = await this.typebotFormConfigModel.findOne({ typebot_id: formId }).lean()
      if (existing) { skipped++; continue }

      const nameDoc = await this.leadModel.findOne({ source_form_id: formId }).select('source_form_name').lean()
      await this.syncTypebotVariables(formId, (nameDoc as { source_form_name?: string } | null)?.source_form_name ?? undefined)
      synced++
    }

    this.logger.log(`migrateTypebotConfigs: synced=${synced} skipped=${skipped}`)
    return { synced, skipped }
  }

  // Re-map existing leads using stored TypebotFormConfig mappings.
  // Only fills fields that are currently null/empty — never overwrites existing data.
  async migrateLeadsFromFormConfigs(): Promise<{ updated: number; skipped: number; errors: number }> {
    const leads = await this.leadModel.find({
      typebot_result_id: { $ne: null}
    }).lean()

    let updated = 0, skipped = 0, errors = 0

    for (const lead of leads) {
      try {
        const config = await this.typebotFormConfigModel
          .findOne({ typebot_id: (lead as { source_form_id: string }).source_form_id || 'q10953ehzz3kt5xhofbnsog6' })
          .lean() as (TypebotFormConfigDocument & { mapping: TypebotFieldMapping }) | null

        if (!config || !config.mapping || Object.keys(config.mapping).length === 0) {
          skipped++
          continue
        }

        const dyn     = (lead.dynamic_fields ?? {}) as Record<string, unknown>
        const mapping = config.mapping

        // dynamic_fields keys were normalized by parseTypebotVariables: toLowerCase + spaces→underscores
        // The Groq mapping uses original Typebot names ("WhatsApp", "Pays de résidence", etc.)
        // So we try original key first, then the normalized version as fallback.
        const normKey = (k: string) => k.toLowerCase().replace(/\s+/g, '_')
        const get = (key: string | undefined): string | null => {
          if (!key) return null
          const v = dyn[key] ?? dyn[normKey(key)]
          return v !== null && v !== undefined && String(v).trim() !== '' ? String(v).trim() : null
        }

        const upd: Record<string, unknown> = {}

        // Name: only fix if missing or generic placeholder
        const prenom     = get(mapping.prenom)
        const nom        = get(mapping.nom)
        const nameFromDyn = (prenom || nom)
          ? [prenom, nom].filter(Boolean).join(' ')
          : get(mapping.name)
        if (nameFromDyn && (!lead.name || lead.name === 'Inconnu')) {
          upd.name = nameFromDyn
        }

        if (!lead.email) {
          const v = get(mapping.email)?.toLowerCase()
          if (v) upd.email = v
        }

        if (!lead.phone) {
          const v = get(mapping.phone)
          if (v) upd.phone = v
        }

        if (!lead.age) {
          const v = get(mapping.age)
          const n = v ? Number(v) || null : null
          if (n) upd.age = n
        }

        if (!lead.pays) {
          const v = get(mapping.pays)
          if (v) upd.pays = v
        }

        if (!lead.budget) {
          const commentaire = dyn['commentaire_libre'] as string | undefined
          const budget = commentaire ? await this.extractBudget(commentaire) : 0
          if (budget >= 0) upd.budget = budget;
          
        }

        if (!lead.reseau_source) {
          const v = get(mapping.reseau_source)
          upd.reseau_source = v ?? 'WhatsApp'
        }

        if (!lead.motivation) {
          const v = get(mapping.motivation)
          if (v) upd.motivation = v
        }

        if (Object.keys(upd).length > 0) {
          await this.leadModel.updateOne({ _id: lead._id }, { $set: upd })
          updated++
        } else {
          skipped++
        }
      } catch (err) {
        this.logger.error(`migrateLeadsFromFormConfigs: lead ${(lead as { _id: unknown })._id}: ${(err as Error).message}`)
        errors++
      }
    }

    this.logger.log(`migrateLeadsFromFormConfigs: updated=${updated} skipped=${skipped} errors=${errors}`)
    return { updated, skipped, errors }
  }

  // Migrate: promote leads whose qualification_status was 'sql'/'mql' to matching pipeline_status
  // (only upgrades — never downgrades leads already past that stage)
  async migrateQualificationToStatus(): Promise<{ sql: number; mql: number }> {
    const BELOW_SQL = ['nouveau', 'mql']
    const BELOW_MQL = ['nouveau']

    const [sqlResult, mqlResult] = await Promise.all([
      this.leadModel.updateMany(
        { qualification_status: 'sql', pipeline_status: { $in: BELOW_SQL } } as Record<string, unknown>,
        { $set: { pipeline_status: 'sql' } },
      ),
      this.leadModel.updateMany(
        { qualification_status: 'mql', pipeline_status: { $in: BELOW_MQL } } as Record<string, unknown>,
        { $set: { pipeline_status: 'mql' } },
      ),
    ])

    this.logger.log(`migrateQualificationToStatus: sql=${sqlResult.modifiedCount} mql=${mqlResult.modifiedCount}`)
    return { sql: sqlResult.modifiedCount, mql: mqlResult.modifiedCount }
  }

  // ── Typebot API sync ──────────────────────────────────────────────────────

  private parseTypebotFlatPayload(body: Record<string, unknown>) {
    const str = (key: string): string | null => {
      const v = body[key]
      return v !== null && v !== undefined && String(v).trim() !== '' ? String(v).trim() : null
    }

    const prenom = str('Prenom')
    const nom    = str('Nom')
    const name   = [prenom, nom].filter(Boolean).join(' ') || str('Email') || 'Inconnu'

    const email  = str('Email')?.toLowerCase() ?? null
    const phone  = str('WhatsApp')
    const ageRaw = str('Age')
    const age    = ageRaw ? Number(ageRaw) || null : null

    // Key may have double space from some Typebot exports
    const pays = str('Pays  de résidence') ?? str('Pays de résidence') ?? null

    const motivation     = str('Motivation formation présentielle')
    const reseau_source  = str('Connaissance Myril SEKOU')
    const submittedAtRaw = str('submittedAt')
    const submitted_at   = submittedAtRaw ? new Date(submittedAtRaw) : null

    // Budget: prefer explicit amount field, then extract from pack label
    let budget: number | null = null
    const montantRaw = str('Montant mobilisable immédiatement')
    if (montantRaw) {
      const n = Number(montantRaw.replace(/[^0-9.]/g, ''))
      if (n > 0) budget = n
    }
    if (!budget) {
      const packRaw = str('Pack choisi')
      if (packRaw) {
        const match = packRaw.match(/[\d\s]+/)
        if (match) {
          const n = Number(match[0].replace(/\s+/g, ''))
          if (n > 0) budget = n
        }
      }
    }

    const knownKeys = new Set([
      'Prenom', 'Nom', 'Email', 'WhatsApp', 'Age',
      'Pays  de résidence', 'Pays de résidence',
      'Motivation formation présentielle',
      'Connaissance Myril SEKOU',
      'Montant mobilisable immédiatement',
      'submittedAt', 'message',
    ])

    const dynamic: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(body)) {
      if (!knownKeys.has(k) && v !== null && v !== undefined && String(v).trim() !== '') {
        dynamic[k] = v
      }
    }

    return { name, email, phone, age, pays, motivation, reseau_source, budget, utm_source: null, dynamic, submitted_at }
  }

  private parseTypebotVariables(variables: Array<{ name: string; value: unknown }>) {
    const varMap: Record<string, unknown> = {}
    for (const v of variables) {
      if (v.value !== null && v.value !== undefined && v.value !== '') {
        varMap[v.name.toLowerCase().replace(/\s+/g, '_')] = v.value
      }
    }

    const knownFields = new Set([
      'nom', 'name', 'email', 'telephone', 'téléphone', 'phone',
      'âge', 'age', 'réseau_source', 'reseau_source', 'réseau_source', 'motivation', 'utm_source',
      'pays', 'country', 'ville', 'budget', 'montant', 'montant_budget', 'budget_disponible',
    ])
    const dynamic: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(varMap)) {
      if (!knownFields.has(k)) dynamic[k] = v
    }

    const rawPays = varMap['pays'] ?? varMap['country'] ?? null
    const rawBudget = varMap['budget'] ?? varMap['montant'] ?? varMap['montant_budget'] ?? varMap['budget_disponible'] ?? null

    return {
      name: String(varMap['nom'] ?? varMap['name'] ?? 'Inconnu'),
      email: varMap['email'] ? String(varMap['email']).toLowerCase().trim() : null,
      phone: varMap['telephone'] ?? varMap['téléphone'] ?? varMap['phone'] ?? null,
      age: varMap['âge'] ?? varMap['age'] ?? null,
      pays: rawPays ? String(rawPays) : null,
      budget: rawBudget ? Number(String(rawBudget).replace(/[^0-9.]/g, '')) || null : null,
      reseau_source: varMap['réseau_source'] ?? varMap['reseau_source'] ?? null,
      motivation: varMap['motivation'] ?? null,
      utm_source: varMap['utm_source'] ?? null,
      dynamic,
      submitted_at: null as Date | null,
    }
  }

  private typebotEnv() {
    return {
      baseUrl: process.env.TYPEBOT_SELF_URL ?? '',
      token: process.env.TYPEBOT_TOKEN ?? '',
      workspaceId: process.env.TYPEBOT_WORKSPACE_ID ?? '',
    }
  }

  async listTypebots(): Promise<Array<{ id: string; name: string; webhook_registered: boolean }>> {
    const { baseUrl, token, workspaceId } = this.typebotEnv()
    if (!baseUrl || !token || !workspaceId) return []

    const headers = { Authorization: `Bearer ${token}` }
    try {
      const res = await axios.get(`${baseUrl}/api/v1/typebots?workspaceId=${workspaceId}`, { headers, timeout: 10000 })
      const typebots = (res.data.typebots ?? []) as Array<{ id: string; name: string }>

      // Check which bots already have our webhook registered
      const results = await Promise.all(
        typebots.map(async (t) => {
          let registered = false
          try {
            const wh = await axios.get(`${baseUrl}/api/v1/typebots/${t.id}/webhooks`, { headers, timeout: 8000 })
            const webhooks = wh.data.webhooks ?? []
            const ourUrl = `${process.env.BACKEND_URL ?? ''}/api/webhooks/typebot`
            registered = webhooks.some((w: { url?: string }) => w.url?.includes('/api/webhooks/typebot'))
            void ourUrl
          } catch {
            // Endpoint may not exist on older Typebot versions — treat as unknown
          }
          return { id: t.id, name: t.name, webhook_registered: registered }
        }),
      )
      return results
    } catch {
      return []
    }
  }

  async registerTypebotWebhook(typebotId: string): Promise<{ registered: boolean; message: string }> {
    const { baseUrl, token } = this.typebotEnv()
    if (!baseUrl || !token) throw new BadRequestException('TYPEBOT_TOKEN et TYPEBOT_SELF_URL requis')

    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    const backendUrl = process.env.BACKEND_URL ?? `http://localhost:${process.env.PORT ?? 3001}`
    const webhookUrl = `${backendUrl}/api/webhooks/typebot`

    try {
      // Check existing webhooks first
      const existing = await axios.get(`${baseUrl}/api/v1/typebots/${typebotId}/webhooks`, { headers, timeout: 8000 })
      const alreadyRegistered = (existing.data.webhooks ?? []).some((w: { url?: string }) => w.url?.includes('/api/webhooks/typebot'))
      if (alreadyRegistered) return { registered: true, message: 'Webhook déjà enregistré' }

      // Register the webhook
      await axios.post(
        `${baseUrl}/api/v1/typebots/${typebotId}/webhooks`,
        { url: webhookUrl, method: 'POST', headers: [], queryParams: [] },
        { headers, timeout: 10000 },
      )
      return { registered: true, message: 'Webhook enregistré avec succès' }
    } catch (err: unknown) {
      // Typebot's webhook block API may differ by version — guide user to do it manually
      this.logger.warn(`Typebot webhook register failed for ${typebotId}: ${(err as Error).message}`)
      return { registered: false, message: `Ajoutez manuellement un bloc Webhook dans ce bot pointant vers : ${webhookUrl}` }
    }
  }

  async backfillTypebot(typebotId: string): Promise<{ created: number; skipped: number; errors: number }> {
    const { baseUrl, token, workspaceId } = this.typebotEnv()

    if (!baseUrl || !token || !workspaceId) {
      throw new BadRequestException('TYPEBOT_TOKEN, TYPEBOT_WORKSPACE_ID, TYPEBOT_SELF_URL requis dans .env')
    }

    const headers = { Authorization: `Bearer ${token}` }

    // Resolve bot name
    let botName = typebotId
    try {
      const info = await axios.get(`${baseUrl}/api/v1/typebots/${typebotId}`, { headers, timeout: 8000 })
      botName = info.data.typebot?.name ?? typebotId
    } catch { /* ignore */ }

    let created = 0, skipped = 0, errors = 0
    let cursor: string | undefined = undefined

    do {
      const url = `${baseUrl}/api/v1/typebots/${typebotId}/results?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}&timeFilter=allTime`
      //console.log(url);
      let res: { data: { results?: unknown[]; nextCursor?: string } }

      try {
        res = await axios.get(url, { headers, timeout: 15000 })
      } catch (err: unknown) {
        this.logger.error(`Typebot backfill: failed to fetch results for ${typebotId}: ${(err as Error).message}`)
        break
      }

      const results = (res.data.results ?? []) as Array<{
        id: string
        isCompleted: boolean
        createdAt?: string
        variables: Array<{ name: string; value: unknown }>
      }>
      cursor = res.data.nextCursor

      console.log(JSON.stringify(results[0], null, 2), results.length);
      for (const result of results) {
        if (!result.isCompleted) { skipped++; continue }

        // Dedup 1: by typebot_result_id
        const byResultId = await this.leadModel.findOne({ typebot_result_id: result.id }).lean()
        if (byResultId) { skipped++; continue }

        const parsed      = this.parseTypebotVariables(result.variables ?? [])
        const submittedAt = result.createdAt ? new Date(result.createdAt) : null

        // Dedup 2: by email — update existing lead rather than create duplicate
        if (parsed.email) {
          const byEmail = await this.leadModel.findOne({ email: parsed.email }).lean()
          if (byEmail) {
            const upd: Record<string, unknown> = { typebot_result_id: result.id }
            if (!byEmail.source_form_id)   upd['source_form_id']   = typebotId
            if (!byEmail.source_form_name) upd['source_form_name'] = botName
            if (!byEmail.submitted_at && submittedAt) upd['submitted_at'] = submittedAt
            if (!byEmail.pays   && parsed.pays)   upd['pays']   = parsed.pays
            if (!byEmail.budget && parsed.budget) upd['budget'] = parsed.budget
            await this.leadModel.updateOne({ _id: byEmail._id }, { $set: upd })
            skipped++
            continue
          }
        }

        try {
          const lead = await this.leadModel.create({
            name: parsed.name,
            email: parsed.email,
            phone: parsed.phone ? String(parsed.phone) : null,
            age: parsed.age ? Number(parsed.age) : null,
            pays: parsed.pays ?? null,
            budget: parsed.budget ?? null,
            utm_source: parsed.utm_source ? String(parsed.utm_source) : null,
            reseau_source: parsed.reseau_source ? String(parsed.reseau_source) : null,
            motivation: parsed.motivation ? String(parsed.motivation) : '',
            dynamic_fields: Object.keys(parsed.dynamic).length > 0 ? parsed.dynamic : {},
            source_type: 'typebot',
            typebot_result_id: result.id,
            source_form_id: typebotId,
            source_form_name: botName,
            submitted_at: submittedAt,
            events: [{ type: 'created', message: `Lead importé depuis Typebot (${botName})`, date: submittedAt ?? new Date(), actor_id: null }],
          })
          this.automationsService.triggerEvent('lead_created', {
            lead: { _id: lead._id, name: lead.name, email: lead.email, source_type: 'typebot' },
          })
          created++
        } catch (err: unknown) {
          this.logger.error(`Typebot backfill: error creating lead from result ${result.id}: ${(err as Error).message}`)
          errors++
        }
      }
    } while (cursor)

    this.logger.log(`Typebot backfill [${botName}]: created=${created} skipped=${skipped} errors=${errors}`)
    return { created, skipped, errors }
  }

  // Keep as a weekly safety-net for bots that may have missed webhook calls
  @Cron('0 3 * * 0')
  async cronBackfillTypebot() {
    const { token, workspaceId } = this.typebotEnv()
    if (!token || !workspaceId) return
    const bots = await this.listTypebots()
    for (const bot of bots) {
      try {
        const r = await this.backfillTypebot(bot.id)
        if (r.created > 0) this.logger.log(`[CRON weekly] Typebot ${bot.name}: ${r.created} new leads`)
      } catch { /* continue */ }
    }
  }

  // ── Won → Student bridge ──────────────────────────────────────────────────

  async convertToStudent(leadId: string): Promise<{ student_id: string; created: boolean }> {
    const lead = await this.leadModel.findById(leadId).lean()
    if (!lead) throw new NotFoundException('Lead introuvable')

    if (lead.student_id) return { student_id: lead.student_id, created: false }

    if (!lead.email) throw new BadRequestException('Un email est requis pour convertir ce lead en étudiant')

    const existing = await this.studentModel.findOne({ email: lead.email.toLowerCase() }).lean()
    let studentId: string

    if (existing) {
      studentId = String(existing._id)
    } else {
      const created = await this.studentModel.create({
        name: lead.name,
        email: lead.email.toLowerCase(),
        whatsapp: lead.phone ?? null,
        source: lead.utm_source ?? lead.source_type ?? null,
        notes: lead.motivation ? `Motivation : ${lead.motivation}` : '',
      })
      studentId = String(created._id)
    }

    await this.leadModel.updateOne({ _id: leadId }, { student_id: studentId })
    this.pushEvent(leadId, 'converted', `Converti en étudiant${!existing ? ' (nouveau)' : ' (existant)'}`)

    return { student_id: studentId, created: !existing }
  }
}
