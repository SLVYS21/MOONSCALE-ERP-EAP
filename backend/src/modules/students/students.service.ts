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
import type { AutomationsService } from '../automations/automations.service'

@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name)

  constructor(
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(FormationDashboard.name) private formationModel: Model<FormationDashboardDocument>,
    @InjectModel(CoachingDashboard.name) private coachingModel: Model<CoachingDashboardDocument>,
    @InjectModel(Reminder.name) private reminderModel: Model<ReminderDocument>,
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
    page?: number
    limit?: number
  }) {
    const { search, infoStatus, debtStatus, page = 1, limit = 50 } = filters
    const query: Record<string, unknown> = {}
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ]
    }
    if (infoStatus) query.infoStatus = infoStatus
    if (debtStatus) query.debtStatus = debtStatus

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

    const [students, total] = await Promise.all([
      this.studentModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
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
          circleJoinedAt: member.created_at ? new Date(member.created_at) : null,
          circleAcceptedAt: isNaN(acceptedAt?.getTime() ?? NaN) ? null : acceptedAt,
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

  // ── Paiements ────────────────────────────────────────────────────

  async listPayments(filters: {
    status?: string
    product?: string
    studentEmail?: string
    page?: number
    limit?: number
  }) {
    const { status, product, studentEmail, page = 1, limit = 50 } = filters
    const query: Record<string, unknown> = {}
    if (status) query.status = status
    if (product) query.product = product
    if (studentEmail) query.studentEmail = studentEmail.toLowerCase()

    const [payments, total] = await Promise.all([
      this.paymentModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.paymentModel.countDocuments(query),
    ])

    return { data: payments, total, page, limit, totalPages: Math.ceil(total / limit) }
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
      modality?: string
      amount?: number
      currency?: string
      product?: string
      gateway?: string
      notes?: string
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
    if (body?.amount !== undefined) payment.amount = body.amount
    if (body?.currency) payment.currency = body.currency as import('./schemas/payment.schema').PaymentCurrency
    if (body?.product) payment.product = body.product as import('./schemas/payment.schema').PaymentProduct
    if (body?.gateway) payment.gateway = body.gateway
    if (body?.notes !== undefined) payment.notes = body.notes

    const resolvedPlanKey = body?.planKey ?? this.inferPlanKey(payment.plan, payment.modality)

    // 1. Trouver/créer l'étudiant
    let student = await this.studentModel.findOne({ email: payment.studentEmail })
    if (!student) {
      student = await this.studentModel.create({
        email: payment.studentEmail,
        name: payment.studentName ?? payment.studentEmail,
      })
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

    // 8. Mirror vers Airtable (async, non-bloquant)
    this.syncPaymentToAirtable(payment, student.airtableId ?? undefined, student.circleId ?? undefined).catch(
      (err: unknown) => this.logger.error(`Airtable sync failed: ${(err as Error).message}`),
    )

    // 9. Trigger automation event
    this.automationsService?.triggerEvent('payment_treated', {
      payment: { _id: String(payment._id), amount: payment.amount, currency: payment.currency, plan: resolvedPlanKey, product: payment.product },
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

    await this.circleService.grantAccess(student.email, planKey)
    await this.circleService.tagMember(student.email, planKey)

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
    const payments = await this.paymentModel
      .find({
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
