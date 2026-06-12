import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Cron } from '@nestjs/schedule'
import { ConfigService } from '@nestjs/config'
import { Model, Types } from 'mongoose'
import * as crypto from 'crypto'
import Groq from 'groq-sdk'
import { Automation, AutomationDocument, AutomationStep, AutomationTrigger, AudienceFilter } from './schemas/automation.schema'
import { AutomationRun, AutomationRunDocument, RunLog } from './schemas/automation-run.schema'
import { MailService } from '../mail/mail.service'
import { CircleService, CIRCLE_PLANS } from '../circle/circle.service'
import { Student, StudentDocument } from '../students/schemas/student.schema'
import { Payment, PaymentDocument } from '../students/schemas/payment.schema'
import { Task, TaskDocument } from '../tasks/schemas/task.schema'
import { User, UserDocument } from '../users/schemas/user.schema'
import { Form, FormDocument } from '../forms/schemas/form.schema'
import { FormResponse, FormResponseDocument } from '../forms/schemas/form-response.schema'
import { Offer, OfferDocument } from '../offers/schemas/offer.schema'
import { Subscription, SubscriptionDocument } from '../offers/schemas/subscription.schema'

// ── Cron schedule presets ─────────────────────────────────────────────────────

const SCHEDULE_MATCHERS: Record<string, (d: Date) => boolean> = {
  'daily_6am':   (d) => d.getUTCHours() === 6  && d.getUTCMinutes() === 0,
  'daily_8am':   (d) => d.getUTCHours() === 8  && d.getUTCMinutes() === 0,
  'daily_9am':   (d) => d.getUTCHours() === 9  && d.getUTCMinutes() === 0,
  'daily_12h':   (d) => d.getUTCHours() === 12 && d.getUTCMinutes() === 0,
  'daily_18h':   (d) => d.getUTCHours() === 18 && d.getUTCMinutes() === 0,
  'hourly':      (d) => d.getUTCMinutes() === 0,
  'weekly_mon':  (d) => d.getUTCDay() === 1 && d.getUTCHours() === 9 && d.getUTCMinutes() === 0,
}

// ── Template interpolation ────────────────────────────────────────────────────

function interpolate(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, path: string) => {
    const parts = path.trim().split('.')
    let val: unknown = ctx
    for (const part of parts) {
      val = (val as Record<string, unknown>)?.[part]
    }
    return val !== undefined && val !== null ? String(val) : ''
  })
}

type EmailBlock =
  | { type: 'text';    content: string; align?: string }
  | { type: 'image';   url: string; alt?: string; width?: string }
  | { type: 'button';  label: string; url: string; color: string; textColor: string; radius?: string; align?: string }
  | { type: 'divider' }
  | { type: 'spacer';  height?: number }

function renderBlocks(blocks: EmailBlock[], ctx: Record<string, unknown>): string {
  const toAlign = (a?: string) => a === 'center' ? 'center' : a === 'right' ? 'right' : 'left'
  const toRadius = (r?: string) => r === 'full' ? '9999px' : r === 'md' ? '6px' : '0px'

  const parts = blocks.map((block) => {
    switch (block.type) {
      case 'text': {
        const text = interpolate(block.content, ctx).replace(/\n/g, '<br>')
        return `<p style="text-align:${toAlign(block.align)};margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#374151;">${text}</p>`
      }
      case 'image': {
        const url = interpolate(block.url, ctx)
        if (!url) return ''
        return `<div style="text-align:center;margin:0 0 12px 0;"><img src="${url}" alt="${block.alt ?? ''}" style="max-width:${block.width ?? '100%'};height:auto;border-radius:4px;" /></div>`
      }
      case 'button': {
        const label = interpolate(block.label, ctx)
        const url = interpolate(block.url, ctx)
        const align = toAlign(block.align)
        return `<div style="text-align:${align};margin:0 0 16px 0;"><a href="${url}" style="display:inline-block;background:${block.color};color:${block.textColor};text-decoration:none;padding:12px 24px;border-radius:${toRadius(block.radius)};font-size:14px;font-weight:600;">${label}</a></div>`
      }
      case 'divider':
        return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />`
      case 'spacer':
        return `<div style="height:${block.height ?? 16}px;"></div>`
    }
  })

  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">${parts.join('')}</div>`
}

function resolvePath(path: string, ctx: Record<string, unknown>): unknown {
  // Strip template delimiters {{ }} so "{{payment.plan}}" and "payment.plan" both work
  const clean = path.trim().replace(/^\{\{/, '').replace(/\}\}$/, '').trim()
  const parts = clean.split('.')
  let val: unknown = ctx
  for (const part of parts) {
    val = (val as Record<string, unknown>)?.[part]
  }
  return val
}

function evaluateCondition(
  field: string,
  operator: string,
  value: string,
  ctx: Record<string, unknown>,
): boolean {
  const val = resolvePath(field, ctx)
  const strVal = String(val ?? '')
  const numVal = parseFloat(strVal)
  const numCmp = parseFloat(value)
  switch (operator) {
    case 'equals':       return strVal === value
    case 'not_equals':   return strVal !== value
    case 'contains':     return strVal.toLowerCase().includes(value.toLowerCase())
    case 'not_contains': return !strVal.toLowerCase().includes(value.toLowerCase())
    case 'is_empty':     return !val || strVal === ''
    case 'is_not_empty': return !!(val && strVal !== '')
    case 'gt':           return !isNaN(numVal) && !isNaN(numCmp) && numVal > numCmp
    case 'lt':           return !isNaN(numVal) && !isNaN(numCmp) && numVal < numCmp
    default:             return true
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class AutomationsService {
  private readonly logger = new Logger(AutomationsService.name)
  private readonly groq: Groq

  constructor(
    @InjectModel(Automation.name) private automationModel: Model<AutomationDocument>,
    @InjectModel(AutomationRun.name) private runModel: Model<AutomationRunDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Form.name) private formModel: Model<FormDocument>,
    @InjectModel(FormResponse.name) private responseModel: Model<FormResponseDocument>,
    @InjectModel(Offer.name) private offerModel: Model<OfferDocument>,
    @InjectModel(Subscription.name) private subscriptionModel: Model<SubscriptionDocument>,
    private mailService: MailService,
    private circleService: CircleService,
    private configService: ConfigService,
  ) {
    this.groq = new Groq({ apiKey: this.configService.get<string>('GROQ_API_KEY') })
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async listAutomations(userId: string, role: string) {
    const query = role === 'member' ? { createdBy: new Types.ObjectId(userId) } : {}
    return this.automationModel
      .find(query)
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean()
  }

  async getAutomation(id: string) {
    const a = await this.automationModel.findById(id)
      .populate('createdBy', 'firstName lastName email')
      .lean()
    if (!a) throw new NotFoundException('Automatisation introuvable')
    return a
  }

  async createAutomation(
    data: { name: string; description?: string; triggerType: string; steps?: AutomationStep[] },
    userId: string,
  ) {
    const trigger: AutomationTrigger = {
      type: data.triggerType as AutomationTrigger['type'],
      config: data.triggerType === 'incoming_webhook'
        ? { webhookKey: crypto.randomUUID() }
        : {},
    }
    return this.automationModel.create({
      name: data.name,
      description: data.description ?? '',
      isActive: false,
      trigger,
      steps: data.steps ?? [],
      createdBy: new Types.ObjectId(userId),
    })
  }

  async updateAutomation(
    id: string,
    data: Partial<{
      name: string
      description: string
      isActive: boolean
      trigger: AutomationTrigger
      steps: AutomationStep[]
    }>,
  ) {
    const a = await this.automationModel.findById(id)
    if (!a) throw new NotFoundException('Automatisation introuvable')
    if (data.name !== undefined) a.name = data.name
    if (data.description !== undefined) a.description = data.description
    if (data.isActive !== undefined) a.isActive = data.isActive
    if (data.trigger !== undefined) a.trigger = data.trigger
    if (data.steps !== undefined) a.steps = data.steps
    return a.save()
  }

  async deleteAutomation(id: string) {
    await Promise.all([
      this.automationModel.deleteOne({ _id: id }),
      this.runModel.deleteMany({ automationId: new Types.ObjectId(id) }),
    ])
    return { deleted: true }
  }

  async toggleActive(id: string) {
    const a = await this.automationModel.findById(id)
    if (!a) throw new NotFoundException('Automatisation introuvable')
    a.isActive = !a.isActive
    return a.save()
  }

  // ── Runs ──────────────────────────────────────────────────────────────────

  async listRuns(automationId: string, page = 1, limit = 20) {
    const q = { automationId: new Types.ObjectId(automationId) }
    const [data, total] = await Promise.all([
      this.runModel.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.runModel.countDocuments(q),
    ])
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  // ── Trigger event (called by other services, fire-and-forget) ─────────────

  triggerEvent(type: string, data: Record<string, unknown>) {
    this.findAndRun(type, data).catch((err: Error) =>
      this.logger.error(`triggerEvent(${type}) error: ${err.message}`),
    )
  }

  async triggerWebhook(webhookKey: string, data: Record<string, unknown>) {
    const automation = await this.automationModel.findOne({
      'trigger.type': 'incoming_webhook',
      'trigger.config.webhookKey': webhookKey,
      isActive: true,
    })
    if (!automation) return { received: false }
    this.runAutomation(automation, { trigger: 'incoming_webhook', ...data }).catch(() => {})
    return { received: true }
  }

  async runManual(id: string) {
    const automation = await this.automationModel.findById(id)
    if (!automation) throw new NotFoundException('Automatisation introuvable')
    await this.runAutomation(automation, { trigger: 'manual', manualRun: true })
    return { started: true }
  }

  // ── Audience-based campaigns ──────────────────────────────────────────────

  private buildAudienceQuery(filters: AudienceFilter[]): Record<string, unknown> {
    const query: Record<string, unknown> = {}
    for (const f of filters) {
      const op = f.operator
      const val = f.value ?? ''
      if (op === 'equals')       query[f.field] = val
      else if (op === 'not_equals') query[f.field] = { $ne: val }
      else if (op === 'contains') query[f.field] = { $regex: val, $options: 'i' }
      else if (op === 'not_contains') query[f.field] = { $not: { $regex: val, $options: 'i' } }
      else if (op === 'is_empty') query[f.field] = { $in: [null, '', undefined] }
      else if (op === 'is_not_empty') query[f.field] = { $nin: [null, ''], $exists: true }
      else if (op === 'gt')  query[f.field] = { $gt: isNaN(Number(val)) ? val : Number(val) }
      else if (op === 'lt')  query[f.field] = { $lt: isNaN(Number(val)) ? val : Number(val) }
    }
    return query
  }

  async previewAudience(id: string) {
    const automation = await this.automationModel.findById(id).lean()
    if (!automation) throw new NotFoundException('Automatisation introuvable')
    const audience = automation.trigger?.config?.audience
    if (!audience) return { entity: null, count: 0, sample: [] }

    const query = this.buildAudienceQuery(audience.filters ?? [])
    if (audience.entity === 'student') {
      const [count, sample] = await Promise.all([
        this.studentModel.countDocuments(query),
        this.studentModel.find(query).select('name email debtStatus').limit(5).lean(),
      ])
      return { entity: 'student', count, sample }
    } else {
      const [count, sample] = await Promise.all([
        this.paymentModel.countDocuments(query),
        this.paymentModel.find(query).select('studentName studentEmail status product amount').limit(5).lean(),
      ])
      return { entity: 'payment', count, sample }
    }
  }

  async runForAudience(id: string) {
    const automation = await this.automationModel.findById(id)
    if (!automation) throw new NotFoundException('Automatisation introuvable')
    const audience = automation.trigger?.config?.audience
    if (!audience) throw new NotFoundException('Pas d\'audience configurée')

    const query = this.buildAudienceQuery(audience.filters ?? [])

    if (audience.entity === 'student') {
      const students = await this.studentModel.find(query).lean()
      this.logger.log(`Audience run: ${students.length} students matched for automation ${id}`)
      for (const student of students) {
        try {
          await this.runAutomation(automation, { trigger: 'audience_based', student })
        } catch (err) {
          this.logger.error(`Audience run error for student ${student.email}: ${(err as Error).message}`)
        }
      }
      return { ran: students.length }
    } else {
      const payments = await this.paymentModel.find(query).lean()
      this.logger.log(`Audience run: ${payments.length} payments matched for automation ${id}`)
      for (const payment of payments) {
        const student = await this.studentModel.findOne({ email: payment.studentEmail }).lean()
        try {
          await this.runAutomation(automation, { trigger: 'audience_based', student, payment })
        } catch (err) {
          this.logger.error(`Audience run error for payment ${payment._id}: ${(err as Error).message}`)
        }
      }
      return { ran: payments.length }
    }
  }

  // ── Circle tags list (depuis l'API, avec fallback hardcodé) ─────────────────

  async listCirclePlans() {
    try {
      return await this.circleService.listTags()
    } catch (err: unknown) {
      this.logger.warn(`Circle listTags échoué, fallback hardcodé : ${(err as Error).message}`)
      return Object.entries(CIRCLE_PLANS).map(([, cfg]) => ({
        id: cfg.tag,
        name: cfg.name,
        is_public: true,
        color: null,
      }))
    }
  }

  // ── Seed des automatisations par défaut ──────────────────────────────────

  async seedDefaultAutomations(userId: string): Promise<{ created: string[]; skipped: string[] }> {
    const createdNames: string[] = []
    const skippedNames: string[] = []

    const defaults: Array<{ name: string; description: string; trigger: AutomationTrigger; steps: AutomationStep[] }> = [
      {
        name: '🎉 Accueil étudiant — Paiement traité',
        description: "Déclenché quand un paiement est marqué TRAITÉ. Invite l'étudiant sur Circle, lui assigne le tag correspondant à son plan, et lui envoie un email de bienvenue.",
        trigger: { type: 'payment_treated', config: {} },
        steps: [
          {
            id: 'circle_invite',
            type: 'circle_invite',
            name: 'Inviter sur Circle',
            config: { emailExpr: '{{student.email}}', nameExpr: '{{student.name}}', circlePlanKey: '{{payment.plan}}' },
          },
          {
            id: 'circle_tag',
            type: 'circle_tag_add',
            name: 'Assigner le tag plan',
            config: { emailExpr: '{{student.email}}', circlePlanKey: '{{payment.plan}}' },
          },
          {
            id: 'welcome_email',
            type: 'send_email',
            name: 'Email de bienvenue',
            config: {
              to: '{{student.email}}',
              subject: '🎓 Bienvenue dans la formation !',
              body: 'Bonjour {{student.name}},\n\nTon paiement a bien été validé. Tu vas recevoir tes accès Circle très prochainement.\n\nÀ bientôt dans la communauté !',
            },
          },
        ],
      },
      {
        name: '⚠️ Relance débiteurs — Dette détectée',
        description: "Déclenché quand une dette est détectée sur un étudiant. Envoie deux rappels email espacés de 7 jours, puis marque le compte EN RETARD sur Circle.",
        trigger: { type: 'debt_detected', config: {} },
        steps: [
          {
            id: 'reminder_1',
            type: 'send_email',
            name: 'Rappel 1 — Solde en attente',
            config: {
              to: '{{student.email}}',
              subject: '⚠️ Rappel — Solde de paiement en attente',
              body: 'Bonjour {{student.name}},\n\nNous n\'avons pas encore reçu le solde de ton paiement pour la formation.\n\nMerci de régulariser ta situation dans les meilleurs délais pour conserver ton accès.\n\nL\'équipe Myril',
            },
          },
          {
            id: 'wait_7d',
            type: 'wait',
            name: 'Attente 7 jours',
            config: { duration: 168, unit: 'hours' },
          },
          {
            id: 'reminder_2',
            type: 'send_email',
            name: 'Rappel 2 — Dernier avertissement',
            config: {
              to: '{{student.email}}',
              subject: '🚨 Dernier rappel — Ton accès est menacé',
              body: 'Bonjour {{student.name}},\n\nSans régularisation de ta situation, nous serons contraints de suspendre ton accès à la communauté.\n\nContacte-nous rapidement pour trouver une solution.\n\nL\'équipe Myril',
            },
          },
          {
            id: 'tag_retard',
            type: 'circle_tag_add',
            name: 'Marquer EN RETARD',
            config: { emailExpr: '{{student.email}}', circleTagName: 'EN RETARD' },
          },
        ],
      },
      {
        name: '📝 Formulaire soumis → Paiement en attente',
        description: "Déclenché quand un formulaire d'inscription est soumis. Crée automatiquement un paiement NON TRAITÉ et notifie l'équipe.",
        trigger: { type: 'form_submitted', config: {} },
        steps: [
          {
            id: 'create_pmt',
            type: 'create_payment',
            name: 'Créer le paiement NON TRAITÉ',
            config: {
              emailExpr: '{{response.email}}',
              nameExpr: '{{response.name}}',
              amountExpr: '{{response.amount}}',
              currency: 'F CFA',
              product: 'ECOM AFRICA PRO',
              modality: 'Complet',
            },
          },
          {
            id: 'notify_team',
            type: 'notify_team',
            name: "Alerter l'équipe",
            config: { recipients: 'admins', note: 'Nouveau formulaire soumis par {{response.email}} — paiement à examiner.' },
          },
        ],
      },
    ]

    for (const def of defaults) {
      const existing = await this.automationModel.findOne({ name: def.name }).select('_id').lean()
      if (existing) { skippedNames.push(def.name); continue }

      await this.automationModel.create({
        name: def.name,
        description: def.description,
        isActive: false,
        trigger: def.trigger,
        steps: def.steps,
        runCount: 0,
        lastRunAt: null,
        createdBy: new Types.ObjectId(userId),
      })
      createdNames.push(def.name)
      this.logger.log(`Automation seeded: ${def.name}`)
    }

    return { created: createdNames, skipped: skippedNames }
  }

  // ── Cron runner (every minute) ────────────────────────────────────────────

  @Cron('* * * * *')
  async runScheduledAutomations() {
    const now = new Date()
    const automations = await this.automationModel.find({
      'trigger.type': 'cron_schedule',
      isActive: true,
    }).lean()

    for (const automation of automations) {
      const preset = automation.trigger.config?.schedulePreset
      if (!preset) continue

      const matcher = SCHEDULE_MATCHERS[preset]
      if (!matcher || !matcher(now)) continue

      if (automation.lastRunAt) {
        const diffMs = now.getTime() - new Date(automation.lastRunAt as Date).getTime()
        if (diffMs < 50_000) continue
      }

      this.runAutomation(automation, {
        trigger: 'cron_schedule',
        scheduledAt: now.toISOString(),
        preset,
      }).catch((err: Error) =>
        this.logger.error(`Cron automation ${automation._id} error: ${err.message}`),
      )
    }
  }

  // ── Internal execution ────────────────────────────────────────────────────

  // ── Extraction Groq depuis une réponse formulaire ─────────────────────────

  private async extractStudentFromResponse(responseId: string): Promise<{
    name?: string
    whatsapp?: string
    occupation?: string
    source?: string
  } | null> {
    try {
      type RespLean = { formId: Types.ObjectId; answers: Array<{ fieldId: string; value: unknown }> }
      const response = await this.responseModel.findById(responseId).lean<RespLean>()
      if (!response) return null

      type FormLean = { fields: Array<{ id: string; label: string; type: string }> }
      const form = await this.formModel.findById(response.formId).select('fields').lean<FormLean>()
      const fieldMap = new Map((form?.fields ?? []).map((f) => [f.id, f]))

      const lines: string[] = []
      for (const answer of response.answers) {
        const field = fieldMap.get(answer.fieldId)
        if (!field || ['heading', 'paragraph', 'file'].includes(field.type)) continue
        const raw = answer.value
        const val = Array.isArray(raw) ? raw.join(', ') : String(raw ?? '')
        if (val && val !== 'null') lines.push(`${field.label}: ${val}`)
      }
      if (!lines.length) return null

      const completion = await this.groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Tu es un extracteur de données. Extrais les informations du profil étudiant depuis les réponses au formulaire. Réponds UNIQUEMENT en JSON valide, sans markdown ni explication.',
          },
          {
            role: 'user',
            content: `Voici les réponses au formulaire :\n\n${lines.join('\n')}\n\nExtrait ces champs (si absent =, cherche ce qui s'en rapproche le plus) :\n{\n  "name": "nom complet de l\'étudiant",\n  "whatsapp": "numéro WhatsApp avec indicatif pays",\n  "occupation": "métier, profession ou occupation",\n  "source": "comment il a connu le programme (réseau social, ami, publicité, etc.)"\n}`,
          },
        ],
      })

      const content = completion.choices[0]?.message?.content ?? '{}'
      return JSON.parse(content) as { name?: string; whatsapp?: string; occupation?: string; source?: string }
    } catch (err: unknown) {
      this.logger.warn(`extractStudentFromResponse(${responseId}) failed: ${(err as Error).message}`)
      return null
    }
  }

  private async findAndRun(type: string, eventData: Record<string, unknown>) {
    const query: Record<string, unknown> = { 'trigger.type': type, isActive: true }
    if (type === 'form_submitted' && eventData.formId) {
      query.$or = [
        { 'trigger.config.formId': String(eventData.formId) },
        { 'trigger.config.formId': { $exists: false } },
        { 'trigger.config.formId': '' },
      ]
    }
    const automations = await this.automationModel.find(query).lean()
    for (const a of automations) {
      this.runAutomation(a, eventData).catch((err: Error) =>
        this.logger.error(`Automation ${a._id} run error: ${err.message}`),
      )
    }
  }

  private async runAutomation(
    automation: AutomationDocument | (Automation & { _id: Types.ObjectId }),
    context: Record<string, unknown>,
  ) {
    const run = await this.runModel.create({
      automationId: (automation._id as Types.ObjectId),
      triggerType: automation.trigger.type,
      status: 'running',
      context,
      logs: [],
    })

    const logs: RunLog[] = []
    let failed = false

    try {
      const enrichedCtx: Record<string, unknown> = {
        ...context,
        _createdBy: (automation as AutomationDocument).createdBy ?? (automation as Automation & { _id: Types.ObjectId }).createdBy,
      }

      for (const step of automation.steps) {
        const result = await this.executeStep(step, enrichedCtx)
        // Merge step outputs into context so subsequent steps can reference them
        if (result.contextUpdate) {
          Object.assign(enrichedCtx, result.contextUpdate)
        }
        logs.push({
          stepId: step.id,
          stepName: step.name ?? step.type,
          status: result.status,
          message: result.message,
          timestamp: new Date(),
        })
        if (result.status === 'error') { failed = true; break }
        if (result.stop) break  // condition gate stopped execution
      }
    } catch (err: unknown) {
      failed = true
      logs.push({
        stepId: 'system',
        stepName: 'Execution',
        status: 'error',
        message: (err as Error).message,
        timestamp: new Date(),
      })
    }

    await this.runModel.findByIdAndUpdate((run as AutomationRunDocument)._id, {
      status: failed ? 'failed' : 'completed',
      logs,
      completedAt: new Date(),
    })

    await this.automationModel.findByIdAndUpdate((automation as AutomationDocument)._id, {
      $inc: { runCount: 1 },
      $set: { lastRunAt: new Date() },
    })
  }

  private async executeStep(
    step: AutomationStep,
    ctx: Record<string, unknown>,
  ): Promise<{ status: 'ok' | 'error' | 'skipped'; message: string; stop?: boolean; contextUpdate?: Record<string, unknown> }> {
    // Step-level conditions — skip this step only (automation continues)
    if (step.conditions?.length) {
      for (const cond of step.conditions) {
        const pass = evaluateCondition(cond.field, cond.operator, cond.value, ctx)
        if (!pass) {
          return {
            status: 'skipped',
            message: `Condition non remplie : ${cond.field} ${cond.operator}${cond.value ? ' ' + cond.value : ''} — étape ignorée`,
          }
        }
      }
    }

    try {
      switch (step.type) {
        case 'send_email': {
          const to = interpolate(step.config.to ?? '', ctx)
          const subject = interpolate(step.config.subject ?? '', ctx)
          const body = step.config.blocks?.length
            ? renderBlocks(step.config.blocks as EmailBlock[], ctx)
            : interpolate(step.config.body ?? '', ctx)
          if (!to) return { status: 'skipped', message: 'Destinataire vide — étape ignorée' }
          await this.mailService.sendCustom(to, subject, body)
          return { status: 'ok', message: `Email envoyé à ${to}` }
        }

        case 'http_request': {
          const url = interpolate(step.config.url ?? '', ctx)
          if (!url) return { status: 'skipped', message: 'URL vide — étape ignorée' }
          const method = (step.config.method ?? 'POST').toUpperCase()
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          for (const h of step.config.headers ?? []) {
            headers[h.key] = interpolate(h.value, ctx)
          }
          const body = step.config.requestBody
            ? interpolate(step.config.requestBody, ctx)
            : undefined

          const res = await fetch(url, {
            method,
            headers,
            body: method !== 'GET' && body ? body : undefined,
          })
          return { status: 'ok', message: `HTTP ${method} ${url} → ${res.status}` }
        }

        case 'wait': {
          const ms = (step.config.duration ?? 1) * {
            seconds: 1000,
            minutes: 60_000,
            hours: 3_600_000,
          }[step.config.unit ?? 'seconds']
          await new Promise((r) => setTimeout(r, Math.min(ms, 30_000))) // cap at 30s in prod
          return { status: 'ok', message: `Attente de ${step.config.duration} ${step.config.unit}` }
        }

        case 'condition': {
          const { field = '', operator = 'is_not_empty', value = '' } = step.config
          const pass = evaluateCondition(field, operator, value, ctx)
          if (!pass) {
            return { status: 'skipped', message: `Condition non remplie (${field} ${operator} ${value}) — arrêt`, stop: true }
          }
          return { status: 'ok', message: `Condition remplie — continuation` }
        }

        case 'notify_team': {
          const subject = interpolate(step.config.subject ?? 'Notification automatisation', ctx)
          const body = interpolate(step.config.body ?? '', ctx)
          const recipientsCfg = step.config.recipients ?? 'all_admins'

          let emails: string[]
          if (recipientsCfg === 'all_admins') {
            const admins = await this.userModel
              .find({ role: { $in: ['admin', 'superadmin'] } })
              .select('email')
              .lean()
            emails = admins.map((u) => u.email)
          } else {
            emails = recipientsCfg.split(',').map((e) => e.trim()).filter(Boolean)
          }

          if (!emails.length) return { status: 'skipped', message: 'Aucun destinataire trouvé' }
          await Promise.all(emails.map((to) => this.mailService.sendCustom(to, subject, body)))
          return { status: 'ok', message: `Notification envoyée à ${emails.length} membre(s)` }
        }

        case 'add_note': {
          const studentCtx = ctx.student as Record<string, unknown> | undefined
          const email = studentCtx?.email as string | undefined
          if (!email) return { status: 'skipped', message: 'Email étudiant introuvable dans le contexte' }

          const noteText = interpolate(step.config.note ?? '', ctx)
          const now = new Date().toLocaleDateString('fr-FR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })
          const newLine = `[${now}] ${noteText}`

          const student = await this.studentModel.findOne({ email }).lean()
          if (!student) return { status: 'skipped', message: `Étudiant introuvable : ${email}` }

          const existing = ((student as unknown) as Record<string, unknown>).notes as string ?? ''
          await this.studentModel.updateOne(
            { email },
            { $set: { notes: existing ? `${existing}\n${newLine}` : newLine } },
          )
          return { status: 'ok', message: `Note ajoutée pour ${email}` }
        }

        case 'update_student': {
          const studentCtx = ctx.student as Record<string, unknown> | undefined
          const email = studentCtx?.email as string | undefined
          if (!email) return { status: 'skipped', message: 'Email étudiant introuvable dans le contexte' }

          const field = step.config.studentField
          if (!field) return { status: 'skipped', message: 'Champ à mettre à jour non défini' }

          const value = interpolate(step.config.studentValue ?? '', ctx)
          await this.studentModel.updateOne({ email }, { $set: { [field]: value } })
          return { status: 'ok', message: `${field} mis à jour pour ${email} → ${value}` }
        }

        case 'create_task': {
          const title = interpolate(step.config.taskTitle ?? 'Tâche automatique', ctx)
          const description = interpolate(step.config.taskDescription ?? '', ctx)
          const priority = step.config.taskPriority ?? 'medium'
          const createdBy = ctx._createdBy as Types.ObjectId

          await this.taskModel.create({
            title,
            description,
            priority,
            status: 'todo',
            createdBy,
            tags: ['automatisation'],
          })
          return { status: 'ok', message: `Tâche créée : "${title}"` }
        }

        case 'create_payment': {
          const emailRaw = interpolate(step.config.emailExpr ?? '', ctx)
          const email = emailRaw.toLowerCase().trim()
          if (!email) return { status: 'skipped', message: 'Email vide — étape ignorée' }

          const amountRaw = interpolate(step.config.amountExpr ?? '0', ctx)
          const amount = parseFloat(String(amountRaw).replace(/\s/g, '').replace(',', '.')) || 0

          const student = await this.studentModel.findOne({ email }).select('_id name').lean()

          const modality = (step.config.modality === 'Partiel' ? 'Partiel' : 'Complet') as 'Complet' | 'Partiel'
          const currency = (['F CFA', 'USD', 'EURO'].includes(step.config.currency ?? '')
            ? step.config.currency : 'F CFA') as 'F CFA' | 'USD' | 'EURO'
          const product = step.config.product ?? ''
          const plan = step.config.plan ?? null

          const ctxResponseId = (ctx.responseId as string | undefined) ?? null

          const createdPayment = await this.paymentModel.create({
            studentId: student?._id ?? null,
            studentEmail: email,
            studentName: (student as unknown as { name?: string })?.name ?? null,
            status: 'NON TRAITÉ',
            modality,
            amount,
            currency,
            product,
            gateway: interpolate(step.config.gateway ?? '', ctx) || null,
            plan,
            source: 'manual',
            responseId: ctxResponseId ? new Types.ObjectId(ctxResponseId) : null,
          })
          const paymentCtxUpdate = {
            _id: String(createdPayment._id),
            studentEmail: email,
            product,
            plan,
            amount,
            currency,
            modality,
            status: 'NON TRAITÉ',
            responseId: ctxResponseId,
          }
          return {
            status: 'ok',
            message: `Paiement créé pour ${email} — ${amount} ${currency}`,
            contextUpdate: { payment: paymentCtxUpdate },
          }
        }

        case 'create_student': {
          const emailRaw = interpolate(step.config.emailExpr ?? '', ctx)
          const email = emailRaw.toLowerCase().trim()
          if (!email) return { status: 'skipped', message: 'Email vide — étape ignorée' }

          type StudentLean = { _id: Types.ObjectId; email: string; name: string; whatsapp?: string | null; occupation?: string | null; source?: string | null; infoStatus?: string }
          const existing = await this.studentModel.findOne({ email }).lean<StudentLean>()

          // responseId is available either from ctx.payment.responseId (set by create_payment step)
          // or directly from ctx.responseId (set by form_submitted trigger)
          const paymentCtxForEnrich = ctx.payment as Record<string, unknown> | undefined
          const responseId: string | null =
            (paymentCtxForEnrich?.responseId as string | undefined) ??
            (ctx.responseId as string | undefined) ??
            null

          if (existing) {
            const updates: Record<string, unknown> = {}
            if (responseId) {
              const enriched = await this.extractStudentFromResponse(responseId)
              if (enriched) {
                if (enriched.name)       updates.name       = enriched.name
                if (enriched.whatsapp)   updates.whatsapp   = enriched.whatsapp
                if (enriched.occupation) updates.occupation = enriched.occupation
                if (enriched.source)     updates.source     = enriched.source
                if (Object.keys(updates).length) updates.infoStatus = 'EXACTE'
              }
            }
            if (Object.keys(updates).length) {
              await this.studentModel.updateOne({ email }, { $set: updates })
              this.logger.log(`create_student: étudiant existant mis à jour via Groq pour ${email}`)
            }

            const studentCtxUpdate = {
              _id: String(existing._id),
              email: existing.email,
              name: (updates.name as string | undefined) ?? existing.name,
              whatsapp: (updates.whatsapp as string | undefined) ?? existing.whatsapp ?? null,
            }
            return {
              status: 'ok',
              message: `Étudiant ${email} existe déjà${Object.keys(updates).length ? ' — mis à jour (Groq)' : ''}`,
              contextUpdate: { student: studentCtxUpdate },
            }
          }

          let name = interpolate(step.config.nameExpr ?? '', ctx).trim() || email
          let whatsapp = interpolate(step.config.whatsappExpr ?? '', ctx).trim() || null
          let occupation: string | null = null
          let source: string | null = null
          let infoStatus = 'NON VÉRIFIÉ'

          if (responseId) {
            const enriched = await this.extractStudentFromResponse(responseId)
            if (enriched) {
              if (enriched.name)       name       = enriched.name
              if (enriched.whatsapp)   whatsapp   = enriched.whatsapp
              if (enriched.occupation) occupation = enriched.occupation
              if (enriched.source)     source     = enriched.source
              infoStatus = 'EXACTE'
              this.logger.log(`create_student: enrichi via Groq pour ${email}`)
            }
          }

          const createdStudent = await this.studentModel.create({ email, name, whatsapp, occupation, source, infoStatus, notes: '', debtStatus: 'ok' })
          const studentCtxUpdate = {
            _id: String(createdStudent._id),
            email: createdStudent.email,
            name: createdStudent.name,
            whatsapp: createdStudent.whatsapp ?? null,
          }
          return {
            status: 'ok',
            message: `Étudiant créé : ${name} (${email})${infoStatus === 'EXACTE' ? ' [enrichi Groq]' : ''}`,
            contextUpdate: { student: studentCtxUpdate },
          }
        }

        case 'circle_invite': {
          const email = interpolate(step.config.emailExpr ?? '', ctx).toLowerCase().trim()
          if (!email) return { status: 'skipped', message: 'Email vide — étape ignorée' }
          const name = interpolate(step.config.nameExpr ?? '', ctx).trim() || email

          const existing = await this.circleService.searchMember(email)
          if (existing) return { status: 'ok', message: `${email} est déjà membre Circle` }

          await this.circleService.inviteMember(email, name)
          return { status: 'ok', message: `Invitation Circle envoyée à ${email}` }
        }

        case 'circle_tag_add': {
          const email = interpolate(step.config.emailExpr ?? '', ctx).toLowerCase().trim()
          if (!email) return { status: 'skipped', message: 'Email vide — étape ignorée' }

          // Préférer l'ID dynamique, fallback sur circlePlanKey (legacy)
          const tagId = step.config.circleTagId ? Number(step.config.circleTagId) : null
          const tagName = step.config.circleTagName ?? step.config.circlePlanKey ?? ''

          if (tagId) {
            await this.circleService.tagMemberById(email, tagId)
            return { status: 'ok', message: `Tag "${tagName}" (ID ${tagId}) ajouté à ${email}` }
          } else if (step.config.circlePlanKey) {
            const plan = await this.circleService.tagMember(email, step.config.circlePlanKey)
            if (!plan) return { status: 'error', message: `Tag échoué pour ${email} — plan "${step.config.circlePlanKey}" introuvable` }
            return { status: 'ok', message: `Tag "${plan.name}" ajouté à ${email}` }
          }
          return { status: 'skipped', message: 'Tag Circle non défini' }
        }

        case 'circle_tag_remove': {
          const email = interpolate(step.config.emailExpr ?? '', ctx).toLowerCase().trim()
          if (!email) return { status: 'skipped', message: 'Email vide — étape ignorée' }

          const tagId = step.config.circleTagId ? Number(step.config.circleTagId) : null
          const tagName = step.config.circleTagName ?? step.config.circlePlanKey ?? ''

          if (tagId) {
            await this.circleService.removeTagById(email, tagId)
            return { status: 'ok', message: `Tag "${tagName}" (ID ${tagId}) retiré de ${email}` }
          } else if (step.config.circlePlanKey) {
            const plan = CIRCLE_PLANS[step.config.circlePlanKey.toLowerCase()]
            if (!plan) return { status: 'error', message: `Plan legacy "${step.config.circlePlanKey}" introuvable` }
            await this.circleService.removeTag(email, plan.tag)
            return { status: 'ok', message: `Tag "${plan.name}" retiré de ${email}` }
          }
          return { status: 'skipped', message: 'Tag Circle non défini' }
        }

        case 'create_subscription': {
          const payment = ctx.payment as Record<string, unknown> | undefined
          const student = ctx.student as Record<string, unknown> | undefined

          if (!payment || !student) {
            return { status: 'skipped', message: 'Contexte payment/student manquant pour create_subscription' }
          }

          type LeanOffer = {
            _id: unknown
            name: string
            plans: Array<{
              _id: unknown
              name: string
              durationMonths: number
              price: number
              currency: string
              partialDueAfterDays: number
              isActive: boolean
            }>
          }

          let offer: LeanOffer | null = null
          let plan: LeanOffer['plans'][0] | undefined

          const paymentProduct = payment.product as string
          const paymentPlan    = payment.plan as string | undefined

          if (step.config.matchMode === 'manual' && step.config.offerId) {
            offer = await this.offerModel.findById(step.config.offerId).lean<LeanOffer>()
            plan = offer?.plans.find((p) => p.name === step.config.planName && p.isActive)
          } else {
            // Auto: match offer by payment.product, plan by payment.plan
            offer = await this.offerModel.findOne({ name: paymentProduct }).lean<LeanOffer>()
            if (offer) {
              plan = offer.plans.find((p) => p.name === paymentPlan && p.isActive)
                   ?? offer.plans.find((p) => p.isActive)
            }
          }

          if (!offer) {
            return { status: 'skipped', message: `Aucune offre trouvée pour le produit "${paymentProduct}"` }
          }
          if (!plan) {
            return { status: 'skipped', message: `Aucun plan actif trouvé dans l'offre "${offer.name}"` }
          }

          const startDate = payment.paidAt
            ? new Date(payment.paidAt as string)
            : new Date()
          const endDate = new Date(startDate)
          endDate.setMonth(endDate.getMonth() + plan.durationMonths)

          const modality = (payment.modality as string) ?? 'Complet'
          const nextPaymentDate = modality === 'Partiel'
            ? new Date(startDate.getTime() + plan.partialDueAfterDays * 24 * 60 * 60 * 1000)
            : null

          const offerName = `${offer.name} — ${plan.name}`

          const [subscription] = await this.subscriptionModel.create([{
            studentId:    student._id   as string,
            studentEmail: (student.email as string).toLowerCase(),
            offerId:      offer._id     as string,
            paymentId:    (payment._id as string | undefined) ?? null,
            offerName,
            offerProduct: offer.name,
            offerPlan:    plan.name,
            durationMonths: plan.durationMonths,
            startDate,
            endDate,
            status: 'active',
            modality,
            paidAmount:  (payment.amount as number) ?? 0,
            totalAmount: plan.price || (payment.amount as number) || 0,
            currency:    (payment.currency as string) ?? plan.currency ?? 'F CFA',
            nextPaymentDate,
            remindersSent: 0,
          }])

          this.triggerEvent('subscription_created', {
            student,
            subscription: {
              _id: String((subscription as { _id: unknown })._id),
              offerName,
              offerProduct: offer.name,
              offerPlan: plan.name,
              durationMonths: plan.durationMonths,
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
            },
          })

          return { status: 'ok', message: `Souscription créée : ${offerName} (${plan.durationMonths} mois)` }
        }

        default:
          return { status: 'skipped', message: `Type d'étape inconnu: ${step.type}` }
      }
    } catch (err: unknown) {
      return { status: 'error', message: (err as Error).message }
    }
  }
}
