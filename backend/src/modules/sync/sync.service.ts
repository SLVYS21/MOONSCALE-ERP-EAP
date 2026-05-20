import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import axios from 'axios'
import { Student, StudentDocument } from '../students/schemas/student.schema'
import { Payment, PaymentDocument } from '../students/schemas/payment.schema'
import { FormationDashboard, FormationDashboardDocument } from '../students/schemas/formation-dashboard.schema'
import { CoachingDashboard, CoachingDashboardDocument } from '../students/schemas/coaching-dashboard.schema'
import { Form, FormDocument, FormField } from '../forms/schemas/form.schema'
import { FormResponse, FormResponseDocument } from '../forms/schemas/form-response.schema'
import { AirtableService } from '../airtable/airtable.service'
import { CircleService } from '../circle/circle.service'
import type { AutomationsService } from '../automations/automations.service'

// ── Result types ──────────────────────────────────────────────────────────────

export interface AirtableSyncResult {
  students: { created: number; updated: number; skipped: number }
  payments: { created: number; updated: number; skipped: number }
  formation: { upserted: number }
  coaching: { upserted: number }
  durationMs: number
}

export interface CircleSyncResult {
  totalCircleMembers: number
  studentsMatched: number
  studentsUpdated: number
  apiCallsUsed: number
  durationMs: number
}

export interface DebtorResult {
  flagged: number
  cleared: number
  durationMs: number
}

export interface SyncStatus {
  lastAirtableSync: Date | null
  lastCircleSync: Date | null
  lastDebtorDetection: Date | null
  lastTallySync: Date | null
  circleApiCallsThisSession: number
}

export interface TallyImportResult {
  imported: number
  skipped: number
  errors: number
  durationMs: number
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name)

  private lastAirtableSync: Date | null = null
  private lastCircleSync: Date | null = null
  private lastDebtorDetection: Date | null = null
  private lastTallySync: Date | null = null

  // Tally form ID (REST API — IDs sans préfixe "question_")
  private readonly TALLY_FORM_ID = 'woB5oM'
  private readonly TALLY_TO_FIELD: Record<string, string> = {
    rD979X: 'f02',  // Nom et Prénoms
    '4a0505': 'f03', // Date de naissance
    je4N41:  'f04', // Email
    '2jd0dM': 'f05', // WhatsApp
    xVbKbk:  'f06', // Plateforme de découverte
    RWepqK:  'f07', // Occupation
    o9NW8b:  'f08', // Formation achetée
    GeEWOe:  'f09', // Moyen de paiement
    BEJl7e:  'f10', // Montant
    Vp7gWj:  'f11', // Devise
    PRQKZ1:  'f12', // Preuves (principal)
    o9rKyP:  'f12', // Preuves supplémentaires slot 2
    GeNXzZ:  'f12', // Preuves supplémentaires slot 3
    vX7EB0:  'f12', // Preuves supplémentaires slot 4
    EqV9ol:  'f13', // Modalités de paiement (choix utilisateur)
  }

  constructor(
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel(Payment.name) private paymentModel: Model<PaymentDocument>,
    @InjectModel(FormationDashboard.name) private formationModel: Model<FormationDashboardDocument>,
    @InjectModel(CoachingDashboard.name) private coachingModel: Model<CoachingDashboardDocument>,
    @InjectModel(Form.name) private formModel: Model<FormDocument>,
    @InjectModel(FormResponse.name) private responseModel: Model<FormResponseDocument>,
    private airtableService: AirtableService,
    private circleService: CircleService,
    @Optional() private automationsService?: AutomationsService,
  ) {}

  // ── Airtable full import ──────────────────────────────────────────────────

  async syncAirtable(): Promise<AirtableSyncResult> {
    const start = Date.now()
    this.logger.log('Airtable sync started')

    const result: AirtableSyncResult = {
      students: { created: 0, updated: 0, skipped: 0 },
      payments: { created: 0, updated: 0, skipped: 0 },
      formation: { upserted: 0 },
      coaching: { upserted: 0 },
      durationMs: 0,
    }

    // ── 1. ETUDIANTS ────────────────────────────────────────────────────────
    this.logger.log('Fetching Airtable ETUDIANTS...')
    const atStudents = await this.airtableService.getAll(this.airtableService.TABLES.STUDENTS)

    for (const rec of atStudents) {
      const f = rec.fields as Record<string, unknown>
      const email = (f['EMAIL'] as string | undefined)?.toLowerCase()?.trim()
      if (!email) { result.students.skipped++; continue }

      const name = (f['NOM ET PRENOMS'] as string) ?? email
      const infoStatusRaw = (f['STATUT DES INFOS'] as string) ?? 'NON VÉRIFIÉ'
      const infoStatus = ['EXACTE', 'ERRONÉE', 'NON VÉRIFIÉ'].includes(infoStatusRaw)
        ? infoStatusRaw : 'NON VÉRIFIÉ'

      const update = {
        name,
        whatsapp: (f['WHATSAPP'] as string) ?? null,
        occupation: (f['OCCUPATION'] as string) ?? null,
        source: (f['OU AVEZ VOUS ENTENDU PARLE DE MYRIL LA PREMEIERE FOIS ?'] as string) ?? null,
        infoStatus,
        notes: (f['Notes'] as string) ?? '',
        airtableId: rec.id,
        airtableEtudiantId: rec.id,
      }

      const existing = await this.studentModel.findOne({ email })
      if (existing) {
        await this.studentModel.updateOne({ email }, { $set: update })
        result.students.updated++
      } else {
        await this.studentModel.create({ email, ...update })
        result.students.created++
      }
    }

    // ── 2. PAIEMENTS ────────────────────────────────────────────────────────
    this.logger.log('Fetching Airtable PAIEMENTS...')
    const atPayments = await this.airtableService.getAll(this.airtableService.TABLES.PAYMENTS)

    for (const rec of atPayments) {
      const f = rec.fields as Record<string, unknown>
      const emailArr = f['EMAIL'] as string[] | string | undefined
      const email = (Array.isArray(emailArr) ? emailArr[0] : emailArr)?.toLowerCase()?.trim()
      if (!email) { result.payments.skipped++; continue }

      const student = await this.studentModel.findOne({ email }).select('_id').lean()
      const modality = (f['MODALITE DE PAIEMENT'] as string) ?? 'Complet'

      const paymentData = {
        studentId: student?._id ?? null,
        studentEmail: email,
        studentName: (f['NOM ET PRENOMS'] as string) ?? null,
        status: this.normalizePaymentStatus(f['STATUT DE TRAITEMENT'] as string),
        modality: (['Complet', 'Partiel'].includes(modality) ? modality : 'Complet') as 'Complet' | 'Partiel',
        amount: (f['MONTANT'] as number) ?? 0,
        currency: this.normalizeCurrency(f['DEVISE'] as string),
        product: this.normalizeProduct(f['PRODUIT'] as string),
        gateway: (f['MOYEN DE PAIEMENT'] as string) ?? null,
        plan: this.normalizePlan(f['Plan'] as string),
        validityMonths: (f['VALIDITÉ (en MOIS)'] as number) ?? 0,
        notes: (f['Notes'] as string) ?? '',
        source: 'manual' as const,
        airtableId: rec.id,
      }

      const existing = await this.paymentModel.findOne({ airtableId: rec.id })
      if (existing) {
        await this.paymentModel.updateOne({ airtableId: rec.id }, { $set: paymentData })
        result.payments.updated++
      } else {
        await this.paymentModel.create(paymentData)
        result.payments.created++
      }
    }

    // ── 3. DASHBOARD FORMATION ──────────────────────────────────────────────
    this.logger.log('Fetching Airtable DASHBOARD FORMATION...')
    const atFormation = await this.airtableService.getAll(this.airtableService.TABLES.FORMATION)

    for (const rec of atFormation) {
      const f = rec.fields as Record<string, unknown>
      const emailArr = f['EMAIL'] as string[] | string | undefined
      const email = (Array.isArray(emailArr) ? emailArr[0] : emailArr)?.toLowerCase()?.trim()
      if (!email) continue

      const student = await this.studentModel.findOne({ email }).select('_id').lean()
      if (!student) continue

      const modality = (f['MODALITE DE PAIEMENT'] as string) ?? 'Complet'
      const paymentStatus = (f['STATUT DE PAIEMENT'] as string) ?? 'EN RÈGLE'
      const nextPaymentRaw = f['DATE DU PROCHAIN PAIEMENT'] as string | undefined

      await this.formationModel.findOneAndUpdate(
        { studentId: student._id },
        {
          $set: {
            circleId: (f['ID CIRCLE'] as number) ?? null,
            paymentModality: ['Complet', 'Partiel'].includes(modality) ? modality : 'Complet',
            paymentStatus: ['EN RÈGLE', 'EN RETARD'].includes(paymentStatus) ? paymentStatus : 'EN RÈGLE',
            autoFollowUpStatus: this.normalizeFollowUp(f['STATUT RELANCE AUTO'] as string),
            manualFollowUpStatus: this.normalizeFollowUp(f['STATUT RELANCE MANUELLE'] as string),
            action: this.cleanAction(f['ACTIONS'] as string),
            notes: (f['Notes'] as string) ?? '',
            nextPaymentDate: nextPaymentRaw ? new Date(nextPaymentRaw) : null,
            airtableId: rec.id,
          },
        },
        { upsert: true, new: true },
      )
      result.formation.upserted++
    }

    // ── 4. DASHBOARD COACHING ───────────────────────────────────────────────
    this.logger.log('Fetching Airtable DASHBOARD COACHING...')
    const atCoaching = await this.airtableService.getAll(this.airtableService.TABLES.COACHING)

    for (const rec of atCoaching) {
      const f = rec.fields as Record<string, unknown>
      const emailArr = f['EMAIL'] as string[] | string | undefined
      const email = (Array.isArray(emailArr) ? emailArr[0] : emailArr)?.toLowerCase()?.trim()
      if (!email) continue

      const student = await this.studentModel.findOne({ email }).select('_id').lean()
      if (!student) continue

      const messagingRaw = (f['MESSAGERIE'] as string) ?? ''
      const paymentStatus = (f['STATUT PAIEMENT'] as string) ?? 'EN REGLE'
      const tags = (f['TAG'] as string[] | undefined) ?? []

      await this.coachingModel.findOneAndUpdate(
        { studentId: student._id },
        {
          $set: {
            circleId: (f['ID CIRCLE'] as number) ?? null,
            messagingEnabled: messagingRaw.includes('ACTIVÉE'),
            paymentDate: f['DATE DE PAIEMENT COACHING'] ? new Date(f['DATE DE PAIEMENT COACHING'] as string) : null,
            nextPaymentDate: f['PROCHAIN PAIEMENT COACHING'] ? new Date(f['PROCHAIN PAIEMENT COACHING'] as string) : null,
            paymentStatus: ['EN REGLE', 'EN RETARD'].includes(paymentStatus) ? paymentStatus : 'EN REGLE',
            autoFollowUpStatus: this.normalizeFollowUp(f['STATUT RELANCE AUTO'] as string),
            manualFollowUpStatus: this.normalizeFollowUp(f['STATUT RELANCE MANUELLE'] as string),
            followUpNote: (f['NOTE RELANCE'] as string) ?? '',
            tags,
            action: this.cleanAction(f['ACTIONS'] as string),
            airtableId: rec.id,
          },
        },
        { upsert: true, new: true },
      )
      result.coaching.upserted++
    }

    result.durationMs = Date.now() - start
    this.lastAirtableSync = new Date()
    this.logger.log(`Airtable sync done in ${result.durationMs}ms`)
    return result
  }

  // ── Circle bulk sync ──────────────────────────────────────────────────────
  // Stratégie optimisée : ~N/100 req au lieu de N req par email

  async syncCircle(): Promise<CircleSyncResult> {
    const start = Date.now()
    const callsBefore = this.circleService.totalCallsThisSession
    this.logger.log('Circle bulk sync started')

    // Build email → member map
    const circleMap = new Map<string, {
      id: number
      created_at: string
      accepted_invitation: string
      active: boolean
      member_tags: { id: number; name: string }[]
    }>()

    const totalCircle = await this.circleService.listAllMembers(async (batch) => {
      for (const m of batch) {
        if (m.email) circleMap.set(m.email.toLowerCase(), m)
      }
    })

    // Fetch all students and build bulkWrite ops
    const students = await this.studentModel.find({}).select('_id email').lean()
    const ops: Parameters<typeof this.studentModel.bulkWrite>[0] = []
    let matched = 0

    for (const student of students) {
      const cm: any = circleMap.get(student.email)
      if (!cm) continue
      matched++

      const acceptedRaw = cm.accepted_invitation?.trim() ?? ''
      const acceptedAt = acceptedRaw
        ? new Date(acceptedRaw.replace(' UTC', 'Z'))
        : null

      ops.push({
        updateOne: {
          filter: { _id: student._id },
          update: {
            $set: {
              circleId: cm.id,
              circleProfile: cm.profile_url,
              circleJoinedAt: new Date(cm.created_at),
              circleAcceptedAt: isNaN(acceptedAt?.getTime() ?? NaN) ? null : acceptedAt,
              circleTags: cm.member_tags ?? [],
              circleIsActive: cm.active,
              circleLastSync: new Date(),
            },
          },
        },
      })
    }

    if (ops.length > 0) await this.studentModel.bulkWrite(ops)

    const result: CircleSyncResult = {
      totalCircleMembers: totalCircle,
      studentsMatched: matched,
      studentsUpdated: ops.length,
      apiCallsUsed: this.circleService.totalCallsThisSession - callsBefore,
      durationMs: Date.now() - start,
    }

    this.lastCircleSync = new Date()
    this.logger.log(`Circle sync done: ${matched} matched, ${ops.length} updated, ${result.apiCallsUsed} API calls used`)
    return result
  }

  // ── Debt detection ────────────────────────────────────────────────────────

  async detectDebtors(): Promise<DebtorResult> {
    const start = Date.now()
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    let flagged = 0
    let cleared = 0

    // Students with Partiel TRAITÉ older than 30 days
    const partialGroups = await this.paymentModel.aggregate<{
      _id: string
      firstPartialDate: Date
    }>([
      { $match: { status: 'TRAITÉ', modality: 'Partiel', createdAt: { $lte: thirtyDaysAgo } } },
      { $group: { _id: '$studentEmail', firstPartialDate: { $min: '$createdAt' } } },
    ])

    for (const { _id: email, firstPartialDate } of partialGroups) {
      const hasFullPayment = await this.paymentModel.exists({
        studentEmail: email,
        modality: 'Complet',
        status: 'TRAITÉ',
      })

      const student = await this.studentModel.findOne({ email })
      if (!student) continue

      if (!hasFullPayment) {
        const wasOk = student.debtStatus === 'ok'
        await this.studentModel.updateOne(
          { email },
          { $set: { debtStatus: 'potential', debtSince: firstPartialDate } },
        )
        await this.formationModel.findOneAndUpdate(
          { studentId: student._id },
          { $set: { paymentStatus: 'EN RETARD' } },
        )
        if (wasOk) {
          flagged++
          this.automationsService?.triggerEvent?.('debt_detected', {
            student: { _id: String(student._id), email: student.email, name: student.name },
            debtSince: firstPartialDate.toISOString(),
          })
        }
      } else if (student.debtStatus !== 'ok') {
        await this.studentModel.updateOne(
          { email },
          { $set: { debtStatus: 'ok', debtSince: null } },
        )
        await this.formationModel.findOneAndUpdate(
          { studentId: student._id },
          { $set: { paymentStatus: 'EN RÈGLE' } },
        )
        cleared++
      }
    }

    const result: DebtorResult = { flagged, cleared, durationMs: Date.now() - start }
    this.lastDebtorDetection = new Date()
    this.logger.log(`Debt detection: ${flagged} flagged, ${cleared} cleared`)
    return result
  }

  // ── Success proofs ────────────────────────────────────────────────────────

  async addSuccessProof(
    studentId: string,
    proof: { url: string; type: 'image' | 'video' | 'link'; caption: string; addedBy: string },
  ) {
    return this.studentModel.findByIdAndUpdate(
      studentId,
      {
        $push: {
          successProofs: {
            url: proof.url,
            type: proof.type,
            caption: proof.caption,
            addedBy: new Types.ObjectId(proof.addedBy),
            createdAt: new Date(),
          },
        },
      },
      { new: true },
    )
  }

  async removeSuccessProof(studentId: string, proofId: string) {
    return this.studentModel.findByIdAndUpdate(
      studentId,
      { $pull: { successProofs: { _id: new Types.ObjectId(proofId) } } },
      { new: true },
    )
  }

  // ── Tally form seed ───────────────────────────────────────────────────────

  async seedTallyForm(userId: string): Promise<{ created: boolean; formId: string; slug: string }> {
    const slug = 'acces-ecom-africa-pro'
    const existing = await this.formModel.findOne({ slug }).select('_id').lean<{ _id: Types.ObjectId }>()
    if (existing) {
      return { created: false, formId: String(existing._id), slug }
    }

    const fields: FormField[] = [
      { id: 'f01', type: 'heading', label: 'Commençons par les présentations !', content: 'Commençons par les présentations !', required: false, order: 0 },
      { id: 'f02', type: 'short_text', label: 'Nom et Prénoms', required: true, order: 1, placeholder: 'Votre nom complet' },
      { id: 'f03', type: 'date', label: 'Quelle est votre date de naissance ?', required: true, order: 2 },
      { id: 'f04', type: 'email', label: "Votre adresse e-mail d'accès à la formation !", required: true, order: 3, placeholder: 'exemple@email.com' },
      { id: 'f05', type: 'phone', label: 'Votre numéro de téléphone WhatsApp Principal !', required: true, order: 4, placeholder: '+XXX XXXXXXXXX' },
      { id: 'f06', type: 'radio', label: 'Sur quelle plateforme avez-vous découvert Myril pour la première fois ?', required: true, order: 5, options: ['YouTube', 'Facebook', 'Instagram', 'TikTok', 'LinkedIn', 'Recommandations'] },
      { id: 'f07', type: 'short_text', label: 'Que faites-vous dans la vie ?', required: true, order: 6, placeholder: 'Votre profession ou activité' },
      { id: 'f08', type: 'radio', label: 'Quelle formation avez-vous achetée ?', required: true, order: 7, options: ['ECOM AFRICA PRO', 'ECOM REVOLUTION'] },
      { id: 'f09', type: 'radio', label: 'Par quel moyen avez-vous payé ?', required: true, order: 8, options: ['Fedapay', 'Carte Bancaire', 'Autres (Paiement Cash, Western Union, MoneyGram, etc.)'] },
      { id: 'f10', type: 'number', label: 'Quel montant avez-vous payé ?', required: true, order: 9, placeholder: '0' },
      { id: 'f11', type: 'radio', label: 'Dans quelle devise ?', required: true, order: 10, options: ['F CFA', 'EURO', 'USD'] },
      { id: 'f12', type: 'file', label: 'Soumettez toutes les preuves de paiement (Reçu de paiement / Western union / Capture Mobile Money)', required: true, order: 11, accept: 'image/*,application/pdf', maxFiles: 4 },
      { id: 'f13', type: 'radio', label: "Modalités de paiement : Qu'est-ce qui définit le mieux votre situation ?", required: true, order: 12, options: ["J'ai payé en une fois", "J'ai Payé en 2 tranches et j'ai soldé", "J'ai Payé en 4 tranches, et j'ai soldé", "J'ai Payé en 2 tranches, mais je n'ai pas encore soldé", "J'ai Payé en 4 tranches, mais je n'ai pas encore soldé", "J'ai payé une caution pour réserver ma place"] },
    ]

    const form = await this.formModel.create({
      title: 'Accès Ecom Africa Pro',
      description: "Formulaire d'inscription pour accéder à la formation (importé depuis Tally woB5oM)",
      slug,
      fields,
      settings: {
        submitMessage: "Vos informations ont été bien reçues et vous recevrez vos accès sous un délai de 72 h maximum !!",
        allowMultipleSubmissions: false,
      },
      isPublished: false,
      createdBy: new Types.ObjectId(userId),
    })

    this.logger.log(`Tally form seeded: ${form._id}`)
    return { created: true, formId: String(form._id), slug }
  }

  // ── Import réponses Tally ─────────────────────────────────────────────────────

  async syncTallyResponses(): Promise<TallyImportResult> {
    const start = Date.now()
    const apiKey = process.env.TALLY_API_KEY
    if (!apiKey) throw new Error('TALLY_API_KEY non configurée')

    const localForm = await this.formModel
      .findOne({ slug: 'acces-ecom-africa-pro' })
      .select('_id')
      .lean<{ _id: Types.ObjectId }>()
    if (!localForm) {
      throw new Error('Formulaire local introuvable — lancez d\'abord "Importer formulaire Tally"')
    }

    let imported = 0
    let skipped = 0
    let errors = 0
    let page = 1
    let hasMore = true

    while (hasMore) {
      const { data } = await axios.get<{
        hasMore: boolean
        submissions: Array<{
          id: string
          submittedAt: string
          isCompleted: boolean
          responses: Array<{
            questionId: string
            answer: unknown
          }>
        }>
      }>(
        `https://api.tally.so/forms/${this.TALLY_FORM_ID}/submissions`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          params: { page, limit: 200 },
        },
      )

      hasMore = data.hasMore

      for (const submission of data.submissions) {
        try {
          const exists = await this.responseModel.exists({
            formId: localForm._id,
            'metadata.tallySubmissionId': submission.id,
          })
          if (exists) { skipped++; continue }

          // Accumulateur pour toutes les preuves (plusieurs champs file → f12)
          const proofFiles: Array<{ id: string; name: string; url: string; mimeType?: string }> = []
          const answerMap = new Map<string, unknown>()

          for (const resp of submission.responses) {
            const localId = this.TALLY_TO_FIELD[resp.questionId]
            if (!localId) continue

            // Calculated field o98vA1 {"Modalité":"Complet"} — ignoré, EqV9ol (f13) est plus lisible
            if (resp.questionId === 'o98vA1') continue

            // Champs file : on agrège toutes les preuves dans f12
            if (localId === 'f12') {
              if (Array.isArray(resp.answer)) {
                for (const f of resp.answer as Array<{ id: string; name: string; url: string; mimeType?: string }>) {
                  if (f?.url) proofFiles.push(f)
                }
              }
              continue
            }

            // Multiple choice : l'API Tally renvoie déjà les libellés (pas des option IDs)
            // ["YouTube"] → "YouTube" pour les single-choice
            let value: unknown = resp.answer
            if (Array.isArray(resp.answer) && resp.answer.length === 1) value = resp.answer[0]

            answerMap.set(localId, value)
          }

          const answers: { fieldId: string; value: unknown }[] = [...answerMap].map(([fieldId, value]) => ({ fieldId, value }))
          if (proofFiles.length > 0) answers.push({ fieldId: 'f12', value: proofFiles })

          await this.responseModel.create({
            formId: localForm._id,
            answers,
            metadata: {
              tallySubmissionId: submission.id,
              submittedAt: submission.submittedAt,
            },
          })

          // ── Créer / enrichir un Payment depuis les données Tally ──────────
          const tallyEmail = ((answerMap.get('f04') as string) ?? '').toLowerCase().trim()
          if (tallyEmail) {
            const paymentExists = await this.paymentModel.exists({ tallySubmissionId: submission.id })
            if (!paymentExists) {
              const tallyName = (answerMap.get('f02') as string | undefined) ?? tallyEmail
              const amountRaw = answerMap.get('f10')
              const amount = typeof amountRaw === 'number' ? amountRaw
                : parseFloat(String(amountRaw ?? '0').replace(/\s/g, '').replace(',', '.')) || 0
              const currencyRaw = ((answerMap.get('f11') as string) ?? '').trim()
              const productRaw = ((answerMap.get('f08') as string) ?? '').trim()
              const gatewayRaw = ((answerMap.get('f09') as string) ?? '').trim()
              const modalityRaw = ((answerMap.get('f13') as string) ?? '').toLowerCase()

              const currency = (['EURO', 'USD'].includes(currencyRaw) ? currencyRaw : 'F CFA') as 'F CFA' | 'EURO' | 'USD'
              const product = productRaw.toUpperCase().includes('REVOLUTION') ? 'ECOM REVOLUTION' as const : 'ECOM AFRICA PRO' as const
              const modality: 'Complet' | 'Partiel' = (modalityRaw.includes('pas encore') || modalityRaw.includes('caution')) ? 'Partiel' : 'Complet'
              const proofImageUrls = proofFiles.map((f) => f.url).filter(Boolean)

              const student = await this.studentModel.findOne({ email: tallyEmail }).select('_id').lean<{ _id: Types.ObjectId }>()

              // Enrichir un paiement Airtable existant sans preuves plutôt que créer un doublon
              const existingNoProof = await this.paymentModel.findOne({
                studentEmail: tallyEmail,
                tallySubmissionId: null,
                proofImages: { $size: 0 },
              }).sort({ createdAt: -1 }).lean()

              if (existingNoProof) {
                await this.paymentModel.updateOne(
                  { _id: existingNoProof._id },
                  { $set: { proofImages: proofImageUrls, tallySubmissionId: submission.id, gateway: gatewayRaw || existingNoProof.gateway } },
                )
              } else {
                await this.paymentModel.create({
                  studentId: student?._id ?? null,
                  studentEmail: tallyEmail,
                  studentName: tallyName,
                  status: 'NON TRAITÉ' as const,
                  modality,
                  amount,
                  currency,
                  product,
                  gateway: gatewayRaw || null,
                  proofImages: proofImageUrls,
                  source: 'tally' as const,
                  tallySubmissionId: submission.id,
                  notes: answerMap.get('f13') ? `Déclaré : ${answerMap.get('f13')}` : '',
                })
              }
            }
          }

          imported++
        } catch (err: unknown) {
          this.logger.error(`Tally import (${submission.id}): ${(err as Error).message}`)
          errors++
        }
      }

      page++
    }

    this.lastTallySync = new Date()
    this.logger.log(`Tally responses: ${imported} importées, ${skipped} ignorées, ${errors} erreurs`)
    return { imported, skipped, errors, durationMs: Date.now() - start }
  }

  // ── Backfill proofImages depuis les FormResponse Tally ───────────────────

  async backfillProofImages(): Promise<{ updated: number; skipped: number; noPayment: number }> {
    const start = Date.now()
    let updated = 0
    let skipped = 0
    let noPayment = 0

    type RespDoc = {
      _id: Types.ObjectId
      answers: Array<{ fieldId: string; value: unknown }>
      metadata: Record<string, unknown>
    }

    // Toutes les réponses Tally avec f12, triées par date de soumission ASC
    // (on traite dans l'ordre chronologique pour que 1ère soumission → 1er paiement)
    const responses = await this.responseModel
      .find({ 'answers.fieldId': 'f12' })
      .sort({ 'metadata.submittedAt': 1 })
      .lean<RespDoc[]>()

    this.logger.log(`Backfill proofImages: ${responses.length} réponse(s) Tally avec f12`)

    for (const resp of responses) {
      // Extraire toutes les URLs des fichiers f12 (plusieurs champs possibles)
      const urls: string[] = []
      for (const ans of resp.answers.filter((a) => a.fieldId === 'f12')) {
        const files = Array.isArray(ans.value) ? ans.value : [ans.value]
        for (const f of files as Array<{ url?: string }>) {
          if (f?.url) urls.push(f.url)
        }
      }
      if (urls.length === 0) { skipped++; continue }

      const tallySubmissionId = resp.metadata?.tallySubmissionId as string | undefined
      const email = (resp.answers.find((a) => a.fieldId === 'f04')?.value as string | undefined)
        ?.toLowerCase()
        .trim()

      if (!email) { skipped++; continue }

      // 1. Chercher par tallySubmissionId exact (déjà lié lors d'un run précédent)
      // 2. Sinon : tous les payments de cet email sans proofImages,
      //    puis on prend celui dont createdAt est le plus proche de submittedAt
      let payment = tallySubmissionId
        ? await this.paymentModel.findOne({ tallySubmissionId })
        : null

      if (!payment) {
        const submittedAt = resp.metadata?.submittedAt
          ? new Date(resp.metadata.submittedAt as string)
          : null

        const candidates = await this.paymentModel
          .find({
            studentEmail: email,
            $or: [{ proofImages: { $exists: false } }, { proofImages: { $size: 0 } }],
          })
          .lean()

        if (candidates.length === 1) {
          payment = await this.paymentModel.findById(candidates[0]._id)
        } else if (candidates.length > 1 && submittedAt) {
          // Choisir le payment dont createdAt est le plus proche de la date de soumission
          const getTs = (doc: unknown) =>
            ((doc as { createdAt?: Date }).createdAt)?.getTime() ?? 0
          const closest = candidates.reduce((best, cur) =>
            Math.abs(getTs(cur) - submittedAt.getTime()) < Math.abs(getTs(best) - submittedAt.getTime()) ? cur : best
          )
          payment = await this.paymentModel.findById(closest._id)
        } else if (candidates.length > 1) {
          // Pas de date de soumission : prendre le plus ancien
          payment = await this.paymentModel.findById(candidates[0]._id)
        }
      }

      if (!payment) { noPayment++; continue }
      if (payment.proofImages?.length > 0) { skipped++; continue }

      payment.proofImages = urls
      if (tallySubmissionId && !payment.tallySubmissionId) {
        payment.tallySubmissionId = tallySubmissionId
      }
      await payment.save()
      updated++
    }

    this.logger.log(`Backfill terminé en ${Date.now() - start}ms — ${updated} mis à jour, ${skipped} ignorés, ${noPayment} sans payment`)
    return { updated, skipped, noPayment }
  }

  // ── Status ────────────────────────────────────────────────────────────────

  getStatus(): SyncStatus {
    return {
      lastAirtableSync: this.lastAirtableSync,
      lastCircleSync: this.lastCircleSync,
      lastDebtorDetection: this.lastDebtorDetection,
      lastTallySync: this.lastTallySync,
      circleApiCallsThisSession: this.circleService.totalCallsThisSession,
    }
  }

  // ── Normalisation Airtable → Mongoose ────────────────────────────────────

  private normalizePaymentStatus(s?: string): 'NON TRAITÉ' | 'TRAITÉ' | 'REJETÉ' {
    if (s === 'TRAITÉ' || s === 'REJETÉ') return s
    return 'NON TRAITÉ'
  }

  private normalizeCurrency(s?: string): 'F CFA' | 'FCFA' | 'USD' | 'EURO' {
    if (s === 'FCFA') return 'FCFA'
    if (s === 'USD') return 'USD'
    if (s === 'EURO') return 'EURO'
    return 'F CFA'
  }

  private normalizeProduct(s?: string): 'ECOM AFRICA PRO' | 'COACHING' | 'ECOM REVOLUTION' {
    if (s === 'COACHING') return 'COACHING'
    if (s === 'ECOM REVOLUTION') return 'ECOM REVOLUTION'
    return 'ECOM AFRICA PRO'
  }

  private normalizePlan(s?: string): 'Elite' | 'Premium' | 'Standard' | null {
    if (s === 'Elite' || s === 'Premium' || s === 'Standard') return s
    return null
  }

  private normalizeFollowUp(s?: string): 'EN RÈGLE' | 'RELANCE 1' | 'RELANCE 2' | 'RELANCE 3' {
    if (s === 'RELANCE 1' || s === 'RELANCE 2' || s === 'RELANCE 3') return s
    return 'EN RÈGLE'
  }

  private cleanAction(s?: string): string {
    if (!s) return '🤖 INTÉGRÉ'
    return s
  }
}
