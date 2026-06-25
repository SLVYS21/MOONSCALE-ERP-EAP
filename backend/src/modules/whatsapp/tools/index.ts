import type { RegisteredTool, ToolContext, ToolHandlerResult } from './tool-context'
import { COMPLAINT_CATEGORIES, type ComplaintCategory } from '../schemas/complaint.schema'
import { Types } from 'mongoose'
import { normalizePhone } from '../../../common/utils/phone.util'

// ── 1. lookup_contact ────────────────────────────────────────────────────────
const lookupContact: RegisteredTool = {
  def: {
    name: 'lookup_contact',
    description:
      'Cherche un contact dans la base de données par numéro WhatsApp ou email. Retourne le type (lead/student/inconnu), nom, statut paiement (étudiants), et tags (leads).',
    parameters: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Numéro au format E.164 ou local. Optionnel.' },
        email: { type: 'string', description: 'Email du contact. Optionnel.' },
      },
    },
  },
  handler: async (args, ctx) => {
    const phoneArg = args.phone as string | undefined
    const emailArg = args.email as string | undefined

    const phoneE164 = phoneArg ? normalizePhone(phoneArg).e164 : ctx.conversation.phone

    const orFilters: any[] = []
    if (phoneE164) orFilters.push({ whatsapp: phoneE164 })
    if (emailArg) orFilters.push({ email: emailArg.toLowerCase().trim() })

    if (orFilters.length === 0) return { ok: false, error: 'No phone or email provided' }

    const student = await ctx.models.Student.findOne({ $or: orFilters }).lean()
    if (student) {
      return {
        ok: true,
        data: {
          type: 'student',
          name: student.name,
          email: student.email,
          plan: student.plan,
          debtStatus: student.debtStatus,
          circleActive: student.circleIsActive,
          tagsCircle: student.circleTags?.map((t: any) => t.name) ?? [],
        },
      }
    }

    const leadOrFilters: any[] = []
    if (phoneE164) leadOrFilters.push({ phone: phoneE164 })
    if (emailArg) leadOrFilters.push({ email: emailArg.toLowerCase().trim() })
    const lead = await ctx.models.Lead.findOne({ $or: leadOrFilters }).lean()
    if (lead) {
      return {
        ok: true,
        data: {
          type: 'lead',
          name: lead.name,
          email: lead.email,
          pipeline_status: lead.pipeline_status,
          qualification: lead.qualification,
          score: lead.score,
        },
      }
    }

    return { ok: true, data: { type: 'unknown', message: 'Aucun contact correspondant en base.' } }
  },
}

// ── 2. create_complaint ──────────────────────────────────────────────────────
const createComplaint: RegisteredTool = {
  def: {
    name: 'create_complaint',
    description:
      'Enregistre une plainte client pour traitement par l\'équipe. À utiliser quand le client signale un problème concret (accès Circle pas reçu, paiement, séance manquée, etc).',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Catégorie de la plainte',
          enum: COMPLAINT_CATEGORIES as unknown as string[],
        },
        description: {
          type: 'string',
          description: 'Description claire et concise du problème, basée sur ce que le client a dit.',
        },
      },
      required: ['category', 'description'],
    },
  },
  handler: async (args, ctx) => {
    const category = args.category as ComplaintCategory
    const description = args.description as string
    if (!COMPLAINT_CATEGORIES.includes(category)) {
      return { ok: false, error: `Invalid category. Allowed: ${COMPLAINT_CATEGORIES.join(', ')}` }
    }
    const created = await ctx.models.Complaint.create({
      conversationId: ctx.conversation._id,
      category,
      description,
      contactType: ctx.conversation.contactType,
      contactId: ctx.conversation.contactId,
      contactName: ctx.conversation.contactName,
      contactPhone: ctx.conversation.phone,
      createdByType: 'ai',
    })
    await ctx.models.Conversation.findByIdAndUpdate(ctx.conversation._id, { $addToSet: { tags: `complaint:${category}` } })
    return { ok: true, data: { complaintId: String(created._id), category } }
  },
}

// ── 3. escalate_to_human ─────────────────────────────────────────────────────
const escalateToHuman: RegisteredTool = {
  def: {
    name: 'escalate_to_human',
    description:
      'Passe la conversation à un humain. À utiliser quand tu ne peux pas répondre correctement, quand le client est mécontent ou demande explicitement de parler à quelqu\'un.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Pourquoi tu escalades (interne, pas montré au client).' },
      },
      required: ['reason'],
    },
  },
  handler: async (args, ctx) => {
    await ctx.models.Conversation.findByIdAndUpdate(ctx.conversation._id, {
      $set: { status: 'human', aiEnabled: false },
      $addToSet: { tags: 'escaladé' },
    })
    return { ok: true, data: { reason: args.reason } }
  },
}

// ── 4. request_email ─────────────────────────────────────────────────────────
const requestEmail: RegisteredTool = {
  def: {
    name: 'request_email',
    description:
      'Marque la conversation comme attendant l\'email du client (utile pour le matcher avec un compte existant). Tu dois ensuite poser la question dans ta réponse.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Pourquoi tu demandes l\'email (sera mentionné au client).' },
      },
    },
  },
  handler: async (_args, ctx) => {
    await ctx.models.Conversation.findByIdAndUpdate(ctx.conversation._id, {
      $set: { 'meta.awaitingEmail': true },
    })
    return { ok: true }
  },
}

// ── 5. mark_as_qualified_lead ────────────────────────────────────────────────
const markAsQualifiedLead: RegisteredTool = {
  def: {
    name: 'mark_as_qualified_lead',
    description:
      'Marque le contact comme lead qualifié (intérêt confirmé). Étape avant d\'envoyer le formulaire Typebot. À utiliser quand le client manifeste un intérêt clair pour les offres.',
    parameters: {
      type: 'object',
      properties: {
        signals: { type: 'string', description: 'Quels signes te font penser que c\'est qualifié.' },
      },
    },
  },
  handler: async (_args, ctx) => {
    await ctx.models.Conversation.findByIdAndUpdate(ctx.conversation._id, {
      $addToSet: { tags: 'qualified' },
    })
    return { ok: true }
  },
}

// ── 6. send_typebot ──────────────────────────────────────────────────────────
const sendTypebot: RegisteredTool = {
  def: {
    name: 'send_typebot',
    description:
      "Démarre le formulaire de capture de lead directement dans la conversation WhatsApp. À utiliser uniquement APRÈS avoir marqué le lead comme qualifié ET obtenu son accord explicite. L'IA est mise en pause pendant que le formulaire est actif. Tu n'as PAS besoin d'ajouter de message après l'appel — le formulaire commence tout seul avec son intro.",
    parameters: { type: 'object', properties: {} },
  },
  handler: async (_args, ctx) => {
    const prefilled: Record<string, string> = {}
    if (ctx.conversation.contactName) prefilled.fullname = ctx.conversation.contactName

    const result = await ctx.services.formRunner.start(ctx.conversation, 'lead_capture', prefilled)
    if (!result) {
      return { ok: false, error: 'Form already complete from prefilled data, no questions to ask' }
    }
    return { ok: true, data: { formStarted: true, firstQuestion: result.firstQuestion } }
  },
}

// ── 7. tag_conversation ──────────────────────────────────────────────────────
const tagConversation: RegisteredTool = {
  def: {
    name: 'tag_conversation',
    description: 'Ajoute un tag interne à la conversation pour catégorisation (ex: "intéressé:bootcamp", "vip", "à rappeler").',
    parameters: {
      type: 'object',
      properties: {
        tag: { type: 'string', description: 'Tag à ajouter (court, en minuscules, format kebab ou :)' },
      },
      required: ['tag'],
    },
  },
  handler: async (args, ctx) => {
    const tag = (args.tag as string).trim().toLowerCase()
    if (!tag) return { ok: false, error: 'Empty tag' }
    await ctx.models.Conversation.findByIdAndUpdate(ctx.conversation._id, { $addToSet: { tags: tag } })
    return { ok: true, data: { tag } }
  },
}

export const ALL_TOOLS: RegisteredTool[] = [
  lookupContact,
  createComplaint,
  escalateToHuman,
  requestEmail,
  markAsQualifiedLead,
  sendTypebot,
  tagConversation,
]

export function getToolByName(name: string): RegisteredTool | undefined {
  return ALL_TOOLS.find((t) => t.def.name === name)
}

export type { ToolContext, ToolHandlerResult, RegisteredTool }
