import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import axios from 'axios'
import * as XLSX from 'xlsx'
import { Category, CategoryDocument } from './schemas/category.schema'
import { Transaction, TransactionDocument } from './schemas/transaction.schema'
import { ProductMapping, ProductMappingDocument } from './schemas/product-mapping.schema'
import { Offer, OfferDocument } from '../offers/schemas/offer.schema'
import { Student, StudentDocument } from '../students/schemas/student.schema'
import { Lead, LeadDocument } from '../leads/schemas/lead.schema'

// ── Inline types for external API responses ────────────────────────────────────

interface ChariowSale {
  id: string
  status: string
  amount: { value: number; currency: string }
  completed_at: string | null
  created_at: string
  product: { id: string; name: string }
  customer: { id: string; name: string; email: string }
  payment: { gateway: string; transaction_id: string } | null
  discount: { code: string } | null
}

interface StripeCharge {
  id: string
  status: string
  amount: number
  currency: string
  created: number
  description: string | null
  customer: string | null
  billing_details: { email: string | null; name: string | null } | null
  payment_intent: string | null
  metadata: Record<string, string> | null
}

interface StripePayout {
  id: string
  status: string
  amount: number
  currency: string
  created: number
  arrival_date: number
  description: string | null
  method: string
  type: string
}

// Shared customer/product context passed through record calls
export interface GatewayTransactionData {
  gateway: string
  type: 'income' | 'expense'
  amount: number
  currency: string
  description: string
  reference: string | null
  date: Date
  status?: 'completed' | 'failed' | 'pending' | 'refunded' | string
  metadata?: Record<string, unknown>
  customerEmail?: string | null
  customerName?: string | null
  customerPhone?: string | null
  productName?: string | null
}

const SYSTEM_USER_ID = new Types.ObjectId('000000000000000000000001')
const VALID_CURRENCIES = ['EUR', 'USD', 'XOF', 'MAD', 'CAD']

@Injectable()
export class FinancesService {
  private readonly logger = new Logger(FinancesService.name)

  constructor(
    @InjectModel(Category.name)       private categoryModel: Model<CategoryDocument>,
    @InjectModel(Transaction.name)    private transactionModel: Model<TransactionDocument>,
    @InjectModel(ProductMapping.name) private productMappingModel: Model<ProductMappingDocument>,
    @InjectModel(Offer.name)          private offerModel: Model<OfferDocument>,
    @InjectModel(Student.name)        private studentModel: Model<StudentDocument>,
    @InjectModel(Lead.name)           private leadModel: Model<LeadDocument>,
  ) {}

  // ── Auto-link transaction to student/lead by email ────────────────────────

  private async autoLinkTransaction(tx: TransactionDocument): Promise<void> {
    if (!tx.customerEmail) return
    const email = tx.customerEmail.toLowerCase().trim()
    const student = await this.studentModel.findOne({ email }).select('_id').lean()
    if (student) {
      tx.studentId = student._id as unknown as Types.ObjectId
      return
    }
    const lead = await this.leadModel.findOne({ email }).select('_id').lean()
    if (lead) {
      tx.leadId = lead._id as unknown as Types.ObjectId
    }
  }

  async backfillEntityLinks(): Promise<{ updated: number; errors: number }> {
    const txs = await this.transactionModel
      .find({ customerEmail: { $ne: null }, studentId: null, leadId: null })
      .select('_id customerEmail')
      .lean()

    let updated = 0; let errors = 0
    for (const tx of txs) {
      try {
        if (!tx.customerEmail) continue
        const email = tx.customerEmail.toLowerCase().trim()
        const student = await this.studentModel.findOne({ email }).select('_id').lean()
        if (student) {
          await this.transactionModel.updateOne({ _id: tx._id }, { $set: { studentId: student._id } })
          updated++; continue
        }
        const lead = await this.leadModel.findOne({ email }).select('_id').lean()
        if (lead) {
          await this.transactionModel.updateOne({ _id: tx._id }, { $set: { leadId: lead._id } })
          updated++
        }
      } catch { errors++ }
    }
    return { updated, errors }
  }

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
    offerId?: string
    page?: number
    limit?: number
  }) {
    const { page = 1, limit = 25 } = filters
    const query: Record<string, unknown> = {}

    if (filters.type)       query.type = filters.type
    if (filters.categoryId) query.categoryId = new Types.ObjectId(filters.categoryId)
    if (filters.gateway)    query.gateway = filters.gateway
    if (filters.status)     query.status = filters.status
    if (filters.currency)   query.currency = filters.currency
    if (filters.offerId)    query.offerId = new Types.ObjectId(filters.offerId)
    if (filters.search) {
      query.$or = [
        { description:    { $regex: filters.search, $options: 'i' } },
        { reference:      { $regex: filters.search, $options: 'i' } },
        { customerEmail:  { $regex: filters.search, $options: 'i' } },
        { customerName:   { $regex: filters.search, $options: 'i' } },
        { productName:    { $regex: filters.search, $options: 'i' } },
      ]
    }
    if (filters.dateFrom || filters.dateTo) {
      const dateQuery: Record<string, Date> = {}
      if (filters.dateFrom) dateQuery.$gte = new Date(filters.dateFrom)
      if (filters.dateTo)   dateQuery.$lte = new Date(filters.dateTo + 'T23:59:59.999Z')
      query.date = dateQuery
    }

    const [data, total] = await Promise.all([
      this.transactionModel
        .find(query)
        .populate('categoryId', 'name color icon')
        .populate('createdBy', 'firstName lastName email')
        .populate('offerId', 'name')
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
      .populate('offerId', 'name')
      .lean()
    if (!tx) throw new NotFoundException('Transaction introuvable')
    return tx
  }

  async createTransaction(data: {
    type: string; amount: number; currency?: string; description: string
    categoryId?: string | null; date: string; gateway?: string; status?: string
    reference?: string; notes?: string; createdById: string
    customerEmail?: string | null
  }) {
    const tx = await this.transactionModel.create({
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
      customerEmail: data.customerEmail ?? null,
    })
    await this.autoLinkTransaction(tx)
    if (tx.isModified()) await tx.save()
    return tx
  }

  async updateTransaction(id: string, data: Partial<{
    type: string; amount: number; currency: string; description: string
    categoryId: string | null; date: string; gateway: string; status: string
    reference: string; notes: string; offerId: string | null; productName: string | null
  }>) {
    const tx = await this.transactionModel.findById(id)
    if (!tx) throw new NotFoundException('Transaction introuvable')

    if (data.type !== undefined)        tx.type = data.type
    if (data.amount !== undefined)      tx.amount = data.amount
    if (data.currency !== undefined)    tx.currency = data.currency
    if (data.description !== undefined) tx.description = data.description
    if (data.categoryId !== undefined)  tx.categoryId = data.categoryId ? new Types.ObjectId(data.categoryId) : null
    if (data.date !== undefined)        tx.date = new Date(data.date)
    if (data.gateway !== undefined)     tx.gateway = data.gateway
    if (data.status !== undefined)      tx.status = data.status
    if (data.reference !== undefined)   tx.reference = data.reference ?? null
    if (data.notes !== undefined)       tx.notes = data.notes
    if (data.offerId !== undefined) {
      tx.offerId = data.offerId ? new Types.ObjectId(data.offerId) : null
    }
    if (data.productName !== undefined) tx.productName = data.productName ?? null

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
    const startOfYear  = new Date(now.getFullYear(), 0, 1)
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1)

    const [monthStats, yearStats, byCategoryRaw, byMonthRaw, byGatewayRaw, byOfferRaw] = await Promise.all([
      this.transactionModel.aggregate([
        { $match: { date: { $gte: startOfMonth }, status: 'completed', currency } },
        { $group: { _id: '$type', total: { $sum: '$amount' } } },
      ]),
      this.transactionModel.aggregate([
        { $match: { date: { $gte: startOfYear }, status: 'completed', currency } },
        { $group: { _id: '$type', total: { $sum: '$amount' } } },
      ]),
      this.transactionModel.aggregate([
        { $match: { status: 'completed', currency, categoryId: { $ne: null } } },
        { $group: { _id: { categoryId: '$categoryId', type: '$type' }, total: { $sum: '$amount' } } },
        { $lookup: { from: 'categories', localField: '_id.categoryId', foreignField: '_id', as: 'category' } },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      ]),
      this.transactionModel.aggregate([
        { $match: { date: { $gte: twelveMonthsAgo }, status: 'completed', currency } },
        { $group: { _id: { year: { $year: '$date' }, month: { $month: '$date' }, type: '$type' }, total: { $sum: '$amount' } } },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      this.transactionModel.aggregate([
        { $match: { status: 'completed', currency } },
        { $group: { _id: { gateway: '$gateway', type: '$type' }, total: { $sum: '$amount' } } },
      ]),
      // By offer (linked transactions)
      this.transactionModel.aggregate([
        { $match: { status: 'completed', currency, offerId: { $ne: null } } },
        { $group: { _id: { offerId: '$offerId', offerName: '$offerName', type: '$type' }, total: { $sum: '$amount' } } },
      ]),
    ])

    const monthIncome  = monthStats.find((r) => r._id === 'income')?.total ?? 0
    const monthExpense = monthStats.find((r) => r._id === 'expense')?.total ?? 0
    const yearIncome   = yearStats.find((r) => r._id === 'income')?.total ?? 0
    const yearExpense  = yearStats.find((r) => r._id === 'expense')?.total ?? 0

    const months: Array<{ label: string; income: number; expense: number }> = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const y = d.getFullYear(); const m = d.getMonth() + 1
      months.push({
        label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
        income:  byMonthRaw.find((r) => r._id.year === y && r._id.month === m && r._id.type === 'income')?.total ?? 0,
        expense: byMonthRaw.find((r) => r._id.year === y && r._id.month === m && r._id.type === 'expense')?.total ?? 0,
      })
    }

    const categoryMap: Record<string, { name: string; color: string; icon: string; income: number; expense: number }> = {}
    for (const r of byCategoryRaw) {
      const catId = r._id.categoryId?.toString() ?? 'unknown'
      if (!categoryMap[catId]) categoryMap[catId] = { name: r.category?.name ?? 'Sans catégorie', color: r.category?.color ?? '#6b7280', icon: r.category?.icon ?? '💰', income: 0, expense: 0 }
      categoryMap[catId][r._id.type as 'income' | 'expense'] += r.total
    }

    const gatewayMap: Record<string, { income: number; expense: number }> = {}
    for (const r of byGatewayRaw) {
      const gw = r._id.gateway
      if (!gatewayMap[gw]) gatewayMap[gw] = { income: 0, expense: 0 }
      gatewayMap[gw][r._id.type as 'income' | 'expense'] += r.total
    }

    const offerMap: Record<string, { offerId: string; offerName: string; income: number; expense: number }> = {}
    for (const r of byOfferRaw) {
      const key = r._id.offerId?.toString() ?? 'unknown'
      if (!offerMap[key]) offerMap[key] = { offerId: key, offerName: r._id.offerName ?? '—', income: 0, expense: 0 }
      offerMap[key][r._id.type as 'income' | 'expense'] += r.total
    }

    return {
      currency,
      month:     { income: monthIncome, expense: monthExpense, net: monthIncome - monthExpense },
      year:      { income: yearIncome,  expense: yearExpense,  net: yearIncome - yearExpense },
      byMonth:   months,
      byCategory: Object.values(categoryMap),
      byGateway:  Object.entries(gatewayMap).map(([gateway, v]) => ({ gateway, ...v })),
      byOffer:    Object.values(offerMap),
    }
  }

  // ── Product mappings ───────────────────────────────────────────────────────

  async listProductMappings(status?: string) {
    const query = status ? { status } : {}
    return this.productMappingModel
      .find(query)
      .sort({ status: 1, seenCount: -1 })
      .lean()
  }

  async confirmProductMapping(mappingId: string, offerId: string): Promise<{ updated: number }> {
    const offer = await this.offerModel.findById(offerId).lean()
    if (!offer) throw new NotFoundException('Offre introuvable')

    const mapping = await this.productMappingModel.findByIdAndUpdate(
      mappingId,
      { $set: { status: 'confirmed', offerId: new Types.ObjectId(offerId), offerName: offer.name } },
      { new: true },
    )
    if (!mapping) throw new NotFoundException('Mapping introuvable')

    // Bulk-link all transactions sharing this product name to the confirmed offer
    const result = await this.transactionModel.updateMany(
      { productName: mapping.productName },
      { $set: { offerId: new Types.ObjectId(offerId), offerName: offer.name } },
    )

    this.logger.log(`ProductMapping confirmed: "${mapping.productName}" → "${offer.name}" (${result.modifiedCount} transactions liées)`)
    return { updated: result.modifiedCount }
  }

  async ignoreProductMapping(mappingId: string): Promise<void> {
    await this.productMappingModel.findByIdAndUpdate(mappingId, { $set: { status: 'ignored' } })
  }

  async resetProductMapping(mappingId: string): Promise<void> {
    await this.productMappingModel.findByIdAndUpdate(mappingId, {
      $set: { status: 'pending', offerId: null, offerName: null },
    })
    // Remove offer links from matching transactions (but keep productName)
    const mapping = await this.productMappingModel.findById(mappingId).lean()
    if (mapping) {
      await this.transactionModel.updateMany(
        { productName: mapping.productName },
        { $set: { offerId: null, offerName: null } },
      )
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  mapCurrency(raw?: string): string {
    const upper = (raw ?? 'EUR').toUpperCase().replace(/\s+/g, ' ').trim()
    const aliases: Record<string, string> = {
      'F CFA': 'XOF', 'FCFA': 'XOF', 'CFA': 'XOF', 'XOF': 'XOF',
      'EUR': 'EUR', 'USD': 'USD', 'MAD': 'MAD', 'CAD': 'CAD',
    }
    return aliases[upper] ?? 'EUR'
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else { inQuotes = !inQuotes }
      } else if ((char === ',' || char === ';') && !inQuotes) {
        result.push(current.trim()); current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }

  /**
   * Register a raw product name: upsert its ProductMapping and trigger a Groq
   * suggestion if this is the first time it's been seen.
   * Returns the confirmed offer link (offerId/offerName) if one exists.
   */
  private async registerProduct(
    productName: string,
    gateway: string,
  ): Promise<{ offerId: Types.ObjectId | null; offerName: string | null }> {
    const now = new Date()
    const existing = await this.productMappingModel.findOne({ productName })

    if (existing) {
      await this.productMappingModel.updateOne(
        { _id: existing._id },
        { $inc: { seenCount: 1 }, $set: { lastSeenAt: now } },
      )
      return { offerId: existing.offerId ?? null, offerName: existing.offerName ?? null }
    }

    // First time we see this product — call Groq to suggest a match
    let suggestedOfferId: Types.ObjectId | null = null
    let suggestedOfferName: string | null = null
    let groqReasoning: string | null = null

    try {
      const offers = await this.offerModel.find({ isActive: true }).select('_id name description').lean()
      if (offers.length > 0) {
        const suggestion = await this.suggestOfferMatch(productName, offers)
        if (suggestion.offerId) {
          suggestedOfferId = new Types.ObjectId(suggestion.offerId)
          suggestedOfferName = suggestion.offerName
        }
        groqReasoning = suggestion.reasoning
      }
    } catch (err) {
      this.logger.warn(`Groq suggestion failed for "${productName}": ${(err as Error).message}`)
    }

    await this.productMappingModel.create({
      productName,
      gateway,
      status: 'pending',
      offerId: null,
      offerName: null,
      suggestedOfferId,
      suggestedOfferName,
      groqReasoning,
      seenCount: 1,
      firstSeenAt: now,
      lastSeenAt: now,
    })

    return { offerId: null, offerName: null }
  }

  /**
   * Ask Groq to suggest the best offer match for a given product name.
   */
  private async suggestOfferMatch(
    productName: string,
    offers: Array<{ _id: unknown; name: string; description?: string }>,
  ): Promise<{ offerId: string | null; offerName: string | null; reasoning: string }> {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return { offerId: null, offerName: null, reasoning: 'GROQ_API_KEY non configurée' }

    const offerList = offers
      .map((o) => `- ID: "${o._id}", Nom: "${o.name}"${o.description ? `, Description: "${o.description}"` : ''}`)
      .join('\n')

    const prompt = `Tu dois identifier quelle offre de formation correspond le mieux au nom de produit suivant, détecté dans une transaction de paiement provenant d'une plateforme externe.

Nom du produit détecté: "${productName}"

Offres disponibles dans le système:
${offerList}

Réponds UNIQUEMENT en JSON valide avec ce format exact:
{"offerId": "<id de l'offre>", "offerName": "<nom exact de l'offre>", "reasoning": "<courte explication en français>"}

Si aucune offre ne correspond clairement, réponds:
{"offerId": null, "offerName": null, "reasoning": "<explication>"}

Ne réponds qu'avec le JSON, sans texte supplémentaire.`

    const { data } = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 200,
      },
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } },
    )

    const content: string = data.choices?.[0]?.message?.content ?? '{}'
    // Strip markdown code blocks if model wraps in ```json
    const cleaned = content.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
    const result = JSON.parse(cleaned) as { offerId?: string | null; offerName?: string | null; reasoning?: string }
    return {
      offerId:   result.offerId   ?? null,
      offerName: result.offerName ?? null,
      reasoning: result.reasoning ?? '',
    }
  }

  // ── Gateway sync ───────────────────────────────────────────────────────────

  /**
   * Common upsert used by all sync methods.
   * If a transaction with this gateway+reference already exists, update its
   * customer/product/offer fields. Otherwise create it.
   */
  private async upsertTransaction(
    data: GatewayTransactionData,
    offerLink: { offerId: Types.ObjectId | null; offerName: string | null },
  ): Promise<'created' | 'updated'> {
    if (!data.reference) {
      // No reference — just create (can't upsert without a key)
      await this.transactionModel.create({
        ...this.buildTransactionDoc(data, offerLink),
      })
      return 'created'
    }

    const existing = await this.transactionModel.findOne({ gateway: data.gateway, reference: data.reference })

    if (existing) {
      await this.transactionModel.updateOne(
        { _id: existing._id },
        {
          $set: {
            amount:        data.amount,
            currency:      data.currency,
            description:   data.description,
            date:          data.date,
            status:        data.status ?? 'completed',
            customerEmail: data.customerEmail ?? existing.customerEmail,
            customerName:  data.customerName  ?? existing.customerName,
            customerPhone: data.customerPhone ?? existing.customerPhone,
            productName:   data.productName   ?? existing.productName,
            // Apply offer link only if there's now a confirmed mapping
            ...(offerLink.offerId
              ? { offerId: offerLink.offerId, offerName: offerLink.offerName }
              : {}),
          },
        },
      )
      return 'updated'
    }

    await this.transactionModel.create(this.buildTransactionDoc(data, offerLink))
    return 'created'
  }

  private buildTransactionDoc(
    data: GatewayTransactionData,
    offerLink: { offerId: Types.ObjectId | null; offerName: string | null },
  ) {
    return {
      type:          data.type,
      amount:        data.amount,
      currency:      data.currency,
      description:   data.description,
      gateway:       data.gateway,
      status:        data.status ?? 'completed',
      reference:     data.reference ?? null,
      date:          data.date,
      notes:         data.metadata ? JSON.stringify(data.metadata) : '',
      customerEmail: data.customerEmail ?? null,
      customerName:  data.customerName  ?? null,
      customerPhone: data.customerPhone ?? null,
      productName:   data.productName   ?? null,
      offerId:       offerLink.offerId   ?? null,
      offerName:     offerLink.offerName ?? null,
      createdBy:     SYSTEM_USER_ID,
    }
  }

  async syncChariow(): Promise<{ created: number; updated: number }> {
    const apiKey = process.env.CHARIOW_API_KEY
    if (!apiKey) throw new BadRequestException('CHARIOW_API_KEY non configurée')

    let created = 0; let updated = 0
    let cursor: string | null = null

    do {
      const params: Record<string, string | number> = { per_page: 100, start_date: '2025-06-01' }
      if (cursor) params.cursor = cursor

      const { data: body } = await axios.get('https://api.chariow.com/v1/sales', {
        headers: { Authorization: `Bearer ${apiKey}` },
        params,
      })

      const sales: ChariowSale[] = body.data ?? []

      for (const sale of sales) {
        if (!['completed', 'settled'].includes(sale.status)) continue

        const productName = sale.product.name
        const offerLink = productName ? await this.registerProduct(productName, 'chariow') : { offerId: null, offerName: null }

        const result = await this.upsertTransaction(
          {
            gateway:       'chariow',
            type:          'income',
            amount:        sale.amount.value,
            currency:      this.mapCurrency(sale.amount.currency),
            description:   `${productName ?? 'Produit'} — ${sale.customer.email}`,
            reference:     sale.id,
            date:          new Date(sale.completed_at ?? sale.created_at),
            status:        'completed',
            customerEmail: sale.customer.email,
            customerName:  sale.customer.name,
            productName,
            metadata: {
              customerId:    sale.customer.id,
              productId:     sale.product.id,
              paymentGateway: sale.payment?.gateway ?? null,
              transactionId:  sale.payment?.transaction_id ?? null,
              discountCode:   sale.discount?.code ?? null,
            },
          },
          offerLink,
        )

        if (result === 'created') created++; else updated++
      }

      cursor = body.pagination?.next_cursor ?? null
    } while (cursor)

    this.logger.log(`Chariow sync: ${created} créées, ${updated} mises à jour`)
    return { created, updated }
  }

  async syncStripe(): Promise<{ created: number; updated: number }> {
    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) throw new BadRequestException('STRIPE_SECRET_KEY non configurée — ajouter dans .env')

    const startTs = Math.floor(new Date('2025-06-01').getTime() / 1000)
    let created = 0; let updated = 0

    // ── Charges (income) ─────────────────────────────────────────────
    let lastChargeId: string | null = null

    while (true) {
      const params: Record<string, string | number> = { limit: 100, 'created[gte]': startTs }
      if (lastChargeId) params.starting_after = lastChargeId

      const { data: body } = await axios.get('https://api.stripe.com/v1/charges', {
        auth: { username: secretKey, password: '' },
        params,
      })

      const charges: StripeCharge[] = body.data ?? []

      for (const charge of charges) {
        if (charge.status !== 'succeeded') continue

        const productName: string | null = charge.metadata?.product ?? charge.description ?? null
        const offerLink = productName ? await this.registerProduct(productName, 'stripe') : { offerId: null, offerName: null }
        const currency = (charge.currency ?? 'eur').toUpperCase()

        const result = await this.upsertTransaction(
          {
            gateway:       'stripe',
            type:          'income',
            amount:        charge.amount / 100,
            currency:      VALID_CURRENCIES.includes(currency) ? currency : 'EUR',
            description:   charge.description ?? `Stripe ${charge.id}`,
            reference:     charge.id,
            date:          new Date(charge.created * 1000),
            status:        'completed',
            customerEmail: charge.billing_details?.email ?? null,
            customerName:  charge.billing_details?.name  ?? null,
            productName,
            metadata: {
              customerId:      charge.customer,
              paymentIntentId: charge.payment_intent,
            },
          },
          offerLink,
        )

        if (result === 'created') created++; else updated++
      }

      if (!body.has_more || !charges.length) break
      lastChargeId = charges[charges.length - 1].id
    }

    // ── Payouts (expense — transfers to your bank) ───────────────────
    let lastPayoutId: string | null = null

    while (true) {
      const params: Record<string, string | number> = { limit: 100, 'created[gte]': startTs }
      if (lastPayoutId) params.starting_after = lastPayoutId

      const { data: body } = await axios.get('https://api.stripe.com/v1/payouts', {
        auth: { username: secretKey, password: '' },
        params,
      })

      const payouts: StripePayout[] = body.data ?? []

      for (const payout of payouts) {
        if (payout.status !== 'paid') continue

        const currency = (payout.currency ?? 'eur').toUpperCase()
        const result = await this.upsertTransaction(
          {
            gateway:     'stripe',
            type:        'expense',
            amount:      payout.amount / 100,
            currency:    VALID_CURRENCIES.includes(currency) ? currency : 'EUR',
            description: `Virement Stripe — ${payout.description ?? payout.id}`,
            reference:   payout.id,
            date:        new Date((payout.arrival_date ?? payout.created) * 1000),
            status:      'completed',
            metadata:    { method: payout.method, type: payout.type },
          },
          { offerId: null, offerName: null },
        )

        if (result === 'created') created++; else updated++
      }

      if (!body.has_more || !payouts.length) break
      lastPayoutId = payouts[payouts.length - 1].id
    }

    this.logger.log(`Stripe sync: ${created} créées, ${updated} mises à jour`)
    return { created, updated }
  }

  async syncPawaPay(): Promise<{ created: number; updated: number }> {
    // PawaPay has no historical list API — transactions arrive via webhook only.
    return { created: 0, updated: 0 }
  }

  async syncFedaPayCsv(csvContent: string): Promise<{ created: number; updated: number; errors: number }> {
    const lines = csvContent.split(/\r?\n/).filter((l) => l.trim())
    if (lines.length < 2) throw new BadRequestException('CSV vide ou invalide (moins de 2 lignes)')

    const headers = this.parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/['"]/g, '').trim())
    let created = 0; let updated = 0; let errors = 0

    for (let i = 1; i < lines.length; i++) {
      try {
        const cols = this.parseCSVLine(lines[i])
        const row: Record<string, string> = {}
        headers.forEach((h, idx) => { row[h] = cols[idx]?.trim() ?? '' })

        const id           = row['id'] ?? row['#'] ?? row['transaction id'] ?? ''
        const status       = (row['statut'] ?? row['status'] ?? '').toLowerCase()
        const amountRaw    = parseFloat((row['montant'] ?? row['amount'] ?? '0').replace(/[\s]/g, '').replace(',', '.'))
        const currency     = this.mapCurrency(row['devise'] ?? row['currency'] ?? 'XOF')
        const email        = row['email'] ?? row['e-mail'] ?? row['email client'] ?? ''
        const customerName = row['client'] ?? row['nom'] ?? row['name'] ?? ''
        const description  = row['description'] ?? row['objet'] ?? `FedaPay ${id}`
        const dateStr      = row['date de création'] ?? row['created_at'] ?? row['date'] ?? ''

        const approvedStatuses = ['approved', 'approuvé', 'approuve', 'success', 'paid']
        if (!id || !approvedStatuses.includes(status)) continue
        if (!amountRaw || isNaN(amountRaw) || amountRaw <= 0) { errors++; continue }

        let date = dateStr ? new Date(dateStr) : new Date()
        if (isNaN(date.getTime())) date = new Date()

        // FedaPay description is often the product name
        const productName = description || null
        const offerLink   = productName ? await this.registerProduct(productName, 'fedapay') : { offerId: null, offerName: null }

        const result = await this.upsertTransaction(
          {
            gateway:       'fedapay',
            type:          'income',
            amount:        amountRaw,
            currency,
            description:   (description || `${customerName} — ${email}`).trim(),
            reference:     id,
            date,
            status:        'completed',
            customerEmail: email || null,
            customerName:  customerName || null,
            productName,
            metadata:      { email, customerName },
          },
          offerLink,
        )

        if (result === 'created') created++; else updated++
      } catch {
        errors++
      }
    }

    this.logger.log(`FedaPay CSV sync: ${created} créées, ${updated} mises à jour, ${errors} erreurs`)
    return { created, updated, errors }
  }

  /**
   * Import FedaPay transactions from the XLSX export (dashboard → Exporter).
   * Column layout (as seen in exports_transactions-YYYY-MM-DD.xlsx):
   * ID | TRANSACTION KEY | REFERENCE | STATUS | MODE | DESCRIPTION | AMOUNT |
   * COMMISSION | FIXED COMMISSION | FEES | AMOUNT TRANSFERRED | AMOUNT DEBITED |
   * CALLBACK URL | CURRENCY | CUSTOMER | CUSTOMERS_LASTNAME | CUSTOMERS_FIRSTNAME |
   * CUSTOMER_EMAIL | PAYMENT METHODS_NUMBER | CUSTOM METADATA | CREATED AT | ...
   */
  async syncFedaPayXlsx(buffer: Buffer): Promise<{ created: number; updated: number; errors: number }> {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    if (!ws) throw new BadRequestException('Fichier XLSX vide ou invalide')

    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
    if (rows.length < 2) throw new BadRequestException('Fichier XLSX sans données')

    // Build header index (case-insensitive)
    const headerRow = rows[0] as string[]
    const col = (name: string) => headerRow.findIndex((h) => h?.toString().toLowerCase().trim() === name.toLowerCase())

    const iRef       = col('reference')
    const iStatus    = col('status')
    const iAmount    = col('amount')
    const iLastName  = col('customers_lastname')
    const iFirstName = col('customers_firstname')
    const iEmail     = col('customer_email')
    const iPhone     = col('payment methods_number')
    const iDesc      = col('description')
    const iCreated   = col('created at')
    const iApproved  = col('approved at')

    let created = 0; let updated = 0; let errors = 0

    for (let i = 1; i < rows.length; i++) {
      try {
        const r = rows[i] as unknown[]
        const get = (idx: number) => (idx >= 0 ? (r[idx] ?? '').toString().trim() : '')

        const reference = get(iRef)
        const rawStatus = get(iStatus).toLowerCase()
        const amountRaw = parseFloat(get(iAmount).replace(/[\s,]/g, '') || '0')

        // Only import approved or transferred (= confirmed payment received)
        const completedStatuses = ['approved', 'transferred']
        if (!reference || !completedStatuses.includes(rawStatus)) continue
        if (!amountRaw || isNaN(amountRaw) || amountRaw <= 0) { errors++; continue }

        const lastName  = get(iLastName)
        const firstName = get(iFirstName)
        const customerName  = [firstName, lastName].filter(Boolean).join(' ') || null
        const customerEmail = get(iEmail) || null
        const customerPhone = get(iPhone) || null
        const description   = get(iDesc) || `FedaPay ${reference}`

        // Parse date — xlsx may return a Date object or a string
        let date: Date
        const rawDate = iApproved >= 0 && r[iApproved] ? r[iApproved] : (iCreated >= 0 ? r[iCreated] : null)
        if (rawDate instanceof Date) {
          date = rawDate
        } else if (rawDate) {
          date = new Date(rawDate.toString())
          if (isNaN(date.getTime())) date = new Date()
        } else {
          date = new Date()
        }

        const offerLink = { offerId: null, offerName: null }

        const result = await this.upsertTransaction(
          {
            gateway:      'fedapay',
            type:         'income',
            amount:       amountRaw,
            currency:     'XOF',
            description,
            reference,
            date,
            status:       'completed',
            customerEmail,
            customerName,
            customerPhone,
            productName:  null,
          },
          offerLink,
        )

        if (result === 'created') created++; else updated++
      } catch {
        errors++
      }
    }

    this.logger.log(`FedaPay XLSX sync: ${created} créées, ${updated} mises à jour, ${errors} erreurs`)
    return { created, updated, errors }
  }

  async seedDefaultCategories(): Promise<{ created: number }> {
    const defaults = [
      { name: 'Salaire',                type: 'income',  icon: '💼', color: '#10b981' },
      { name: 'Freelance / Prestations', type: 'income',  icon: '💻', color: '#6366f1' },
      { name: 'Ventes formations',       type: 'income',  icon: '🎓', color: '#8b5cf6' },
      { name: 'Investissements',         type: 'income',  icon: '📈', color: '#22c55e' },
      { name: 'Loyer / Bureaux',         type: 'expense', icon: '🏠', color: '#ef4444' },
      { name: 'Marketing & Pub',         type: 'expense', icon: '📣', color: '#f97316' },
      { name: 'Hébergement / Serveurs',  type: 'expense', icon: '🖥️', color: '#3b82f6' },
      { name: 'Logiciels & Abonnements', type: 'expense', icon: '📱', color: '#06b6d4' },
      { name: 'Salaires équipe',         type: 'expense', icon: '👥', color: '#f59e0b' },
      { name: 'Transport',               type: 'expense', icon: '🚗', color: '#84cc16' },
      { name: 'Formation',               type: 'expense', icon: '📚', color: '#a855f7' },
      { name: 'Frais bancaires',         type: 'expense', icon: '💳', color: '#6b7280' },
      { name: 'Matériel & Équipement',   type: 'expense', icon: '📦', color: '#78716c' },
      { name: 'Remboursements',          type: 'both',    icon: '🔄', color: '#14b8a6' },
      { name: 'Divers',                  type: 'both',    icon: '💰', color: '#6366f1' },
    ]

    let created = 0
    for (const cat of defaults) {
      const exists = await this.categoryModel.findOne({ name: cat.name })
      if (!exists) {
        await this.categoryModel.create(cat)
        created++
      }
    }

    return { created }
  }

  // ── Webhook recorder ───────────────────────────────────────────────────────

  /**
   * Record a transaction originating from a payment gateway webhook.
   * Idempotent: if the reference already exists, enriches the existing record
   * rather than creating a duplicate.
   */
  async recordGatewayTransaction(data: GatewayTransactionData) {
    // Look up any confirmed product mapping
    const offerLink = data.productName
      ? await this.registerProduct(data.productName, data.gateway)
      : { offerId: null, offerName: null }

    if (data.reference) {
      const existing = await this.transactionModel.findOne({
        gateway: data.gateway,
        reference: data.reference,
      })

      if (existing) {
        // Enrich the existing record with any new customer/product info
        await this.transactionModel.updateOne(
          { _id: existing._id },
          {
            $set: {
              customerEmail: data.customerEmail ?? existing.customerEmail,
              customerName:  data.customerName  ?? existing.customerName,
              customerPhone: data.customerPhone ?? existing.customerPhone,
              productName:   data.productName   ?? existing.productName,
              ...(offerLink.offerId
                ? { offerId: offerLink.offerId, offerName: offerLink.offerName }
                : {}),
            },
          },
        )
        return existing
      }
    }

    const tx = await this.transactionModel.create(this.buildTransactionDoc(data, offerLink))
    await this.autoLinkTransaction(tx)
    if (tx.isModified()) await tx.save()
    return tx
  }
}
