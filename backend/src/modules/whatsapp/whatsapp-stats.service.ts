import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Conversation, ConversationDocument } from './schemas/conversation.schema'
import { Message, MessageDocument } from './schemas/message.schema'
import { Complaint, ComplaintDocument, COMPLAINT_CATEGORIES, type ComplaintCategory } from './schemas/complaint.schema'
import { FormSession, FormSessionDocument } from './schemas/form-session.schema'

export type StatsRange = '24h' | '7d' | '30d' | 'all'

export interface WhatsAppStats {
  range: StatsRange
  newConversations: number
  totalConversations: number
  activeHumanConversations: number
  messagesIn: number
  messagesOut: number
  aiReplies: number
  escalations: number
  complaintsTotal: number
  complaintsByCategory: Record<ComplaintCategory, number>
  formsStarted: number
  formsCompleted: number
  formCompletionRate: number
  llmCostTotalUsd: number
  llmCostByProvider: Record<string, number>
  dailySeries: Array<{ date: string; newConvs: number; aiReplies: number; costUsd: number }>
}

function rangeToDate(range: StatsRange): Date | null {
  const now = Date.now()
  switch (range) {
    case '24h': return new Date(now - 24 * 3600 * 1000)
    case '7d':  return new Date(now - 7 * 24 * 3600 * 1000)
    case '30d': return new Date(now - 30 * 24 * 3600 * 1000)
    case 'all': return null
  }
}

@Injectable()
export class WhatsAppStatsService {
  constructor(
    @InjectModel(Conversation.name) private readonly convModel: Model<ConversationDocument>,
    @InjectModel(Message.name) private readonly msgModel: Model<MessageDocument>,
    @InjectModel(Complaint.name) private readonly complaintModel: Model<ComplaintDocument>,
    @InjectModel(FormSession.name) private readonly formModel: Model<FormSessionDocument>,
  ) {}

  async getStats(range: StatsRange): Promise<WhatsAppStats> {
    const since = rangeToDate(range)
    const dateFilter = since ? { createdAt: { $gte: since } } : {}

    const [
      newConversations,
      totalConversations,
      activeHumanConversations,
      messagesIn,
      messagesOut,
      aiReplies,
      escalationsAgg,
      complaintsTotal,
      complaintsByCategoryAgg,
      formsStarted,
      formsCompleted,
      costAgg,
      costByProviderAgg,
      dailyConvAgg,
      dailyMsgAgg,
    ] = await Promise.all([
      this.convModel.countDocuments(dateFilter),
      this.convModel.countDocuments(),
      this.convModel.countDocuments({ status: 'human' }),
      this.msgModel.countDocuments({ ...dateFilter, direction: 'in' }),
      this.msgModel.countDocuments({ ...dateFilter, direction: 'out' }),
      this.msgModel.countDocuments({ ...dateFilter, direction: 'out', fromType: 'bot' }),
      this.convModel.countDocuments({ tags: { $in: ['escaladé', 'escaladé:keyword'] }, ...(since ? { updatedAt: { $gte: since } } : {}) }),
      this.complaintModel.countDocuments(dateFilter),
      this.complaintModel.aggregate([
        ...(since ? [{ $match: { createdAt: { $gte: since } } }] : []),
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
      this.formModel.countDocuments(dateFilter),
      this.formModel.countDocuments({ ...dateFilter, status: 'completed' }),
      this.msgModel.aggregate([
        ...(since ? [{ $match: { createdAt: { $gte: since } } }] : []),
        { $match: { costUsd: { $ne: null } } },
        { $group: { _id: null, total: { $sum: '$costUsd' } } },
      ]),
      this.msgModel.aggregate([
        ...(since ? [{ $match: { createdAt: { $gte: since } } }] : []),
        { $match: { llmProvider: { $ne: null } } },
        { $group: { _id: '$llmProvider', total: { $sum: '$costUsd' } } },
      ]),
      this.convModel.aggregate([
        ...(since ? [{ $match: { createdAt: { $gte: since } } }] : []),
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      this.msgModel.aggregate([
        ...(since ? [{ $match: { createdAt: { $gte: since } } }] : []),
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            aiReplies: { $sum: { $cond: [{ $and: [{ $eq: ['$direction', 'out'] }, { $eq: ['$fromType', 'bot'] }] }, 1, 0] } },
            costUsd: { $sum: { $ifNull: ['$costUsd', 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ])

    const complaintsByCategory: Record<ComplaintCategory, number> = Object.fromEntries(
      COMPLAINT_CATEGORIES.map((c) => [c, 0]),
    ) as Record<ComplaintCategory, number>
    for (const row of complaintsByCategoryAgg) complaintsByCategory[row._id as ComplaintCategory] = row.count

    const llmCostByProvider: Record<string, number> = {}
    for (const row of costByProviderAgg) llmCostByProvider[row._id as string] = row.total

    // Merge daily series
    const dailyMap = new Map<string, { newConvs: number; aiReplies: number; costUsd: number }>()
    for (const row of dailyConvAgg) {
      dailyMap.set(row._id as string, { newConvs: row.count, aiReplies: 0, costUsd: 0 })
    }
    for (const row of dailyMsgAgg) {
      const date = row._id as string
      const existing = dailyMap.get(date) ?? { newConvs: 0, aiReplies: 0, costUsd: 0 }
      existing.aiReplies = row.aiReplies
      existing.costUsd = row.costUsd
      dailyMap.set(date, existing)
    }
    const dailySeries = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }))

    return {
      range,
      newConversations,
      totalConversations,
      activeHumanConversations,
      messagesIn,
      messagesOut,
      aiReplies,
      escalations: escalationsAgg,
      complaintsTotal,
      complaintsByCategory,
      formsStarted,
      formsCompleted,
      formCompletionRate: formsStarted > 0 ? formsCompleted / formsStarted : 0,
      llmCostTotalUsd: costAgg[0]?.total ?? 0,
      llmCostByProvider,
      dailySeries,
    }
  }
}
