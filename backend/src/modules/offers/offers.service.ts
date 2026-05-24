import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Cron } from '@nestjs/schedule'
import { Model, Types } from 'mongoose'
import { Offer, OfferDocument, OfferPlan } from './schemas/offer.schema'
import { Subscription, SubscriptionDocument } from './schemas/subscription.schema'
import { Student, StudentDocument } from '../students/schemas/student.schema'
import { Payment, PaymentDocument } from '../students/schemas/payment.schema'
import { AutomationsService } from '../automations/automations.service'

@Injectable()
export class OffersService {
  private readonly logger = new Logger(OffersService.name)

  constructor(
    @InjectModel(Offer.name)        private offerModel: Model<OfferDocument>,
    @InjectModel(Subscription.name) private subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(Student.name)      private studentModel: Model<StudentDocument>,
    @InjectModel(Payment.name)      private paymentModel: Model<PaymentDocument>,
    private automationsService: AutomationsService,
  ) {}

  // ── CRUD Offres ──────────────────────────────────────────────────

  async listOffers(activeOnly = false) {
    const query = activeOnly ? { isActive: true } : {}
    return this.offerModel.find(query).sort({ name: 1 }).lean()
  }

  async createOffer(data: { name: string; description?: string }) {
    return this.offerModel.create({
      name: data.name,
      plans: [],
      isActive: true,
      description: data.description ?? '',
    })
  }

  async updateOffer(id: string, data: Partial<{ description: string; isActive: boolean }>) {
    const offer = await this.offerModel.findByIdAndUpdate(id, { $set: data }, { new: true })
    if (!offer) throw new NotFoundException('Offre introuvable')
    return offer
  }

  async deleteOffer(id: string) {
    const linked = await this.subscriptionModel.countDocuments({ offerId: new Types.ObjectId(id) })
    if (linked > 0) {
      throw new BadRequestException(`Impossible de supprimer : ${linked} souscription(s) liée(s) à cette offre`)
    }
    const offer = await this.offerModel.findByIdAndDelete(id)
    if (!offer) throw new NotFoundException('Offre introuvable')
    return { deleted: true }
  }

  // ── Plans ────────────────────────────────────────────────────────

  async addPlan(offerId: string, plan: {
    name: string
    durationMonths: number
    price?: number
    currency?: string
    partialDueAfterDays?: number
  }) {
    const offer = await this.offerModel.findById(offerId)
    if (!offer) throw new NotFoundException('Offre introuvable')

    offer.plans.push({
      name: plan.name,
      durationMonths: plan.durationMonths,
      price: plan.price ?? 0,
      currency: (plan.currency ?? 'F CFA') as 'F CFA' | 'USD' | 'EURO',
      partialDueAfterDays: plan.partialDueAfterDays ?? 30,
      isActive: true,
    } as typeof offer.plans[0])

    return offer.save()
  }

  async updatePlan(offerId: string, planId: string, data: Partial<{
    name: string
    durationMonths: number
    price: number
    currency: string
    partialDueAfterDays: number
    isActive: boolean
  }>) {
    const offer = await this.offerModel.findById(offerId)
    if (!offer) throw new NotFoundException('Offre introuvable')

    const plan = (offer.plans as unknown as Array<{ _id: { toString: () => string } } & typeof offer.plans[0]>)
      .find((p) => p._id.toString() === planId)
    if (!plan) throw new NotFoundException('Plan introuvable')

    Object.assign(plan, data)
    return offer.save()
  }

  async removePlan(offerId: string, planId: string) {
    const offer = await this.offerModel.findById(offerId)
    if (!offer) throw new NotFoundException('Offre introuvable')

    const before = offer.plans.length
    offer.plans = (offer.plans as unknown as Array<{ _id: { toString: () => string } } & typeof offer.plans[0]>)
      .filter((p) => p._id.toString() !== planId) as typeof offer.plans
    if (offer.plans.length === before) throw new NotFoundException('Plan introuvable')

    return offer.save()
  }

  // ── Backfill ─────────────────────────────────────────────────────

  private matchPlan(plans: OfferPlan[], paymentPlan: string | null): OfferPlan | undefined {
    const active = plans.filter((p) => p.isActive)
    if (!paymentPlan) return active[0]
    const norm = paymentPlan.toLowerCase().trim()
    return (
      active.find((p) => p.name.toLowerCase() === norm) ??
      active.find((p) => p.name.toLowerCase().includes(norm) || norm.includes(p.name.toLowerCase().split(' ')[0])) ??
      active[1]
    )
  }

  async backfillPreview() {
    type LeanPayment = { _id: Types.ObjectId; product: string; plan: string | null; paidAt: Date | null; modality: string; amount: number; currency: string; studentId: Types.ObjectId; studentEmail: string }
    const payments = await this.paymentModel
      .find({ status: 'TRAITÉ', product: { $exists: true, $ne: null } })
      .lean<LeanPayment[]>()
    const offers = await this.offerModel.find().lean()

    let willCreate = 0; let alreadyHaveSubscription = 0; let noOfferMatch = 0
    const breakdown = new Map<string, { offerName: string; planName: string; durationMonths: number; count: number }>()

    for (const payment of payments) {
      const existingSub = await this.subscriptionModel.findOne({ paymentId: payment._id as unknown as Types.ObjectId })
      if (existingSub) { alreadyHaveSubscription++; continue }
      const offer = offers.find((o) => o.name.toLowerCase() === payment.product.toLowerCase())
      if (!offer) { noOfferMatch++; continue }
      const plan = this.matchPlan(offer.plans as OfferPlan[], payment.plan)
      if (!plan) { noOfferMatch++; continue }
      willCreate++
      const key = `${offer.name}::${plan.name}`
      if (!breakdown.has(key)) breakdown.set(key, { offerName: offer.name, planName: plan.name, durationMonths: plan.durationMonths, count: 0 })
      breakdown.get(key)!.count++
    }

    return { total: payments.length, willCreate, alreadyHaveSubscription, noOfferMatch, breakdown: [...breakdown.values()] }
  }

  async backfillRun() {
    type LeanPayment = { _id: Types.ObjectId; product: string; plan: string | null; paidAt: Date | null; modality: string; amount: number; currency: string; studentId: Types.ObjectId; studentEmail: string }
    const payments = await this.paymentModel
      .find({ status: 'TRAITÉ', product: { $exists: true, $ne: null } })
      .lean<LeanPayment[]>()
    const offers = await this.offerModel.find().lean()

    let created = 0; let skipped = 0; let errors = 0

    for (const payment of payments) {
      try {
        const existingSub = await this.subscriptionModel.findOne({ paymentId: payment._id as unknown as Types.ObjectId })
        if (existingSub) { skipped++; continue }
        const offer = offers.find((o) => o.name.toLowerCase() === payment.product.toLowerCase())
        if (!offer) { skipped++; continue }
        const plan = this.matchPlan(offer.plans as OfferPlan[], payment.plan)
        if (!plan) { skipped++; continue }

        const startDate = payment.paidAt ? new Date(payment.paidAt) : new Date()
        const endDate = new Date(startDate)
        endDate.setMonth(endDate.getMonth() + plan.durationMonths)
        const modality = (payment.modality as string) || 'Complet'
        const nextPaymentDate = modality === 'Partiel'
          ? new Date(startDate.getTime() + plan.partialDueAfterDays * 24 * 60 * 60 * 1000)
          : null

        await this.subscriptionModel.create({
          studentId: payment.studentId as unknown as Types.ObjectId,
          studentEmail: payment.studentEmail,
          offerId: offer._id,
          paymentId: payment._id as unknown as Types.ObjectId,
          offerName: `${offer.name} — ${plan.name}`,
          offerProduct: offer.name,
          offerPlan: plan.name,
          durationMonths: plan.durationMonths,
          startDate,
          endDate,
          status: endDate < new Date() ? 'expired' : 'active',
          modality,
          paidAmount: payment.amount ?? 0,
          totalAmount: plan.price || payment.amount || 0,
          currency: payment.currency ?? plan.currency ?? 'F CFA',
          nextPaymentDate,
          remindersSent: 0,
        })

        // Set student plan for ECOM AFRICA PRO subscriptions
        if (offer.name.toUpperCase() === 'ECOM AFRICA PRO' && payment.studentId) {
          await this.studentModel.updateOne(
            { _id: payment.studentId as unknown as Types.ObjectId },
            { $set: { plan: plan.name } },
          )
        }

        created++
      } catch {
        errors++
      }
    }

    this.logger.log(`Backfill: ${created} créées, ${skipped} ignorées, ${errors} erreurs`)
    return { created, skipped, errors }
  }

  // ── Souscriptions ────────────────────────────────────────────────

  async listSubscriptions(filters: {
    studentEmail?: string
    status?: string
    page?: number
    limit?: number
  }) {
    const { studentEmail, status, page = 1, limit = 50 } = filters
    const query: Record<string, unknown> = {}
    if (studentEmail) query.studentEmail = studentEmail.toLowerCase()
    if (status)       query.status = status

    const [data, total] = await Promise.all([
      this.subscriptionModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.subscriptionModel.countDocuments(query),
    ])
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async getStudentSubscriptions(studentEmail: string) {
    return this.subscriptionModel
      .find({ studentEmail: studentEmail.toLowerCase() })
      .sort({ createdAt: -1 })
      .lean()
  }

  // ── Cron : expiration ────────────────────────────────────────────

  @Cron('0 7 * * *')
  async checkExpiringSubscriptions() {
    const now = new Date()
    const thresholds = [7, 3, 1]

    for (const days of thresholds) {
      const target = new Date(now)
      target.setDate(target.getDate() + days)
      const from = new Date(target); from.setHours(0, 0, 0, 0)
      const to   = new Date(target); to.setHours(23, 59, 59, 999)

      const expiring = await this.subscriptionModel
        .find({ status: 'active', endDate: { $gte: from, $lte: to } })
        .lean()

      for (const sub of expiring) {
        const student = await this.studentModel
          .findById(sub.studentId)
          .select('email name whatsapp')
          .lean<{ email: string; name: string; whatsapp: string | null }>()

        if (!student) continue

        this.automationsService.triggerEvent('subscription_expiring', {
          daysUntilExpiry: days,
          student: { _id: String(sub.studentId), email: student.email, name: student.name, whatsapp: student.whatsapp },
          subscription: {
            _id: String(sub._id),
            offerName: sub.offerName,
            offerProduct: sub.offerProduct,
            offerPlan: sub.offerPlan,
            durationMonths: sub.durationMonths,
            endDate: sub.endDate.toISOString(),
            modality: sub.modality,
            paidAmount: sub.paidAmount,
            totalAmount: sub.totalAmount,
            currency: sub.currency,
          },
        })
      }
    }

    await this.subscriptionModel.updateMany(
      { status: 'active', endDate: { $lt: now } },
      { $set: { status: 'expired' } },
    )
  }

  // ── Cron : rappels partiels ──────────────────────────────────────

  @Cron('0 8 * * *')
  async checkPartialPaymentsDue() {
    const now = new Date()
    const today = new Date(now); today.setHours(0, 0, 0, 0)
    const eod   = new Date(now); eod.setHours(23, 59, 59, 999)

    const due = await this.subscriptionModel
      .find({
        status: 'active',
        modality: 'Partiel',
        nextPaymentDate: { $lte: eod },
        $expr: { $lt: ['$paidAmount', '$totalAmount'] },
      })
      .lean()

    for (const sub of due) {
      const student = await this.studentModel
        .findById(sub.studentId)
        .select('email name whatsapp')
        .lean<{ email: string; name: string; whatsapp: string | null }>()

      if (!student) continue

      const remainingAmount = sub.totalAmount - sub.paidAmount
      const dueDate = sub.nextPaymentDate!
      const daysSinceDue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))

      this.automationsService.triggerEvent('partial_payment_due', {
        remainingAmount,
        daysSinceDue,
        student: { _id: String(sub.studentId), email: student.email, name: student.name, whatsapp: student.whatsapp },
        subscription: {
          _id: String(sub._id),
          offerName: sub.offerName,
          offerProduct: sub.offerProduct,
          offerPlan: sub.offerPlan,
          modality: sub.modality,
          paidAmount: sub.paidAmount,
          totalAmount: sub.totalAmount,
          remainingAmount,
          currency: sub.currency,
          nextPaymentDate: dueDate.toISOString(),
        },
      })

      await this.subscriptionModel.findByIdAndUpdate(sub._id, {
        $inc: { remindersSent: 1 },
        $set: { lastReminderAt: now },
      })
    }
  }
}
