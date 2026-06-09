import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeft, Zap, Plus, Trash2, Play, CheckCircle2, XCircle,
  SkipForward, RefreshCw, ChevronDown, Copy,
  ClipboardList, CreditCard, GraduationCap, Link2,
  Mail, Globe, Timer, GitBranch, Bell, FileText, Pencil, CheckSquare,
  AlarmClock, AlertTriangle, Crosshair, TrendingUp, Trophy, Phone,
  CalendarClock, UserPlus, Send, Tag, X as TagX, Filter, Users, Repeat,
  AlignLeft, AlignCenter, AlignRight, Image, MousePointerClick, Minus, MoveUp, MoveDown,
} from 'lucide-react'
import type { StepCondition, AudienceFilter, AudienceConfig } from '@/types'
import { cn } from '@/lib/utils'
import api from '@/services/api'
import type { Automation, AutomationStep, AutomationRun, StepType, TriggerType, Form, Offer, EmailBlock } from '@/types'

// ── API ───────────────────────────────────────────────────────────────────────

const fetchAutomation = (id: string): Promise<Automation> =>
  api.get(`/automations/${id}`).then((r) => r.data)

const saveAutomation = (
  id: string,
  data: Partial<Pick<Automation, 'name' | 'description' | 'trigger' | 'steps'>>,
): Promise<Automation> => api.patch(`/automations/${id}`, data).then((r) => r.data)

const toggleActive = (id: string): Promise<Automation> =>
  api.post(`/automations/${id}/toggle`).then((r) => r.data)

const runManual = (id: string) => api.post(`/automations/${id}/run`).then((r) => r.data)
const previewAudience = (id: string) => api.get(`/automations/${id}/audience-preview`).then((r) => r.data as { entity: string | null; count: number; sample: { name?: string; email?: string; studentEmail?: string; studentName?: string }[] })
const runAudience = (id: string) => api.post(`/automations/${id}/run-audience`).then((r) => r.data as { ran: number })

const fetchRuns = (id: string): Promise<{ data: AutomationRun[]; total: number }> =>
  api.get(`/automations/${id}/runs?page=1&limit=30`).then((r) => r.data)

const fetchForms = (): Promise<Form[]> =>
  api.get('/forms').then((r) => (Array.isArray(r.data) ? r.data : (r.data.data ?? [])))

interface CirclePlan { id: number; name: string; is_public: boolean; color?: string | null }
const fetchCirclePlans = (): Promise<CirclePlan[]> =>
  api.get('/automations/circle-plans').then((r) => r.data)

// ── Metadata ──────────────────────────────────────────────────────────────────

const TRIGGER_META: Record<TriggerType, { label: string; Icon: LucideIcon; color: string; desc: string }> = {
  form_submitted:   { label: 'Formulaire soumis',    Icon: ClipboardList,  color: 'text-blue-600 bg-blue-500/10 border-blue-500/30',    desc: 'Se déclenche quand un formulaire est soumis' },
  payment_created:  { label: 'Paiement créé',        Icon: CreditCard,     color: 'text-emerald-600 bg-emerald-50 border-emerald-500/30', desc: 'Se déclenche quand un paiement est créé' },
  payment_treated:  { label: 'Paiement traité',      Icon: CheckCircle2,   color: 'text-green-600 bg-green-500/10 border-green-500/30',  desc: 'Se déclenche quand un paiement est traité' },
  student_created:  { label: 'Étudiant créé',        Icon: GraduationCap,  color: 'text-purple-700 bg-purple-500/10 border-purple-500/30', desc: 'Se déclenche quand un étudiant est créé' },
  manual:           { label: 'Déclenchement manuel', Icon: Play,           color: 'text-gray-400 bg-gray-500/10 border-gray-500/30',    desc: 'Déclenchement manuel uniquement' },
  incoming_webhook: { label: 'Webhook entrant',      Icon: Link2,          color: 'text-orange-600 bg-orange-500/10 border-orange-500/30', desc: 'Se déclenche par un appel HTTP externe' },
  reminder_due:     { label: 'Rappel dû',            Icon: AlarmClock,     color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',   desc: 'Se déclenche quand un rappel de paiement est dû' },
  debt_detected:    { label: 'Débiteur détecté',     Icon: AlertTriangle,  color: 'text-red-400 bg-red-500/10 border-red-500/30',         desc: 'Se déclenche quand un étudiant est identifié comme débiteur potentiel' },
  lead_created:     { label: 'Lead créé',            Icon: Crosshair,      color: 'text-teal-400 bg-teal-500/10 border-teal-500/30',      desc: 'Se déclenche quand un nouveau lead entre dans le système' },
  lead_stage_changed: { label: 'Étape lead changée', Icon: TrendingUp,    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',      desc: "Se déclenche quand l'étape pipeline d'un lead change" },
  lead_won:         { label: 'Lead converti (Won)',  Icon: Trophy,         color: 'text-yellow-600 bg-yellow-500/10 border-yellow-500/30', desc: 'Se déclenche quand un lead est marqué Won' },
  call_completed:   { label: 'Appel terminé',        Icon: Phone,          color: 'text-indigo-600 bg-indigo-50 border-indigo-500/30', desc: "Se déclenche quand un appel diagnostic est marqué réalisé" },
  cron_schedule:         { label: 'Planification',           Icon: CalendarClock,  color: 'text-violet-400 bg-violet-500/10 border-violet-500/30', desc: 'Se déclenche automatiquement selon un calendrier défini' },
  subscription_created:  { label: 'Souscription créée',      Icon: CheckCircle2,   color: 'text-emerald-600 bg-emerald-50 border-emerald-500/30', desc: "Se déclenche quand un étudiant souscrit à une offre" },
  subscription_expiring: { label: 'Souscription expirante',  Icon: AlarmClock,     color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',   desc: 'Se déclenche 7, 3 et 1 jour(s) avant la fin d\'accès' },
  partial_payment_due:   { label: 'Échéance partielle due',   Icon: AlertTriangle,  color: 'text-red-400 bg-red-500/10 border-red-500/30',         desc: 'Se déclenche quand un solde partiel arrive à échéance' },
  audience_based:        { label: 'Campagne audience',        Icon: Filter,         color: 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/30', desc: 'Lance l\'automatisation pour chaque entité correspondant aux filtres définis' },
}

const STEP_META: Record<StepType, { label: string; Icon: LucideIcon; color: string; desc: string }> = {
  send_email:     { label: 'Envoyer un email',        Icon: Mail,        color: 'text-blue-600 bg-blue-500/10 border-blue-500/30',    desc: 'Envoie un email à un destinataire' },
  http_request:   { label: 'Requête HTTP',            Icon: Globe,       color: 'text-purple-700 bg-purple-500/10 border-purple-500/30', desc: 'Envoie une requête HTTP à une URL' },
  wait:           { label: 'Attente',                 Icon: Timer,       color: 'text-yellow-600 bg-yellow-500/10 border-yellow-500/30', desc: "Pause l'exécution pendant une durée" },
  condition:      { label: 'Condition',               Icon: GitBranch,   color: 'text-pink-400 bg-pink-500/10 border-pink-500/30',     desc: "Arrête l'exécution si la condition est fausse" },
  notify_team:    { label: "Notifier l'équipe",       Icon: Bell,        color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',  desc: "Envoie un email aux membres de l'équipe" },
  add_note:       { label: 'Ajouter une note',        Icon: FileText,    color: 'text-teal-400 bg-teal-500/10 border-teal-500/30',    desc: "Ajoute une note au dossier de l'étudiant" },
  update_student: { label: "Mettre à jour l'étudiant", Icon: Pencil,    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',    desc: "Met à jour un champ du dossier étudiant" },
  create_task:      { label: 'Créer une tâche',          Icon: CheckSquare, color: 'text-emerald-600 bg-emerald-50 border-emerald-500/30', desc: 'Crée une tâche dans le gestionnaire de projets' },
  create_payment:   { label: 'Créer un paiement',        Icon: CreditCard,  color: 'text-green-600 bg-green-500/10 border-green-500/30',      desc: 'Crée un paiement NON TRAITÉ pour un étudiant' },
  create_student:   { label: 'Créer un étudiant',        Icon: UserPlus,    color: 'text-purple-700 bg-purple-500/10 border-purple-500/30',   desc: "Crée un étudiant s'il n'existe pas déjà" },
  circle_invite:    { label: 'Inviter dans Circle',      Icon: Send,        color: 'text-sky-400 bg-sky-500/10 border-sky-500/30',            desc: "Envoie une invitation Circle à l'étudiant" },
  circle_tag_add:   { label: 'Ajouter un tag Circle',    Icon: Tag,         color: 'text-teal-400 bg-teal-500/10 border-teal-500/30',         desc: 'Ajoute un tag / plan Circle à un membre' },
  circle_tag_remove: { label: 'Retirer un tag Circle',  Icon: TagX,        color: 'text-rose-600 bg-rose-50 border-rose-500/30',         desc: 'Retire un tag / plan Circle d\'un membre' },
  create_subscription: { label: 'Créer une souscription', Icon: Repeat,    color: 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/30', desc: 'Crée une souscription à partir du paiement traité' },
}

const STEP_TYPES: StepType[] = [
  'send_email', 'http_request', 'wait', 'condition',
  'notify_team', 'add_note', 'update_student', 'create_task',
  'create_payment', 'create_student', 'circle_invite', 'circle_tag_add', 'circle_tag_remove',
  'create_subscription',
]

const VARIABLES: Record<TriggerType, { token: string; desc: string }[]> = {
  form_submitted: [
    { token: '{{form.title}}', desc: 'Titre du formulaire' },
    { token: '{{submittedAt}}', desc: 'Date de soumission' },
  ],
  payment_created: [
    { token: '{{student.name}}', desc: "Nom de l'étudiant" },
    { token: '{{student.email}}', desc: "Email de l'étudiant" },
    { token: '{{payment.amount}}', desc: 'Montant' },
    { token: '{{payment.currency}}', desc: 'Devise' },
    { token: '{{payment.product}}', desc: 'Produit' },
  ],
  payment_treated: [
    { token: '{{student.name}}', desc: "Nom de l'étudiant" },
    { token: '{{student.email}}', desc: "Email de l'étudiant" },
    { token: '{{payment.amount}}', desc: 'Montant' },
    { token: '{{payment.currency}}', desc: 'Devise' },
    { token: '{{payment.plan}}', desc: 'Plan Circle' },
    { token: '{{payment.gateway}}', desc: 'Passerelle' },
  ],
  student_created: [
    { token: '{{student.name}}', desc: "Nom de l'étudiant" },
    { token: '{{student.email}}', desc: 'Email' },
    { token: '{{student.whatsapp}}', desc: 'WhatsApp' },
    { token: '{{student.source}}', desc: 'Source' },
  ],
  manual: [{ token: '{{trigger}}', desc: 'Type de déclencheur' }],
  incoming_webhook: [{ token: '{{trigger}}', desc: 'Type de déclencheur' }],
  reminder_due: [
    { token: '{{student.name}}', desc: "Nom de l'étudiant" },
    { token: '{{student.email}}', desc: "Email de l'étudiant" },
    { token: '{{daysBeforePayment}}', desc: 'Jours avant paiement' },
  ],
  debt_detected: [
    { token: '{{student.name}}', desc: "Nom de l'étudiant" },
    { token: '{{student.email}}', desc: "Email de l'étudiant" },
    { token: '{{debtSince}}', desc: 'Date du premier partiel' },
  ],
  lead_created: [
    { token: '{{lead.name}}', desc: 'Nom du lead' },
    { token: '{{lead.email}}', desc: 'Email du lead' },
    { token: '{{lead.source_type}}', desc: 'Source du lead' },
    { token: '{{lead.utm_source}}', desc: 'UTM source' },
  ],
  lead_stage_changed: [
    { token: '{{lead.name}}', desc: 'Nom du lead' },
    { token: '{{lead.email}}', desc: 'Email du lead' },
    { token: '{{new_status}}', desc: 'Nouveau statut pipeline' },
  ],
  lead_won: [
    { token: '{{lead.name}}', desc: 'Nom du lead' },
    { token: '{{lead.email}}', desc: 'Email du lead' },
    { token: '{{lead.opportunity_amount}}', desc: 'Montant de la vente' },
  ],
  call_completed: [
    { token: '{{lead.name}}', desc: 'Nom du lead' },
    { token: '{{lead.email}}', desc: 'Email du lead' },
    { token: '{{call.date}}', desc: "Date de l'appel" },
    { token: '{{call.duration}}', desc: "Durée de l'appel" },
  ],
  cron_schedule: [
    { token: '{{scheduledAt}}', desc: "Date/heure d'exécution" },
    { token: '{{preset}}', desc: 'Nom de la planification' },
  ],
  subscription_created: [
    { token: '{{student.name}}', desc: "Nom de l'étudiant" },
    { token: '{{student.email}}', desc: "Email de l'étudiant" },
    { token: '{{student.whatsapp}}', desc: 'WhatsApp' },
    { token: '{{subscription.offerName}}', desc: "Nom de l'offre" },
    { token: '{{subscription.offerProduct}}', desc: 'Produit' },
    { token: '{{subscription.offerPlan}}', desc: 'Plan Circle' },
    { token: '{{subscription.durationMonths}}', desc: 'Durée (mois)' },
    { token: '{{subscription.startDate}}', desc: 'Date de début' },
    { token: '{{subscription.endDate}}', desc: "Date de fin d'accès" },
    { token: '{{subscription.modality}}', desc: 'Modalité' },
    { token: '{{subscription.paidAmount}}', desc: 'Montant payé' },
    { token: '{{subscription.totalAmount}}', desc: "Montant total de l'offre" },
    { token: '{{subscription.currency}}', desc: 'Devise' },
    { token: '{{subscription.nextPaymentDate}}', desc: 'Prochaine échéance (si partiel)' },
  ],
  subscription_expiring: [
    { token: '{{student.name}}', desc: "Nom de l'étudiant" },
    { token: '{{student.email}}', desc: "Email de l'étudiant" },
    { token: '{{student.whatsapp}}', desc: 'WhatsApp' },
    { token: '{{daysUntilExpiry}}', desc: "Jours avant expiration" },
    { token: '{{subscription.offerName}}', desc: "Nom de l'offre" },
    { token: '{{subscription.endDate}}', desc: "Date d'expiration" },
  ],
  partial_payment_due: [
    { token: '{{student.name}}', desc: "Nom de l'étudiant" },
    { token: '{{student.email}}', desc: "Email de l'étudiant" },
    { token: '{{student.whatsapp}}', desc: 'WhatsApp' },
    { token: '{{remainingAmount}}', desc: 'Montant restant dû' },
    { token: '{{daysSinceDue}}', desc: 'Jours de retard' },
    { token: '{{subscription.offerName}}', desc: "Nom de l'offre" },
    { token: '{{subscription.nextPaymentDate}}', desc: "Date d'échéance" },
    { token: '{{subscription.currency}}', desc: 'Devise' },
  ],
  audience_based: [
    { token: '{{student.name}}', desc: "Nom de l'étudiant" },
    { token: '{{student.email}}', desc: "Email de l'étudiant" },
    { token: '{{student.whatsapp}}', desc: 'WhatsApp' },
    { token: '{{student.debtStatus}}', desc: 'Statut dette' },
    { token: '{{payment.amount}}', desc: 'Montant du paiement (si audience=paiement)' },
    { token: '{{payment.product}}', desc: 'Produit (si audience=paiement)' },
    { token: '{{payment.status}}', desc: 'Statut paiement (si audience=paiement)' },
  ],
}

// Tokens injected into context by each step type (used to show available variables in subsequent steps)
const STEP_OUTPUTS: Partial<Record<StepType, { token: string; desc: string }[]>> = {
  create_student: [
    { token: '{{student._id}}',    desc: "ID de l'étudiant créé" },
    { token: '{{student.email}}',  desc: "Email" },
    { token: '{{student.name}}',   desc: "Nom" },
    { token: '{{student.whatsapp}}', desc: "WhatsApp" },
  ],
  create_payment: [
    { token: '{{payment._id}}',          desc: "ID du paiement créé" },
    { token: '{{payment.studentEmail}}', desc: "Email de l'étudiant" },
    { token: '{{payment.product}}',      desc: "Produit" },
    { token: '{{payment.plan}}',         desc: "Plan" },
    { token: '{{payment.amount}}',       desc: "Montant" },
    { token: '{{payment.currency}}',     desc: "Devise" },
    { token: '{{payment.modality}}',     desc: "Modalité" },
    { token: '{{payment.status}}',       desc: "Statut (NON TRAITÉ)" },
  ],
}

const AUDIENCE_FIELDS: Record<'student' | 'payment', { value: string; label: string }[]> = {
  student: [
    { value: 'debtStatus',   label: 'Statut dette' },
    { value: 'infoStatus',   label: "Statut infos" },
    { value: 'email',        label: 'Email' },
    { value: 'name',         label: 'Nom' },
    { value: 'whatsapp',     label: 'WhatsApp' },
    { value: 'source',       label: 'Source' },
    { value: 'circleIsActive', label: 'Circle actif' },
  ],
  payment: [
    { value: 'status',    label: 'Statut paiement' },
    { value: 'product',   label: 'Produit' },
    { value: 'modality',  label: 'Modalité' },
    { value: 'plan',      label: 'Plan Circle' },
    { value: 'gateway',   label: 'Passerelle' },
    { value: 'amount',    label: 'Montant' },
    { value: 'currency',  label: 'Devise' },
    { value: 'studentEmail', label: 'Email étudiant' },
  ],
}

const SCHEDULE_PRESETS = [
  { value: 'daily_6am',  label: 'Tous les jours à 6h00 (UTC)' },
  { value: 'daily_8am',  label: 'Tous les jours à 8h00 (UTC)' },
  { value: 'daily_9am',  label: 'Tous les jours à 9h00 (UTC)' },
  { value: 'daily_12h',  label: 'Tous les jours à 12h00 (UTC)' },
  { value: 'daily_18h',  label: 'Tous les jours à 18h00 (UTC)' },
  { value: 'hourly',     label: 'Toutes les heures' },
  { value: 'weekly_mon', label: 'Chaque lundi à 9h00 (UTC)' },
]

const OPERATORS = [
  { value: 'equals',       label: 'est égal à' },
  { value: 'not_equals',   label: "n'est pas égal à" },
  { value: 'contains',     label: 'contient' },
  { value: 'not_contains', label: 'ne contient pas' },
  { value: 'is_empty',     label: 'est vide' },
  { value: 'is_not_empty', label: "n'est pas vide" },
  { value: 'gt',           label: 'est supérieur à' },
  { value: 'lt',           label: 'est inférieur à' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

function makeStep(type: StepType): AutomationStep {
  const defaults: Partial<AutomationStep['config']> =
    type === 'wait'             ? { duration: 1, unit: 'minutes' }
    : type === 'http_request'   ? { method: 'POST' }
    : type === 'condition'      ? { operator: 'is_not_empty' }
    : type === 'notify_team'    ? { recipients: 'all_admins' }
    : type === 'update_student' ? { studentField: 'infoStatus', studentValue: 'EXACTE' }
    : type === 'create_task'    ? { taskPriority: 'medium' }
    : type === 'create_payment'      ? { currency: 'F CFA', product: 'ECOM AFRICA PRO', modality: 'Complet' }
    : type === 'create_subscription' ? { matchMode: 'auto' }
    : {}
  return { id: uid(), type, name: STEP_META[type].label, config: defaults }
}

const inputCls =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'
const labelCls = 'mb-1.5 block text-xs font-medium text-gray-400'

// ── Flow blocks ───────────────────────────────────────────────────────────────

function TriggerBlock({
  triggerType, selected, onClick,
}: { triggerType: TriggerType; selected: boolean; onClick: () => void }) {
  const meta = TRIGGER_META[triggerType]
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full rounded-xl border-2 p-4 text-left transition-all',
        selected ? 'border-indigo-500 bg-indigo-600/10' : 'border-gray-200 bg-white hover:border-gray-600',
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border', meta.color)}>
          <meta.Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Déclencheur</p>
          <p className="text-sm font-medium text-gray-900">{meta.label}</p>
        </div>
        {selected && <div className="ml-auto h-2 w-2 rounded-full bg-indigo-400" />}
      </div>
    </button>
  )
}

function StepBlock({
  step, index, selected, onClick, onDelete,
}: { step: AutomationStep; index: number; selected: boolean; onClick: () => void; onDelete: () => void }) {
  const meta = STEP_META[step.type]
  return (
    <button
      onClick={onClick}
      className={cn(
        'group w-full rounded-xl border-2 p-4 text-left transition-all',
        selected ? 'border-indigo-500 bg-indigo-600/10' : 'border-gray-200 bg-white hover:border-gray-600',
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs text-gray-400">
          {index + 1}
        </div>
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border', meta.color)}>
          <meta.Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900">{step.name || meta.label}</p>
          <p className="text-xs text-gray-500">{meta.label}</p>
        </div>
        {(step.conditions?.length ?? 0) > 0 && (
          <span title={`${step.conditions!.length} condition${step.conditions!.length > 1 ? 's' : ''}`}
            className="flex shrink-0 items-center gap-1 rounded-full bg-violet-500/20 px-1.5 py-0.5 text-xs text-violet-400">
            <Filter className="h-3 w-3" />
            {step.conditions!.length}
          </span>
        )}
        {selected && <div className="h-2 w-2 shrink-0 rounded-full bg-indigo-400" />}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="ml-1 shrink-0 rounded p-1 text-gray-600 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </button>
  )
}

function Connector({ onAdd }: { onAdd: (type: StepType) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative flex flex-col items-center">
      <div className="h-5 w-px bg-gray-100" />
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-gray-200 bg-[#f5f6fa] text-gray-600 transition-colors hover:border-indigo-500 hover:text-indigo-600"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute left-1/2 z-20 mt-2 w-60 -translate-x-1/2 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">
              {STEP_TYPES.map((type) => {
                const meta = STEP_META[type]
                return (
                  <button
                    key={type}
                    onClick={() => { onAdd(type); setOpen(false) }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-gray-100 transition-colors"
                  >
                    <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border', meta.color)}>
                      <meta.Icon className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-800">{meta.label}</p>
                      <p className="text-xs text-gray-500">{meta.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
      <div className="h-5 w-px bg-gray-100" />
    </div>
  )
}

// ── Config panels ─────────────────────────────────────────────────────────────

function VariablesPanel({
  triggerType,
  formFields,
  precedingSteps,
}: {
  triggerType: TriggerType
  formFields?: Form['fields']
  precedingSteps?: AutomationStep[]
}) {
  const vars = VARIABLES[triggerType] ?? []
  const fieldVars = (formFields ?? [])
    .filter((f) => !['heading', 'paragraph'].includes(f.type))
    .map((f) => ({ token: `{{answers.${f.id}}}`, desc: f.label }))

  const allVars = [...vars, ...fieldVars]

  const stepOutputGroups: { stepName: string; vars: { token: string; desc: string }[] }[] = []
  for (const step of precedingSteps ?? []) {
    const outputs = STEP_OUTPUTS[step.type]
    if (outputs?.length) {
      stepOutputGroups.push({ stepName: step.name || STEP_META[step.type].label, vars: outputs })
    }
  }

  if (!allVars.length && !stepOutputGroups.length) return null

  const tokenCode = (token: string) => (
    <code
      key={token}
      onClick={() => navigator.clipboard.writeText(token)}
      title="Cliquer pour copier"
      className="cursor-pointer rounded bg-gray-100 px-1.5 py-0.5 text-xs text-indigo-300 transition-colors hover:bg-gray-200"
    >
      {token}
    </code>
  )

  return (
    <div className="mt-6 space-y-3">
      {allVars.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-[#f5f6fa] p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Variables disponibles</p>
          <div className="space-y-1.5">
            {allVars.map((v) => (
              <div key={v.token} className="flex items-center gap-2">
                {tokenCode(v.token)}
                <span className="text-xs text-gray-600">{v.desc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stepOutputGroups.length > 0 && (
        <div className="rounded-lg border border-indigo-800/40 bg-indigo-950/20 p-3">
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-indigo-500">Sorties des étapes précédentes</p>
          <div className="space-y-3">
            {stepOutputGroups.map((group) => (
              <div key={group.stepName}>
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-indigo-600/60">{group.stepName}</p>
                <div className="space-y-1.5">
                  {group.vars.map((v) => (
                    <div key={v.token} className="flex items-center gap-2">
                      {tokenCode(v.token)}
                      <span className="text-xs text-gray-600">{v.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AudienceEditor({
  audience,
  onChange,
}: {
  audience: AudienceConfig
  onChange: (a: AudienceConfig) => void
}) {
  const fields = AUDIENCE_FIELDS[audience.entity]

  const addFilter = () =>
    onChange({ ...audience, filters: [...audience.filters, { field: fields[0].value, operator: 'equals', value: '' }] })
  const removeFilter = (i: number) =>
    onChange({ ...audience, filters: audience.filters.filter((_, j) => j !== i) })
  const updateFilter = (i: number, patch: Partial<AudienceFilter>) =>
    onChange({ ...audience, filters: audience.filters.map((f, j) => (j === i ? { ...f, ...patch } : f)) })

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>Type d'entité</label>
        <div className="flex gap-2">
          {(['student', 'payment'] as const).map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onChange({ entity: e, filters: [] })}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                audience.entity === e
                  ? 'border-fuchsia-500 bg-fuchsia-600/10 text-fuchsia-300'
                  : 'border-gray-200 bg-gray-50 text-gray-400 hover:border-gray-600',
              )}
            >
              <Users className="h-3.5 w-3.5" />
              {e === 'student' ? 'Étudiants' : 'Paiements'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className={labelCls}>Filtres audience</label>
          <button
            type="button"
            onClick={addFilter}
            className="flex items-center gap-1 text-xs text-fuchsia-400 hover:text-fuchsia-300 transition-colors"
          >
            <Plus className="h-3 w-3" /> Ajouter
          </button>
        </div>
        {audience.filters.length === 0 && (
          <p className="rounded-lg border border-dashed border-gray-200 py-3 text-center text-xs text-gray-600">
            Aucun filtre — toutes les entités seront ciblées
          </p>
        )}
        <div className="space-y-2">
          {audience.filters.map((f, i) => (
            <div key={i} className="rounded-lg border border-gray-200/70 bg-gray-50 p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Filtre {i + 1}</span>
                <button type="button" onClick={() => removeFilter(i)} className="text-gray-600 hover:text-red-400 transition-colors">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-gray-500">Champ</label>
                <select
                  className={inputCls}
                  value={f.field}
                  onChange={(e) => updateFilter(i, { field: e.target.value })}
                >
                  {fields.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-gray-500">Opérateur</label>
                <select
                  className={inputCls}
                  value={f.operator}
                  onChange={(e) => updateFilter(i, { operator: e.target.value as AudienceFilter['operator'] })}
                >
                  {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {!['is_empty', 'is_not_empty'].includes(f.operator) && (
                <div>
                  <label className="mb-1 block text-[10px] text-gray-500">Valeur</label>
                  <input
                    className={inputCls}
                    value={f.value ?? ''}
                    onChange={(e) => updateFilter(i, { value: e.target.value })}
                    placeholder="Valeur..."
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TriggerConfig({
  trigger, onChange, forms,
}: { trigger: Automation['trigger']; onChange: (t: Automation['trigger']) => void; forms: Form[] }) {
  const meta = TRIGGER_META[trigger.type]
  const webhookUrl = trigger.config?.webhookKey
    ? `${window.location.origin}/api/public/automations/webhook/${trigger.config?.webhookKey}`
    : null

  return (
    <div className="space-y-4">
      <div className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium', meta.color)}>
        <meta.Icon className="h-4 w-4 shrink-0" />
        <span>{meta.label}</span>
      </div>
      <p className="text-xs text-gray-500">{meta.desc}</p>

      {trigger.type === 'form_submitted' && (
        <div>
          <label className={labelCls}>Formulaire (laisser vide pour tous)</label>
          <select
            value={trigger.config?.formId ?? ''}
            onChange={(e) =>
              onChange({ ...trigger, config: { ...trigger.config, formId: e.target.value || undefined } })
            }
            className={inputCls}
          >
            <option value="">Tous les formulaires</option>
            {forms.map((f) => (
              <option key={f._id} value={f._id}>{f.title}</option>
            ))}
          </select>
        </div>
      )}

      {trigger.type === 'cron_schedule' && (
        <div>
          <label className={labelCls}>Fréquence d'exécution</label>
          <select
            value={trigger.config?.schedulePreset ?? 'daily_8am'}
            onChange={(e) =>
              onChange({ ...trigger, config: { ...trigger.config, schedulePreset: e.target.value } })
            }
            className={inputCls}
          >
            {SCHEDULE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Les heures sont en UTC. Ajoutez 1h pour Paris en hiver, 2h en été.
          </p>
        </div>
      )}

      {trigger.type === 'incoming_webhook' && webhookUrl && (
        <div>
          <label className={labelCls}>URL du webhook</label>
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
            <code className="flex-1 truncate text-xs text-orange-300">{webhookUrl}</code>
            <button
              onClick={() => navigator.clipboard.writeText(webhookUrl)}
              title="Copier"
              className="shrink-0 text-gray-500 transition-colors hover:text-gray-600"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Envoyez une requête POST à cette URL pour déclencher l'automatisation.
          </p>
        </div>
      )}

      {trigger.type === 'audience_based' && (
        <AudienceEditor
          audience={trigger.config?.audience ?? { entity: 'student', filters: [] }}
          onChange={(audience) => onChange({ ...trigger, config: { ...trigger.config, audience } })}
        />
      )}
    </div>
  )
}

// ── Step-level conditions editor ──────────────────────────────────────────────

function ConditionsEditor({
  conditions,
  onChange,
}: {
  conditions: StepCondition[]
  onChange: (c: StepCondition[]) => void
}) {
  const [open, setOpen] = useState(conditions.length > 0)

  const add = () => onChange([...conditions, { field: '', operator: 'equals', value: '' }])
  const remove = (i: number) => onChange(conditions.filter((_, j) => j !== i))
  const update = (i: number, patch: Partial<StepCondition>) => {
    // Strip {{ }} if user pastes a template token into the field path
    if (patch.field !== undefined) {
      patch.field = patch.field.replace(/^\{\{/, '').replace(/\}\}$/, '').trim()
    }
    const next = conditions.map((c, j) => (j === i ? { ...c, ...patch } : c))
    onChange(next)
  }

  return (
    <div className="rounded-lg border border-gray-200/60 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <Filter className="h-3.5 w-3.5 shrink-0 text-violet-400" />
        <span className="flex-1 text-xs font-semibold text-gray-600">
          Conditions d'exécution
        </span>
        {conditions.length > 0 && (
          <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-xs font-medium text-violet-300">
            {conditions.length}
          </span>
        )}
        <ChevronDown className={cn('h-3.5 w-3.5 text-gray-600 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="space-y-2 border-t border-gray-200/60 px-3 pb-3 pt-2">
          {conditions.length === 0 && (
            <p className="py-1 text-xs text-gray-600">
              Aucune condition — l'étape s'exécute toujours.
            </p>
          )}

          {conditions.map((cond, i) => (
            <div key={i} className="rounded-lg border border-gray-200/70 bg-gray-50 p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  Condition {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="rounded p-0.5 text-gray-600 transition-colors hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-gray-500">
                  Champ <span className="text-gray-600 normal-case">(sans accolades)</span>
                </label>
                <input
                  value={cond.field}
                  onChange={(e) => update(i, { field: e.target.value })}
                  placeholder="payment.plan"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-gray-500">Opérateur</label>
                <select
                  value={cond.operator}
                  onChange={(e) => update(i, { operator: e.target.value })}
                  className={inputCls}
                >
                  {OPERATORS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {!['is_empty', 'is_not_empty'].includes(cond.operator) && (
                <div>
                  <label className="mb-1 block text-[10px] text-gray-500">Valeur</label>
                  <input
                    value={cond.value}
                    onChange={(e) => update(i, { value: e.target.value })}
                    placeholder="TRAITÉ"
                    className={inputCls}
                  />
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={add}
            className="mt-1 flex items-center gap-1.5 text-xs text-violet-400 transition-colors hover:text-violet-300"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter une condition
          </button>

          {conditions.length > 0 && (
            <p className="rounded-lg bg-violet-500/10 px-3 py-2 text-xs text-violet-300">
              Toutes les conditions doivent être vraies. Si l'une échoue, cette étape est ignorée — l'automatisation continue avec les étapes suivantes.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── CreatePaymentConfig ───────────────────────────────────────────────────────

function CreatePaymentConfig({
  step, onChange, inputCls, labelCls,
}: { step: AutomationStep; onChange: (s: AutomationStep) => void; inputCls: string; labelCls: string }) {
  const cfg = step.config
  const upd = (patch: Partial<typeof cfg>) => onChange({ ...step, config: { ...cfg, ...patch } })

  const { data: offers = [] } = useQuery<Offer[]>({
    queryKey: ['subscription-offers'],
    queryFn: () => api.get<Offer[]>('/subscription-offers').then((r) => r.data),
  })

  const selectedOffer = offers.find((o) => o.name === cfg.product)
  const availablePlans = (selectedOffer?.plans ?? []).filter((p) => p.isActive)

  const handleOfferChange = (name: string) => {
    const o = offers.find((o) => o.name === name)
    upd({ product: name, plan: o?.plans.find((p) => p.isActive)?.name ?? '' })
  }

  return (
    <>
      <div>
        <label className={labelCls}>Email (expression) *</label>
        <input value={cfg.emailExpr ?? ''} onChange={(e) => upd({ emailExpr: e.target.value })} placeholder="{{student.email}} ou {{answers.f04}}" className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Montant (expression)</label>
        <input value={cfg.amountExpr ?? ''} onChange={(e) => upd({ amountExpr: e.target.value })} placeholder="{{answers.f10}} ou 50000" className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Devise</label>
          <select value={cfg.currency ?? 'F CFA'} onChange={(e) => upd({ currency: e.target.value })} className={inputCls}>
            {['F CFA', 'USD', 'EURO'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Modalité</label>
          <select value={cfg.modality ?? 'Complet'} onChange={(e) => upd({ modality: e.target.value })} className={inputCls}>
            <option value="Complet">Complet</option>
            <option value="Partiel">Partiel</option>
          </select>
        </div>
      </div>
      <div>
        <label className={labelCls}>Offre</label>
        <select value={cfg.product ?? ''} onChange={(e) => handleOfferChange(e.target.value)} className={inputCls}>
          <option value="">— Choisir une offre —</option>
          {offers.map((o) => <option key={o._id} value={o.name}>{o.name}</option>)}
        </select>
      </div>
      {selectedOffer && (
        <div>
          <label className={labelCls}>Plan</label>
          <select value={cfg.plan ?? ''} onChange={(e) => upd({ plan: e.target.value })} className={inputCls}>
            <option value="">— Choisir un plan —</option>
            {availablePlans.map((p) => (
              <option key={p._id} value={p.name}>{p.name} · {p.durationMonths} mois</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className={labelCls}>Gateway (expression)</label>
        <input value={cfg.gateway ?? ''} onChange={(e) => upd({ gateway: e.target.value })} placeholder="{{answers.f09}} ou FedaPay" className={inputCls} />
      </div>
      <p className="rounded-lg bg-green-500/10 px-3 py-2 text-xs text-green-300">
        Le paiement est créé avec le statut NON TRAITÉ. Vous pourrez le traiter depuis la page Paiements.
      </p>
    </>
  )
}

// ── CreateSubscriptionConfig ──────────────────────────────────────────────────

function CreateSubscriptionConfig({
  step, onChange,
}: { step: AutomationStep; onChange: (s: AutomationStep) => void }) {
  const { data: offers = [] } = useQuery<Offer[]>({
    queryKey: ['subscription-offers'],
    queryFn: () => api.get<Offer[]>('/subscription-offers').then((r) => r.data),
  })

  const cfg = step.config
  const matchMode = cfg.matchMode ?? 'auto'
  const selectedOffer = offers.find((o) => o._id === cfg.offerId)
  const activePlans = selectedOffer?.plans.filter((p) => p.isActive) ?? []

  const patch = (fields: Partial<AutomationStep['config']>) =>
    onChange({ ...step, config: { ...cfg, ...fields } })

  const sel = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'

  return (
    <div className="space-y-3">
      {/* Mode */}
      <div className="flex gap-2">
        {(['auto', 'manual'] as const).map((m) => (
          <button
            key={m}
            onClick={() => patch({ matchMode: m, offerId: undefined, planName: undefined })}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              matchMode === m
                ? 'border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-400'
                : 'border-gray-200 bg-white text-gray-400 hover:text-gray-800'
            }`}
          >
            {m === 'auto' ? 'Auto (depuis le paiement)' : 'Manuel (choisir l\'offre)'}
          </button>
        ))}
      </div>

      {matchMode === 'auto' && (
        <p className="rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/20 px-3 py-2 text-xs text-fuchsia-300">
          Détecte automatiquement l'offre via <code>payment.product</code> et le plan via <code>payment.plan</code>. À utiliser avec le trigger <strong>Paiement traité</strong>.
        </p>
      )}

      {matchMode === 'manual' && (
        <>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Offre</label>
            <select
              value={cfg.offerId ?? ''}
              onChange={(e) => patch({ offerId: e.target.value, planName: undefined })}
              className={sel}
            >
              <option value="">— Choisir une offre —</option>
              {offers.map((o) => (
                <option key={o._id} value={o._id}>{o.name}</option>
              ))}
            </select>
          </div>
          {selectedOffer && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">Plan</label>
              <select
                value={cfg.planName ?? ''}
                onChange={(e) => patch({ planName: e.target.value })}
                className={sel}
              >
                <option value="">— Choisir un plan —</option>
                {activePlans.map((p) => (
                  <option key={p._id} value={p.name}>{p.name} ({p.durationMonths} mois)</option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── EmailBlockEditor ──────────────────────────────────────────────────────────

function EmailBlockEditor({ blocks, onChange }: { blocks: EmailBlock[]; onChange: (b: EmailBlock[]) => void }) {
  const upd = (i: number, patch: Partial<EmailBlock>) =>
    onChange(blocks.map((b, idx) => idx === i ? { ...b, ...patch } as EmailBlock : b))
  const remove = (i: number) => onChange(blocks.filter((_, idx) => idx !== i))
  const move = (i: number, dir: -1 | 1) => {
    const next = [...blocks]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  const add = (type: EmailBlock['type']) => {
    const defaults: Record<string, EmailBlock> = {
      text:    { type: 'text', content: '', align: 'left' },
      image:   { type: 'image', url: '' },
      button:  { type: 'button', label: 'Cliquez ici', url: '', color: '#6366f1', textColor: '#ffffff', radius: 'md', align: 'center' },
      divider: { type: 'divider' },
      spacer:  { type: 'spacer', height: 16 },
    }
    onChange([...blocks, defaults[type]])
  }

  const inputCls = 'w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-indigo-500'

  return (
    <div className="space-y-2">
      {/* Block list */}
      <div className="space-y-2">
        {blocks.map((block, i) => (
          <div key={i} className="rounded-lg border border-white/10 bg-white/5 p-2.5 space-y-2">
            {/* Block header */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500 flex-1">
                {block.type === 'text' ? 'Texte' : block.type === 'image' ? 'Image' : block.type === 'button' ? 'Bouton' : block.type === 'divider' ? 'Séparateur' : 'Espacement'}
              </span>
              <button onClick={() => move(i, -1)} className="text-gray-600 hover:text-gray-400 transition-colors"><MoveUp className="h-3 w-3" /></button>
              <button onClick={() => move(i, 1)} className="text-gray-600 hover:text-gray-400 transition-colors"><MoveDown className="h-3 w-3" /></button>
              <button onClick={() => remove(i)} className="text-gray-600 hover:text-red-400 transition-colors"><Trash2 className="h-3 w-3" /></button>
            </div>

            {/* Text block */}
            {block.type === 'text' && (
              <>
                <textarea
                  value={block.content}
                  onChange={(e) => upd(i, { content: e.target.value })}
                  placeholder="Bonjour {{student.name}}, ..."
                  rows={3}
                  className={cn(inputCls, 'resize-y')}
                />
                <div className="flex gap-1">
                  {(['left', 'center', 'right'] as const).map((a) => {
                    const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight
                    return (
                      <button
                        key={a}
                        onClick={() => upd(i, { align: a })}
                        className={cn('p-1 rounded transition-colors', block.align === a ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-600')}
                      >
                        <Icon className="h-3 w-3" />
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {/* Image block */}
            {block.type === 'image' && (
              <div className="space-y-1.5">
                <input value={block.url} onChange={(e) => upd(i, { url: e.target.value })} placeholder="https://..." className={inputCls} />
                <input value={block.alt ?? ''} onChange={(e) => upd(i, { alt: e.target.value })} placeholder="Texte alternatif" className={inputCls} />
                {block.url && <img src={block.url} alt={block.alt ?? ''} className="max-h-24 rounded opacity-70 object-contain" onError={() => {}} />}
              </div>
            )}

            {/* Button block */}
            {block.type === 'button' && (
              <div className="space-y-1.5">
                <input value={block.label} onChange={(e) => upd(i, { label: e.target.value })} placeholder="Label du bouton" className={inputCls} />
                <input value={block.url} onChange={(e) => upd(i, { url: e.target.value })} placeholder="https://..." className={inputCls} />
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <span className="text-[10px] text-gray-500">Couleur fond</span>
                    <div className="flex gap-1.5 items-center">
                      <input type="color" value={block.color} onChange={(e) => upd(i, { color: e.target.value })} className="h-6 w-8 rounded cursor-pointer bg-transparent border-0" />
                      <input value={block.color} onChange={(e) => upd(i, { color: e.target.value })} className={cn(inputCls, 'flex-1 font-mono')} />
                    </div>
                  </div>
                  <div className="flex-1 space-y-1">
                    <span className="text-[10px] text-gray-500">Couleur texte</span>
                    <div className="flex gap-1.5 items-center">
                      <input type="color" value={block.textColor} onChange={(e) => upd(i, { textColor: e.target.value })} className="h-6 w-8 rounded cursor-pointer bg-transparent border-0" />
                      <input value={block.textColor} onChange={(e) => upd(i, { textColor: e.target.value })} className={cn(inputCls, 'flex-1 font-mono')} />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-[10px] text-gray-500 shrink-0">Forme :</span>
                  {(['none', 'md', 'full'] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => upd(i, { radius: r })}
                      className={cn('px-2 py-0.5 text-[10px] rounded border transition-colors', block.radius === r ? 'border-indigo-500 bg-indigo-600/30 text-indigo-300' : 'border-white/10 text-gray-500 hover:text-gray-600')}
                    >
                      {r === 'none' ? 'Carré' : r === 'md' ? 'Arrondi' : 'Pill'}
                    </button>
                  ))}
                  <span className="text-[10px] text-gray-500 shrink-0 ml-2">Alignement :</span>
                  {(['left', 'center', 'right'] as const).map((a) => {
                    const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight
                    return (
                      <button
                        key={a}
                        onClick={() => upd(i, { align: a })}
                        className={cn('p-1 rounded transition-colors', block.align === a ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-600')}
                      >
                        <Icon className="h-3 w-3" />
                      </button>
                    )
                  })}
                </div>
                {/* Preview */}
                <div className={cn('pt-1', block.align === 'center' ? 'text-center' : block.align === 'right' ? 'text-right' : 'text-left')}>
                  <span
                    style={{ background: block.color, color: block.textColor, borderRadius: block.radius === 'full' ? '9999px' : block.radius === 'md' ? '6px' : '0px' }}
                    className="inline-block px-3 py-1.5 text-xs font-medium"
                  >
                    {block.label || 'Aperçu bouton'}
                  </span>
                </div>
              </div>
            )}

            {/* Spacer block */}
            {block.type === 'spacer' && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500">Hauteur (px)</span>
                <input
                  type="number"
                  value={block.height}
                  min={4}
                  max={80}
                  onChange={(e) => upd(i, { height: Number(e.target.value) })}
                  className={cn(inputCls, 'w-20')}
                />
              </div>
            )}

            {/* Divider block — no config needed */}
            {block.type === 'divider' && <div className="border-t border-white/10 my-1" />}
          </div>
        ))}
      </div>

      {/* Add block buttons */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        <button onClick={() => add('text')} className="flex items-center gap-1 px-2 py-1 rounded border border-white/10 text-[10px] text-gray-400 hover:text-gray-800 hover:border-white/20 transition-colors">
          <Mail className="h-3 w-3" /> Texte
        </button>
        <button onClick={() => add('image')} className="flex items-center gap-1 px-2 py-1 rounded border border-white/10 text-[10px] text-gray-400 hover:text-gray-800 hover:border-white/20 transition-colors">
          <Image className="h-3 w-3" /> Image
        </button>
        <button onClick={() => add('button')} className="flex items-center gap-1 px-2 py-1 rounded border border-white/10 text-[10px] text-gray-400 hover:text-gray-800 hover:border-white/20 transition-colors">
          <MousePointerClick className="h-3 w-3" /> Bouton
        </button>
        <button onClick={() => add('divider')} className="flex items-center gap-1 px-2 py-1 rounded border border-white/10 text-[10px] text-gray-400 hover:text-gray-800 hover:border-white/20 transition-colors">
          <Minus className="h-3 w-3" /> Séparateur
        </button>
        <button onClick={() => add('spacer')} className="flex items-center gap-1 px-2 py-1 rounded border border-white/10 text-[10px] text-gray-400 hover:text-gray-800 hover:border-white/20 transition-colors">
          <Plus className="h-3 w-3" /> Espacement
        </button>
      </div>
    </div>
  )
}

// ── StepConfig ────────────────────────────────────────────────────────────────

function StepConfig({
  step, onChange, circlePlans,
}: { step: AutomationStep; onChange: (s: AutomationStep) => void; circlePlans: CirclePlan[] }) {
  const cfg = step.config
  const upd = (patch: Partial<AutomationStep['config']>) =>
    onChange({ ...step, config: { ...cfg, ...patch } })

  return (
    <div className="space-y-4">
      {/* Name */}
      <div>
        <label className={labelCls}>Nom de l'étape</label>
        <input
          value={step.name ?? ''}
          onChange={(e) => onChange({ ...step, name: e.target.value })}
          placeholder={STEP_META[step.type].label}
          className={inputCls}
        />
      </div>

      {/* Type selector */}
      <div>
        <label className={labelCls}>Type d'action</label>
        <div className="grid grid-cols-2 gap-1.5">
          {STEP_TYPES.map((t) => {
            const meta = STEP_META[t]
            return (
              <button
                key={t}
                onClick={() => onChange({ ...step, type: t })}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors',
                  step.type === t
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-300'
                    : 'border-gray-200 text-gray-400 hover:border-gray-600',
                )}
              >
                <meta.Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{meta.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* send_email */}
      {step.type === 'send_email' && (
        <>
          <div>
            <label className={labelCls}>Destinataire *</label>
            <input value={cfg.to ?? ''} onChange={(e) => upd({ to: e.target.value })} placeholder="{{student.email}}" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Sujet</label>
            <input value={cfg.subject ?? ''} onChange={(e) => upd({ subject: e.target.value })} placeholder="Bienvenue {{student.name}}" className={inputCls} />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className={cn(labelCls, 'mb-0')}>Contenu de l'email</label>
              <div className="flex gap-1.5">
                <button
                  onClick={() => upd({ blocks: cfg.blocks ?? [], body: undefined })}
                  className={cn('text-[10px] px-2 py-0.5 rounded border transition-colors', !cfg.body && cfg.blocks !== undefined ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300' : 'border-white/10 text-gray-500 hover:text-gray-600')}
                >
                  Éditeur blocs
                </button>
                <button
                  onClick={() => upd({ body: cfg.body ?? '', blocks: undefined })}
                  className={cn('text-[10px] px-2 py-0.5 rounded border transition-colors', cfg.body !== undefined || cfg.blocks === undefined ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300' : 'border-white/10 text-gray-500 hover:text-gray-600')}
                >
                  Texte brut
                </button>
              </div>
            </div>
            {cfg.blocks !== undefined && !cfg.body ? (
              <EmailBlockEditor
                blocks={cfg.blocks ?? []}
                onChange={(b) => upd({ blocks: b })}
              />
            ) : (
              <textarea
                value={cfg.body ?? ''}
                onChange={(e) => upd({ body: e.target.value })}
                placeholder={"Bonjour {{student.name}},\n\nVotre paiement a bien été reçu."}
                rows={6}
                className={cn(inputCls, 'resize-y font-mono text-xs')}
              />
            )}
          </div>
        </>
      )}

      {/* http_request */}
      {step.type === 'http_request' && (
        <>
          <div className="flex gap-2">
            <div className="w-28 shrink-0">
              <label className={labelCls}>Méthode</label>
              <select value={cfg.method ?? 'POST'} onChange={(e) => upd({ method: e.target.value })} className={inputCls}>
                {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className={labelCls}>URL *</label>
              <input value={cfg.url ?? ''} onChange={(e) => upd({ url: e.target.value })} placeholder="https://hooks.example.com/notify" className={inputCls} />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className={cn(labelCls, 'mb-0')}>En-têtes</label>
              <button
                onClick={() => upd({ headers: [...(cfg.headers ?? []), { key: '', value: '' }] })}
                className="text-xs text-indigo-600 hover:text-indigo-300 transition-colors"
              >
                + Ajouter
              </button>
            </div>
            <div className="space-y-1.5">
              {(cfg.headers ?? []).map((h, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    value={h.key}
                    onChange={(e) => {
                      const hs = [...(cfg.headers ?? [])]
                      hs[i] = { ...hs[i], key: e.target.value }
                      upd({ headers: hs })
                    }}
                    placeholder="Clé"
                    className={cn(inputCls, 'flex-1')}
                  />
                  <input
                    value={h.value}
                    onChange={(e) => {
                      const hs = [...(cfg.headers ?? [])]
                      hs[i] = { ...hs[i], value: e.target.value }
                      upd({ headers: hs })
                    }}
                    placeholder="Valeur"
                    className={cn(inputCls, 'flex-1')}
                  />
                  <button
                    onClick={() => upd({ headers: (cfg.headers ?? []).filter((_, j) => j !== i) })}
                    className="shrink-0 text-gray-600 transition-colors hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>Corps (JSON)</label>
            <textarea
              value={cfg.requestBody ?? ''}
              onChange={(e) => upd({ requestBody: e.target.value })}
              placeholder={'{\n  "name": "{{student.name}}"\n}'}
              rows={4}
              className={cn(inputCls, 'resize-y font-mono text-xs')}
            />
          </div>
        </>
      )}

      {/* wait */}
      {step.type === 'wait' && (
        <div className="flex gap-2">
          <div className="flex-1">
            <label className={labelCls}>Durée</label>
            <input
              type="number"
              min={1}
              value={cfg.duration ?? 1}
              onChange={(e) => upd({ duration: Number(e.target.value) })}
              className={inputCls}
            />
          </div>
          <div className="w-36 shrink-0">
            <label className={labelCls}>Unité</label>
            <select
              value={cfg.unit ?? 'minutes'}
              onChange={(e) => upd({ unit: e.target.value as 'seconds' | 'minutes' | 'hours' })}
              className={inputCls}
            >
              <option value="seconds">Secondes</option>
              <option value="minutes">Minutes</option>
              <option value="hours">Heures</option>
            </select>
          </div>
        </div>
      )}

      {/* condition */}
      {step.type === 'condition' && (
        <>
          <div>
            <label className={labelCls}>Champ (sans accolades)</label>
            <input
              value={cfg.field ?? ''}
              onChange={(e) => upd({ field: e.target.value.replace(/^\{\{/, '').replace(/\}\}$/, '').trim() })}
              placeholder="payment.plan"
              className={inputCls}
            />
            <p className="mt-1 text-xs text-gray-500">Ex : payment.plan, student.debtStatus, payment.amount</p>
          </div>
          <div>
            <label className={labelCls}>Opérateur</label>
            <select
              value={cfg.operator ?? 'is_not_empty'}
              onChange={(e) => upd({ operator: e.target.value })}
              className={inputCls}
            >
              {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {!['is_empty', 'is_not_empty'].includes(cfg.operator ?? '') && (
            <div>
              <label className={labelCls}>Valeur</label>
              <input
                value={cfg.value ?? ''}
                onChange={(e) => upd({ value: e.target.value })}
                placeholder="TRAITÉ"
                className={inputCls}
              />
            </div>
          )}
          <p className="rounded-lg bg-pink-500/10 px-3 py-2 text-xs text-pink-300">
            Si la condition est fausse, l'exécution s'arrête ici et les étapes suivantes sont ignorées.
          </p>
        </>
      )}

      {/* notify_team */}
      {step.type === 'notify_team' && (
        <>
          <div>
            <label className={labelCls}>Destinataires</label>
            <select
              value={cfg.recipients ?? 'all_admins'}
              onChange={(e) => upd({ recipients: e.target.value })}
              className={inputCls}
            >
              <option value="all_admins">Tous les admins</option>
              <option value="custom">Emails personnalisés</option>
            </select>
          </div>
          {(cfg.recipients ?? 'all_admins') !== 'all_admins' && (
            <div>
              <label className={labelCls}>Emails (séparés par des virgules)</label>
              <input
                value={cfg.recipients ?? ''}
                onChange={(e) => upd({ recipients: e.target.value })}
                placeholder="alice@example.com, bob@example.com"
                className={inputCls}
              />
            </div>
          )}
          <div>
            <label className={labelCls}>Sujet</label>
            <input
              value={cfg.subject ?? ''}
              onChange={(e) => upd({ subject: e.target.value })}
              placeholder="Nouveau paiement de {{student.name}}"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Corps du message</label>
            <textarea
              value={cfg.body ?? ''}
              onChange={(e) => upd({ body: e.target.value })}
              placeholder={"Étudiant : {{student.name}}\nEmail : {{student.email}}"}
              rows={5}
              className={cn(inputCls, 'resize-y')}
            />
          </div>
        </>
      )}

      {/* add_note */}
      {step.type === 'add_note' && (
        <>
          <div>
            <label className={labelCls}>Contenu de la note</label>
            <textarea
              value={cfg.note ?? ''}
              onChange={(e) => upd({ note: e.target.value })}
              placeholder="Paiement confirmé le {{payment.processedAt}}. Plan : {{payment.plan}}."
              rows={4}
              className={cn(inputCls, 'resize-y')}
            />
            <p className="mt-1.5 text-xs text-gray-500">
              Sera ajoutée avec horodatage automatique au dossier de l'étudiant identifié dans le contexte.
            </p>
          </div>
        </>
      )}

      {/* update_student */}
      {step.type === 'update_student' && (
        <>
          <div>
            <label className={labelCls}>Champ à mettre à jour</label>
            <select
              value={cfg.studentField ?? 'infoStatus'}
              onChange={(e) => upd({ studentField: e.target.value })}
              className={inputCls}
            >
              <option value="infoStatus">Statut des infos (infoStatus)</option>
              <option value="source">Source</option>
              <option value="occupation">Occupation</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Nouvelle valeur</label>
            {cfg.studentField === 'infoStatus' ? (
              <select
                value={cfg.studentValue ?? 'EXACTE'}
                onChange={(e) => upd({ studentValue: e.target.value })}
                className={inputCls}
              >
                <option value="EXACTE">EXACTE</option>
                <option value="ERRONÉE">ERRONÉE</option>
                <option value="NON VÉRIFIÉ">NON VÉRIFIÉ</option>
              </select>
            ) : (
              <input
                value={cfg.studentValue ?? ''}
                onChange={(e) => upd({ studentValue: e.target.value })}
                placeholder="{{payment.source}}"
                className={inputCls}
              />
            )}
          </div>
          <p className="rounded-lg bg-cyan-500/10 px-3 py-2 text-xs text-cyan-300">
            L'étudiant est identifié via l'email présent dans le contexte du déclencheur.
          </p>
        </>
      )}

      {/* create_task */}
      {step.type === 'create_task' && (
        <>
          <div>
            <label className={labelCls}>Titre de la tâche *</label>
            <input
              value={cfg.taskTitle ?? ''}
              onChange={(e) => upd({ taskTitle: e.target.value })}
              placeholder="Suivre {{student.name}} — {{payment.plan}}"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              value={cfg.taskDescription ?? ''}
              onChange={(e) => upd({ taskDescription: e.target.value })}
              placeholder={"Étudiant : {{student.name}}\nEmail : {{student.email}}"}
              rows={4}
              className={cn(inputCls, 'resize-y')}
            />
          </div>
          <div>
            <label className={labelCls}>Priorité</label>
            <select
              value={cfg.taskPriority ?? 'medium'}
              onChange={(e) => upd({ taskPriority: e.target.value })}
              className={inputCls}
            >
              <option value="low">Basse</option>
              <option value="medium">Moyenne</option>
              <option value="high">Haute</option>
              <option value="urgent">Urgente</option>
            </select>
          </div>
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-300">
            La tâche sera créée avec le tag "automatisation" et assignée à l'équipe.
          </p>
        </>
      )}

      {/* create_payment */}
      {step.type === 'create_payment' && (
        <CreatePaymentConfig step={step} onChange={onChange} inputCls={inputCls} labelCls={labelCls} />
      )}

      {/* create_student */}
      {step.type === 'create_student' && (
        <>
          <div>
            <label className={labelCls}>Email (expression) *</label>
            <input value={cfg.emailExpr ?? ''} onChange={(e) => upd({ emailExpr: e.target.value })} placeholder="{{answers.f04}}" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Nom (expression)</label>
            <input value={cfg.nameExpr ?? ''} onChange={(e) => upd({ nameExpr: e.target.value })} placeholder="{{answers.f02}}" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>WhatsApp (expression)</label>
            <input value={cfg.whatsappExpr ?? ''} onChange={(e) => upd({ whatsappExpr: e.target.value })} placeholder="{{answers.f05}}" className={inputCls} />
          </div>
          <p className="rounded-lg bg-purple-500/10 px-3 py-2 text-xs text-purple-300">
            Si un étudiant avec cet email existe déjà, l'étape est ignorée sans erreur.
          </p>
        </>
      )}

      {/* circle_invite */}
      {step.type === 'circle_invite' && (
        <>
          <div>
            <label className={labelCls}>Email (expression) *</label>
            <input value={cfg.emailExpr ?? ''} onChange={(e) => upd({ emailExpr: e.target.value })} placeholder="{{student.email}}" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Nom (expression)</label>
            <input value={cfg.nameExpr ?? ''} onChange={(e) => upd({ nameExpr: e.target.value })} placeholder="{{student.name}}" className={inputCls} />
          </div>
          <p className="rounded-lg bg-sky-500/10 px-3 py-2 text-xs text-sky-300">
            Si le membre est déjà dans Circle, l'invitation est ignorée.
          </p>
        </>
      )}

      {/* circle_tag_add / circle_tag_remove */}
      {(step.type === 'circle_tag_add' || step.type === 'circle_tag_remove') && (
        <>
          <div>
            <label className={labelCls}>Email (expression) *</label>
            <input value={cfg.emailExpr ?? ''} onChange={(e) => upd({ emailExpr: e.target.value })} placeholder="{{student.email}}" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Tag Circle *</label>
            {circlePlans.length > 0 ? (
              <select
                value={cfg.circleTagId ?? ''}
                onChange={(e) => {
                  const plan = circlePlans.find((p) => p.id === Number(e.target.value))
                  upd({ circleTagId: plan ? plan.id : undefined, circleTagName: plan?.name })
                }}
                className={inputCls}
              >
                <option value="">— Choisir un tag —</option>
                {circlePlans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} (ID {p.id})</option>
                ))}
              </select>
            ) : (
              <input
                value={cfg.circleTagId ?? ''}
                onChange={(e) => upd({ circleTagId: Number(e.target.value) || undefined })}
                placeholder="ID numérique du tag Circle"
                type="number"
                className={inputCls}
              />
            )}
            {cfg.circleTagName && (
              <p className="mt-1 text-xs text-gray-500">Tag sélectionné : <span className="text-gray-600">{cfg.circleTagName}</span></p>
            )}
          </div>
          <p className={cn(
            'rounded-lg px-3 py-2 text-xs',
            step.type === 'circle_tag_add' ? 'bg-teal-500/10 text-teal-300' : 'bg-rose-50 text-rose-300',
          )}>
            {step.type === 'circle_tag_add'
              ? 'Ajoute le tag au membre — les automations Circle se déclencheront ensuite.'
              : 'Retire le tag du membre — accès aux espaces limités par les automations Circle.'}
          </p>
        </>
      )}

      {/* create_subscription */}
      {step.type === 'create_subscription' && (
        <CreateSubscriptionConfig step={step} onChange={onChange} />
      )}

      {/* ── Conditions d'exécution (toutes étapes) ──────────────────── */}
      <div className="pt-2">
        <ConditionsEditor
          conditions={step.conditions ?? []}
          onChange={(conds) => onChange({ ...step, conditions: conds })}
        />
      </div>
    </div>
  )
}

// ── Run history ───────────────────────────────────────────────────────────────

function RunItem({ run }: { run: AutomationRun }) {
  const [expanded, setExpanded] = useState(false)

  const statusMeta = {
    completed: { icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-emerald-600', label: 'Terminé' },
    failed:    { icon: <XCircle className="h-4 w-4" />,       color: 'text-red-400',     label: 'Échoué' },
    running:   { icon: <RefreshCw className="h-4 w-4 animate-spin" />, color: 'text-blue-600', label: 'En cours' },
  }[run.status]

  const logMeta = {
    ok:      { icon: <CheckCircle2 className="h-3 w-3" />, color: 'text-emerald-600' },
    error:   { icon: <XCircle className="h-3 w-3" />,      color: 'text-red-400' },
    skipped: { icon: <SkipForward className="h-3 w-3" />,  color: 'text-yellow-600' },
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white"
      >
        <span className={statusMeta.color}>{statusMeta.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn('text-xs font-medium', statusMeta.color)}>{statusMeta.label}</span>
            <span className="text-xs text-gray-600">·</span>
            <span className="text-xs text-gray-500">{run.logs.length} étape{run.logs.length !== 1 ? 's' : ''}</span>
          </div>
          <p className="mt-0.5 text-xs text-gray-600">
            {new Date(run.createdAt).toLocaleString('fr-FR')}
          </p>
        </div>
        <ChevronDown className={cn('h-4 w-4 text-gray-600 transition-transform', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <div className="space-y-2 border-t border-gray-200 px-4 py-3">
          {run.logs.length === 0 && <p className="text-xs text-gray-600">Aucun log disponible</p>}
          {run.logs.map((log, i) => {
            const lm = logMeta[log.status]
            return (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className={cn('mt-0.5 shrink-0', lm.color)}>{lm.icon}</span>
                <div className="min-w-0">
                  <span className="font-medium text-gray-600">{log.stepName}</span>
                  <span className="mx-1.5 text-gray-700">·</span>
                  <span className="text-gray-500">{log.message}</span>
                </div>
              </div>
            )
          })}
          {run.error && <p className="text-xs text-red-400">Erreur système : {run.error}</p>}
        </div>
      )}
    </div>
  )
}

// ── Builder campaign modal ────────────────────────────────────────────────────

function BuilderCampaignModal({
  automationId, automationName, audience, onClose,
}: {
  automationId: string
  automationName: string
  audience?: AudienceConfig
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [result, setResult] = useState<{ ran: number } | null>(null)

  const { data: preview, isLoading: loadingPreview } = useQuery({
    queryKey: ['audience-preview', automationId],
    queryFn: () => previewAudience(automationId),
  })

  const runMut = useMutation({
    mutationFn: () => runAudience(automationId),
    onSuccess: (data) => {
      setResult(data)
      qc.invalidateQueries({ queryKey: ['automations'] })
    },
  })

  const entityLabel = audience?.entity === 'payment' ? 'paiement(s)' : 'étudiant(s)'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white border border-gray-200 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-fuchsia-500/10 border border-fuchsia-500/30">
            <Users className="h-4 w-4 text-fuchsia-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Lancer la campagne</h2>
            <p className="text-xs text-gray-500">{automationName}</p>
          </div>
        </div>

        {!result ? (
          <>
            <div className="rounded-lg border border-gray-200 bg-[#f5f6fa] p-4 mb-4">
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
              L'automatisation sera exécutée une fois pour chaque entité correspondante.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-800">
                Annuler
              </button>
              <button
                disabled={runMut.isPending || (preview?.count ?? 0) === 0}
                onClick={() => runMut.mutate()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-700 text-sm text-white font-medium disabled:opacity-50 transition-colors"
              >
                {runMut.isPending ? (
                  <><div className="h-3.5 w-3.5 animate-spin rounded-full border border-white border-t-transparent" />Exécution…</>
                ) : (
                  <><Play className="h-3.5 w-3.5" />Lancer ({preview?.count ?? 0})</>
                )}
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-900 mb-1">Campagne lancée</p>
            <p className="text-xs text-gray-500">{result.ran} {entityLabel} traité(s)</p>
            <button onClick={onClose} className="mt-4 px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm text-gray-800 transition-colors">
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function AutomationBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [tab, setTab] = useState<'workflow' | 'history'>('workflow')
  const [selected, setSelected] = useState<'trigger' | string>('trigger')
  const [name, setName] = useState('')
  const [steps, setSteps] = useState<AutomationStep[]>([])
  const [trigger, setTrigger] = useState<Automation['trigger']>({ type: 'manual', config: {} })
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [showCampaign, setShowCampaign] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: automation, isLoading } = useQuery({
    queryKey: ['automation', id],
    queryFn: () => fetchAutomation(id!),
    enabled: !!id,
  })

  const { data: forms = [] } = useQuery({
    queryKey: ['forms'],
    queryFn: fetchForms,
    enabled: trigger.type === 'form_submitted',
  })

  const { data: circlePlans = [] } = useQuery({
    queryKey: ['circle-plans'],
    queryFn: fetchCirclePlans,
  })

  // Champs du formulaire sélectionné pour les variables dynamiques
  const selectedForm = trigger.type === 'form_submitted' && trigger.config?.formId
    ? forms.find((f) => f._id === trigger.config?.formId)
    : undefined

  const { data: runsData, refetch: refetchRuns } = useQuery({
    queryKey: ['automation-runs', id],
    queryFn: () => fetchRuns(id!),
    enabled: !!id && tab === 'history',
  })

  const toggleMut = useMutation({
    mutationFn: () => toggleActive(id!),
    onSuccess: (updated) => {
      qc.setQueryData(['automation', id], (old: Automation | undefined) =>
        old ? { ...old, isActive: updated.isActive } : old,
      )
    },
  })

  const runMut = useMutation({
    mutationFn: () => runManual(id!),
    onSuccess: () => {
      setTab('history')
      setTimeout(() => refetchRuns(), 800)
    },
  })

  const saveMut = useMutation({
    mutationFn: (data: Parameters<typeof saveAutomation>[1]) => saveAutomation(id!, data),
    onSuccess: () => setSaveStatus('saved'),
    onError: () => setSaveStatus('unsaved'),
  })

  useEffect(() => {
    if (automation) {
      setName(automation.name)
      setSteps(automation.steps)
      setTrigger(automation.trigger)
    }
  }, [automation])

  const scheduleSave = useCallback(
    (patch: Parameters<typeof saveAutomation>[1]) => {
      setSaveStatus('unsaved')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        setSaveStatus('saving')
        saveMut.mutate(patch)
      }, 1500)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const changeName = (v: string) => {
    setName(v)
    scheduleSave({ name: v, steps, trigger })
  }

  const changeTrigger = (t: Automation['trigger']) => {
    setTrigger(t)
    scheduleSave({ name, steps, trigger: t })
  }

  const changeSteps = (s: AutomationStep[]) => {
    setSteps(s)
    scheduleSave({ name, steps: s, trigger })
  }

  const addStepAt = (type: StepType, index: number) => {
    const next = [...steps]
    const step = makeStep(type)
    next.splice(index, 0, step)
    setSelected(step.id)
    changeSteps(next)
  }

  const updateStep = (step: AutomationStep) => changeSteps(steps.map((s) => (s.id === step.id ? step : s)))

  const deleteStep = (stepId: string) => {
    if (selected === stepId) setSelected('trigger')
    changeSteps(steps.filter((s) => s.id !== stepId))
  }

  const selectedStep = steps.find((s) => s.id === selected)
  const selectedStepIndex = selectedStep ? steps.findIndex((s) => s.id === selectedStep.id) : -1
  const isActive = automation?.isActive ?? false

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-sm text-gray-500">Chargement...</div>
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {showCampaign && automation && (
        <BuilderCampaignModal
          automationId={automation._id}
          automationName={automation.name}
          audience={trigger.config?.audience}
          onClose={() => setShowCampaign(false)}
        />
      )}
      {/* Top bar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-[#f5f6fa] px-4 py-3">
        <button
          onClick={() => navigate('/automations')}
          className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <input
          value={name}
          onChange={(e) => changeName(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-gray-900 focus:outline-none"
          placeholder="Nom de l'automatisation"
        />

        <span
          className={cn(
            'shrink-0 text-xs',
            saveStatus === 'saved' ? 'text-gray-600'
            : saveStatus === 'saving' ? 'text-yellow-500'
            : 'text-orange-600',
          )}
        >
          {saveStatus === 'saved' ? 'Enregistré' : saveStatus === 'saving' ? 'Enregistrement…' : 'Non enregistré'}
        </span>

        <button
          onClick={() => toggleMut.mutate()}
          disabled={toggleMut.isPending}
          className={cn('relative h-5 w-9 shrink-0 overflow-hidden rounded-full p-0 transition-colors', isActive ? 'bg-indigo-600' : 'bg-gray-200')}
        >
          <span
            className={cn(
              'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
              isActive ? 'translate-x-4' : 'translate-x-0',
            )}
          />
        </button>
        <span className="shrink-0 text-xs text-gray-500">{isActive ? 'Actif' : 'Inactif'}</span>

        {trigger.type === 'audience_based' ? (
          <button
            onClick={() => setShowCampaign(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-fuchsia-600/15 px-3 py-1.5 text-xs font-medium text-fuchsia-400 transition-colors hover:bg-fuchsia-600/25"
          >
            <Users className="h-3.5 w-3.5" />
            Lancer campagne
          </button>
        ) : (
          <button
            onClick={() => runMut.mutate()}
            disabled={runMut.isPending}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600/15 px-3 py-1.5 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-600/25 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            {runMut.isPending ? 'Exécution…' : 'Exécuter'}
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex shrink-0 gap-1 border-b border-gray-200 px-4">
        {([
          { key: 'workflow', label: 'Workflow' },
          { key: 'history', label: runsData?.total ? `Historique (${runsData.total})` : 'Historique' },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'px-3 py-2.5 text-sm font-medium transition-colors',
              tab === t.key ? 'border-b-2 border-indigo-500 text-indigo-600' : 'text-gray-500 hover:text-gray-600',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Workflow tab */}
      {tab === 'workflow' && (
        <div className="flex flex-1 overflow-hidden">
          {/* Flow panel */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-md">
              <TriggerBlock
                triggerType={trigger.type}
                selected={selected === 'trigger'}
                onClick={() => setSelected('trigger')}
              />

              {steps.length === 0 ? (
                <>
                  <Connector onAdd={(type) => addStepAt(type, 0)} />
                  <div className="rounded-xl border border-dashed border-gray-200 px-6 py-5 text-center">
                    <Zap className="mx-auto mb-2 h-6 w-6 text-gray-700" />
                    <p className="text-sm text-gray-600">Ajoutez votre première étape</p>
                  </div>
                </>
              ) : (
                <>
                  <Connector onAdd={(type) => addStepAt(type, 0)} />
                  {steps.map((step, index) => (
                    <div key={step.id}>
                      <StepBlock
                        step={step}
                        index={index}
                        selected={selected === step.id}
                        onClick={() => setSelected(step.id)}
                        onDelete={() => deleteStep(step.id)}
                      />
                      <Connector onAdd={(type) => addStepAt(type, index + 1)} />
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Config panel */}
          <div className="w-80 shrink-0 overflow-y-auto border-l border-gray-200 bg-[#f5f6fa] p-4">
            {selected === 'trigger' ? (
              <>
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Configuration du déclencheur
                </h3>
                <TriggerConfig trigger={trigger} onChange={changeTrigger} forms={forms} />
                <VariablesPanel triggerType={trigger.type} formFields={selectedForm?.fields} />
              </>
            ) : selectedStep ? (
              <>
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Configuration de l'étape
                </h3>
                <StepConfig step={selectedStep} onChange={updateStep} circlePlans={circlePlans} />
                <VariablesPanel
                  triggerType={trigger.type}
                  formFields={selectedForm?.fields}
                  precedingSteps={steps.slice(0, selectedStepIndex)}
                />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Zap className="mb-3 h-8 w-8 text-gray-700" />
                <p className="text-sm text-gray-600">Cliquez sur un bloc pour le configurer</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-2xl space-y-3">
            {!runsData ? (
              <p className="py-8 text-center text-sm text-gray-500">Chargement…</p>
            ) : runsData.data.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <Play className="mb-3 h-8 w-8 text-gray-700" />
                <p className="text-sm text-gray-500">Aucune exécution pour l'instant</p>
                <p className="mt-1 text-xs text-gray-600">Utilisez le bouton "Exécuter" pour tester votre workflow</p>
              </div>
            ) : (
              runsData.data.map((run) => <RunItem key={run._id} run={run} />)
            )}
          </div>
        </div>
      )}
    </div>
  )
}
