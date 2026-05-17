import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Category, CategoryDocument } from './schemas/category.schema'
import { Transaction, TransactionDocument } from './schemas/transaction.schema'

@Injectable()
export class FinancesService {
  constructor(
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
  ) {}

  // ── Categories ─────────────────────────────────────────────────────────────

  async listCategories(type?: string) {
    const query = type ? { type: { $in: [type, 'both'] } } : {}
    return this.categoryModel.find(query).sort({ name: 1 }).lean()
  }

  async createCategory(data: { name: string; type?: string; color?: string; icon?: string }) {
    return this.categoryModel.create({
      name: data.name,
      type: data.type ?? 'both',
      color: data.color ?? '#6366f1',
      icon: data.icon ?? '💰',
    })
  }

  async updateCategory(id: string, data: Partial<{ name: string; type: string; color: string; icon: string }>) {
    const cat = await this.categoryModel.findById(id)
    if (!cat) throw new NotFoundException('Catégorie introuvable')
    Object.assign(cat, data)
    return cat.save()
  }

  async deleteCategory(id: string) {
    await this.categoryModel.findByIdAndDelete(id)
    return { deleted: true }
  }

  // ── Transactions ───────────────────────────────────────────────────────────

  async listTransactions(filters: {
    type?: string
    categoryId?: string
    gateway?: string
    status?: string
    search?: string
    dateFrom?: string
    dateTo?: string
    currency?: string
    page?: number
    limit?: number
  }) {
    const { page = 1, limit = 25 } = filters
    const query: Record<string, unknown> = {}

    if (filters.type) query.type = filters.type
    if (filters.categoryId) query.categoryId = new Types.ObjectId(filters.categoryId)
    if (filters.gateway) query.gateway = filters.gateway
    if (filters.status) query.status = filters.status
    if (filters.currency) query.currency = filters.currency
    if (filters.search) {
      query.$or = [
        { description: { $regex: filters.search, $options: 'i' } },
        { reference: { $regex: filters.search, $options: 'i' } },
        { notes: { $regex: filters.search, $options: 'i' } },
      ]
    }
    if (filters.dateFrom || filters.dateTo) {
      const dateQuery: Record<string, Date> = {}
      if (filters.dateFrom) dateQuery.$gte = new Date(filters.dateFrom)
      if (filters.dateTo) dateQuery.$lte = new Date(filters.dateTo)
      query.date = dateQuery
    }

    const [data, total] = await Promise.all([
      this.transactionModel
        .find(query)
        .populate('categoryId', 'name color icon')
        .populate('createdBy', 'firstName lastName email')
        .sort({ date: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.transactionModel.countDocuments(query),
    ])

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async getTransaction(id: string) {
    const tx = await this.transactionModel
      .findById(id)
      .populate('categoryId', 'name color icon')
      .populate('createdBy', 'firstName lastName email')
      .lean()
    if (!tx) throw new NotFoundException('Transaction introuvable')
    return tx
  }

  async createTransaction(data: {
    type: string
    amount: number
    currency?: string
    description: string
    categoryId?: string | null
    date: string
    gateway?: string
    status?: string
    reference?: string
    notes?: string
    createdById: string
  }) {
    return this.transactionModel.create({
      type: data.type,
      amount: data.amount,
      currency: data.currency ?? 'EUR',
      description: data.description,
      categoryId: data.categoryId ? new Types.ObjectId(data.categoryId) : null,
      date: new Date(data.date),
      gateway: data.gateway ?? 'manual',
      status: data.status ?? 'completed',
      reference: data.reference ?? null,
      notes: data.notes ?? '',
      createdBy: new Types.ObjectId(data.createdById),
    })
  }

  async updateTransaction(
    id: string,
    data: Partial<{
      type: string
      amount: number
      currency: string
      description: string
      categoryId: string | null
      date: string
      gateway: string
      status: string
      reference: string
      notes: string
    }>,
  ) {
    const tx = await this.transactionModel.findById(id)
    if (!tx) throw new NotFoundException('Transaction introuvable')

    if (data.type !== undefined) tx.type = data.type
    if (data.amount !== undefined) tx.amount = data.amount
    if (data.currency !== undefined) tx.currency = data.currency
    if (data.description !== undefined) tx.description = data.description
    if (data.categoryId !== undefined) {
      tx.categoryId = data.categoryId ? new Types.ObjectId(data.categoryId) : null
    }
    if (data.date !== undefined) tx.date = new Date(data.date)
    if (data.gateway !== undefined) tx.gateway = data.gateway
    if (data.status !== undefined) tx.status = data.status
    if (data.reference !== undefined) tx.reference = data.reference ?? null
    if (data.notes !== undefined) tx.notes = data.notes

    return tx.save()
  }

  async deleteTransaction(id: string) {
    const tx = await this.transactionModel.findById(id)
    if (!tx) throw new NotFoundException('Transaction introuvable')
    await this.transactionModel.deleteOne({ _id: id })
    return { deleted: true }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  async getStats(currency = 'EUR') {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfYear = new Date(now.getFullYear(), 0, 1)
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1)

    const [monthStats, yearStats, byCategoryRaw, byMonthRaw, byGatewayRaw] = await Promise.all([
      // Current month income + expense
      this.transactionModel.aggregate([
        { $match: { date: { $gte: startOfMonth }, status: 'completed', currency } },
        { $group: { _id: '$type', total: { $sum: '$amount' } } },
      ]),
      // Current year income + expense
      this.transactionModel.aggregate([
        { $match: { date: { $gte: startOfYear }, status: 'completed', currency } },
        { $group: { _id: '$type', total: { $sum: '$amount' } } },
      ]),
      // By category
      this.transactionModel.aggregate([
        { $match: { status: 'completed', currency, categoryId: { $ne: null } } },
        { $group: { _id: { categoryId: '$categoryId', type: '$type' }, total: { $sum: '$amount' } } },
        { $lookup: { from: 'categories', localField: '_id.categoryId', foreignField: '_id', as: 'category' } },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      ]),
      // By month (last 12 months)
      this.transactionModel.aggregate([
        { $match: { date: { $gte: twelveMonthsAgo }, status: 'completed', currency } },
        {
          $group: {
            _id: { year: { $year: '$date' }, month: { $month: '$date' }, type: '$type' },
            total: { $sum: '$amount' },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      // By gateway
      this.transactionModel.aggregate([
        { $match: { status: 'completed', currency } },
        { $group: { _id: { gateway: '$gateway', type: '$type' }, total: { $sum: '$amount' } } },
      ]),
    ])

    // Build month stats
    const monthIncome = monthStats.find((r) => r._id === 'income')?.total ?? 0
    const monthExpense = monthStats.find((r) => r._id === 'expense')?.total ?? 0
    const yearIncome = yearStats.find((r) => r._id === 'income')?.total ?? 0
    const yearExpense = yearStats.find((r) => r._id === 'expense')?.total ?? 0

    // Build monthly series (last 12 months)
    const months: Array<{ label: string; income: number; expense: number }> = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const y = d.getFullYear()
      const m = d.getMonth() + 1
      const income = byMonthRaw.find((r) => r._id.year === y && r._id.month === m && r._id.type === 'income')?.total ?? 0
      const expense = byMonthRaw.find((r) => r._id.year === y && r._id.month === m && r._id.type === 'expense')?.total ?? 0
      months.push({
        label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
        income,
        expense,
      })
    }

    // By category grouped
    const categoryMap: Record<string, { name: string; color: string; icon: string; income: number; expense: number }> = {}
    for (const r of byCategoryRaw) {
      const catId = r._id.categoryId?.toString() ?? 'unknown'
      if (!categoryMap[catId]) {
        categoryMap[catId] = {
          name: r.category?.name ?? 'Sans catégorie',
          color: r.category?.color ?? '#6b7280',
          icon: r.category?.icon ?? '💰',
          income: 0,
          expense: 0,
        }
      }
      categoryMap[catId][r._id.type as 'income' | 'expense'] += r.total
    }

    // By gateway
    const gatewayMap: Record<string, { income: number; expense: number }> = {}
    for (const r of byGatewayRaw) {
      const gw = r._id.gateway
      if (!gatewayMap[gw]) gatewayMap[gw] = { income: 0, expense: 0 }
      gatewayMap[gw][r._id.type as 'income' | 'expense'] += r.total
    }

    return {
      currency,
      month: { income: monthIncome, expense: monthExpense, net: monthIncome - monthExpense },
      year: { income: yearIncome, expense: yearExpense, net: yearIncome - yearExpense },
      byMonth: months,
      byCategory: Object.values(categoryMap),
      byGateway: Object.entries(gatewayMap).map(([gateway, v]) => ({ gateway, ...v })),
    }
  }

  // ── Gateway sync stubs ─────────────────────────────────────────────────────
  // These import recent transactions from external payment gateways.
  // Requires API keys configured in .env.

  async syncStripe(createdById: string): Promise<{ imported: number }> {
    // TODO: implement with stripe SDK
    // const Stripe = require('stripe')
    // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    // const charges = await stripe.charges.list({ limit: 100, created: { gte: lastSyncTimestamp } })
    return { imported: 0 }
  }

  async syncPawaPay(createdById: string): Promise<{ imported: number }> {
    // TODO: implement with PawaPay REST API
    // POST https://api.pawapay.io/payouts (requires PAWAPAY_API_KEY)
    return { imported: 0 }
  }

  async syncFedaPay(createdById: string): Promise<{ imported: number }> {
    // TODO: implement with FedaPay API
    // GET https://api.fedapay.com/v1/transactions (requires FEDAPAY_SECRET_KEY)
    return { imported: 0 }
  }

  /**
   * Record a transaction originating from a payment gateway webhook.
   * Used by WebhooksController for Stripe, PawaPay, FedaPay, Chariow.
   * Skips duplicate references to handle webhook retries idempotently.
   */
  async recordGatewayTransaction(data: {
    gateway: string
    type: 'income' | 'expense'
    amount: number
    currency: string
    description: string
    reference: string | null
    date: Date
    status?: 'completed' | 'failed' | 'pending' | 'refunded' | string
    metadata?: Record<string, unknown>
  }) {
    // Idempotency: skip if we already recorded this reference for this gateway
    if (data.reference) {
      const existing = await this.transactionModel.findOne({
        gateway: data.gateway,
        reference: data.reference,
      })
      if (existing) {
        return existing
      }
    }

    return this.transactionModel.create({
      type: data.type,
      amount: data.amount,
      currency: data.currency,
      description: data.description,
      gateway: data.gateway,
      status: data.status ?? 'completed',
      reference: data.reference ?? null,
      date: data.date,
      notes: data.metadata ? JSON.stringify(data.metadata) : '',
      // System-generated: no real user — use a sentinel ObjectId
      createdBy: new Types.ObjectId('000000000000000000000001'),
    })
  }
}
