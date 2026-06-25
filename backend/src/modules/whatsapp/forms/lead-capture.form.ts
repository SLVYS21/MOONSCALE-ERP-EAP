import type { FormDefinition } from './form-definition'

export const LEAD_CAPTURE_FORM: FormDefinition = {
  key: 'lead_capture',
  name: 'Capture lead — Formation EAP',
  intro:
    "Top ! Je vais te poser quelques questions courtes pour qu'on puisse te recontacter et te proposer ce qui te correspond le mieux. 4 questions, ça prend 2 minutes.",
  introEn:
    "Great! I'll ask you a few quick questions so we can get back to you with what fits best. 4 questions, takes 2 minutes.",
  outro:
    "C'est noté, merci ! Un membre de l'équipe va te recontacter rapidement. Tu peux aussi continuer à me parler ici si tu as une question. 👌",
  outroEn:
    "Got it, thanks! A team member will get back to you shortly. Feel free to keep chatting with me if you have any other question. 👌",
  steps: [
    {
      key: 'fullname',
      question: "Pour commencer : tes prénom et nom ?",
      questionEn: "First: your first and last name?",
      validators: ['required'],
      skipIfPrefilled: true,
    },
    {
      key: 'email',
      question: "Ton email (on s'en sert pour t'envoyer la confirmation)",
      questionEn: "Your email (used to send confirmation)",
      validators: ['required', 'email'],
      skipIfPrefilled: true,
    },
    {
      key: 'pays',
      question: "Dans quel pays vis-tu ?",
      questionEn: "What country do you live in?",
      validators: ['required'],
    },
    {
      key: 'motivation',
      question: "En 1 phrase : qu'est-ce qui te motive à te lancer en e-commerce ?",
      questionEn: "In one sentence: what's motivating you to get into e-commerce?",
      validators: ['required'],
    },
  ],
  toTypebotPayload(answers, ctx) {
    const fullname = (answers.fullname ?? '').trim()
    const firstSpace = fullname.indexOf(' ')
    const prenom = firstSpace > 0 ? fullname.slice(0, firstSpace) : fullname
    const nom = firstSpace > 0 ? fullname.slice(firstSpace + 1) : ''

    return {
      submittedAt: new Date().toISOString(),
      message: 'Submitted via WhatsApp form runner',
      Prenom: prenom,
      Nom: nom,
      Email: answers.email ?? '',
      WhatsApp: ctx.phone,
      'Pays  de résidence': answers.pays ?? '',
      'Motivation formation présentielle': answers.motivation ?? '',
      _source: 'whatsapp_form_runner',
      _conversationId: ctx.convId,
    }
  },
}

export const ALL_FORMS: FormDefinition[] = [LEAD_CAPTURE_FORM]

export function getFormByKey(key: string): FormDefinition | undefined {
  return ALL_FORMS.find((f) => f.key === key)
}
