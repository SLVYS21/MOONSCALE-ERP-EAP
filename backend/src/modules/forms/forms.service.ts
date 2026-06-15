import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Form, FormDocument, FormField, FormSettings, FieldCondition } from './schemas/form.schema'
import { FormResponse, FormResponseDocument } from './schemas/form-response.schema'
import { AutomationsService } from '../automations/automations.service'

function evaluateCondition(condition: FieldCondition, answerMap: Record<string, unknown>): boolean {
  const val = answerMap[condition.fieldId]
  switch (condition.operator) {
    case 'is_empty':
      return val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)
    case 'is_not_empty':
      return val !== undefined && val !== null && val !== '' && (!Array.isArray(val) || val.length > 0)
    case 'equals':
      return Array.isArray(val)
        ? (val as string[]).includes(condition.value ?? '')
        : String(val ?? '') === (condition.value ?? '')
    case 'not_equals':
      return Array.isArray(val)
        ? !(val as string[]).includes(condition.value ?? '')
        : String(val ?? '') !== (condition.value ?? '')
    case 'contains':
      return String(val ?? '').toLowerCase().includes((condition.value ?? '').toLowerCase())
    case 'not_contains':
      return !String(val ?? '').toLowerCase().includes((condition.value ?? '').toLowerCase())
    default:
      return true
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60) || 'formulaire'
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 7)
}

@Injectable()
export class FormsService {
  constructor(
    @InjectModel(Form.name) private formModel: Model<FormDocument>,
    @InjectModel(FormResponse.name) private responseModel: Model<FormResponseDocument>,
    @Optional() private automationsService?: AutomationsService,
  ) {}

  // ── Forms CRUD ────────────────────────────────────────────────────────────

  async listForms(userId: string, role: string) {
    const query = role === 'member' ? { createdBy: new Types.ObjectId(userId) } : {}
    const forms = await this.formModel
      .find(query)
      .populate('createdBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .lean()

    const ids = forms.map((f) => f._id)
    const counts = await this.responseModel.aggregate([
      { $match: { formId: { $in: ids } } },
      { $group: { _id: '$formId', count: { $sum: 1 } } },
    ])
    const countMap = Object.fromEntries(counts.map((c) => [c._id.toString(), c.count]))

    return forms.map((f) => ({ ...f, responseCount: countMap[f._id.toString()] ?? 0 }))
  }

  async getForm(id: string) {
    const form = await this.formModel
      .findById(id)
      .populate('createdBy', 'firstName lastName email')
      .lean()
    if (!form) throw new NotFoundException('Formulaire introuvable')

    const responseCount = await this.responseModel.countDocuments({ formId: new Types.ObjectId(id) })
    return { ...form, responseCount }
  }

  async getFormBySlug(slug: string) {
    const form = await this.formModel.findOne({ slug, isPublished: true }).lean()
    if (!form) throw new NotFoundException('Formulaire introuvable ou non publié')
    return form
  }

  async createForm(data: { title: string; description?: string }, userId: string) {
    let slug = slugify(data.title)
    const existing = await this.formModel.findOne({ slug })
    if (existing) slug = `${slug}-${randomSuffix()}`

    return this.formModel.create({
      title: data.title,
      description: data.description ?? '',
      slug,
      fields: [],
      settings: { submitMessage: 'Merci pour votre réponse !', allowMultipleSubmissions: true },
      isPublished: false,
      createdBy: new Types.ObjectId(userId),
    })
  }

  async updateForm(
    id: string,
    data: Partial<{
      title: string
      description: string
      fields: FormField[]
      settings: Partial<FormSettings>
    }>,
  ) {
    const form = await this.formModel.findById(id)
    if (!form) throw new NotFoundException('Formulaire introuvable')

    if (data.title !== undefined) {
      form.title = data.title
      // Regenerate slug only if title changed significantly — keep existing to avoid breaking links
    }
    if (data.description !== undefined) form.description = data.description
    if (data.fields !== undefined) form.fields = data.fields
    if (data.settings !== undefined) {
      form.settings = { ...form.settings, ...data.settings } as FormSettings
    }

    return form.save()
  }

  async publishForm(id: string) {
    const form = await this.formModel.findById(id)
    if (!form) throw new NotFoundException('Formulaire introuvable')
    form.isPublished = true
    return form.save()
  }

  async unpublishForm(id: string) {
    const form = await this.formModel.findById(id)
    if (!form) throw new NotFoundException('Formulaire introuvable')
    form.isPublished = false
    return form.save()
  }

  async duplicateForm(id: string, userId: string) {
    const form = await this.formModel.findById(id).lean()
    if (!form) throw new NotFoundException('Formulaire introuvable')

    let slug = `${form.slug}-copie`
    const existing = await this.formModel.findOne({ slug })
    if (existing) slug = `${slug}-${randomSuffix()}`

    return this.formModel.create({
      title: `${form.title} (copie)`,
      description: form.description,
      slug,
      fields: form.fields,
      settings: form.settings,
      isPublished: false,
      createdBy: new Types.ObjectId(userId),
    })
  }

  async deleteForm(id: string) {
    const form = await this.formModel.findById(id)
    if (!form) throw new NotFoundException('Formulaire introuvable')
    await Promise.all([
      this.formModel.deleteOne({ _id: id }),
      this.responseModel.deleteMany({ formId: new Types.ObjectId(id) }),
    ])
    return { deleted: true }
  }

  // ── Responses ─────────────────────────────────────────────────────────────

  async submitResponse(
    slug: string,
    answers: { fieldId: string; value: unknown }[],
    metadata: { ip?: string; userAgent?: string },
  ) {
    const form = await this.formModel.findOne({ slug, isPublished: true })
    if (!form) throw new NotFoundException('Formulaire introuvable ou non publié')

    // Build answer map for condition evaluation
    const answerMap: Record<string, unknown> = {}
    for (const a of answers) answerMap[a.fieldId] = a.value

    // Validate required fields (skip hidden ones based on conditions)
    for (const field of form.fields) {
      if (['heading', 'paragraph'].includes(field.type)) continue
      // Skip validation if field is hidden by its condition
      if (field.condition && !evaluateCondition(field.condition, answerMap)) continue
      if (field.required) {
        const val = answerMap[field.id]
        const isEmpty = val === undefined || val === null || val === '' ||
          (Array.isArray(val) && val.length === 0)
        if (isEmpty) throw new BadRequestException(`Le champ "${field.label}" est requis`)
      }
    }

    const savedResponse = await this.responseModel.create({ formId: form._id, answers, metadata })

    // Fire automation trigger (non-blocking)
    this.automationsService?.triggerEvent('form_submitted', {
      formId: String(form._id),
      responseId: String(savedResponse._id),
      form: { title: form.title, slug: form.slug },
      answers: answerMap,
      submittedAt: new Date().toISOString(),
    })

    return {
      message: form.settings?.submitMessage ?? 'Merci pour votre réponse !',
      redirectUrl: form.settings?.redirectUrl ?? null,
    }
  }

  async listResponses(formId: string, page = 1, limit = 25) {
    const query = { formId: new Types.ObjectId(formId) }
    const [data, total] = await Promise.all([
      this.responseModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.responseModel.countDocuments(query),
    ])
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async deleteResponse(responseId: string) {
    await this.responseModel.findByIdAndDelete(responseId)
    return { deleted: true }
  }

  async resubmitResponse(responseId: string) {
    const response = await this.responseModel.findById(responseId).lean()
    if (!response) throw new NotFoundException('Réponse introuvable')

    const form = await this.formModel.findById(response.formId).lean()
    if (!form) throw new NotFoundException('Formulaire introuvable')

    const answerMap: Record<string, unknown> = {}
    for (const a of response.answers) answerMap[a.fieldId] = a.value

    this.automationsService?.triggerEvent('form_submitted', {
      formId: String(form._id),
      responseId: String(response._id),
      form: { title: form.title, slug: form.slug },
      answers: answerMap,
      submittedAt: new Date().toISOString(),
      resubmitted: true,
    })

    return { resubmitted: true }
  }

  async getFormStats(formId: string) {
    const form = await this.formModel.findById(formId).lean()
    if (!form) throw new NotFoundException('Formulaire introuvable')

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const [total, byDay] = await Promise.all([
      this.responseModel.countDocuments({ formId: new Types.ObjectId(formId) }),
      this.responseModel.aggregate([
        { $match: { formId: new Types.ObjectId(formId), createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ])

    return { total, byDay: byDay.map((d) => ({ date: d._id, count: d.count })) }
  }
}
