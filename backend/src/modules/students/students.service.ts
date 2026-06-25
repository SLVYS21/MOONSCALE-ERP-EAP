import { Injectable, Logger, NotFoundException, ConflictException, Optional } from '@nestjs/common'

// ── Types exportés pour le module reminders ───────────────────────────────────

export interface ReminderRunEntry {
  email: string
  studentName: string | null
  type: 'formation' | 'coaching'
  daysBeforePayment: number
  status: 'sent' | 'failed'
  restricted: boolean
  error?: string
}

export interface ReminderRunSummary {
  totalReminders: number
  emailsSent: number
  emailsFailed: number
  accessRestricted: number
  entries: ReminderRunEntry[]
}
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Student, StudentDocument } from './schemas/student.schema'
import { Payment, PaymentDocument } from './schemas/payment.schema'
import { FormationDashboard, FormationDashboardDocument } from './schemas/formation-dashboard.schema'
import { CoachingDashboard, CoachingDashboardDocument } from './schemas/coaching-dashboard.schema'
import { Reminder, ReminderDocument } from './schemas/reminder.schema'
import { CircleService } from '../circle/circle.service'
import { AirtableService } from '../airtable/airtable.service'
import { MailService } from '../mail/mail.service'
import { OcrService } from '../ocr/ocr.service'
import { AutomationsService } from '../automations/automations.service'
import { Offer, OfferDocument } from '../offers/schemas/offer.schema'
import { Subscription, SubscriptionDocument } from '../offers/schemas/subscription.schema'
import { Lead, LeadDocument } from '../leads/schemas/lead.schema'
import { ProductMapping, ProductMappingDocument } from '../finances/schemas/product-mapping.schema'

@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name)

  constructor(
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(FormationDashboard.name) private formationModel: Model<FormationDashboardDocument>,
    @InjectModel(CoachingDashboard.name) private coachingModel: Model<CoachingDashboardDocument>,
    @InjectModel(Reminder.name)      private reminderModel: Model<ReminderDocument>,
    @InjectModel(Offer.name)            private offerModel: Model<OfferDocument>,
    @InjectModel(Subscription.name)     private subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(Lead.name)             private leadModel: Model<LeadDocument>,
    @InjectModel(ProductMapping.name)   private productMappingModel: Model<ProductMappingDocument>,
    private circleService: CircleService,
    private airtableService: AirtableService,
    private mailService: MailService,
    private ocrService: OcrService,
    @Optional() private automationsService?: AutomationsService,
  ) {}

  // ── Étudiants ────────────────────────────────────────────────────

  async listStudents(filters: {
    search?: string
    infoStatus?: string
    hasDebt?: boolean
    debtStatus?: string
    dateFrom?: string
    dateTo?: string
    page?: number
    limit?: number
  }) {
    const { search, infoStatus, debtStatus, dateFrom, dateTo, page = 1, limit = 50 } = filters
    const query: Record<string, unknown> = {}
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ]
    }
    if (infoStatus) query.infoStatus = infoStatus
    if (debtStatus) query.debtStatus = debtStatus
    if (dateFrom || dateTo) {
      const range: Record<string, Date> = {}
      if (dateFrom) range.$gte = new Date(dateFrom)
      if (dateTo) {
        const end = new Date(dateTo)
        end.setHours(23, 59, 59, 999)
        range.$lte = end
      }
      query.createdAt = range
    }

    // Pré-filtre sur le statut formation (EN RÈGLE / EN RETARD)
    const statusFilter = (filters as Record<string, unknown>).status as string | undefined
    if (statusFilter) {
      const formations = await this.formationModel
        .find({ paymentStatus: statusFilter })
        .select('studentId')
        .lean()
      const ids = formations.map((f) => f.studentId)
      query._id = { $in: ids }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pipeline: any[] = [
      { $match: query },
      {
        $addFields: {
          _sortDate: {
            $ifNull: ['$airtableCreatedAt', { $ifNull: ['$circleJoinedAt', '$createdAt'] }],
          },
        },
      },
      { $sort: { _sortDate: -1 as const } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]

    const [students, total] = await Promise.all([
      this.studentModel.aggregate(pipeline).exec(),
      this.studentModel.countDocuments(query),
    ])

    // Enrichir avec résumé paiements
    const enriched = await Promise.all(
      students.map(async (s) => {
        const payments = await this.paymentModel
          .find({ studentId: s._id })
          .select('status modality amount currency product createdAt')
          .lean()
        const formation = await this.formationModel.findOne({ studentId: s._id }).lean()
        const coaching = await this.coachingModel.findOne({ studentId: s._id }).lean()
        return { ...s, payments, formation, coaching }
      }),
    )

    return { data: enriched, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async getStudent(id: string) {
    const student = await this.studentModel.findById(id).lean()
    if (!student) throw new NotFoundException('Étudiant introuvable')

    const [payments, formation, coaching, reminders] = await Promise.all([
      // Cherche par studentId OU studentEmail pour trouver tous les paiements
      // (certains paiements Airtable/Tally ont studentId=null mais email correct)
      this.paymentModel.find({
        $or: [{ studentId: id }, { studentEmail: student.email }],
      }).sort({ createdAt: -1 }).lean(),
      this.formationModel.findOne({ studentId: id }).lean(),
      this.coachingModel.findOne({ studentId: id }).lean(),
      this.reminderModel.find({ studentId: id, status: 'active' }).lean(),
    ])

    return { student, payments, formation, coaching, reminders }
  }

  // ── Resync Circle (1 seul appel API) ─────────────────────────────
  async refreshCircleProfile(studentId: string) {
    const student = await this.studentModel.findById(studentId)
    if (!student) throw new NotFoundException('Étudiant introuvable')

    const member = await this.circleService.searchMember(student.email)
    if (!member) return { refreshed: false, student: student.toObject() }

    const acceptedRaw = (member.accepted_invitation as string | undefined)?.trim() ?? ''
    const acceptedAt = acceptedRaw ? new Date(acceptedRaw.replace(' UTC', 'Z')) : null

    await this.studentModel.updateOne(
      { _id: studentId },
      {
        $set: {
          circleId: member.id,
          circleProfile: member.profile_url ?? null,
          circleAvatarUrl: member.avatar_url ?? null,
          circleJoinedAt: member.created_at ? new Date(member.created_at) : null,
          circleAcceptedAt: isNaN(acceptedAt?.getTime() ?? NaN) ? null : acceptedAt,
          circleLastSeenAt: member.last_seen_at ? new Date(member.last_seen_at) : null,
          circleTags: member.member_tags ?? [],
          circleIsActive: member.active,
          circleLastSync: new Date(),
        },
      },
    )

    const updated = await this.studentModel.findById(studentId).lean()
    this.logger.log(`Circle profile refreshed for ${student.email} (1 API call)`)
    return { refreshed: true, student: updated }
  }

  // ── Retirer l'accès coaching (espaces privés) ─────────────────────
  async removeCoachingAccess(studentId: string): Promise<void> {
    const student = await this.studentModel.findById(studentId)
    if (!student) throw new NotFoundException('Étudiant introuvable')

    await this.circleService.restrictAccess(student.email)

    await Promise.all([
      this.formationModel.findOneAndUpdate(
        { studentId },
        { paymentStatus: 'EN RETARD', action: '🤖 RETRAIT COACHING' },
      ),
      this.coachingModel.findOneAndUpdate(
        { studentId },
        { paymentStatus: 'EN RETARD', action: '🤖 RETRAIT COACHING' },
      ),
    ])

    this.logger.log(`Coaching access removed for ${student.email}`)
  }

  async findOrCreateStudent(data: {
    email: string
    name: string
    whatsapp?: string
    occupation?: string
    source?: string
    airtableId?: string
  }): Promise<StudentDocument> {
    const existing = await this.studentModel.findOne({ email: data.email.toLowerCase() })
    if (existing) return existing

    const student = await this.studentModel.create({
      email: data.email.toLowerCase(),
      name: data.name,
      whatsapp: data.whatsapp ?? null,
      occupation: data.occupation ?? null,
      source: data.source ?? null,
      airtableId: data.airtableId ?? null,
    })

    // Trigger automation event
    this.automationsService?.triggerEvent('student_created', {
      student: { _id: String(student._id), email: student.email, name: student.name, whatsapp: student.whatsapp },
    })

    return student
  }

  async addNote(studentId: string, note: string) {
    const student = await this.studentModel.findById(studentId)
    if (!student) throw new NotFoundException('Étudiant introuvable')
    student.notes = note
    return student.save()
  }

  async toggleStudentAdmin(studentId: string): Promise<{ isAdmin: boolean }> {
    const student = await this.studentModel.findById(studentId)
    if (!student) throw new NotFoundException('Étudiant introuvable')
    student.isAdmin = !student.isAdmin
    await student.save()
    return { isAdmin: student.isAdmin }
  }

  async updateFormationStatus(studentId: string, paymentStatus: 'EN RÈGLE' | 'EN RETARD'): Promise<void> {
    const student = await this.studentModel.findById(studentId)
    if (!student) throw new NotFoundException('Étudiant introuvable')
    await this.formationModel.findOneAndUpdate(
      { studentId },
      { $set: { paymentStatus, action: '✏️ MODIFIÉ MANUELLEMENT' } },
      { upsert: true },
    )
  }

  // ── Paiements ────────────────────────────────────────────────────

  async listPayments(filters: {
    status?: string
    product?: string
    studentEmail?: string
    search?: string
    dateFrom?: string
    dateTo?: string
    page?: number
    limit?: number
  }) {
    const { status, product, studentEmail, search, dateFrom, dateTo, page = 1, limit = 50 } = filters
    const query: Record<string, unknown> = {}
    if (status) query.status = status
    if (product) query.product = product
    if (studentEmail) query.studentEmail = studentEmail.toLowerCase()
    if (search) {
      query.$or = [
        { studentName: { $regex: search, $options: 'i' } },
        { studentEmail: { $regex: search, $options: 'i' } },
      ]
    }
    if (dateFrom || dateTo) {
      const range: Record<string, Date> = {}
      if (dateFrom) range.$gte = new Date(dateFrom)
      if (dateTo) {
        const end = new Date(dateTo)
        end.setHours(23, 59, 59, 999)
        range.$lte = end
      }
      query.createdAt = range
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pipeline: any[] = [
      { $match: query },
      {
        $addFields: {
          _sortDate: { $ifNull: ['$paidAt', '$createdAt'] },
        },
      },
      { $sort: { _sortDate: -1 as const } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]

    const [payments, total] = await Promise.all([
      this.paymentModel.aggregate(pipeline).exec(),
      this.paymentModel.countDocuments(query),
    ])

    return { data: payments, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async getStudentStats() {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const nonAdmin = { isAdmin: { $ne: true } }

    const [total, withDebt, newThisMonth, formations] = await Promise.all([
      this.studentModel.countDocuments(nonAdmin),
      this.studentModel.countDocuments({ ...nonAdmin, debtStatus: { $in: ['potential', 'confirmed'] } }),
      this.studentModel.countDocuments({ ...nonAdmin, createdAt: { $gte: startOfMonth } }),
      this.formationModel.aggregate([
        { $group: { _id: '$paymentStatus', count: { $sum: 1 } } },
      ]),
    ])

    const enRegle = (formations.find((f: { _id: string; count: number }) => f._id === 'EN RÈGLE')?.count ?? 0) as number
    const enRetard = (formations.find((f: { _id: string; count: number }) => f._id === 'EN RETARD')?.count ?? 0) as number

    return { total, enRegle, enRetard, withDebt, newThisMonth }
  }

  async clientSearch(q: string): Promise<Array<{
    type: 'student' | 'lead'
    _id: string
    name: string
    email: string | null
    extra?: string
  }>> {
    if (!q || q.trim().length < 2) return []
    const regex = new RegExp(q.trim(), 'i')

    const [students, leads] = await Promise.all([
      this.studentModel
        .find({ $or: [{ name: regex }, { email: regex }] })
        .select('name email plan')
        .limit(6)
        .lean(),
      this.leadModel
        .find({ $or: [{ name: regex }, { email: regex }] })
        .select('name email pipeline_status')
        .limit(6)
        .lean(),
    ])

    return [
      ...students.map((s) => ({
        type: 'student' as const,
        _id: String(s._id),
        name: s.name,
        email: s.email,
        extra: s.plan ?? undefined,
      })),
      ...leads.map((l) => ({
        type: 'lead' as const,
        _id: String(l._id),
        name: l.name,
        email: l.email,
        extra: l.pipeline_status ?? undefined,
      })),
    ]
  }

  async getPaymentStats() {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [statusCounts, todayAmounts, monthAmounts] = await Promise.all([
      this.paymentModel.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.paymentModel.aggregate([
        { $match: { status: 'TRAITÉ', processedAt: { $gte: startOfDay } } },
        { $group: { _id: '$currency', total: { $sum: '$amount' } } },
      ]),
      this.paymentModel.aggregate([
        { $match: { status: 'TRAITÉ', processedAt: { $gte: startOfMonth } } },
        { $group: { _id: '$currency', total: { $sum: '$amount' } } },
      ]),
    ])

    const byStatus = Object.fromEntries(
      (statusCounts as { _id: string; count: number }[]).map((s) => [s._id, s.count]),
    )
    const total = Object.values(byStatus).reduce((a: number, b: unknown) => a + (b as number), 0)

    return {
      total,
      nonTraite: byStatus['NON TRAITÉ'] ?? 0,
      traite: byStatus['TRAITÉ'] ?? 0,
      rejete: byStatus['REJETÉ'] ?? 0,
      todayByAmount: (todayAmounts as { _id: string; total: number }[]).map((a) => ({ currency: a._id, total: a.total })),
      monthByAmount: (monthAmounts as { _id: string; total: number }[]).map((a) => ({ currency: a._id, total: a.total })),
    }
  }

  async createPayment(data: {
    studentEmail: string
    studentName: string
    modality: 'Complet' | 'Partiel'
    amount: number
    currency: string
    product: string
    gateway?: string
    plan?: string
    validityMonths?: number
    proofImages?: string[]
    notes?: string
    source?: 'tally' | 'chariow' | 'manual'
    airtableId?: string
    responseId?: string
  }): Promise<PaymentDocument> {
    const student = await this.studentModel.findOne({ email: data.studentEmail.toLowerCase() })

    const payment = await this.paymentModel.create({
      studentId: student?._id ?? null,
      studentEmail: data.studentEmail.toLowerCase(),
      studentName: data.studentName,
      status: 'NON TRAITÉ' as const,
      modality: data.modality,
      amount: data.amount,
      currency: data.currency as import('./schemas/payment.schema').PaymentCurrency,
      product: data.product as import('./schemas/payment.schema').PaymentProduct,
      gateway: data.gateway ?? null,
      plan: (data.plan ?? null) as import('./schemas/payment.schema').CirclePlan | null,
      validityMonths: data.validityMonths ?? 0,
      proofImages: data.proofImages ?? [],
      notes: data.notes ?? '',
      source: (data.source ?? 'manual') as 'tally' | 'chariow' | 'manual',
      airtableId: data.airtableId ?? null,
      responseId: data.responseId ? new Types.ObjectId(data.responseId) : null,
    })

    // Trigger automation event
    const studentForEvent = await this.studentModel.findOne({ email: data.studentEmail.toLowerCase() }).lean()
    this.automationsService?.triggerEvent('payment_created', {
      payment: { _id: String(payment._id), amount: payment.amount, currency: payment.currency, product: payment.product, source: payment.source },
      student: { email: data.studentEmail, name: data.studentName, whatsapp: studentForEvent?.whatsapp ?? null },
    })

    return payment
  }

  // ── Traitement d'un paiement (le flux principal) ─────────────────

  async updatePaymentFields(
    paymentId: string,
    fields: {
      status?: string
      modality?: string
      product?: string
      gateway?: string
      plan?: string
      amount?: number
      currency?: string
    },
  ): Promise<void> {
    const payment = await this.paymentModel.findById(paymentId)
    if (!payment) throw new NotFoundException('Paiement introuvable')

    const becomesTreated = fields.status === 'TRAITÉ' && payment.status !== 'TRAITÉ'

    if (fields.status)              payment.status   = fields.status as import('./schemas/payment.schema').PaymentStatus
    if (fields.modality)            payment.modality = fields.modality as import('./schemas/payment.schema').PaymentModality
    if (fields.product)             payment.product  = fields.product as import('./schemas/payment.schema').PaymentProduct
    if (fields.gateway !== undefined) payment.gateway = fields.gateway
    if (fields.plan)                payment.plan     = fields.plan as import('./schemas/payment.schema').CirclePlan
    if (fields.amount !== undefined) payment.amount  = fields.amount
    if (fields.currency)            payment.currency = fields.currency as import('./schemas/payment.schema').PaymentCurrency
    await payment.save()

    if (becomesTreated) {
      const student = await this.studentModel.findOne({ email: payment.studentEmail })
      this.automationsService?.triggerEvent('payment_treated', {
        payment: {
          _id: String(payment._id),
          amount: payment.amount,
          currency: payment.currency,
          plan: payment.plan,
          planKey: this.inferPlanKey(payment.plan, payment.modality),
          product: payment.product,
          responseId: payment.responseId ? String(payment.responseId) : null,
        },
        student: {
          _id: String(student?._id ?? ''),
          email: payment.studentEmail,
          name: payment.studentName,
          whatsapp: student?.whatsapp,
        },
      })
    }
  }

  async rejectPayment(paymentId: string): Promise<void> {
    const payment = await this.paymentModel.findById(paymentId)
    if (!payment) throw new NotFoundException('Paiement introuvable')
    payment.status = 'REJETÉ'
    await payment.save()
  }

  async treatPayment(
    paymentId: string,
    processedById: string,
    body?: {
      planKey?: string
      plan?: string
      modality?: string
      amount?: number
      currency?: string
      product?: string
      gateway?: string
      notes?: string
      offerId?: string
    },
  ): Promise<void> {
    const payment = await this.paymentModel.findById(paymentId)
    if (!payment) throw new NotFoundException('Paiement introuvable')
    if (payment.status === 'TRAITÉ') return

    // Appliquer les corrections de l'admin avant traitement
    if (body?.modality) {
      const raw = body.modality.trim()
      payment.modality = (raw === 'COMPLET' ? 'Complet' : raw === 'PARTIEL' ? 'Partiel' : raw) as import('./schemas/payment.schema').PaymentModality
    }
    if (body?.amount !== undefined) payment.amount = body.amount;
    if (body?.currency) payment.currency = body.currency as import('./schemas/payment.schema').PaymentCurrency
    if (body?.product) payment.product = body.product as import('./schemas/payment.schema').PaymentProduct
    if (body?.plan !== undefined) payment.plan = body.plan as typeof payment.plan
    if (body?.gateway) payment.gateway = body.gateway
    if (body?.notes !== undefined) payment.notes = body.notes

    const resolvedPlanKey = body?.planKey ?? this.inferPlanKey(payment.plan, payment.modality)

    // 2D. Auto-suggest offerId from confirmed ProductMapping if not provided
    let resolvedOfferId = body?.offerId
    if (!resolvedOfferId && payment.product) {
      const mapping = await this.productMappingModel
        .findOne({ productName: payment.product, status: 'confirmed' })
        .lean<{ offerId: Types.ObjectId | null }>()
      if (mapping?.offerId) resolvedOfferId = String(mapping.offerId)
    }

    // 1. Trouver/créer l'étudiant
    let student = await this.studentModel.findOne({ email: payment.studentEmail })
    if (!student) {
      student = await this.studentModel.create({
        email: payment.studentEmail,
        name: payment.studentName ?? payment.studentEmail,
      })
    }

    // 2E. Lead → Student conversion
    try {
      const lead = await this.leadModel.findOne({ email: payment.studentEmail })
      if (lead && !lead.student_id) {
        lead.student_id = String(student._id)
        lead.pipeline_status = 'won'
        await lead.save()
        this.automationsService?.triggerEvent('lead_won', {
          student: { _id: String(student._id), email: student.email, name: student.name, whatsapp: student.whatsapp },
          lead: { _id: String(lead._id), name: lead.name, email: lead.email },
        })
      }
    } catch (err: unknown) {
      this.logger.error(`Lead→won conversion failed for ${payment.studentEmail}: ${(err as Error).message}`)
    }

    // 2. Circle : inviter si nouveau + tagger + donner l'accès
    let circleMember: Record<string, unknown> | null = null
    try {
      const result = await this.circleService.processNewPayment(
        payment.studentEmail,
        student.name,
        resolvedPlanKey,
      )
      circleMember = result.member as Record<string, unknown>
      const circleId = circleMember?.id as number | undefined
      if (circleId && !student.circleId) {
        student.circleId = circleId
        student.circleLastSync = new Date()
        await student.save()
      }
    } catch (err: unknown) {
      this.logger.error(`Circle flow failed for ${payment.studentEmail}: ${(err as Error).message}`)
    }

    // 3. Calculer la prochaine date de paiement
    const nextPaymentDate = this.circleService.getNextPaymentDate(resolvedPlanKey)
    const isPartial = payment.modality === 'Partiel'

    // 4. Mettre à jour ou créer le dashboard Formation
    if (payment.product !== 'COACHING') {
      await this.upsertFormationDashboard(student._id as Types.ObjectId, {
        circleId: student.circleId ?? undefined,
        paymentModality: payment.modality,
        paymentStatus: 'EN RÈGLE',
        nextPaymentDate: isPartial ? nextPaymentDate : null,
        action: '🤖 INTÉGRÉ',
        paymentId: payment._id as Types.ObjectId,
      })
    }

    // 5. Mettre à jour ou créer le dashboard Coaching
    await this.upsertCoachingDashboard(student._id as Types.ObjectId, {
      circleId: student.circleId ?? undefined,
      nextPaymentDate,
      paymentStatus: 'EN REGLE',
      action: '🤖 INTÉGRÉ',
      tags: [resolvedPlanKey],
      paymentId: payment._id as Types.ObjectId,
    })

    // 6. Créer un rappel email si paiement partiel
    if (isPartial) {
      await this.createReminder({
        email: payment.studentEmail,
        studentId: student._id as Types.ObjectId,
        type: payment.product === 'COACHING' ? 'coaching' : 'formation',
        paymentDate: nextPaymentDate,
        circlePlanTag: resolvedPlanKey,
        studentName: student.name,
        whatsapp: student.whatsapp ?? undefined,
      })
    }

    // 7. Marquer le paiement TRAITÉ
    payment.status = 'TRAITÉ'
    payment.processedBy = new Types.ObjectId(processedById)
    payment.processedAt = new Date()
    await payment.save()

    // 2F. Append history: payment treated
    try {
      await this.studentModel.updateOne(
        { _id: student._id },
        { $push: { history: { event: 'payment_treated', detail: `Paiement ${payment._id} traité (${payment.product}, ${payment.amount} ${payment.currency})`, actor: new Types.ObjectId(processedById), date: new Date() } } },
      )
    } catch { /* non-bloquant */ }

    // 8. Créer la souscription si une offre est sélectionnée
    if (resolvedOfferId) {
      try {
        const offer = await this.offerModel.findById(resolvedOfferId).lean<{
          _id: Types.ObjectId; name: string; plan: string | null
          durationMonths: number; price: number; currency: string; partialDueAfterDays: number
        }>()
        if (offer) {
          const startDate = new Date()
          const endDate = new Date(startDate)
          endDate.setMonth(endDate.getMonth() + offer.durationMonths)
          const isPartialSub = payment.modality === 'Partiel'
          const nextPaymentDate = isPartialSub
            ? new Date(startDate.getTime() + offer.partialDueAfterDays * 24 * 60 * 60 * 1000)
            : null

          const subscription = await this.subscriptionModel.create({
            studentId: student._id,
            studentEmail: payment.studentEmail,
            offerId: offer._id,
            paymentId: payment._id,
            offerName: offer.name,
            offerProduct: offer.name,
            offerPlan: offer.plan,
            durationMonths: offer.durationMonths,
            startDate,
            endDate,
            status: 'active',
            modality: payment.modality,
            paidAmount: payment.amount,
            totalAmount: offer.price,
            currency: payment.currency,
            nextPaymentDate,
            remindersSent: 0,
          })

          this.automationsService?.triggerEvent('subscription_created', {
            student: { _id: String(student._id), email: student.email, name: student.name, whatsapp: student.whatsapp },
            subscription: {
              _id: String(subscription._id),
              offerName: offer.name,
              offerProduct: offer.name,
              offerPlan: offer.plan,
              durationMonths: offer.durationMonths,
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
              modality: payment.modality,
              paidAmount: payment.amount,
              totalAmount: offer.price,
              currency: payment.currency,
              nextPaymentDate: nextPaymentDate?.toISOString() ?? null,
            },
            payment: { _id: String(payment._id), amount: payment.amount, currency: payment.currency },
          })
        }
      } catch (err: unknown) {
        this.logger.error(`Subscription creation failed for payment ${paymentId}: ${(err as Error).message}`)
      }
    }

    // 9. Mirror vers Airtable (async, non-bloquant)
    this.syncPaymentToAirtable(payment, student.airtableId ?? undefined, student.circleId ?? undefined).catch(
      (err: unknown) => this.logger.error(`Airtable sync failed: ${(err as Error).message}`),
    )

    // 10. Trigger automation event
    this.automationsService?.triggerEvent('payment_treated', {
      payment: {
        _id: String(payment._id),
        amount: payment.amount,
        currency: payment.currency,
        plan: payment.plan,
        planKey: resolvedPlanKey,
        product: payment.product,
        responseId: payment.responseId ? String(payment.responseId) : null,
      },
      student: { _id: String(student._id), email: student.email, name: student.name, whatsapp: student.whatsapp },
    })

    this.logger.log(`Payment ${paymentId} treated for ${payment.studentEmail} (plan: ${resolvedPlanKey})`)
  }

  // ── Restriction d'accès (paiement en retard) ─────────────────────

  async restrictStudentAccess(studentId: string): Promise<void> {
    const student = await this.studentModel.findById(studentId)
    if (!student) throw new NotFoundException('Étudiant introuvable')

    await this.circleService.restrictAccess(student.email)

    await Promise.all([
      this.formationModel.findOneAndUpdate(
        { studentId },
        { paymentStatus: 'EN RETARD', action: '🤖 RETRAIT EFFECTUÉ' },
      ),
      this.coachingModel.findOneAndUpdate(
        { studentId },
        { paymentStatus: 'EN RETARD', action: '🤖 RETRAIT EFFECTUÉ' },
      ),
    ])

    await this.airtableService.updateFormationStatus(student.email, 'EN RETARD', 'RELANCE 3')
    await this.airtableService.updateCoachingStatus(student.email, 'EN RETARD', 'RELANCE 2')
  }

  async restoreStudentAccess(studentId: string, planKey: string): Promise<void> {
    const student = await this.studentModel.findById(studentId)
    if (!student) throw new NotFoundException('Étudiant introuvable')

    await this.circleService.grantAccess(student.email, planKey || 'Premium')
    await this.circleService.tagMember(student.email, planKey || 'Premium')

    await Promise.all([
      this.formationModel.findOneAndUpdate(
        { studentId },
        { paymentStatus: 'EN RÈGLE', action: '🤖 INTÉGRÉ' },
      ),
      this.coachingModel.findOneAndUpdate(
        { studentId },
        { paymentStatus: 'EN REGLE', action: '🤖 INTÉGRÉ' },
      ),
    ])
  }

  // ── Rappels email ────────────────────────────────────────────────

  async processReminders(): Promise<ReminderRunSummary> {
    const now = new Date()
    const reminders = await this.reminderModel.find({
      status: 'active',
      'reminderDates.status': 'pending',
      'reminderDates.date': { $lte: now },
    })

    const summary: ReminderRunSummary = {
      totalReminders: reminders.length,
      emailsSent: 0,
      emailsFailed: 0,
      accessRestricted: 0,
      entries: [],
    }

    for (const reminder of reminders) {
      for (const rd of reminder.reminderDates) {
        if (rd.status !== 'pending' || rd.date > now) continue

        const entry: ReminderRunEntry = {
          email: reminder.email,
          studentName: reminder.studentName,
          type: reminder.type,
          daysBeforePayment: rd.daysBeforePayment,
          status: 'sent',
          restricted: false,
        }

        try {
          const payments = await this.paymentModel.find({
            studentEmail: reminder.email,
            modality: 'Partiel',
            status: 'TRAITÉ',
          }).lean()
          const totalPaid = payments.reduce((s, p) => s + (p.amount ?? 0), 0)

          // Fetch subscription for enriched context
          const subscription = await this.subscriptionModel
            .findOne({ studentEmail: reminder.email, status: 'active' })
            .lean<{ offerName?: string; totalAmount?: number; currency?: string; nextPaymentDate?: Date }>()

          this.automationsService?.triggerEvent('reminder_due', {
            student: { email: reminder.email, name: reminder.studentName },
            reminder: {
              nextPaymentDate: rd.date.toISOString().split('T')[0],
              amountDue: subscription?.totalAmount ?? totalPaid,
              daysBeforePayment: rd.daysBeforePayment,
            },
            subscription: {
              offerName: subscription?.offerName ?? '',
              currency: subscription?.currency ?? 'F CFA',
            },
          })

          await this.mailService.sendPaymentReminder(
            reminder.email,
            reminder.studentName ?? reminder.email,
            totalPaid,
            'F CFA',
          )
          rd.status = 'sent'
          rd.sentAt = new Date()
          summary.emailsSent++
        } catch (err: unknown) {
          rd.status = 'failed'
          entry.status = 'failed'
          entry.error = (err as Error).message
          summary.emailsFailed++
        }

        // Au dernier rappel (J-0) : restreindre l'accès Circle
        if (rd.daysBeforePayment === 0) {
          reminder.status = 'completed'
          try {
            const student = await this.studentModel.findOne({ email: reminder.email })
            if (student) {
              await this.circleService.restrictAccess(student.email)
              entry.restricted = true
              summary.accessRestricted++
            }
          } catch (err: unknown) {
            this.logger.error(`Circle restrict failed for ${reminder.email}: ${(err as Error).message}`)
          }
        }

        summary.entries.push(entry)
      }
      await reminder.save()
    }

    return summary
  }

  async createReminder(data: {
    email: string
    studentId: Types.ObjectId
    type: 'formation' | 'coaching'
    paymentDate: Date
    circlePlanTag: string
    studentName?: string
    whatsapp?: string
  }) {
    // Annuler un éventuel rappel actif du même type
    await this.reminderModel.updateMany(
      { email: data.email, type: data.type, status: 'active' },
      { status: 'cancelled' },
    )

    const reminderDates = [7, 3, 0].map((days) => {
      const date = new Date(data.paymentDate)
      date.setDate(date.getDate() - days)
      return { date, daysBeforePayment: days, status: 'pending' as const, sentAt: null }
    })

    return this.reminderModel.create({
      ...data,
      reminderDates,
      status: 'active',
    })
  }

  // ── Import depuis Airtable ───────────────────────────────────────

  async importFromAirtable(): Promise<{ students: number; payments: number }> {
    this.logger.log('Starting Airtable import...')
    let studentCount = 0
    let paymentCount = 0

    const [airtableStudents, airtablePayments] = await Promise.all([
      this.airtableService.getAll(this.airtableService.TABLES.STUDENTS),
      this.airtableService.getAll(this.airtableService.TABLES.PAYMENTS),
    ])

    for (const rec of airtableStudents) {
      const f = rec.fields as Record<string, unknown>
      const email = f['EMAIL'] as string | undefined
      if (!email) continue

      const existing = await this.studentModel.findOne({ email: email.toLowerCase() })
      if (!existing) {
        await this.studentModel.create({
          email: email.toLowerCase(),
          name: (f['NOM ET PRENOMS'] as string) ?? email,
          whatsapp: (f['WHATSAPP'] as string) ?? null,
          occupation: (f['OCCUPATION'] as string) ?? null,
          source: (f['OU AVEZ VOUS ENTENDU PARLE DE MYRIL LA PREMEIERE FOIS ?'] as string) ?? null,
          notes: (f['Notes'] as string) ?? '',
          airtableId: rec.id,
          airtableEtudiantId: rec.id,
        })
        studentCount++
      }
    }

    for (const rec of airtablePayments) {
      const f = rec.fields as Record<string, unknown>
      const emailArr = f['EMAIL'] as string[] | undefined
      const email = Array.isArray(emailArr) ? emailArr[0] : (emailArr as string | undefined)
      if (!email) continue

      const existing = await this.paymentModel.findOne({ airtableId: rec.id })
      if (!existing) {
        const student = await this.studentModel.findOne({ email: email.toLowerCase() })
        await this.paymentModel.create({
          studentId: student?._id ?? null,
          studentEmail: email.toLowerCase(),
          studentName: (f['NOM ET PRENOMS'] as string) ?? null,
          status: ((f['STATUT DE TRAITEMENT'] as string) ?? 'NON TRAITÉ') as import('./schemas/payment.schema').PaymentStatus,
          modality: ((f['MODALITE DE PAIEMENT'] as string) ?? 'Complet') as import('./schemas/payment.schema').PaymentModality,
          amount: (f['MONTANT'] as number) ?? 0,
          currency: ((f['DEVISE'] as string) ?? 'F CFA') as import('./schemas/payment.schema').PaymentCurrency,
          product: ((f['PRODUIT'] as string) ?? 'ECOM AFRICA PRO') as import('./schemas/payment.schema').PaymentProduct,
          gateway: (f['MOYEN DE PAIEMENT'] as string) ?? null,
          plan: ((f['Plan'] as string) ?? null) as import('./schemas/payment.schema').CirclePlan | null,
          notes: (f['Notes'] as string) ?? '',
          airtableId: rec.id,
          source: 'manual' as const,
        })
        paymentCount++
      }
    }

    this.logger.log(`Airtable import done: ${studentCount} students, ${paymentCount} payments`)
    return { students: studentCount, payments: paymentCount }
  }

  // ── OCR des preuves de paiement ──────────────────────────────────

  async bulkAnalyzeProofs(): Promise<{ queued: number; alreadyDone: number }> {
    return this.runAnalyzeProofs({})
  }

  async applyOcrAmounts(): Promise<{ updated: number; skipped: number; noConsensus: number }> {
    let updated = 0
    let skipped = 0
    let noConsensus = 0

    const payments = await this.paymentModel
      .find({
        ocrStatus: 'done',
        status: 'NON TRAITÉ',
        'ocrResults.0': { $exists: true },
      })
      .lean<Array<{
        _id: Types.ObjectId
        amount: number
        currency: string
        ocrResults: Array<{ extractedAmount: number | null; extractedCurrency: string | null; error: string | null }>
      }>>()

    for (const payment of payments) {
      const successes = payment.ocrResults.filter((r) => !r.error && r.extractedAmount !== null)
      if (successes.length === 0) { noConsensus++; continue }

      const amounts = successes.map((r) => r.extractedAmount as number)
      const freq = new Map<number, number>()
      for (const a of amounts) freq.set(a, (freq.get(a) ?? 0) + 1)
      const maxFreq = Math.max(...freq.values())
      const top = [...freq.entries()].filter(([, f]) => f === maxFreq).map(([a]) => a)
      const consensusAmount = Math.round(
        top.length === 1 ? top[0] : amounts.reduce((s, a) => s + a, 0) / amounts.length,
      )

      const currencies = successes.map((r) => r.extractedCurrency).filter(Boolean) as string[]
      const currFreq = new Map<string, number>()
      for (const c of currencies) currFreq.set(c, (currFreq.get(c) ?? 0) + 1)
      const topCurrency = [...currFreq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]

      const patch: Record<string, unknown> = {}
      if (consensusAmount !== payment.amount) patch.amount = consensusAmount
      if (topCurrency && topCurrency !== payment.currency) {
        const valid = ['F CFA', 'FCFA', 'USD', 'EURO']
        if (valid.includes(topCurrency)) patch.currency = topCurrency
      }

      if (Object.keys(patch).length === 0) { skipped++; continue }

      await this.paymentModel.updateOne({ _id: payment._id }, { $set: patch })
      updated++
    }

    this.logger.log(`ApplyOcrAmounts: ${updated} mis à jour, ${skipped} inchangés, ${noConsensus} sans consensus`)
    return { updated, skipped, noConsensus }
  }

  async analyzeDebtorProofs(): Promise<{ queued: number; alreadyDone: number }> {
    const debtors = await this.studentModel
      .find({ debtStatus: 'confirmed', isAdmin: { $ne: true } })
      .select('email')
      .lean<Array<{ email: string }>>()

    if (debtors.length === 0) return { queued: 0, alreadyDone: 0 }

    const emails = debtors.map((d) => d.email)
    return this.runAnalyzeProofs({ studentEmail: { $in: emails } })
  }

  private async runAnalyzeProofs(extraMatch: Record<string, unknown>): Promise<{ queued: number; alreadyDone: number }> {
    const payments = await this.paymentModel
      .find({
        ...extraMatch,
        proofImages: { $exists: true, $not: { $size: 0 } },
        $or: [
          // Jamais analysé ou échec global
          { ocrStatus: { $in: [null, 'failed', 'pending'] } },
          // Analysé mais TOUS les résultats ont une erreur (aucun succès)
          {
            ocrStatus: 'done',
            ocrResults: { $not: { $elemMatch: { error: null } } },
          },
        ],
      })
      .select('_id proofImages')
      .lean()

    const alreadyDone = await this.paymentModel.countDocuments({
      ...extraMatch,
      ocrStatus: 'done',
      ocrResults: { $elemMatch: { error: null } },
    })

    if (payments.length === 0) return { queued: 0, alreadyDone }

    const ids = payments.map((p) => p._id)
    await this.paymentModel.updateMany({ _id: { $in: ids } }, { ocrStatus: 'pending' })

    this.runBulkOcr(payments as Array<{ _id: Types.ObjectId; proofImages: string[] }>).catch(
      (err: unknown) => this.logger.error(`Bulk OCR error: ${(err as Error).message}`),
    )

    this.logger.log(`Bulk OCR démarré: ${payments.length} payments, workers: ${this.ocrService.workerCount}`)
    return { queued: payments.length, alreadyDone }
  }

  private async runBulkOcr(payments: Array<{ _id: Types.ObjectId; proofImages: string[] }>) {
    type OcrResult = import('../ocr/ocr.service').OcrImageResult
    const totalImages = payments.reduce((sum, p) => sum + p.proofImages.length, 0)
    let doneImages = 0
    let donePmts = 0

    this.logger.log(`Bulk OCR démarré: ${payments.length} payments, ${totalImages} images, ${this.ocrService.workerCount} workers`)

    // Toutes les images de tous les payments soumises au pool simultanément → distribution optimale.
    // Chaque payment est sauvegardé dès que toutes ses images sont analysées, sans attendre les autres.
    await Promise.allSettled(
      payments.map(async (p) => {
        const results = await Promise.all(
          p.proofImages.map(async (url): Promise<OcrResult> => {
            const r = await this.ocrService.analyzeImage(url)
            doneImages++
            return r
          }),
        )

        await this.paymentModel.updateOne(
          { _id: p._id },
          { ocrResults: results, ocrStatus: 'done' },
        )

        donePmts++
        if (donePmts % 10 === 0 || donePmts === payments.length) {
          this.logger.log(`Bulk OCR: ${donePmts}/${payments.length} payments sauvegardés (${doneImages}/${totalImages} images)`)
        }
      }),
    )

    this.logger.log(`Bulk OCR terminé: ${donePmts} payments, ${doneImages} images`)
  }

  async analyzePaymentProof(paymentId: string) {
    const payment = await this.paymentModel.findById(paymentId)
    if (!payment) throw new NotFoundException('Paiement introuvable')
    if (!payment.proofImages.length) {
      return { analyzed: 0, results: [], message: 'Aucune preuve à analyser' }
    }

    payment.ocrStatus = 'pending'
    await payment.save()

    try {
      const results = await this.ocrService.analyzeBatch(
        payment.proofImages,
        (done, total) => this.logger.log(`OCR ${paymentId}: ${done}/${total}`),
      )

      payment.ocrResults = results
      payment.ocrStatus = 'done'
      await payment.save()

      const amounts = results
        .map((r) => r.extractedAmount)
        .filter((a): a is number => a !== null)

      return {
        analyzed: results.length,
        results,
        detectedAmounts: amounts,
        amountConsensus: amounts.length > 0
          ? amounts.reduce((a, b) => a + b, 0) / amounts.length
          : null,
      }
    } catch (err: unknown) {
      payment.ocrStatus = 'failed'
      await payment.save()
      throw err
    }
  }

  // ── Changement d'email ───────────────────────────────────────────

  async changeStudentEmail(studentId: string, newEmail: string, actorId: string): Promise<void> {
    const student = await this.studentModel.findById(studentId)
    if (!student) throw new NotFoundException('Étudiant introuvable')

    const normalized = newEmail.toLowerCase().trim()
    const conflict = await this.studentModel.findOne({ email: normalized, _id: { $ne: studentId } })
    if (conflict) throw new ConflictException('Cet email est déjà utilisé par un autre étudiant')

    const oldEmail = student.email
    student.email = normalized
    await student.save()

    // Mettre à jour les paiements et abonnements liés
    await Promise.all([
      this.paymentModel.updateMany({ studentEmail: oldEmail }, { studentEmail: normalized }),
      this.subscriptionModel.updateMany({ studentEmail: oldEmail }, { studentEmail: normalized }),
    ])

    // Invitation Circle avec le nouvel email (non-bloquant)
    this.circleService.inviteMember(normalized, student.name).catch(
      (err: unknown) => this.logger.error(`Circle re-invite failed for ${normalized}: ${(err as Error).message}`),
    )

    await this.studentModel.updateOne(
      { _id: student._id },
      { $push: { history: { event: 'email_changed', detail: `${oldEmail} → ${normalized}`, actor: new Types.ObjectId(actorId), date: new Date() } } },
    )
  }

  // ── Helpers privés ───────────────────────────────────────────────

  private async upsertFormationDashboard(
    studentId: Types.ObjectId,
    data: {
      circleId?: number
      paymentModality: string
      paymentStatus: string
      nextPaymentDate: Date | null
      action: string
      paymentId: Types.ObjectId
    },
  ) {
    return this.formationModel.findOneAndUpdate(
      { studentId },
      {
        $set: {
          circleId: data.circleId ?? null,
          paymentModality: data.paymentModality,
          paymentStatus: data.paymentStatus,
          nextPaymentDate: data.nextPaymentDate,
          action: data.action,
          autoFollowUpStatus: 'EN RÈGLE',
          manualFollowUpStatus: 'EN RÈGLE',
        },
        $addToSet: { paymentIds: data.paymentId },
      },
      { upsert: true, new: true },
    )
  }

  private async upsertCoachingDashboard(
    studentId: Types.ObjectId,
    data: {
      circleId?: number
      nextPaymentDate: Date
      paymentStatus: string
      action: string
      tags: string[]
      paymentId: Types.ObjectId
    },
  ) {
    return this.coachingModel.findOneAndUpdate(
      { studentId },
      {
        $set: {
          circleId: data.circleId ?? null,
          nextPaymentDate: data.nextPaymentDate,
          paymentStatus: data.paymentStatus,
          action: data.action,
          autoFollowUpStatus: 'EN RÈGLE',
          manualFollowUpStatus: 'EN RÈGLE',
        },
        $addToSet: {
          paymentIds: data.paymentId,
          tags: { $each: data.tags },
        },
      },
      { upsert: true, new: true },
    )
  }

  private async syncPaymentToAirtable(
    payment: PaymentDocument,
    studentAirtableId?: string,
    circleId?: number,
  ) {
    const nextDate = this.circleService.getNextPaymentDate(
      this.inferPlanKey(payment.plan, payment.modality),
    )
    const nextDateStr = nextDate.toISOString().split('T')[0]

    const formationFields = {
      'STATUT DE PAIEMENT': 'EN RÈGLE',
      'STATUT RELANCE AUTO': 'EN RÈGLE',
      'STATUT RELANCE MANUELLE': 'EN RÈGLE',
      'ACTIONS': '🤖 INTÉGRÉ',
      'MODALITE DE PAIEMENT': payment.modality,
      ...(payment.modality === 'Partiel' ? { 'DATE DU PROCHAIN PAIEMENT': nextDateStr } : {}),
    }

    const coachingFields = {
      'STATUT PAIEMENT ': 'EN REGLE',
      'STATUT RELANCE AUTO': 'EN RÈGLE',
      'STATUT RELANCE MANUELLE': 'EN RÈGLE',
      'ACTIONS': '🤖 INTÉGRÉ',
      'PROCHAIN PAIEMENT COACHING': nextDateStr,
    }

    await Promise.all([
      this.airtableService.createOrUpdateFormation(
        payment.studentEmail, formationFields, studentAirtableId, circleId,
      ),
      this.airtableService.createOrUpdateCoaching(
        payment.studentEmail, coachingFields, studentAirtableId, circleId,
      ),
      payment.airtableId
        ? this.airtableService.updatePaymentStatus(payment.airtableId, 'TRAITÉ')
        : null,
    ])
  }

  private inferPlanKey(plan: string | null | undefined, modality: string): string {
    if (!plan) return modality === 'Complet' ? 'all_in_one_monthly' : 'standard'
    const map: Record<string, string> = {
      Elite: 'elite',
      Premium: 'premium',
      Standard: 'standard',
    }
    return map[plan] ?? 'standard'
  }
}
