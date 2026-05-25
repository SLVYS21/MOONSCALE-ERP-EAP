import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  Plus, Zap, Trash2, Play, Clock, ChevronRight, X,
  ClipboardList, CheckCircle2, GraduationCap, CreditCard, Link2,
  Mail, Globe, Timer, GitBranch, Bell, FileText, Pencil, CheckSquare,
  Sparkles, Layers, RefreshCw, AlarmClock, Circle, AlertTriangle,
  Crosshair, TrendingUp, Trophy, Phone, CalendarClock, UserPlus, Send, Tag, Filter, Users, Repeat,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/services/api'
import type { Automation, AutomationStep, TriggerType, StepType, AudienceConfig } from '@/types'

// ── API ───────────────────────────────────────────────────────────────────────

const fetchAutomations = (): Promise<Automation[]> => api.get('/automations').then((r) => r.data)

const createAutomation = (data: {
  name: string
  description?: string
  triggerType: string
  steps?: AutomationStep[]
}): Promise<Automation> => api.post('/automations', data).then((r) => r.data)

const deleteAutomation = (id: string) => api.delete(`/automations/${id}`)
const toggleActive = (id: string) => api.post(`/automations/${id}/toggle`)
const runManual = (id: string) => api.post(`/automations/${id}/run`)
const previewAudience = (id: string) => api.get(`/automations/${id}/audience-preview`).then((r) => r.data as { entity: string | null; count: number; sample: { name?: string; email?: string; studentEmail?: string; studentName?: string }[] })
const runAudience = (id: string) => api.post(`/automations/${id}/run-audience`).then((r) => r.data as { ran: number })

// ── Metadata ──────────────────────────────────────────────────────────────────

const TRIGGER_META: Record<TriggerType, { label: string; Icon: LucideIcon; color: string }> = {
  form_submitted:   { label: 'Formulaire soumis',    Icon: ClipboardList,  color: 'text-blue-400 bg-blue-500/15' },
  payment_created:  { label: 'Paiement créé',        Icon: CreditCard,     color: 'text-emerald-400 bg-emerald-500/15' },
  payment_treated:  { label: 'Paiement traité',      Icon: CheckCircle2,   color: 'text-green-400 bg-green-500/15' },
  student_created:  { label: 'Étudiant créé',        Icon: GraduationCap,  color: 'text-purple-400 bg-purple-500/15' },
  manual:           { label: 'Déclenchement manuel', Icon: Play,           color: 'text-gray-400 bg-gray-500/15' },
  incoming_webhook: { label: 'Webhook entrant',      Icon: Link2,          color: 'text-orange-400 bg-orange-500/15' },
  reminder_due:     { label: 'Rappel dû',            Icon: AlarmClock,     color: 'text-amber-400 bg-amber-500/15' },
  debt_detected:    { label: 'Débiteur détecté',     Icon: AlertTriangle,  color: 'text-red-400 bg-red-500/15' },
  lead_created:     { label: 'Lead créé',            Icon: Crosshair,      color: 'text-teal-400 bg-teal-500/15' },
  lead_stage_changed: { label: 'Étape lead changée', Icon: TrendingUp,    color: 'text-cyan-400 bg-cyan-500/15' },
  lead_won:         { label: 'Lead converti (Won)',  Icon: Trophy,         color: 'text-yellow-400 bg-yellow-500/15' },
  call_completed:   { label: 'Appel terminé',        Icon: Phone,          color: 'text-indigo-400 bg-indigo-500/15' },
  cron_schedule:         { label: 'Planification',           Icon: CalendarClock,  color: 'text-violet-400 bg-violet-500/15' },
  subscription_created:  { label: 'Souscription créée',      Icon: CheckCircle2,   color: 'text-emerald-400 bg-emerald-500/15' },
  subscription_expiring: { label: 'Souscription expirante',  Icon: AlarmClock,     color: 'text-amber-400 bg-amber-500/15' },
  partial_payment_due:   { label: 'Échéance partielle due',   Icon: AlertTriangle,  color: 'text-red-400 bg-red-500/15' },
  audience_based:        { label: 'Campagne audience',        Icon: Filter,         color: 'text-fuchsia-400 bg-fuchsia-500/15' },
}

const STEP_ICONS: Record<StepType, LucideIcon> = {
  send_email:        Mail,
  http_request:      Globe,
  wait:              Timer,
  condition:         GitBranch,
  notify_team:       Bell,
  add_note:          FileText,
  update_student:    Pencil,
  create_task:       CheckSquare,
  create_payment:    CreditCard,
  create_student:    UserPlus,
  circle_invite:     Send,
  circle_tag_add:      Tag,
  circle_tag_remove:   X,
  create_subscription: Repeat,
}

const STEP_LABELS: Record<StepType, string> = {
  send_email:        'Envoyer un email',
  http_request:      'Requête HTTP',
  wait:              'Attente',
  condition:         'Condition',
  notify_team:       "Notifier l'équipe",
  add_note:          'Ajouter une note',
  update_student:    "Mettre à jour l'étudiant",
  create_task:       'Créer une tâche',
  create_payment:    'Créer un paiement',
  create_student:    'Créer un étudiant',
  circle_invite:       'Inviter dans Circle',
  circle_tag_add:      'Ajouter un tag Circle',
  circle_tag_remove:   'Retirer un tag Circle',
  create_subscription: 'Créer une souscription',
}

// ── Template definitions ──────────────────────────────────────────────────────

interface AutomationTemplate {
  id: string
  name: string
  description: string
  category: string
  Icon: LucideIcon
  triggerType: TriggerType
  steps: Omit<AutomationStep, 'id'>[]
}

const TEMPLATES: AutomationTemplate[] = [
  // ── Étudiants ──────────────────────────────────────────────────────────────
  // {
  //   id: 'welcome-email',
  //   name: 'Email de bienvenue',
  //   description: "Envoyer un email de bienvenue personnalisé dès qu'un étudiant est ajouté au système.",
  //   category: 'Étudiants',
  //   Icon: Sparkles,
  //   triggerType: 'student_created',
  //   steps: [
  //     {
  //       type: 'send_email',
  //       name: 'Email de bienvenue',
  //       config: {
  //         to: '{{student.email}}',
  //         subject: 'Bienvenue {{student.name}} !',
  //         body: 'Bonjour {{student.name}},\n\nNous sommes ravis de vous accueillir dans notre communauté.\n\nVotre inscription a bien été prise en compte et votre dossier est en cours de traitement.\n\nÀ bientôt,\nL\'équipe',
  //       },
  //     },
  //   ],
  // },
  // {
  //   id: 'full-onboarding',
  //   name: 'Onboarding complet',
  //   description: "Email de bienvenue + alerte équipe + note sur le dossier automatiquement à l'inscription.",
  //   category: 'Étudiants',
  //   Icon: Layers,
  //   triggerType: 'student_created',
  //   steps: [
  //     {
  //       type: 'send_email',
  //       name: 'Email de bienvenue',
  //       config: {
  //         to: '{{student.email}}',
  //         subject: 'Bienvenue dans la communauté, {{student.name}} !',
  //         body: 'Bonjour {{student.name}},\n\nVotre inscription est confirmée. Bienvenue !\n\nNous reviendrons vers vous très prochainement avec les prochaines étapes.',
  //       },
  //     },
  //     {
  //       type: 'notify_team',
  //       name: "Alerte équipe",
  //       config: {
  //         recipients: 'all_admins',
  //         subject: 'Nouvel étudiant inscrit : {{student.name}}',
  //         body: "Un nouvel étudiant vient de s'inscrire :\n\nNom : {{student.name}}\nEmail : {{student.email}}\nWhatsApp : {{student.whatsapp}}\nSource : {{student.source}}",
  //       },
  //     },
  //     {
  //       type: 'add_note',
  //       name: "Note d'onboarding",
  //       config: { note: 'Onboarding automatique envoyé.' },
  //     },
  //   ],
  // },
  // {
  //   id: 'sync-crm',
  //   name: 'Synchroniser un CRM externe',
  //   description: 'Créer automatiquement un contact dans votre CRM (HubSpot, Pipedrive…) lors de chaque inscription.',
  //   category: 'Étudiants',
  //   Icon: RefreshCw,
  //   triggerType: 'student_created',
  //   steps: [
  //     {
  //       type: 'http_request',
  //       name: 'Créer contact CRM',
  //       config: {
  //         url: 'https://api.votre-crm.com/contacts',
  //         method: 'POST',
  //         headers: [{ key: 'Authorization', value: 'Bearer VOTRE_API_KEY' }],
  //         requestBody: '{\n  "name": "{{student.name}}",\n  "email": "{{student.email}}",\n  "phone": "{{student.whatsapp}}"\n}',
  //       },
  //     },
  //   ],
  // },

  // // ── Paiements ──────────────────────────────────────────────────────────────
  // {
  //   id: 'payment-confirmation',
  //   name: 'Confirmation de paiement',
  //   description: "Envoyer un reçu par email à l'étudiant dès qu'un paiement est traité.",
  //   category: 'Paiements',
  //   Icon: CreditCard,
  //   triggerType: 'payment_treated',
  //   steps: [
  //     {
  //       type: 'condition',
  //       name: "Vérifier l'email",
  //       config: { field: 'student.email', operator: 'is_not_empty' },
  //     },
  //     {
  //       type: 'send_email',
  //       name: 'Reçu de paiement',
  //       config: {
  //         to: '{{student.email}}',
  //         subject: 'Confirmation de votre paiement — {{payment.amount}} {{payment.currency}}',
  //         body: 'Bonjour {{student.name}},\n\nVotre paiement de {{payment.amount}} {{payment.currency}} a bien été validé.\n\nPlan : {{payment.plan}}\nPasserelle : {{payment.gateway}}\n\nMerci de votre confiance.',
  //       },
  //     },
  //   ],
  // },
  // {
  //   id: 'payment-alert',
  //   name: 'Alerte nouveau paiement',
  //   description: "Notifier toute l'équipe admin dès qu'un paiement arrive en attente de traitement.",
  //   category: 'Paiements',
  //   Icon: AlarmClock,
  //   triggerType: 'payment_created',
  //   steps: [
  //     {
  //       type: 'notify_team',
  //       name: 'Alerte nouveau paiement',
  //       config: {
  //         recipients: 'all_admins',
  //         subject: 'Nouveau paiement à traiter — {{student.name}}',
  //         body: 'Un nouveau paiement vient d\'arriver :\n\nÉtudiant : {{student.name}} ({{student.email}})\nMontant : {{payment.amount}} {{payment.currency}}\nSource : {{payment.source}}\n\nConnectez-vous pour le traiter.',
  //       },
  //     },
  //   ],
  // },
  // {
  //   id: 'payment-slack',
  //   name: 'Notifier Slack / Discord',
  //   description: "Envoyer une notification dans Slack ou Discord à chaque nouveau paiement.",
  //   category: 'Paiements',
  //   Icon: MessageSquare,
  //   triggerType: 'payment_created',
  //   steps: [
  //     {
  //       type: 'http_request',
  //       name: 'Notification Slack',
  //       config: {
  //         url: 'https://hooks.slack.com/services/VOTRE/WEBHOOK/URL',
  //         method: 'POST',
  //         requestBody: '{"text": "Nouveau paiement de {{student.name}} : {{payment.amount}} {{payment.currency}} via {{payment.source}}"}',
  //       },
  //     },
  //   ],
  // },

  // // ── Formulaires ────────────────────────────────────────────────────────────
  // {
  //   id: 'form-lead',
  //   name: 'Suivi de lead formulaire',
  //   description: 'Créer une tâche de suivi et envoyer un accusé de réception après chaque soumission.',
  //   category: 'Formulaires',
  //   Icon: ClipboardList,
  //   triggerType: 'form_submitted',
  //   steps: [
  //     {
  //       type: 'create_task',
  //       name: 'Créer tâche de suivi',
  //       config: {
  //         taskTitle: 'Suivi formulaire — {{form.title}}',
  //         taskDescription: 'Formulaire soumis le {{submittedAt}}.\nÀ contacter rapidement.',
  //         taskPriority: 'medium',
  //       },
  //     },
  //     {
  //       type: 'notify_team',
  //       name: 'Alerter équipe',
  //       config: {
  //         recipients: 'all_admins',
  //         subject: 'Nouveau formulaire soumis : {{form.title}}',
  //         body: 'Un formulaire a été soumis le {{submittedAt}}.\n\nFormulaire : {{form.title}}\n\nConnectez-vous pour consulter les réponses.',
  //       },
  //     },
  //   ],
  // },
  // {
  //   id: 'form-notification',
  //   name: 'Notification de soumission',
  //   description: "Envoyer un email à l'équipe à chaque soumission d'un formulaire spécifique.",
  //   category: 'Formulaires',
  //   Icon: Mail,
  //   triggerType: 'form_submitted',
  //   steps: [
  //     {
  //       type: 'notify_team',
  //       name: 'Email soumission',
  //       config: {
  //         recipients: 'all_admins',
  //         subject: 'Nouvelle soumission : {{form.title}}',
  //         body: 'Un nouveau formulaire {{form.title}} vient d\'être soumis le {{submittedAt}}.',
  //       },
  //     },
  //   ],
  // },

  // // ── Intégrations ───────────────────────────────────────────────────────────
  // {
  //   id: 'webhook-to-team',
  //   name: 'Webhook entrant → équipe',
  //   description: "Recevoir un appel HTTP externe et notifier l'équipe avec les données reçues.",
  //   category: 'Intégrations',
  //   Icon: Link2,
  //   triggerType: 'incoming_webhook',
  //   steps: [
  //     {
  //       type: 'notify_team',
  //       name: 'Notifier équipe',
  //       config: {
  //         recipients: 'all_admins',
  //         subject: 'Webhook reçu',
  //         body: 'Un appel webhook vient d\'être reçu. Consultez les logs pour plus de détails.',
  //       },
  //     },
  //   ],
  // },
  // {
  //   id: 'circle-sync',
  //   name: 'Synchroniser Circle',
  //   description: "Envoyer les informations d'un étudiant vers Circle.so après traitement du paiement.",
  //   category: 'Intégrations',
  //   Icon: Circle,
  //   triggerType: 'payment_treated',
  //   steps: [
  //     {
  //       type: 'condition',
  //       name: 'Produit Formation uniquement',
  //       config: { field: 'payment.product', operator: 'equals', value: 'FORMATION' },
  //     },
  //     {
  //       type: 'http_request',
  //       name: 'Mettre à jour Circle',
  //       config: {
  //         url: 'https://app.circle.so/api/v1/community_members',
  //         method: 'POST',
  //         headers: [
  //           { key: 'Authorization', value: 'Token VOTRE_TOKEN_CIRCLE' },
  //           { key: 'Content-Type', value: 'application/json' },
  //         ],
  //         requestBody: '{\n  "email": "{{student.email}}",\n  "name": "{{student.name}}"\n}',
  //       },
  //     },
  //   ],
  // },

  // ── Cycle de vie ───────────────────────────────────────────────────────────
  {
    id: 'lifecycle-welcome-circle',
    name: 'Bienvenue + lien Circle',
    description: "Envoyer un email de bienvenue avec le lien d'accès Circle dès qu'un paiement Formation est traité.",
    category: 'Cycle de vie',
    Icon: Sparkles,
    triggerType: 'payment_treated',
    steps: [
      {
        type: 'condition',
        name: 'Formation uniquement',
        config: { field: 'payment.product', operator: 'not_equals', value: 'COACHING' },
      },
      {
        type: 'send_email',
        name: 'Email de bienvenue Circle',
        config: {
          to: '{{student.email}}',
          subject: 'Bienvenue {{student.name}} — votre accès est prêt !',
          blocks: [
            { type: 'text', content: 'Bonjour {{student.name}},\n\nVotre paiement a bien été validé. Voici votre lien d\'accès à la communauté Circle :', align: 'left' },
            { type: 'button', label: 'Rejoindre la communauté', url: 'https://app.circle.so', color: '#6366f1', textColor: '#ffffff', radius: 'md', align: 'center' },
            { type: 'text', content: 'À très bientôt,\nL\'équipe', align: 'left' },
          ],
        },
      },
    ],
  },
  {
    id: 'lifecycle-circle-tag',
    name: 'Tag Circle selon le plan',
    description: 'Appliquer automatiquement le tag Circle correspondant au plan de l\'étudiant après paiement.',
    category: 'Cycle de vie',
    Icon: Layers,
    triggerType: 'payment_treated',
    steps: [
      {
        type: 'condition',
        name: 'Plan Elite',
        config: { field: 'payment.plan', operator: 'equals', value: 'Elite' },
      },
      {
        type: 'circle_tag_add',
        name: 'Tag Elite',
        config: { tag: 'Elite' },
      },
    ],
  },
  {
    id: 'lifecycle-reminder',
    name: 'Rappel paiement partiel',
    description: 'Envoyer un email de relance avec bouton de paiement lorsqu\'un rappel est déclenché.',
    category: 'Cycle de vie',
    Icon: AlarmClock,
    triggerType: 'reminder_due',
    steps: [
      {
        type: 'send_email',
        name: 'Email de relance',
        config: {
          to: '{{student.email}}',
          subject: 'Rappel — votre prochain paiement arrive bientôt',
          blocks: [
            { type: 'text', content: 'Bonjour {{student.name}},\n\nNous vous rappelons que votre prochain paiement est prévu le {{reminder.nextPaymentDate}} pour un montant de {{reminder.amountDue}} pour l\'offre {{subscription.offerName}}.', align: 'left' },
            { type: 'button', label: 'Payer maintenant', url: 'https://lien-de-paiement.com', color: '#10b981', textColor: '#ffffff', radius: 'full', align: 'center' },
          ],
        },
      },
    ],
  },
  {
    id: 'lifecycle-debt-suspension',
    name: 'Suspension accès débiteur',
    description: 'Retirer l\'accès Circle et notifier l\'étudiant lorsqu\'une dette est confirmée.',
    category: 'Cycle de vie',
    Icon: Circle,
    triggerType: 'debt_detected',
    steps: [
      {
        type: 'circle_tag_remove',
        name: 'Retirer tag actif',
        config: { tag: 'Premium' },
      },
      {
        type: 'circle_tag_add',
        name: 'Tag suspendu',
        config: { tag: 'Suspendu' },
      },
      {
        type: 'send_email',
        name: 'Email suspension',
        config: {
          to: '{{student.email}}',
          subject: 'Votre accès a été suspendu',
          blocks: [
            { type: 'text', content: 'Bonjour {{student.name}},\n\nSuite au non-paiement de votre solde dû, votre accès à la communauté a été temporairement suspendu.\n\nPour le restaurer, veuillez régulariser votre situation :', align: 'left' },
            { type: 'button', label: 'Régulariser mon compte', url: 'https://lien-de-paiement.com', color: '#ef4444', textColor: '#ffffff', radius: 'md', align: 'center' },
          ],
        },
      },
    ],
  },
  {
    id: 'lifecycle-restore-access',
    name: 'Restauration après paiement',
    description: 'Restaurer l\'accès Circle et envoyer un email de confirmation après régularisation d\'un débiteur.',
    category: 'Cycle de vie',
    Icon: RefreshCw,
    triggerType: 'payment_treated',
    steps: [
      {
        type: 'condition',
        name: 'Étudiant débiteur',
        config: { field: 'student.debtStatus', operator: 'equals', value: 'confirmed' },
      },
      {
        type: 'circle_tag_remove',
        name: 'Retirer tag suspendu',
        config: { tag: 'Suspendu' },
      },
      {
        type: 'circle_tag_add',
        name: 'Tag plan restauré',
        config: { tag: '{{payment.plan}}' },
      },
      {
        type: 'send_email',
        name: 'Email restauration',
        config: {
          to: '{{student.email}}',
          subject: 'Votre accès a été restauré',
          blocks: [
            { type: 'text', content: 'Bonjour {{student.name}},\n\nVotre paiement a bien été reçu et votre accès à la communauté a été restauré. Bon retour parmi nous !', align: 'left' },
            { type: 'button', label: 'Accéder à la communauté', url: 'https://app.circle.so', color: '#6366f1', textColor: '#ffffff', radius: 'md', align: 'center' },
          ],
        },
      },
    ],
  },
  {
    id: 'lifecycle-lead-won',
    name: 'Lead converti en étudiant',
    description: 'Notifier l\'équipe et mettre à jour le CRM lorsqu\'un lead devient étudiant suite à un paiement.',
    category: 'Cycle de vie',
    Icon: CreditCard,
    triggerType: 'lead_won',
    steps: [
      {
        type: 'notify_team',
        name: 'Alerte conversion',
        config: {
          recipients: 'all_admins',
          subject: '🎉 {{lead.name}} est maintenant étudiant !',
          body: 'Le lead {{lead.name}} ({{lead.email}}) vient d\'être converti en étudiant suite à un paiement traité.',
        },
      },
    ],
  },
]

const CATEGORIES = ['Tous', 'Étudiants', 'Paiements', 'Formulaires', 'Intégrations', 'Cycle de vie']

const TRIGGER_OPTIONS: TriggerType[] = [
  'form_submitted', 'payment_created', 'payment_treated', 'student_created',
  'manual', 'incoming_webhook', 'cron_schedule',
  'subscription_created', 'subscription_expiring', 'partial_payment_due',
  'audience_based',
  'lead_created', 'lead_stage_changed', 'lead_won',
  'reminder_due', 'debt_detected',
]

// ── Helper ────────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

// ── Template modal ────────────────────────────────────────────────────────────

function TemplateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [category, setCategory] = useState('Tous')
  const [selected, setSelected] = useState<AutomationTemplate | null>(null)
  const [fromScratch, setFromScratch] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [scratchName, setScratchName] = useState('')
  const [triggerType, setTriggerType] = useState<TriggerType>('manual')
  const qc = useQueryClient()

  const filtered = TEMPLATES.filter((t) => category === 'Tous' || t.category === category)

  const createMut = useMutation({
    mutationFn: createAutomation,
    onSuccess: (a: Automation) => {
      qc.invalidateQueries({ queryKey: ['automations'] })
      onCreated(a._id)
    },
  })

  const handleSelectTemplate = (t: AutomationTemplate) => {
    setSelected(t)
    setFromScratch(false)
    setTemplateName(t.name)
  }

  const handleFromScratch = () => {
    setSelected(null)
    setFromScratch(true)
    setScratchName('')
  }

  const handleCreateFromTemplate = () => {
    if (!selected || !templateName.trim()) return
    const steps: AutomationStep[] = selected.steps.map((s) => ({ ...s, id: uid() }))
    createMut.mutate({ name: templateName.trim(), triggerType: selected.triggerType, steps })
  }

  const handleCreateFromScratch = () => {
    if (!scratchName.trim()) return
    createMut.mutate({ name: scratchName.trim(), triggerType })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="flex h-[680px] w-full max-w-4xl overflow-hidden rounded-2xl border border-gray-800 bg-gray-950 shadow-2xl">

        {/* Left — template list */}
        <div className="flex w-72 shrink-0 flex-col border-r border-gray-800 bg-gray-900">
          <div className="shrink-0 border-b border-gray-800 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Choisir un modèle</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                    category === cat
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200',
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {filtered.map((t) => {
              const TIcon = TRIGGER_META[t.triggerType].Icon
              return (
                <button
                  key={t.id}
                  onClick={() => handleSelectTemplate(t)}
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                    selected?.id === t.id
                      ? 'bg-indigo-600/15 text-indigo-300'
                      : 'text-gray-300 hover:bg-gray-800',
                  )}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-700">
                    <t.Icon className="h-3.5 w-3.5 text-gray-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.name}</p>
                    <p className="flex items-center gap-1 text-xs text-gray-500">
                      <TIcon className="h-3 w-3" />
                      {t.steps.length} étape{t.steps.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </button>
              )
            })}

            <div className="my-2 border-t border-gray-800" />

            <button
              onClick={handleFromScratch}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                fromScratch
                  ? 'bg-indigo-600/15 text-indigo-300'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-300',
              )}
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-600">
                <Plus className="h-3.5 w-3.5" />
              </div>
              <div>
                <p className="text-sm font-medium">Depuis zéro</p>
                <p className="text-xs text-gray-500">Choisir le déclencheur</p>
              </div>
            </button>
          </div>
        </div>

        {/* Right — preview / form */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-6 py-4">
            <h2 className="text-base font-semibold text-gray-100">
              {selected ? selected.name : fromScratch ? 'Nouvelle automatisation' : 'Sélectionnez un modèle'}
            </h2>
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {!selected && !fromScratch && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-800">
                  <Zap className="h-8 w-8 text-gray-600" />
                </div>
                <p className="text-base font-medium text-gray-400">Choisissez un modèle</p>
                <p className="mt-1 text-sm text-gray-600">ou créez depuis zéro depuis la liste à gauche</p>
              </div>
            )}

            {selected && (() => {
              const trigMeta = TRIGGER_META[selected.triggerType]
              return (
                <div className="space-y-5">
                  <div>
                    <div className="mb-2 flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-800">
                        <selected.Icon className="h-5 w-5 text-gray-200" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-100">{selected.name}</p>
                        <span className={cn('mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', trigMeta.color)}>
                          <trigMeta.Icon className="h-3 w-3" />
                          {trigMeta.label}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-400">{selected.description}</p>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Étapes du workflow</p>
                    <div className="space-y-2">
                      {selected.steps.map((step, i) => {
                        const SI = STEP_ICONS[step.type]
                        return (
                          <div key={i} className="flex items-center gap-2.5 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-700 text-xs text-gray-400">{i + 1}</span>
                            <SI className="h-4 w-4 shrink-0 text-gray-400" />
                            <div>
                              <p className="text-sm font-medium text-gray-200">{step.name || STEP_LABELS[step.type]}</p>
                              <p className="text-xs text-gray-500">{STEP_LABELS[step.type]}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="border-t border-gray-800 pt-5">
                    <label className="mb-1.5 block text-xs font-medium text-gray-400">Nom de l'automatisation</label>
                    <input
                      autoFocus
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <button
                    onClick={handleCreateFromTemplate}
                    disabled={!templateName.trim() || createMut.isPending}
                    className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {createMut.isPending ? 'Création...' : 'Créer et configurer →'}
                  </button>
                </div>
              )
            })()}

            {fromScratch && (
              <div className="space-y-5">
                <p className="text-sm text-gray-400">Partez de zéro et construisez votre workflow étape par étape.</p>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">Nom *</label>
                  <input
                    autoFocus
                    value={scratchName}
                    onChange={(e) => setScratchName(e.target.value)}
                    placeholder="ex: Email de bienvenue après inscription"
                    className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">Déclencheur</label>
                  <div className="grid grid-cols-2 gap-2">
                    {TRIGGER_OPTIONS.map((t) => {
                      const meta = TRIGGER_META[t]
                      return (
                        <button
                          key={t}
                          onClick={() => setTriggerType(t)}
                          className={cn(
                            'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors',
                            triggerType === t
                              ? 'border-indigo-500 bg-indigo-600/15 text-indigo-300'
                              : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:bg-gray-800/50',
                          )}
                        >
                          <meta.Icon className="h-3.5 w-3.5 shrink-0" />
                          <span>{meta.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="border-t border-gray-800 pt-2">
                  <button
                    onClick={handleCreateFromScratch}
                    disabled={!scratchName.trim() || createMut.isPending}
                    className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {createMut.isPending ? 'Création...' : 'Créer et configurer →'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Campaign run modal ────────────────────────────────────────────────────────

function CampaignRunModal({ automation, onClose }: { automation: Automation; onClose: () => void }) {
  const qc = useQueryClient()
  const [result, setResult] = useState<{ ran: number } | null>(null)

  const audience = automation.trigger.config?.audience as AudienceConfig | undefined

  const { data: preview, isLoading: loadingPreview } = useQuery({
    queryKey: ['audience-preview', automation._id],
    queryFn: () => previewAudience(automation._id),
  })

  const runMut = useMutation({
    mutationFn: () => runAudience(automation._id),
    onSuccess: (data) => {
      setResult(data)
      qc.invalidateQueries({ queryKey: ['automations'] })
    },
  })

  const entityLabel = audience?.entity === 'payment' ? 'paiement(s)' : 'étudiant(s)'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-gray-900 border border-gray-800 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/30">
            <Users className="h-4 w-4 text-fuchsia-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-100">Lancer la campagne</h2>
            <p className="text-xs text-gray-500">{automation.name}</p>
          </div>
        </div>

        {!result ? (
          <>
            <div className="rounded-lg border border-gray-800 bg-gray-950 p-4 mb-4">
              {loadingPreview ? (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <div className="h-3 w-3 animate-spin rounded-full border border-gray-500 border-t-transparent" />
                  Calcul de l'audience…
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500">Audience ciblée</span>
                    <span className="text-sm font-bold text-fuchsia-300">
                      {preview?.count ?? 0} {entityLabel}
                    </span>
                  </div>
                  {(preview?.sample?.length ?? 0) > 0 && (
                    <div className="space-y-1">
                      {preview!.sample.slice(0, 3).map((s, i) => (
                        <div key={i} className="text-xs text-gray-500">
                          {s.name ?? s.studentName ?? '—'} · {s.email ?? s.studentEmail ?? '—'}
                        </div>
                      ))}
                      {preview!.count > 3 && (
                        <p className="text-xs text-gray-600">+ {preview!.count - 3} autre(s)…</p>
                      )}
                    </div>
                  )}
                  {(preview?.count ?? 0) === 0 && (
                    <p className="text-xs text-gray-600">Aucune entité ne correspond aux filtres.</p>
                  )}
                </>
              )}
            </div>

            <p className="text-xs text-gray-500 mb-4">
              L'automatisation sera exécutée une fois pour chaque entité correspondante. Cette action est irréversible.
            </p>

            <div className="flex justify-end gap-3">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">
                Annuler
              </button>
              <button
                disabled={runMut.isPending || (preview?.count ?? 0) === 0}
                onClick={() => runMut.mutate()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-700 text-sm text-white font-medium disabled:opacity-50 transition-colors"
              >
                {runMut.isPending ? (
                  <>
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border border-white border-t-transparent" />
                    Exécution…
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    Lancer ({preview?.count ?? 0})
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-100 mb-1">Campagne lancée</p>
            <p className="text-xs text-gray-500">
              {result.ran} {entityLabel} traité(s)
            </p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-200 transition-colors"
            >
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Automation card ───────────────────────────────────────────────────────────

function AutomationCard({ automation }: { automation: Automation }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const meta = TRIGGER_META[automation.trigger.type]
  const isAudience = automation.trigger.type === 'audience_based'
  const [showCampaign, setShowCampaign] = useState(false)

  const toggleMut = useMutation({
    mutationFn: () => toggleActive(automation._id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
  })

  const runMut = useMutation({
    mutationFn: () => runManual(automation._id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteAutomation(automation._id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations'] }),
  })

  return (
    <>
      {showCampaign && (
        <CampaignRunModal automation={automation} onClose={() => setShowCampaign(false)} />
      )}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 hover:border-gray-700 transition-colors">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', meta.color)}>
              <meta.Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold text-gray-100" title={automation.name}>{automation.name}</h3>
              <p className="truncate text-xs text-gray-500">{meta.label}</p>
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); toggleMut.mutate() }}
            disabled={toggleMut.isPending}
            className={cn('relative h-5 w-9 shrink-0 overflow-hidden rounded-full p-0 transition-colors', automation.isActive ? 'bg-indigo-600' : 'bg-gray-700')}
          >
            <span className={cn('absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', automation.isActive ? 'translate-x-4' : 'translate-x-0')} />
          </button>
        </div>

        <div className="mb-4 flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Zap className="h-3.5 w-3.5" />
            {automation.steps.length} étape{automation.steps.length !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1">
            <Play className="h-3.5 w-3.5" />
            {automation.runCount} exécution{automation.runCount !== 1 ? 's' : ''}
          </span>
          {automation.lastRunAt && (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {new Date(automation.lastRunAt).toLocaleDateString('fr-FR')}
            </span>
          )}
          {isAudience && automation.trigger.config?.audience && (
            <span className="flex items-center gap-1 text-fuchsia-400">
              <Users className="h-3 w-3" />
              {automation.trigger.config.audience.entity === 'student' ? 'Étudiants' : 'Paiements'}
              {(automation.trigger.config.audience.filters?.length ?? 0) > 0 &&
                ` · ${automation.trigger.config.audience.filters.length} filtre(s)`
              }
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-gray-800 pt-3">
          <button
            onClick={() => navigate(`/automations/${automation._id}`)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600/10 px-3 py-1.5 text-xs font-medium text-indigo-400 hover:bg-indigo-600/20 transition-colors"
          >
            Configurer
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          {isAudience ? (
            <button
              onClick={() => setShowCampaign(true)}
              title="Lancer la campagne"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-fuchsia-400 hover:bg-fuchsia-500/10 transition-colors"
            >
              <Users className="h-3.5 w-3.5" />
              Lancer
            </button>
          ) : (
            <button
              onClick={() => runMut.mutate()}
              disabled={runMut.isPending}
              title="Exécuter maintenant"
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-emerald-400 transition-colors"
            >
              <Play className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => { if (confirm('Supprimer cette automatisation ?')) deleteMut.mutate() }}
            disabled={deleteMut.isPending}
            title="Supprimer"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function AutomationsPage() {
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)

  const { data: automations = [], isLoading } = useQuery({
    queryKey: ['automations'],
    queryFn: fetchAutomations,
  })

  const activeCount = automations.filter((a) => a.isActive).length

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-100">Automatisations</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {automations.length} workflow{automations.length !== 1 ? 's' : ''} · {activeCount} actif{activeCount !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nouvelle automatisation
        </button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-gray-500">Chargement...</div>
      ) : automations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-800">
            <Zap className="h-8 w-8 text-gray-600" />
          </div>
          <h3 className="text-base font-medium text-gray-300">Aucune automatisation</h3>
          <p className="mt-1 text-sm text-gray-500">Créez des workflows qui s'exécutent automatiquement</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Créer un workflow
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {automations.map((a) => (
            <AutomationCard key={a._id} automation={a} />
          ))}
        </div>
      )}

      {showCreate && (
        <TemplateModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); navigate(`/automations/${id}`) }}
        />
      )}
    </div>
  )
}
