export type StepValidator = 'required' | 'email' | 'phone' | 'number' | 'choice'

export interface FormStep {
  key: string
  question: string
  questionEn?: string
  validators?: StepValidator[]
  choices?: string[]
  skipIfPrefilled?: boolean
  hint?: string
}

export interface FormDefinition {
  key: string
  name: string
  intro: string
  introEn?: string
  outro: string
  outroEn?: string
  steps: FormStep[]
  /**
   * Maps form answers (by step.key) into the payload sent to the Typebot webhook.
   * The webhook handler (`leadsService.handleTypebotWebhook`) expects keys like
   * Prenom, Nom, Email, WhatsApp, etc.
   */
  toTypebotPayload(answers: Record<string, string>, ctx: { phone: string; convId: string }): Record<string, unknown>
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateAnswer(step: FormStep, raw: string): { ok: true; value: string } | { ok: false; reason: string } {
  const value = raw.trim()

  for (const v of step.validators ?? []) {
    if (v === 'required' && !value) return { ok: false, reason: "Cette réponse est obligatoire — peux-tu réessayer ?" }
    if (v === 'email' && !EMAIL_RE.test(value)) return { ok: false, reason: "Cet email n'a pas l'air valide. Peux-tu vérifier ?" }
    if (v === 'number' && Number.isNaN(Number(value.replace(/[^\d.,-]/g, '').replace(',', '.')))) {
      return { ok: false, reason: "Donne-moi un nombre s'il te plaît." }
    }
    if (v === 'choice' && step.choices && !step.choices.some((c) => c.toLowerCase() === value.toLowerCase())) {
      return { ok: false, reason: `Choisis parmi : ${step.choices.join(', ')}` }
    }
  }
  return { ok: true, value }
}
