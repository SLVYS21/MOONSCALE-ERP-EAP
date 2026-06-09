import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Plus, Search, Kanban, LayoutList,
  Phone, Mail, Globe, ChevronRight,
  TrendingUp, Target, Clock, CheckCircle, Upload, X, Filter,
  Briefcase, Banknote, Trophy, Star, BarChart2,
  CalendarDays, ExternalLink, AlertCircle, Video,
} from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip } from 'recharts'
import api from '@/services/api'
import type { Lead, PipelineStatus, AppSettings } from '@/types'
import { cn } from '@/lib/utils'
import { type Period, periodToDates } from '@/lib/periods'
import { DateRangePicker, ALL_PERIODS } from '@/components/ui/DateRangePicker'

// ── Constants ──────────────────────────────────────────────────────────────────

const PIPELINE_COLUMNS: {
  status: PipelineStatus
  label: string
  color: string
  dotColor: string
  bg: string
}[] = [
  { status: 'nouveau',          label: 'Nouveau',          color: 'text-gray-400',   dotColor: 'bg-gray-400',   bg: 'bg-gray-50' },
  { status: 'mql',              label: 'MQL',              color: 'text-blue-600',   dotColor: 'bg-blue-400',   bg: 'bg-blue-50' },
  { status: 'sql',              label: 'SQL',              color: 'text-indigo-600', dotColor: 'bg-indigo-400', bg: 'bg-indigo-50' },
  { status: 'rdv_programme',    label: 'RDV Programmé',    color: 'text-yellow-600', dotColor: 'bg-yellow-400', bg: 'bg-yellow-50' },
  { status: 'appel_diagnostic', label: 'Appel Diagnostic', color: 'text-orange-600', dotColor: 'bg-orange-400', bg: 'bg-orange-50' },
  { status: 'won',              label: 'Won',              color: 'text-green-600',  dotColor: 'bg-green-400',  bg: 'bg-green-50' },
  { status: 'lost',             label: 'Lost',             color: 'text-red-400',    dotColor: 'bg-red-400',    bg: 'bg-red-50' },
  { status: 'nurturing',        label: 'Nurturing',        color: 'text-purple-700', dotColor: 'bg-purple-400', bg: 'bg-purple-50' },
]

const SOURCE_LABELS: Record<string, string> = {
  typebot: 'Typebot',
  meta_ads: 'Meta Ads',
  whatsapp_tracked: 'WhatsApp',
  whatsapp_direct: 'WhatsApp direct',
  manual: 'Manuel',
  import: 'Import',
}

const PIPELINE_COLORS: Record<string, string> = {
  nouveau:          '#6b7280',
  mql:              '#3b82f6',
  sql:              '#6366f1',
  rdv_programme:    '#eab308',
  appel_diagnostic: '#f97316',
  won:              '#22c55e',
  lost:             '#ef4444',
  nurturing:        '#a855f7',
}

const SRC_COLORS = [
  '#6366f1', '#3b82f6', '#ec4899', '#06b6d4', '#22c55e',
  '#f97316', '#eab308', '#a855f7', '#f43f5e',
]

function fmtCFA(n: number) {
  return `${n.toLocaleString('fr-FR')} F CFA`
}

// ── Card helpers ───────────────────────────────────────────────────────────────

const AVATAR_PALETTE = [
  'bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-lime-600',
  'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-blue-500',
  'bg-violet-500', 'bg-pink-500', 'bg-indigo-500', 'bg-sky-500',
]

function avatarBg(name: string): string {
  let h = 0
  for (const c of name) h = ((h << 5) - h) + c.charCodeAt(0)
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length]
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function splitName(fullName: string): { nom: string; prenom: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return { nom: parts[0].toUpperCase(), prenom: '' }
  return {
    nom:    parts[parts.length - 1].toUpperCase(),
    prenom: parts.slice(0, -1).join(' '),
  }
}

function getProfession(lead: Lead): string | null {
  const d = lead.dynamic_fields ?? {}
  return (
    d['Situation professionnelle'] ??
    d['situation_professionnelle'] ??
    d['Profession'] ??
    d['profession'] ??
    d['Métier'] ??
    d['metier'] ??
    null
  ) as string | null
}

function getSourceLabel(lead: Lead): string | null {
  return lead.utm_source ?? lead.reseau_source ?? SOURCE_LABELS[lead.source_type] ?? null
}

function formatBudget(amount: number, lead: Lead): string {
  const d = lead.dynamic_fields ?? {}
  const explicit = (d['devise'] ?? d['Devise'] ?? d['currency'] ?? d['Currency']) as string | undefined
  const cur = explicit || (amount < 10000 ? '€' : 'F CFA')
  return `${amount.toLocaleString('fr-FR')} ${cur}`
}

// ── Create Lead Modal ─────────────────────────────────────────────────────────

function CreateLeadModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: '', email: '', phone: '', utm_source: '', motivation: '',
    reseau_source: '', lead_magnet: '',
  })

  const { data: appSettings } = useQuery<AppSettings>({
    queryKey: ['app-settings'],
    queryFn: () => api.get('/app-settings').then(r => r.data),
  })

  const mutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/leads', { ...data, source_type: 'manual' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['leads'] }); onClose() },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl bg-white border border-gray-200 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-900 mb-5">Nouveau lead</h2>

        <div className="space-y-3">
          {[
            { key: 'name', label: 'Nom *', placeholder: 'Nom complet' },
            { key: 'email', label: 'Email', placeholder: 'email@exemple.com' },
            { key: 'phone', label: 'Téléphone', placeholder: '+229...' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-400 mb-1">{label}</label>
              <input
                className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none"
                placeholder={placeholder}
                value={(form as Record<string, string>)[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Réseau social</label>
              <select
                className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none"
                value={form.reseau_source}
                onChange={(e) => setForm((f) => ({ ...f, reseau_source: e.target.value }))}
              >
                <option value="">— Non renseigné —</option>
                {(appSettings?.lead_sources ?? ['YouTube', 'TikTok', 'Facebook']).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Lead Magnet</label>
              <select
                className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none"
                value={form.lead_magnet}
                onChange={(e) => setForm((f) => ({ ...f, lead_magnet: e.target.value }))}
              >
                <option value="">— Non renseigné —</option>
                {(appSettings?.lead_magnets ?? ['Formation Gratuite', 'Ressources Gratuite', 'Webinaires']).map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Source UTM</label>
            <input
              className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none"
              placeholder="facebook_ads, tiktok_bio..."
              value={form.utm_source}
              onChange={(e) => setForm((f) => ({ ...f, utm_source: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Motivation</label>
            <textarea
              rows={2}
              className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none resize-none"
              placeholder="Ce que cherche le lead..."
              value={form.motivation}
              onChange={(e) => setForm((f) => ({ ...f, motivation: e.target.value }))}
            />
          </div>
        </div>

        {mutation.error && (
          <p className="mt-3 text-xs text-red-400">
            {(mutation.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur'}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-800 transition-colors">
            Annuler
          </button>
          <button
            disabled={!form.name || mutation.isPending}
            onClick={() => mutation.mutate(form)}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm text-white font-medium disabled:opacity-50 transition-colors"
          >
            {mutation.isPending ? 'Création...' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Quick Call Modal ──────────────────────────────────────────────────────────

function QuickCallModal({ lead, myBookingUrl, onClose }: {
  lead: Lead
  myBookingUrl: string | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  type Step = 'pre' | 'iframe' | 'manual'
  const [step, setStep] = useState<Step>(myBookingUrl ? 'pre' : 'manual')
  const [sendEmail, setSendEmail] = useState(!!lead.email)
  const [prefLoading, setPrefLoading] = useState(false)

  // Manual form
  const defaultDate = (() => {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0)
    return d.toISOString().slice(0, 16)
  })()
  const [date, setDate] = useState(defaultDate)
  const [meetLink, setMeetLink] = useState('')
  const [manualSendEmail, setManualSendEmail] = useState(!!lead.email)
  const [emailSent, setEmailSent] = useState(false)

  const createMutation = useMutation({
    mutationFn: () => api.post(`/leads/${lead._id}/calls`, {
      date, google_meet_link: meetLink || undefined, sendEmail: manualSendEmail && !!lead.email,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      if (manualSendEmail && lead.email) { setEmailSent(true); setTimeout(onClose, 2000) }
      else onClose()
    },
  })

  const handlePreConfirm = async () => {
    setPrefLoading(true)
    try { await api.post(`/leads/${lead._id}/booking-pref`, { sendEmail: sendEmail && !!lead.email }) } catch { /* ignore */ }
    setPrefLoading(false)
    setStep('iframe')
  }

  const generateMeet = () => {
    const id = Math.random().toString(36).slice(2, 5) + '-' + Math.random().toString(36).slice(2, 7) + '-' + Math.random().toString(36).slice(2, 5)
    setMeetLink(`https://meet.google.com/${id}`)
  }

  // ── Iframe view (fullscreen) ───────────────────────────────
  if (step === 'iframe') {
    const params = new URLSearchParams()
    if (lead.name) params.set('name', lead.name)
    if (lead.email) params.set('email', lead.email)
    const iframeUrl = `${myBookingUrl}?${params.toString()}`

    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#f5f6fa]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <CalendarDays size={16} className="text-indigo-600" />
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Programmer un appel — {lead.name}</h2>
              <p className="text-xs text-gray-500">Cal.com enverra l'invitation automatiquement</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href={iframeUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs text-gray-600">
              <ExternalLink size={12} /> Ouvrir dans un onglet
            </a>
            <button onClick={() => { onClose(); qc.invalidateQueries({ queryKey: ['lead-calls', lead._id] }) }}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-600 hover:bg-gray-100">
              <X size={16} />
            </button>
          </div>
        </div>
        <iframe src={iframeUrl} className="flex-1 w-full border-none" title="Réservation Cal.com" />
      </div>
    )
  }

  // ── Pre-booking screen ─────────────────────────────────────
  if (step === 'pre') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-white border border-gray-200 rounded-xl w-full max-w-sm p-6 space-y-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays size={18} className="text-indigo-600 mt-0.5" />
              <h2 className="text-base font-semibold text-gray-900">Programmer un appel</h2>
            </div>
            <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-600"><X size={16} /></button>
          </div>
          <p className="text-sm text-gray-400">
            Cal.com s'ouvrira pour choisir un créneau avec <span className="text-gray-800">{lead.name}</span>.
          </p>
          {lead.email && (
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div onClick={() => setSendEmail(v => !v)}
                className={`relative w-10 h-5 rounded-full transition-colors ${sendEmail ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${sendEmail ? 'translate-x-5' : ''}`} />
              </div>
              <span className="text-sm text-gray-600">
                Envoyer aussi l'email ERP à <span className="text-gray-900">{lead.email}</span>
              </span>
            </label>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-400 hover:text-gray-800 transition-colors">
              Annuler
            </button>
            <button onClick={handlePreConfirm} disabled={prefLoading}
              className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white disabled:opacity-60 transition-colors">
              {prefLoading ? 'Chargement…' : 'Ouvrir Cal.com →'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Manual form ────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white border border-gray-200 rounded-xl w-full max-w-sm p-6 space-y-4">
        {emailSent ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle size={36} className="text-green-600" />
            <p className="text-sm text-gray-600">Email envoyé à <span className="text-gray-900">{lead.email}</span></p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays size={18} className="text-indigo-600 mt-0.5" />
                <h2 className="text-base font-semibold text-gray-900">Nouvel appel — {lead.name}</h2>
              </div>
              <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Date & heure</label>
              <input type="datetime-local" value={date} onChange={e => setDate(e.target.value)}
                className="w-full rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Lien Google Meet</label>
              <div className="flex gap-2">
                <input value={meetLink} onChange={e => setMeetLink(e.target.value)}
                  placeholder="https://meet.google.com/..."
                  className="flex-1 rounded-lg bg-gray-100 border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none" />
                <button onClick={generateMeet}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-600 text-xs text-gray-600 shrink-0 transition-colors">
                  <Video size={12} /> Nouveau
                </button>
              </div>
            </div>
            {lead.email && (
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div onClick={() => setManualSendEmail(v => !v)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${manualSendEmail ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${manualSendEmail ? 'translate-x-5' : ''}`} />
                </div>
                <span className="text-sm text-gray-600">Email de confirmation à <span className="text-gray-900">{lead.email}</span></span>
              </label>
            )}
            {createMutation.isError && (
              <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12} /> Erreur lors de la création</p>
            )}
            <div className="flex gap-3 pt-1">
              <button onClick={onClose}
                className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-400 hover:text-gray-800 transition-colors">
                Annuler
              </button>
              <button onClick={() => createMutation.mutate()} disabled={!date || createMutation.isPending}
                className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white disabled:opacity-60 transition-colors">
                {createMutation.isPending ? 'Création…' : 'Créer'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Lead Card ─────────────────────────────────────────────────────────────────

function LeadCard({ lead, onScheduleCall }: { lead: Lead; onScheduleCall?: () => void }) {
  const budget     = lead.budget ?? (lead.dynamic_fields?.budget as number | undefined) ?? null
  const { nom, prenom } = splitName(lead.name)
  const profession = getProfession(lead)
  const source     = getSourceLabel(lead)
  const bg         = avatarBg(lead.name)

  const closerInitials = lead.closer_id
    ? (lead.closer_id.firstName[0] + lead.closer_id.lastName[0]).toUpperCase()
    : null
  const closerBg = lead.closer_id
    ? avatarBg(lead.closer_id.firstName + lead.closer_id.lastName)
    : null

  return (
    <Link
      to={`/leads/${lead._id}`}
      className="block rounded-xl bg-white border border-gray-200 hover:border-gray-200 hover:bg-gray-50 p-4 transition-all"
    >
      {/* Avatar + call button */}
      <div className="flex items-start justify-between gap-2">
        <div className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0',
          bg,
        )}>
          {getInitials(lead.name)}
        </div>
        {onScheduleCall && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onScheduleCall() }}
            title="Programmer un appel"
            className="p-1.5 rounded-lg text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 transition-colors shrink-0"
          >
            <CalendarDays size={14} />
          </button>
        )}
      </div>

      {/* NOM Prénom */}
      <p className="mt-2.5 text-[13px] leading-tight">
        <span className="font-bold text-gray-900">{nom}</span>
        {prenom && <span className="font-normal text-gray-400"> {prenom}</span>}
      </p>

      {/* Profession · Age */}
      {(profession || lead.age) && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-gray-500">
          <Briefcase size={10} className="shrink-0 text-gray-600" />
          <span className="truncate">
            {[profession, lead.age ? `${lead.age} ans` : null].filter(Boolean).join(' · ')}
          </span>
        </div>
      )}

      {/* Budget */}
      {budget != null && (
        <div className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5">
          <Banknote size={11} className="text-emerald-500 shrink-0" />
          <span className="text-[11px] font-semibold text-emerald-600 truncate">
            {formatBudget(budget, lead)}
          </span>
        </div>
      )}

      {/* Source + closer */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        {source ? (
          <div className="flex items-center gap-1 text-[11px] text-gray-500 min-w-0">
            <Globe size={10} className="shrink-0 text-gray-600" />
            <span className="truncate">{source}</span>
          </div>
        ) : <div />}

        {closerInitials && closerBg ? (
          <div className="flex items-center gap-1 shrink-0">
            <div className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white',
              closerBg,
            )}>
              {closerInitials}
            </div>
            <span className="text-[11px] text-gray-500 max-w-[56px] truncate">
              {lead.closer_id?.firstName}
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-gray-600 shrink-0">Non assigné</span>
        )}
      </div>
    </Link>
  )
}

// ── Kanban View ───────────────────────────────────────────────────────────────

function KanbanView({
  leads,
  pipelineFilter,
  onStatusChange,
  onScheduleCall,
}: {
  leads: Lead[]
  pipelineFilter: string
  onStatusChange: (leadId: string, status: PipelineStatus) => void
  onScheduleCall: (lead: Lead) => void
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overCol, setOverCol]       = useState<PipelineStatus | null>(null)

  const grouped = PIPELINE_COLUMNS.reduce<Record<string, Lead[]>>((acc, col) => {
    acc[col.status] = leads.filter((l) => l.pipeline_status === col.status)
    return acc
  }, {})

  const visibleCols = pipelineFilter
    ? PIPELINE_COLUMNS.filter((c) => c.status === pipelineFilter)
    : PIPELINE_COLUMNS

  const draggingLead = draggingId ? leads.find((l) => l._id === draggingId) : null

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 select-none" style={{ minWidth: 0 }}>
      {visibleCols.map((col) => {
        const isTarget  = overCol === col.status && draggingId !== null && draggingLead?.pipeline_status !== col.status
        const colLeads  = grouped[col.status] ?? []

        return (
          <div key={col.status} className="shrink-0 w-[272px] flex flex-col">
            {/* Column header */}
            <div className="flex items-center gap-2 px-1 py-2 mb-2">
              <div className={cn('w-2 h-2 rounded-full shrink-0', col.dotColor)} />
              <span className="flex-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                {col.label}
              </span>
              <span className="rounded-full bg-gray-100 border border-gray-200/60 px-2 py-0.5 text-[11px] font-semibold text-gray-400">
                {colLeads.length}
              </span>
            </div>

            {/* Drop zone */}
            <div
              className={cn(
                'flex-1 rounded-xl border p-2 space-y-2.5 min-h-[200px] transition-colors',
                isTarget
                  ? 'bg-indigo-900/10 border-indigo-600/40'
                  : 'bg-[#f5f6fa]/60 border-gray-200/60',
              )}
              onDragOver={(e) => { e.preventDefault(); if (overCol !== col.status) setOverCol(col.status) }}
              onDragEnter={(e) => { e.preventDefault(); setOverCol(col.status) }}
              onDrop={(e) => {
                e.preventDefault()
                if (draggingId && draggingLead?.pipeline_status !== col.status) {
                  onStatusChange(draggingId, col.status)
                }
                setDraggingId(null); setOverCol(null)
              }}
            >
              {colLeads.map((lead) => (
                <div
                  key={lead._id}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDraggingId(lead._id) }}
                  onDragEnd={() => { setDraggingId(null); setOverCol(null) }}
                  className={cn(
                    'cursor-grab active:cursor-grabbing transition-opacity',
                    draggingId === lead._id && 'opacity-25',
                  )}
                >
                  <LeadCard lead={lead} onScheduleCall={() => onScheduleCall(lead)} />
                </div>
              ))}

              {colLeads.length === 0 && (
                <div className={cn(
                  'flex items-center justify-center rounded-lg border-2 border-dashed min-h-[80px] transition-colors',
                  isTarget ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-gray-200/50',
                )}>
                  <p className={cn('text-xs', isTarget ? 'text-indigo-600' : 'text-gray-700')}>
                    {isTarget ? '↓ Déposer ici' : 'Vide'}
                  </p>
                </div>
              )}

              {colLeads.length > 0 && isTarget && (
                <div className="h-12 rounded-lg border-2 border-dashed border-indigo-500/40 bg-indigo-500/5 flex items-center justify-center">
                  <span className="text-xs text-indigo-600">↓ Déposer ici</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Table View ────────────────────────────────────────────────────────────────

function TableView({ leads, onStatusChange, onScheduleCall }: {
  leads: Lead[]
  onStatusChange: (leadId: string, status: PipelineStatus) => void
  onScheduleCall: (lead: Lead) => void
}) {
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-white">
            {['Nom', 'Contact', 'Source', 'Pipeline', 'Closer', ''].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => {
            const col = PIPELINE_COLUMNS.find((c) => c.status === lead.pipeline_status)
            const { nom, prenom } = splitName(lead.name)
            return (
              <tr key={lead._id} className="border-b border-gray-200/50 hover:bg-white/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0', avatarBg(lead.name))}>
                      {getInitials(lead.name)}
                    </div>
                    <div>
                      <p className="text-[13px] text-gray-800">
                        <span className="font-bold">{nom}</span>
                        {prenom && <span className="font-normal text-gray-400"> {prenom}</span>}
                      </p>
                      {lead.age && <p className="text-[11px] text-gray-600">{lead.age} ans</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {lead.email && (
                    <div className="flex items-center gap-1.5 text-gray-400">
                      <Mail size={12} />
                      <span className="text-xs truncate max-w-[160px]">{lead.email}</span>
                    </div>
                  )}
                  {lead.phone && (
                    <div className="flex items-center gap-1.5 text-gray-400 mt-0.5">
                      <Phone size={12} />
                      <span className="text-xs">{lead.phone}</span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {lead.utm_source ? (
                    <div className="flex items-center gap-1.5">
                      <Globe size={12} className="text-gray-500" />
                      <span className="text-xs text-gray-400">{lead.utm_source}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-600">{SOURCE_LABELS[lead.source_type] ?? lead.source_type}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={lead.pipeline_status}
                    onChange={(e) => onStatusChange(lead._id, e.target.value as PipelineStatus)}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-medium bg-transparent border border-transparent',
                      'hover:border-gray-600 focus:outline-none focus:border-indigo-500 cursor-pointer',
                      col?.color ?? 'text-gray-400',
                    )}
                  >
                    {PIPELINE_COLUMNS.map((c) => (
                      <option key={c.status} value={c.status} className="bg-white text-gray-900">
                        {c.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  {lead.closer_id ? (
                    <div className="flex items-center gap-1.5">
                      <div className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white', avatarBg(lead.closer_id.firstName + lead.closer_id.lastName))}>
                        {(lead.closer_id.firstName[0] + lead.closer_id.lastName[0]).toUpperCase()}
                      </div>
                      <span className="text-xs text-gray-400">
                        {lead.closer_id.firstName} {lead.closer_id.lastName}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-600">Non assigné</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onScheduleCall(lead)}
                      title="Programmer un appel"
                      className="p-1.5 rounded-lg text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                    >
                      <CalendarDays size={14} />
                    </button>
                    <Link
                      to={`/leads/${lead._id}`}
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-300"
                    >
                      Voir <ChevronRight size={12} />
                    </Link>
                  </div>
                </td>
              </tr>
            )
          })}
          {leads.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-500">
                Aucun lead trouvé
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Stats Bar ─────────────────────────────────────────────────────────────────

function StatsBar({ leads }: { leads: Lead[] }) {
  const total    = leads.length
  const won      = leads.filter((l) => l.pipeline_status === 'won').length
  const sql      = leads.filter((l) => ['sql', 'rdv_programme', 'appel_diagnostic'].includes(l.pipeline_status)).length
  const convRate = total > 0 ? Math.round((won / total) * 100) : 0

  return (
    <div className="grid grid-cols-4 gap-3 mb-5">
      {[
        { icon: Target,      label: 'Total leads',      value: total,        color: 'text-gray-600' },
        { icon: TrendingUp,  label: 'En phase SQL+',     value: sql,          color: 'text-indigo-600' },
        { icon: CheckCircle, label: 'Won',               value: won,          color: 'text-green-600' },
        { icon: Clock,       label: 'Taux conversion',   value: `${convRate}%`, color: 'text-yellow-600' },
      ].map(({ icon: Icon, label, value, color }) => (
        <div key={label} className="rounded-xl bg-white border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Icon size={14} className={color} />
            <span className="text-xs text-gray-500">{label}</span>
          </div>
          <p className={cn('text-2xl font-bold', color)}>{value}</p>
        </div>
      ))}
    </div>
  )
}



// ── Leads Analytics Tab ───────────────────────────────────────────────────────

function LeadsAnalytics() {
  const [period, setPeriod]       = useState<Period | ''>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]   = useState('')

  const { from: dateFrom, to: dateTo } = (!period || period === 'custom')
    ? { from: customFrom, to: customTo }
    : periodToDates(period)

  const { data, isLoading } = useQuery({
    queryKey: ['leads-analytics-tab', dateFrom, dateTo],
    queryFn: () =>
      api.get('/leads', {
        params: {
          date_from: dateFrom || undefined,
          date_to:   dateTo   || undefined,
          limit: 1000,
        },
      }).then((r) => r.data as { data: Lead[]; total: number }),
  })

  const leads = data?.data ?? []
  const total = leads.length

  const byPipeline: Record<string, number> = {}
  const bySource:   Record<string, number> = {}
  const budgetByPipeline: Record<string, number> = {}

  for (const lead of leads) {
    const s = lead.pipeline_status
    byPipeline[s] = (byPipeline[s] ?? 0) + 1

    const src =
      (lead.reseau_source && lead.reseau_source.trim())
        ? lead.reseau_source.trim()
        : (lead.utm_source && lead.utm_source.trim())
          ? lead.utm_source.trim()
          : SOURCE_LABELS[lead.source_type] ?? null
    if (src) bySource[src] = (bySource[src] ?? 0) + 1

    const budget = (lead.budget ?? (lead.dynamic_fields?.budget as number | undefined) ?? 0) as number
    if (budget > 0) budgetByPipeline[s] = (budgetByPipeline[s] ?? 0) + budget
  }

  const wonCount    = byPipeline['won'] ?? 0
  const sqlCount    = (byPipeline['sql'] ?? 0) + (byPipeline['rdv_programme'] ?? 0) + (byPipeline['appel_diagnostic'] ?? 0)
  const actifsCount = total - wonCount - (byPipeline['lost'] ?? 0)
  const convRate    = total > 0 ? Math.round((wonCount / total) * 100) : 0

  const donutData = PIPELINE_COLUMNS
    .map(c => ({ name: c.label, value: byPipeline[c.status] ?? 0, color: PIPELINE_COLORS[c.status] }))
    .filter(d => d.value > 0)

  const mqlPlus   = total - (byPipeline['nouveau'] ?? 0) - (byPipeline['lost'] ?? 0)
  const sqlPlus   = (byPipeline['sql'] ?? 0) + (byPipeline['rdv_programme'] ?? 0) + (byPipeline['appel_diagnostic'] ?? 0) + wonCount
  const rdvPlus   = (byPipeline['rdv_programme'] ?? 0) + (byPipeline['appel_diagnostic'] ?? 0) + wonCount
  const appelPlus = (byPipeline['appel_diagnostic'] ?? 0) + wonCount

  const funnelStages = [
    { label: 'Total leads',  count: total,     prev: total,     color: '#6b7280' },
    { label: 'MQL+',         count: mqlPlus,   prev: total,     color: '#3b82f6' },
    { label: 'SQL+',         count: sqlPlus,   prev: mqlPlus,   color: '#6366f1' },
    { label: 'RDV+',         count: rdvPlus,   prev: sqlPlus,   color: '#eab308' },
    { label: 'Appel diag.+', count: appelPlus, prev: rdvPlus,   color: '#f97316' },
    { label: 'Won',          count: wonCount,  prev: appelPlus, color: '#22c55e' },
  ]

  const sourcesData   = Object.entries(bySource).sort(([, a], [, b]) => b - a).slice(0, 8)
  const maxSource     = sourcesData[0]?.[1] ?? 1

  const budgetData    = Object.entries(budgetByPipeline).sort(([, a], [, b]) => b - a)
  const maxBudget     = budgetData[0]?.[1] ?? 1
  const totalBudget   = Object.values(budgetByPipeline).reduce((a, b) => a + b, 0)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Period picker */}
      <div className="flex items-center gap-2">
        <DateRangePicker
          period={period} customFrom={customFrom} customTo={customTo}
          onChange={(p, from, to) => { setPeriod(p as Period | ''); setCustomFrom(from); setCustomTo(to) }}
          periods={ALL_PERIODS}
          placeholder="Toutes les dates"
        />
        {total > 0 && <span className="text-xs text-gray-600">{total} lead{total > 1 ? 's' : ''} sur la période</span>}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-xl bg-white border border-gray-200 p-4 flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500">Total Leads</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{total}</p>
            <p className="text-xs text-gray-600 mt-1">sur la période</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
            <Target size={16} className="text-gray-400" />
          </div>
        </div>

        <div className="rounded-xl bg-white border border-gray-200 p-4 flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500">SQL</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{sqlCount}</p>
            <p className="text-xs text-gray-600 mt-1">leads qualifiés vente</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
            <Star size={16} className="text-gray-400" />
          </div>
        </div>

        <div className="rounded-xl bg-amber-950/30 border border-amber-900/30 p-4 flex items-start justify-between">
          <div>
            <p className="text-xs text-amber-700">Actifs</p>
            <p className="text-3xl font-bold text-amber-400 mt-1">{actifsCount}</p>
            <p className="text-xs text-amber-900/70 mt-1">en cours dans le pipeline</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-amber-900/30 flex items-center justify-center shrink-0">
            <TrendingUp size={16} className="text-amber-500" />
          </div>
        </div>

        <div className="rounded-xl bg-white border border-gray-200 p-4 flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500">Won</p>
            <p className="text-3xl font-bold text-green-600 mt-1">
              {wonCount}
              <span className="text-lg font-normal text-gray-600 mx-1">·</span>
              <span className="text-lg font-semibold text-green-500">{convRate}%</span>
            </p>
            <p className="text-xs text-gray-600 mt-1">taux de conversion</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-green-950/40 flex items-center justify-center shrink-0">
            <Trophy size={16} className="text-green-500" />
          </div>
        </div>
      </div>

      {/* Row 1 — Donut + Funnel */}
      <div className="grid grid-cols-2 gap-4">
        {/* Donut */}
        <div className="rounded-xl bg-white border border-gray-200 p-5">
          <p className="text-sm font-semibold text-gray-800 mb-4">Répartition des leads par statut</p>
          {donutData.length > 0 ? (
            <div className="flex items-center gap-5">
              <div className="relative shrink-0" style={{ width: 180, height: 180 }}>
                <PieChart width={180} height={180}>
                  <Pie
                    data={donutData} cx={90} cy={90}
                    innerRadius={56} outerRadius={80} paddingAngle={2}
                    dataKey="value" startAngle={90} endAngle={-270}
                  >
                    {donutData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                    formatter={(val, name) => {
                      const v = Number(val) || 0
                      const pct = total > 0 ? Math.round((v / total) * 100) : 0
                      return [`${v} (${pct}%)`, String(name)]
                    }}
                  />
                </PieChart>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold text-gray-900">{total}</span>
                  <span className="text-[10px] text-gray-500 mt-0.5">leads</span>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                {donutData.map((entry) => {
                  const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0
                  return (
                    <div key={entry.name} className="flex items-center justify-between text-[12px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
                        <span className="text-gray-400 truncate">{entry.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="font-semibold text-gray-800">{entry.value}</span>
                        <span className="text-gray-600 w-8 text-right">{pct}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600 py-8 text-center">Aucun lead sur la période</p>
          )}
        </div>

        {/* Funnel */}
        <div className="rounded-xl bg-white border border-gray-200 p-5">
          <p className="text-sm font-semibold text-gray-800 mb-4">Entonnoir de conversion</p>
          <div className="space-y-2.5">
            {funnelStages.map((stage, i) => {
              const widthPct  = total > 0 ? Math.max((stage.count / total) * 100, stage.count > 0 ? 6 : 0) : 0
              const convPct   = i === 0 ? null : (stage.prev > 0 ? Math.round((stage.count / stage.prev) * 100) : 0)
              return (
                <div key={stage.label} className="flex items-center gap-2">
                  <div className="w-[88px] text-[11px] text-gray-500 text-right shrink-0">{stage.label}</div>
                  <div className="flex-1 h-7 rounded bg-gray-100 relative overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded flex items-center px-2 transition-all"
                      style={{ width: `${widthPct}%`, backgroundColor: stage.color + 'dd' }}
                    >
                      <span className="text-[12px] font-bold text-white">{stage.count}</span>
                    </div>
                  </div>
                  <div className="w-9 text-right shrink-0">
                    {convPct !== null && (
                      <span className="text-[11px] text-gray-500">{convPct}%</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Row 2 — Sources + Budget */}
      <div className="grid grid-cols-2 gap-4">
        {/* Sources */}
        <div className="rounded-xl bg-white border border-gray-200 p-5">
          <p className="text-sm font-semibold text-gray-800 mb-4">Leads par source</p>
          {sourcesData.length > 0 ? (
            <div className="space-y-2.5">
              {sourcesData.map(([src, count], i) => (
                <div key={src} className="flex items-center gap-2">
                  <div className="w-20 text-[11px] text-gray-400 text-right shrink-0 truncate">{src}</div>
                  <div className="flex-1 h-7 rounded bg-gray-100 relative overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded flex items-center justify-end px-2 transition-all"
                      style={{ width: `${Math.max((count / maxSource) * 100, 8)}%`, backgroundColor: SRC_COLORS[i % SRC_COLORS.length] + 'dd' }}
                    >
                      <span className="text-[12px] font-bold text-white">{count}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-600 py-8 text-center">Aucune source renseignée</p>
          )}
        </div>

        {/* Budget */}
        <div className="rounded-xl bg-white border border-gray-200 p-5">
          <div className="flex items-start justify-between mb-1">
            <p className="text-sm font-semibold text-gray-800">Valeur des opportunités</p>
            {totalBudget > 0 && (
              <span className="text-xs font-semibold text-green-600 shrink-0 ml-2">
                Total : {fmtCFA(totalBudget)}
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-600 mb-3">Budget cumulé des leads par statut (en F CFA)</p>
          {budgetData.length > 0 ? (
            <div className="space-y-2.5">
              {budgetData.map(([status, value]) => {
                const col   = PIPELINE_COLUMNS.find(c => c.status === status)
                const color = PIPELINE_COLORS[status] ?? '#6b7280'
                return (
                  <div key={status} className="flex items-center gap-2">
                    <div className="w-[88px] text-[11px] text-gray-400 text-right shrink-0 truncate">{col?.label ?? status}</div>
                    <div className="flex-1 h-7 rounded bg-gray-100 relative overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded flex items-center px-2 transition-all"
                        style={{ width: `${Math.max((value / maxBudget) * 100, 10)}%`, backgroundColor: color + 'dd' }}
                      >
                        <span className="text-[11px] font-semibold text-white truncate">{fmtCFA(value)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-600 py-8 text-center">Aucun budget renseigné</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function LeadsPage() {
  const [activeTab, setActiveTab] = useState<'pipeline' | 'analytics'>('pipeline')
  const [view, setView]           = useState<'kanban' | 'table'>('kanban')
  const [showCreate, setShowCreate] = useState(false)
  const [schedulingLead, setSchedulingLead] = useState<Lead | null>(null)
  const [search, setSearch]       = useState('')
  const [pipeline, setPipeline]   = useState('')
  const [source, setSource]       = useState('')
  const [period, setPeriod]       = useState<Period | ''>('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]   = useState('')
  const csvRef = useRef<HTMLInputElement>(null)
  const qc     = useQueryClient()

  const { from: dateFrom, to: dateTo } = period === 'custom'
    ? { from: customFrom, to: customTo }
    : periodToDates(period)

  const activeFilters = [pipeline, source, period || customFrom || customTo].filter(Boolean).length

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PipelineStatus }) =>
      api.patch(`/leads/${id}/pipeline`, { status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['leads'] })
      const prevData = qc.getQueriesData<{ data: Lead[]; total: number }>({ queryKey: ['leads'] })
      qc.setQueriesData<{ data: Lead[]; total: number }>(
        { queryKey: ['leads'] },
        (old) => old
          ? { ...old, data: old.data.map((l) => l._id === id ? { ...l, pipeline_status: status } : l) }
          : old,
      )
      return { prevData }
    },
    onError: (_err, _vars, ctx) => {
      ctx?.prevData.forEach(([key, data]) => qc.setQueryData(key as QueryKey, data))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })

  const importCsv = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return api.post('/leads/import-csv', fd, { headers: { 'Content-Type': undefined } })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  })

  const { data: calcomUrlData } = useQuery({
    queryKey: ['calcom-my-booking-url'],
    queryFn: () => api.get('/calcom/my-booking-url').then(r => r.data as { url: string | null }),
    staleTime: 5 * 60_000,
    retry: false,
  })
  const myBookingUrl = calcomUrlData?.url ?? null

  const { data, isLoading } = useQuery({
    queryKey: ['leads', search, pipeline, source, dateFrom, dateTo],
    queryFn: () =>
      api.get('/leads', {
        params: {
          search: search || undefined,
          pipeline_status: pipeline || undefined,
          source_type: source || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          limit: 500,
        },
      }).then((r) => r.data as { data: Lead[]; total: number }),
  })

  const leads = data?.data ?? []

  const clearFilters = () => {
    setPipeline(''); setSource(''); setPeriod(''); setCustomFrom(''); setCustomTo('')
  }

  return (
    <div className="p-6">
      {showCreate && <CreateLeadModal onClose={() => setShowCreate(false)} />}
      {schedulingLead && (
        <QuickCallModal
          lead={schedulingLead}
          myBookingUrl={myBookingUrl}
          onClose={() => setSchedulingLead(null)}
        />
      )}
      <input
        type="file" accept=".csv" ref={csvRef} className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) importCsv.mutate(f)
          e.target.value = ''
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Leads & Acquisition</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.total ?? 0} leads au total</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => csvRef.current?.click()}
            disabled={importCsv.isPending}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm text-gray-600 disabled:opacity-50 transition-colors"
          >
            <Upload size={14} />
            {importCsv.isPending ? 'Import...' : 'Import CSV'}
          </button>
          <Link to="/payments/offers" className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm text-gray-600 transition-colors">
            Offres
          </Link>
          <Link to="/leads/scoring" className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm text-gray-600 transition-colors">
            Scoring
          </Link>
          <Link to="/leads/tracking" className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm text-gray-600 transition-colors">
            Liens WA
          </Link>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm text-white font-medium transition-colors"
          >
            <Plus size={16} />
            Nouveau lead
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-5">
        <button
          onClick={() => setActiveTab('pipeline')}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'pipeline'
              ? 'border-indigo-500 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-600',
          )}
        >
          <Kanban size={13} />
          Pipeline
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            activeTab === 'analytics'
              ? 'border-indigo-500 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-600',
          )}
        >
          <BarChart2 size={13} />
          Analytics
        </button>
      </div>

      {activeTab === 'analytics' ? (
        <LeadsAnalytics />
      ) : (
        <>

      {/* Stats */}
      <StatsBar leads={leads} />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-[11px] font-bold uppercase tracking-widest text-gray-600 mr-1 shrink-0">Filtres :</span>

        {/* Search pill */}
        <div className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white pl-3 pr-3 py-1.5">
          <Search size={12} className="text-gray-500 shrink-0" />
          <input
            className="bg-transparent text-[13px] text-gray-800 placeholder-gray-400 focus:outline-none w-36"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-600 hover:text-gray-400 transition-colors">
              <X size={11} />
            </button>
          )}
        </div>

        {/* Pipeline status pill */}
        <div className={cn(
          'relative flex items-center rounded-full border py-1.5 pl-3 pr-7 transition-colors',
          pipeline ? 'border-indigo-600/50 bg-indigo-50' : 'border-gray-200 bg-white',
        )}>
          <select
            className="bg-transparent text-[13px] text-gray-600 focus:outline-none appearance-none cursor-pointer"
            value={pipeline}
            onChange={(e) => setPipeline(e.target.value)}
          >
            <option value="">Tous les statuts</option>
            {PIPELINE_COLUMNS.map((c) => (
              <option key={c.status} value={c.status}>{c.label}</option>
            ))}
          </select>
          <Globe size={11} className="absolute right-2.5 text-gray-500 pointer-events-none" />
        </div>

        {/* Source pill */}
        <div className={cn(
          'relative flex items-center rounded-full border py-1.5 pl-3 pr-7 transition-colors',
          source ? 'border-indigo-600/50 bg-indigo-50' : 'border-gray-200 bg-white',
        )}>
          <select
            className="bg-transparent text-[13px] text-gray-600 focus:outline-none appearance-none cursor-pointer"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="">Toutes les sources</option>
            {Object.entries(SOURCE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <Globe size={11} className="absolute right-2.5 text-gray-500 pointer-events-none" />
        </div>

        {/* Date range picker */}
        <DateRangePicker
          period={period} customFrom={customFrom} customTo={customTo}
          onChange={(p, from, to) => { setPeriod(p as Period | ''); setCustomFrom(from); setCustomTo(to) }}
          periods={ALL_PERIODS}
          placeholder="Toutes les dates"
        />

        {/* Clear all */}
        {activeFilters > 0 && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1.5 text-[13px] text-gray-400 hover:text-gray-800 hover:border-gray-600 transition-colors"
          >
            <Filter size={11} />
            <X size={10} />
          </button>
        )}

        {/* View toggle */}
        <div className="ml-auto flex items-center gap-1 rounded-lg bg-white border border-gray-200 p-1">
          <button
            onClick={() => setView('kanban')}
            className={cn('p-1.5 rounded-md transition-colors', view === 'kanban' ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:text-gray-600')}
            title="Vue kanban"
          >
            <Kanban size={16} />
          </button>
          <button
            onClick={() => setView('table')}
            className={cn('p-1.5 rounded-md transition-colors', view === 'table' ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:text-gray-600')}
            title="Vue tableau"
          >
            <LayoutList size={16} />
          </button>
        </div>
      </div>

      {/* Import feedback */}
      {importCsv.isSuccess && (
        <div className="mb-3 rounded-lg bg-green-50 border border-green-800/30 px-4 py-2 text-xs text-green-600">
          Import terminé — {(importCsv.data?.data as { created?: number })?.created ?? '?'} leads créés
        </div>
      )}
      {importCsv.isError && (
        <div className="mb-3 rounded-lg bg-red-50 border border-red-800/30 px-4 py-2 text-xs text-red-400">
          Erreur lors de l'import CSV
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      ) : view === 'kanban' ? (
        <KanbanView
          leads={leads}
          pipelineFilter={pipeline}
          onStatusChange={(leadId, status) => updateStatusMutation.mutate({ id: leadId, status })}
          onScheduleCall={(lead) => setSchedulingLead(lead)}
        />
      ) : (
        <TableView
          leads={leads}
          onStatusChange={(leadId, status) => updateStatusMutation.mutate({ id: leadId, status })}
          onScheduleCall={(lead) => setSchedulingLead(lead)}
        />
      )}
        </>
      )}
    </div>
  )
}
