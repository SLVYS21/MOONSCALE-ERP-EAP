import { Injectable, Logger, NotFoundException, BadRequestException, OnApplicationBootstrap } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Cron } from '@nestjs/schedule'
import { Model, Types } from 'mongoose'
import axios from 'axios'
import { Lead, LeadDocument, PipelineStatus, QualificationStatus, LeadSourceType } from './schemas/lead.schema'
import { Call, CallDocument } from './schemas/call.schema'
import { ScoringRule, ScoringRuleDocument } from './schemas/scoring-rule.schema'
import { ScoringConfig, ScoringConfigDocument } from './schemas/scoring-config.schema'
import { WhatsAppLink, WhatsAppLinkDocument } from './schemas/whatsapp-link.schema'
import { WhatsAppClick, WhatsAppClickDocument } from './schemas/whatsapp-click.schema'
import { AutomationsService } from '../automations/automations.service'
import { OffersService } from '../offers/offers.service'
import { Student, StudentDocument } from '../students/schemas/student.schema'
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
  utm_source?: string
  reseau_source?: string
  lead_magnet?: string
  motivation?: string
  dynamic_fields?: Record<string, unknown>
  source_type?: LeadSourceType
  offer_ids?: string[]
  opportunity_amount?: number
  notes?: string
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
  qualification_status?: string
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

  constructor(
    @InjectModel(Lead.name) private leadModel: Model<LeadDocument>,
    @InjectModel(Call.name) private callModel: Model<CallDocument>,
    @InjectModel(ScoringRule.name) private scoringRuleModel: Model<ScoringRuleDocument>,
    @InjectModel(ScoringConfig.name) private scoringConfigModel: Model<ScoringConfigDocument>,
    @InjectModel(WhatsAppLink.name) private whatsappLinkModel: Model<WhatsAppLinkDocument>,
    @InjectModel(WhatsAppClick.name) private whatsappClickModel: Model<WhatsAppClickDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    private automationsService: AutomationsService,
    private offersService: OffersService,
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
    const lead = await this.leadModel.create({
      ...dto,
      offer_ids: dto.offer_ids?.map((id) => new Types.ObjectId(id)) ?? [],
      created_by: userId ? new Types.ObjectId(userId) : null,
      events: [{ type: 'created', message: `Lead créé via ${SOURCE_LABEL[dto.source_type ?? 'manual'] ?? dto.source_type}`, date: new Date(), actor_id: userId ?? null }],
    })

    await this.recalculateScore(lead)

    this.automationsService.triggerEvent('lead_created', {
      lead: { _id: lead._id, name: lead.name, email: lead.email, source_type: lead.source_type, utm_source: lead.utm_source },
    })

    return lead
  }

  async listLeads(query: ListLeadsQuery) {
    const {
      pipeline_status, qualification_status, closer_id, utm_source,
      source_type, search, date_from, date_to,
      page = 1, limit = 50,
    } = query

    const filter: Record<string, unknown> = {}

    if (pipeline_status) filter.pipeline_status = pipeline_status
    if (qualification_status) filter.qualification_status = qualification_status
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

  async updateQualification(id: string, status: QualificationStatus): Promise<LeadDocument> {
    const lead = await this.leadModel.findByIdAndUpdate(
      id,
      { qualification_status: status },
      { new: true },
    ).lean() as unknown as LeadDocument

    if (!lead) throw new NotFoundException('Lead introuvable')

    const QLABEL: Record<string, string> = { mql: 'MQL', sql: 'SQL', non_qualifie: 'Non qualifié' }
    this.pushEvent(id, 'qualification_changed', `Qualification → ${QLABEL[status] ?? status}`)

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

  async recalculateScore(lead: LeadDocument): Promise<void> {
    const [rules, config] = await Promise.all([
      this.scoringRuleModel.find({ is_active: true }).lean(),
      this.getOrCreateScoringConfig(),
    ])

    let score = 0
    const leadPlain = lead.toObject ? lead.toObject() : lead

    for (const rule of rules) {
      const fieldVal = (leadPlain as Record<string, unknown>)[rule.condition_field]
      const strVal = String(fieldVal ?? '')

      let matches = false
      switch (rule.condition_operator) {
        case 'equals':
          matches = strVal === rule.condition_value
          break
        case 'contains':
          matches = strVal.toLowerCase().includes((rule.condition_value ?? '').toLowerCase())
          break
        case 'not_null':
          matches = fieldVal !== null && fieldVal !== undefined && strVal !== ''
          break
        case 'is_empty':
          matches = !fieldVal || strVal === ''
          break
      }

      if (matches) score += rule.points
    }

    let newQualStatus = (leadPlain as Lead).qualification_status
    if (score >= config.sql_threshold) {
      newQualStatus = 'sql'
    } else if (score >= config.mql_threshold) {
      newQualStatus = 'mql'
    }

    await this.leadModel.updateOne(
      { _id: lead._id },
      { qualification_score: score, qualification_status: newQualStatus },
    )
  }

  async recalculateAllScores(): Promise<{ updated: number }> {
    const leads = await this.leadModel.find().lean()
    await Promise.all(leads.map((l) => this.recalculateScore(l as unknown as LeadDocument)))
    return { updated: leads.length }
  }

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

  async handleTypebotWebhook(payload: Record<string, unknown>, utmOverride?: string): Promise<LeadDocument> {
    const variables = (payload.variables as Array<{ name: string; value: unknown }>) ?? []
    const parsed = this.parseTypebotVariables(variables)
    const utm_source = utmOverride ?? parsed.utm_source ?? (payload.utm_source as string) ?? null

    return this.createLead({
      name: parsed.name,
      email: parsed.email ?? undefined,
      phone: parsed.phone ? String(parsed.phone) : undefined,
      age: parsed.age ? Number(parsed.age) : undefined,
      utm_source: utm_source ? String(utm_source) : undefined,
      reseau_source: parsed.reseau_source ? String(parsed.reseau_source) : undefined,
      motivation: parsed.motivation ? String(parsed.motivation) : undefined,
      dynamic_fields: parsed.dynamic,
      source_type: 'typebot',
    })
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

  async handleCalComWebhook(payload: Record<string, unknown>): Promise<void> {
    const triggerEvent = payload.triggerEvent as string
    if (triggerEvent !== 'BOOKING_CREATED') return

    const bookingPayload = payload.payload as Record<string, unknown>
    if (!bookingPayload) return

    const attendees = (bookingPayload.attendees as Array<{ email: string; name: string }>) ?? []
    const attendee = attendees[0]
    if (!attendee?.email) return

    const startTime = bookingPayload.startTime as string
    const videoCall = bookingPayload.videoCallData as Record<string, unknown> | undefined
    const meetLink = (videoCall?.url as string) ?? ''

    // Find lead by email
    const lead = await this.leadModel.findOne({ email: attendee.email.toLowerCase() })
    if (!lead) {
      this.logger.warn(`Cal.com webhook: no lead found for email ${attendee.email}`)
      return
    }

    // Update pipeline to RDV Programmé
    await this.updatePipeline(String(lead._id), 'rdv_programme')

    // Create a planned call record
    await this.createCall(String(lead._id), {
      date: startTime,
      google_meet_link: meetLink,
      status: 'planned',
    })
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

    const [statusCounts, sourceCounts, qualCounts] = await Promise.all([
      this.leadModel.aggregate(pipeline),
      this.leadModel.aggregate([
        { $match: matchFilter },
        { $group: { _id: '$utm_source', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      this.leadModel.aggregate([
        { $match: matchFilter },
        { $group: { _id: '$qualification_status', count: { $sum: 1 } } },
      ]),
    ])

    const total = await this.leadModel.countDocuments(matchFilter)

    return { total, by_pipeline: statusCounts, by_source: sourceCounts, by_qualification: qualCounts }
  }

  // ── Acquisition KPIs ──────────────────────────────────────────────────────

  async getAcquisitionKpis() {
    const now = new Date()
    const ago7d  = new Date(now.getTime() - 7  * 86400000)
    const ago30d = new Date(now.getTime() - 30 * 86400000)

    const [total, new7d, new30d, byPipeline, bySource] = await Promise.all([
      this.leadModel.countDocuments(),
      this.leadModel.countDocuments({ createdAt: { $gte: ago7d } }),
      this.leadModel.countDocuments({ createdAt: { $gte: ago30d } }),
      this.leadModel.aggregate([{ $group: { _id: '$pipeline_status', count: { $sum: 1 } } }]),
      this.leadModel.aggregate([
        { $group: { _id: '$source_type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
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
    }
  }

  // ── Typebot API sync ──────────────────────────────────────────────────────

  private parseTypebotVariables(variables: Array<{ name: string; value: unknown }>) {
    const varMap: Record<string, unknown> = {}
    for (const v of variables) {
      if (v.value !== null && v.value !== undefined && v.value !== '') {
        varMap[v.name.toLowerCase().replace(/\s+/g, '_')] = v.value
      }
    }

    const knownFields = new Set(['nom', 'name', 'email', 'telephone', 'téléphone', 'phone', 'âge', 'age', 'réseau_source', 'reseau_source', 'réseau_source', 'motivation', 'utm_source'])
    const dynamic: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(varMap)) {
      if (!knownFields.has(k)) dynamic[k] = v
    }

    return {
      name: String(varMap['nom'] ?? varMap['name'] ?? 'Inconnu'),
      email: varMap['email'] ? String(varMap['email']).toLowerCase().trim() : null,
      phone: varMap['telephone'] ?? varMap['téléphone'] ?? varMap['phone'] ?? null,
      age: varMap['âge'] ?? varMap['age'] ?? null,
      reseau_source: varMap['réseau_source'] ?? varMap['reseau_source'] ?? null,
      motivation: varMap['motivation'] ?? null,
      utm_source: varMap['utm_source'] ?? null,
      dynamic,
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
      const url = `${baseUrl}/api/v1/typebots/${typebotId}/results?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
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
        variables: Array<{ name: string; value: unknown }>
      }>
      cursor = res.data.nextCursor

      for (const result of results) {
        if (!result.isCompleted) { skipped++; continue }

        const existing = await this.leadModel.findOne({ typebot_result_id: result.id }).lean()
        if (existing) { skipped++; continue }

        try {
          const parsed = this.parseTypebotVariables(result.variables ?? [])
          const lead = await this.leadModel.create({
            name: parsed.name,
            email: parsed.email,
            phone: parsed.phone ? String(parsed.phone) : null,
            age: parsed.age ? Number(parsed.age) : null,
            utm_source: parsed.utm_source ? String(parsed.utm_source) : null,
            reseau_source: parsed.reseau_source ? String(parsed.reseau_source) : null,
            motivation: parsed.motivation ? String(parsed.motivation) : '',
            dynamic_fields: Object.keys(parsed.dynamic).length > 0 ? parsed.dynamic : {},
            source_type: 'typebot',
            typebot_result_id: result.id,
            events: [{ type: 'created', message: `Lead importé depuis Typebot (${botName})`, date: new Date(), actor_id: null }],
          })
          await this.recalculateScore(lead as unknown as LeadDocument)
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
