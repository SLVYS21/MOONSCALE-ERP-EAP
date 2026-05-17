import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import * as crypto from 'crypto'
import { Automation, AutomationDocument, AutomationStep, AutomationTrigger } from './schemas/automation.schema'
import { AutomationRun, AutomationRunDocument, RunLog } from './schemas/automation-run.schema'
import { MailService } from '../mail/mail.service'
import { Student, StudentDocument } from '../students/schemas/student.schema'
import { Task, TaskDocument } from '../tasks/schemas/task.schema'
import { User, UserDocument } from '../users/schemas/user.schema'

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

function resolvePath(path: string, ctx: Record<string, unknown>): unknown {
  const parts = path.trim().split('.')
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
  switch (operator) {
    case 'equals': return strVal === value
    case 'not_equals': return strVal !== value
    case 'contains': return strVal.toLowerCase().includes(value.toLowerCase())
    case 'not_contains': return !strVal.toLowerCase().includes(value.toLowerCase())
    case 'is_empty': return !val || strVal === ''
    case 'is_not_empty': return !!(val && strVal !== '')
    default: return true
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class AutomationsService {
  private readonly logger = new Logger(AutomationsService.name)

  constructor(
    @InjectModel(Automation.name) private automationModel: Model<AutomationDocument>,
    @InjectModel(AutomationRun.name) private runModel: Model<AutomationRunDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private mailService: MailService,
  ) {}

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

  // ── Internal execution ────────────────────────────────────────────────────

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
  ): Promise<{ status: 'ok' | 'error' | 'skipped'; message: string; stop?: boolean }> {
    try {
      switch (step.type) {
        case 'send_email': {
          const to = interpolate(step.config.to ?? '', ctx)
          const subject = interpolate(step.config.subject ?? '', ctx)
          const body = interpolate(step.config.body ?? '', ctx)
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

        default:
          return { status: 'skipped', message: `Type d'étape inconnu: ${step.type}` }
      }
    } catch (err: unknown) {
      return { status: 'error', message: (err as Error).message }
    }
  }
}
