import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { FormSession, FormSessionDocument } from '../schemas/form-session.schema'
import { Conversation, ConversationDocument } from '../schemas/conversation.schema'
import { Message, MessageDocument } from '../schemas/message.schema'
import { getFormByKey } from './lead-capture.form'
import { validateAnswer, type FormStep, type FormDefinition } from './form-definition'
import { LeadsService } from '../../leads/leads.service'

export interface FormStartResult {
  session: FormSessionDocument
  firstQuestion: string
}

export interface FormStepResult {
  done: boolean
  question?: string
  errorHint?: string
  finalSummary?: string
  leadId?: string | null
}

@Injectable()
export class FormRunnerService {
  private readonly logger = new Logger(FormRunnerService.name)

  constructor(
    @InjectModel(FormSession.name) private readonly sessionModel: Model<FormSessionDocument>,
    @InjectModel(Conversation.name) private readonly convModel: Model<ConversationDocument>,
    @InjectModel(Message.name) private readonly msgModel: Model<MessageDocument>,
    private readonly leadsService: LeadsService,
  ) {}

  async findActiveSession(conversationId: string): Promise<FormSessionDocument | null> {
    return this.sessionModel.findOne({ conversationId, status: 'active' })
  }

  async start(conv: ConversationDocument, formKey: string, prefilled: Record<string, string> = {}): Promise<FormStartResult | null> {
    const form = getFormByKey(formKey)
    if (!form) {
      this.logger.warn(`Unknown form key: ${formKey}`)
      return null
    }

    // Abandon any prior active session
    await this.sessionModel.updateMany(
      { conversationId: conv._id, status: 'active' },
      { $set: { status: 'abandoned' } },
    )

    const session = await this.sessionModel.create({
      conversationId: conv._id,
      formKey,
      currentStepIdx: 0,
      answers: {},
      prefilled,
    })

    await this.convModel.findByIdAndUpdate(conv._id, {
      $set: { typebotSessionActive: true, typebotSessionId: String(session._id) },
      $addToSet: { tags: 'typebot:active' },
    })

    const lang = conv.language ?? 'fr'
    const intro = (lang === 'en' && form.introEn) ? form.introEn : form.intro

    // Skip prefilled steps from the start
    const firstUnansweredIdx = this.findNextStepIdx(form, session)
    if (firstUnansweredIdx === -1) {
      // All steps prefilled — complete immediately
      await this.complete(conv, session, form)
      return null
    }

    session.currentStepIdx = firstUnansweredIdx
    await session.save()

    const firstStep = form.steps[firstUnansweredIdx]
    const firstQuestion = `${intro}\n\n${this.renderQuestion(firstStep, lang)}`
    return { session, firstQuestion }
  }

  /**
   * Handle an inbound text from a conversation that's in form mode.
   * Returns: next question, or completion message.
   */
  async handleAnswer(conv: ConversationDocument, text: string): Promise<FormStepResult> {
    const session = await this.findActiveSession(String(conv._id))
    if (!session) return { done: true }

    const form = getFormByKey(session.formKey)
    if (!form) {
      await this.abandon(conv, session)
      return { done: true, finalSummary: 'Erreur interne : formulaire introuvable.' }
    }

    const currentStep = form.steps[session.currentStepIdx]
    if (!currentStep) {
      const lead = await this.complete(conv, session, form)
      return { done: true, finalSummary: this.outro(form, conv), leadId: lead?._id ? String(lead._id) : null }
    }

    const validation = validateAnswer(currentStep, text)
    if (!validation.ok) {
      return { done: false, errorHint: validation.reason, question: this.renderQuestion(currentStep, conv.language ?? 'fr') }
    }

    session.answers = { ...session.answers, [currentStep.key]: validation.value }
    session.markModified('answers')
    const nextIdx = this.findNextStepIdx(form, session, session.currentStepIdx + 1)

    if (nextIdx === -1) {
      session.currentStepIdx = form.steps.length
      session.status = 'completed'
      session.completedAt = new Date()
      await session.save()
      const lead = await this.complete(conv, session, form)
      return { done: true, finalSummary: this.outro(form, conv), leadId: lead?._id ? String(lead._id) : null }
    }

    session.currentStepIdx = nextIdx
    await session.save()
    const next = form.steps[nextIdx]
    return { done: false, question: this.renderQuestion(next, conv.language ?? 'fr') }
  }

  async abandon(conv: ConversationDocument, session: FormSessionDocument) {
    session.status = 'abandoned'
    await session.save()
    await this.convModel.findByIdAndUpdate(conv._id, {
      $set: { typebotSessionActive: false, typebotSessionId: null },
      $pull: { tags: 'typebot:active' },
    })
  }

  private async complete(conv: ConversationDocument, session: FormSessionDocument, form: FormDefinition) {
    const allAnswers = { ...session.prefilled, ...session.answers }
    const payload = form.toTypebotPayload(allAnswers, { phone: conv.phone, convId: String(conv._id) })

    let lead: any = null
    try {
      lead = await this.leadsService.handleTypebotWebhook(payload, 'whatsapp_form', undefined, form.name)
    } catch (err) {
      this.logger.error(`Lead creation from form failed: ${(err as Error).message}`)
    }

    await this.convModel.findByIdAndUpdate(conv._id, {
      $set: { typebotSessionActive: false, typebotSessionId: null },
      $addToSet: { tags: 'typebot:completed' },
      $pull: { tags: 'typebot:active' },
    })
    session.status = 'completed'
    if (!session.completedAt) session.completedAt = new Date()
    await session.save()
    return lead
  }

  private findNextStepIdx(form: FormDefinition, session: FormSessionDocument, fromIdx = 0): number {
    for (let i = fromIdx; i < form.steps.length; i++) {
      const step = form.steps[i]
      if (step.skipIfPrefilled && (session.prefilled[step.key] || session.answers[step.key])) continue
      return i
    }
    return -1
  }

  private renderQuestion(step: FormStep, lang: 'fr' | 'en'): string {
    const q = lang === 'en' && step.questionEn ? step.questionEn : step.question
    if (step.choices?.length) {
      return `${q}\n${step.choices.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
    }
    return q
  }

  private outro(form: FormDefinition, conv: ConversationDocument): string {
    return conv.language === 'en' && form.outroEn ? form.outroEn : form.outro
  }
}
