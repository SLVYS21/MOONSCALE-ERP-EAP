import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  Plus, Zap, Trash2, Play, Clock, ChevronRight, X,
  ClipboardList, CheckCircle2, GraduationCap, CreditCard, Link2,
  Mail, Globe, Timer, GitBranch, Bell, FileText, Pencil, CheckSquare,
  Sparkles, Layers, RefreshCw, AlarmClock, MessageSquare, Circle, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/services/api'
import type { Automation, AutomationStep, TriggerType, StepType } from '@/types'

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
}

const STEP_ICONS: Record<StepType, LucideIcon> = {
  send_email:     Mail,
  http_request:   Globe,
  wait:           Timer,
  condition:      GitBranch,
  notify_team:    Bell,
  add_note:       FileText,
  update_student: Pencil,
  create_task:    CheckSquare,
}

const STEP_LABELS: Record<StepType, string> = {
  send_email:     'Envoyer un email',
  http_request:   'Requête HTTP',
  wait:           'Attente',
  condition:      'Condition',
  notify_team:    "Notifier l'équipe",
  add_note:       'Ajouter une note',
  update_student: "Mettre à jour l'étudiant",
  create_task:    'Créer une tâche',
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
  {
    id: 'welcome-email',
    name: 'Email de bienvenue',
    description: "Envoyer un email de bienvenue personnalisé dès qu'un étudiant est ajouté au système.",
    category: 'Étudiants',
    Icon: Sparkles,
    triggerType: 'student_created',
    steps: [
      {
        type: 'send_email',
        name: 'Email de bienvenue',
        config: {
          to: '{{student.email}}',
          subject: 'Bienvenue {{student.name}} !',
          body: 'Bonjour {{student.name}},\n\nNous sommes ravis de vous accueillir dans notre communauté.\n\nVotre inscription a bien été prise en compte et votre dossier est en cours de traitement.\n\nÀ bientôt,\nL\'équipe',
        },
      },
    ],
  },
  {
    id: 'full-onboarding',
    name: 'Onboarding complet',
    description: "Email de bienvenue + alerte équipe + note sur le dossier automatiquement à l'inscription.",
    category: 'Étudiants',
    Icon: Layers,
    triggerType: 'student_created',
    steps: [
      {
        type: 'send_email',
        name: 'Email de bienvenue',
        config: {
          to: '{{student.email}}',
          subject: 'Bienvenue dans la communauté, {{student.name}} !',
          body: 'Bonjour {{student.name}},\n\nVotre inscription est confirmée. Bienvenue !\n\nNous reviendrons vers vous très prochainement avec les prochaines étapes.',
        },
      },
      {
        type: 'notify_team',
        name: "Alerte équipe",
        config: {
          recipients: 'all_admins',
          subject: 'Nouvel étudiant inscrit : {{student.name}}',
          body: "Un nouvel étudiant vient de s'inscrire :\n\nNom : {{student.name}}\nEmail : {{student.email}}\nWhatsApp : {{student.whatsapp}}\nSource : {{student.source}}",
        },
      },
      {
        type: 'add_note',
        name: "Note d'onboarding",
        config: { note: 'Onboarding automatique envoyé.' },
      },
    ],
  },
  {
    id: 'sync-crm',
    name: 'Synchroniser un CRM externe',
    description: 'Créer automatiquement un contact dans votre CRM (HubSpot, Pipedrive…) lors de chaque inscription.',
    category: 'Étudiants',
    Icon: RefreshCw,
    triggerType: 'student_created',
    steps: [
      {
        type: 'http_request',
        name: 'Créer contact CRM',
        config: {
          url: 'https://api.votre-crm.com/contacts',
          method: 'POST',
          headers: [{ key: 'Authorization', value: 'Bearer VOTRE_API_KEY' }],
          requestBody: '{\n  "name": "{{student.name}}",\n  "email": "{{student.email}}",\n  "phone": "{{student.whatsapp}}"\n}',
        },
      },
    ],
  },

  // ── Paiements ──────────────────────────────────────────────────────────────
  {
    id: 'payment-confirmation',
    name: 'Confirmation de paiement',
    description: "Envoyer un reçu par email à l'étudiant dès qu'un paiement est traité.",
    category: 'Paiements',
    Icon: CreditCard,
    triggerType: 'payment_treated',
    steps: [
      {
        type: 'condition',
        name: "Vérifier l'email",
        config: { field: 'student.email', operator: 'is_not_empty' },
      },
      {
        type: 'send_email',
        name: 'Reçu de paiement',
        config: {
          to: '{{student.email}}',
          subject: 'Confirmation de votre paiement — {{payment.amount}} {{payment.currency}}',
          body: 'Bonjour {{student.name}},\n\nVotre paiement de {{payment.amount}} {{payment.currency}} a bien été validé.\n\nPlan : {{payment.plan}}\nPasserelle : {{payment.gateway}}\n\nMerci de votre confiance.',
        },
      },
    ],
  },
  {
    id: 'payment-alert',
    name: 'Alerte nouveau paiement',
    description: "Notifier toute l'équipe admin dès qu'un paiement arrive en attente de traitement.",
    category: 'Paiements',
    Icon: AlarmClock,
    triggerType: 'payment_created',
    steps: [
      {
        type: 'notify_team',
        name: 'Alerte nouveau paiement',
        config: {
          recipients: 'all_admins',
          subject: 'Nouveau paiement à traiter — {{student.name}}',
          body: 'Un nouveau paiement vient d\'arriver :\n\nÉtudiant : {{student.name}} ({{student.email}})\nMontant : {{payment.amount}} {{payment.currency}}\nSource : {{payment.source}}\n\nConnectez-vous pour le traiter.',
        },
      },
    ],
  },
  {
    id: 'payment-slack',
    name: 'Notifier Slack / Discord',
    description: "Envoyer une notification dans Slack ou Discord à chaque nouveau paiement.",
    category: 'Paiements',
    Icon: MessageSquare,
    triggerType: 'payment_created',
    steps: [
      {
        type: 'http_request',
        name: 'Notification Slack',
        config: {
          url: 'https://hooks.slack.com/services/VOTRE/WEBHOOK/URL',
          method: 'POST',
          requestBody: '{"text": "Nouveau paiement de {{student.name}} : {{payment.amount}} {{payment.currency}} via {{payment.source}}"}',
        },
      },
    ],
  },

  // ── Formulaires ────────────────────────────────────────────────────────────
  {
    id: 'form-lead',
    name: 'Suivi de lead formulaire',
    description: 'Créer une tâche de suivi et envoyer un accusé de réception après chaque soumission.',
    category: 'Formulaires',
    Icon: ClipboardList,
    triggerType: 'form_submitted',
    steps: [
      {
        type: 'create_task',
        name: 'Créer tâche de suivi',
        config: {
          taskTitle: 'Suivi formulaire — {{form.title}}',
          taskDescription: 'Formulaire soumis le {{submittedAt}}.\nÀ contacter rapidement.',
          taskPriority: 'medium',
        },
      },
      {
        type: 'notify_team',
        name: 'Alerter équipe',
        config: {
          recipients: 'all_admins',
          subject: 'Nouveau formulaire soumis : {{form.title}}',
          body: 'Un formulaire a été soumis le {{submittedAt}}.\n\nFormulaire : {{form.title}}\n\nConnectez-vous pour consulter les réponses.',
        },
      },
    ],
  },
  {
    id: 'form-notification',
    name: 'Notification de soumission',
    description: "Envoyer un email à l'équipe à chaque soumission d'un formulaire spécifique.",
    category: 'Formulaires',
    Icon: Mail,
    triggerType: 'form_submitted',
    steps: [
      {
        type: 'notify_team',
        name: 'Email soumission',
        config: {
          recipients: 'all_admins',
          subject: 'Nouvelle soumission : {{form.title}}',
          body: 'Un nouveau formulaire {{form.title}} vient d\'être soumis le {{submittedAt}}.',
        },
      },
    ],
  },

  // ── Intégrations ───────────────────────────────────────────────────────────
  {
    id: 'webhook-to-team',
    name: 'Webhook entrant → équipe',
    description: "Recevoir un appel HTTP externe et notifier l'équipe avec les données reçues.",
    category: 'Intégrations',
    Icon: Link2,
    triggerType: 'incoming_webhook',
    steps: [
      {
        type: 'notify_team',
        name: 'Notifier équipe',
        config: {
          recipients: 'all_admins',
          subject: 'Webhook reçu',
          body: 'Un appel webhook vient d\'être reçu. Consultez les logs pour plus de détails.',
        },
      },
    ],
  },
  {
    id: 'circle-sync',
    name: 'Synchroniser Circle',
    description: "Envoyer les informations d'un étudiant vers Circle.so après traitement du paiement.",
    category: 'Intégrations',
    Icon: Circle,
    triggerType: 'payment_treated',
    steps: [
      {
        type: 'condition',
        name: 'Produit Formation uniquement',
        config: { field: 'payment.product', operator: 'equals', value: 'FORMATION' },
      },
      {
        type: 'http_request',
        name: 'Mettre à jour Circle',
        config: {
          url: 'https://app.circle.so/api/v1/community_members',
          method: 'POST',
          headers: [
            { key: 'Authorization', value: 'Token VOTRE_TOKEN_CIRCLE' },
            { key: 'Content-Type', value: 'application/json' },
          ],
          requestBody: '{\n  "email": "{{student.email}}",\n  "name": "{{student.name}}"\n}',
        },
      },
    ],
  },
]

const CATEGORIES = ['Tous', 'Étudiants', 'Paiements', 'Formulaires', 'Intégrations']

const TRIGGER_OPTIONS: TriggerType[] = [
  'form_submitted', 'payment_created', 'payment_treated', 'student_created', 'manual', 'incoming_webhook',
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

// ── Automation card ───────────────────────────────────────────────────────────

function AutomationCard({ automation }: { automation: Automation }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const meta = TRIGGER_META[automation.trigger.type]

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
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-5 hover:border-gray-700 transition-colors">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', meta.color)}>
            <meta.Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-gray-100">{automation.name}</h3>
            <p className="text-xs text-gray-500">{meta.label}</p>
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); toggleMut.mutate() }}
          disabled={toggleMut.isPending}
          className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', automation.isActive ? 'bg-indigo-600' : 'bg-gray-700')}
        >
          <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', automation.isActive ? 'translate-x-4' : 'translate-x-0.5')} />
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
      </div>

      <div className="flex items-center gap-2 border-t border-gray-800 pt-3">
        <button
          onClick={() => navigate(`/automations/${automation._id}`)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600/10 px-3 py-1.5 text-xs font-medium text-indigo-400 hover:bg-indigo-600/20 transition-colors"
        >
          Configurer
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => runMut.mutate()}
          disabled={runMut.isPending}
          title="Exécuter maintenant"
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-emerald-400 transition-colors"
        >
          <Play className="h-4 w-4" />
        </button>
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
