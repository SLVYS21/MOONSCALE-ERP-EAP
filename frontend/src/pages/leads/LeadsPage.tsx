import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Plus, Search, Kanban, LayoutList,
  Phone, Mail, Globe, ChevronRight,
  TrendingUp, Target, Clock, CheckCircle, Upload, X, Filter,
  Briefcase, Banknote,
} from 'lucide-react'
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
  { status: 'nouveau',          label: 'Nouveau',          color: 'text-gray-400',   dotColor: 'bg-gray-400',   bg: 'bg-gray-800/40' },
  { status: 'mql',              label: 'MQL',              color: 'text-blue-400',   dotColor: 'bg-blue-400',   bg: 'bg-blue-900/20' },
  { status: 'sql',              label: 'SQL',              color: 'text-indigo-400', dotColor: 'bg-indigo-400', bg: 'bg-indigo-900/20' },
  { status: 'rdv_programme',    label: 'RDV Programmé',    color: 'text-yellow-400', dotColor: 'bg-yellow-400', bg: 'bg-yellow-900/20' },
  { status: 'appel_diagnostic', label: 'Appel Diagnostic', color: 'text-orange-400', dotColor: 'bg-orange-400', bg: 'bg-orange-900/20' },
  { status: 'won',              label: 'Won',              color: 'text-green-400',  dotColor: 'bg-green-400',  bg: 'bg-green-900/20' },
  { status: 'lost',             label: 'Lost',             color: 'text-red-400',    dotColor: 'bg-red-400',    bg: 'bg-red-900/20' },
  { status: 'nurturing',        label: 'Nurturing',        color: 'text-purple-400', dotColor: 'bg-purple-400', bg: 'bg-purple-900/20' },
]

const SOURCE_LABELS: Record<string, string> = {
  typebot: 'Typebot',
  meta_ads: 'Meta Ads',
  whatsapp_tracked: 'WhatsApp',
  whatsapp_direct: 'WhatsApp direct',
  manual: 'Manuel',
  import: 'Import',
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
      <div className="w-full max-w-md rounded-xl bg-gray-900 border border-gray-800 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-100 mb-5">Nouveau lead</h2>

        <div className="space-y-3">
          {[
            { key: 'name', label: 'Nom *', placeholder: 'Nom complet' },
            { key: 'email', label: 'Email', placeholder: 'email@exemple.com' },
            { key: 'phone', label: 'Téléphone', placeholder: '+229...' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-400 mb-1">{label}</label>
              <input
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
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
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:outline-none"
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
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:outline-none"
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
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
              placeholder="facebook_ads, tiktok_bio..."
              value={form.utm_source}
              onChange={(e) => setForm((f) => ({ ...f, utm_source: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Motivation</label>
            <textarea
              rows={2}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none resize-none"
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
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">
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

// ── Lead Card ─────────────────────────────────────────────────────────────────

function LeadCard({ lead }: { lead: Lead }) {
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
      className="block rounded-xl bg-gray-900 border border-gray-800/80 hover:border-gray-700 hover:bg-gray-850 p-4 transition-all"
    >
      {/* Avatar */}
      <div className="flex items-start justify-between gap-2">
        <div className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0',
          bg,
        )}>
          {getInitials(lead.name)}
        </div>
      </div>

      {/* NOM Prénom */}
      <p className="mt-2.5 text-[13px] leading-tight">
        <span className="font-bold text-gray-100">{nom}</span>
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
        <div className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-emerald-700/40 bg-emerald-950/50 px-2.5 py-1.5">
          <Banknote size={11} className="text-emerald-500 shrink-0" />
          <span className="text-[11px] font-semibold text-emerald-400 truncate">
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
}: {
  leads: Lead[]
  pipelineFilter: string
  onStatusChange: (leadId: string, status: PipelineStatus) => void
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
              <span className="rounded-full bg-gray-800 border border-gray-700/60 px-2 py-0.5 text-[11px] font-semibold text-gray-400">
                {colLeads.length}
              </span>
            </div>

            {/* Drop zone */}
            <div
              className={cn(
                'flex-1 rounded-xl border p-2 space-y-2.5 min-h-[200px] transition-colors',
                isTarget
                  ? 'bg-indigo-900/10 border-indigo-600/40'
                  : 'bg-gray-950/60 border-gray-800/60',
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
                  <LeadCard lead={lead} />
                </div>
              ))}

              {colLeads.length === 0 && (
                <div className={cn(
                  'flex items-center justify-center rounded-lg border-2 border-dashed min-h-[80px] transition-colors',
                  isTarget ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-gray-800/50',
                )}>
                  <p className={cn('text-xs', isTarget ? 'text-indigo-400' : 'text-gray-700')}>
                    {isTarget ? '↓ Déposer ici' : 'Vide'}
                  </p>
                </div>
              )}

              {colLeads.length > 0 && isTarget && (
                <div className="h-12 rounded-lg border-2 border-dashed border-indigo-500/40 bg-indigo-500/5 flex items-center justify-center">
                  <span className="text-xs text-indigo-400">↓ Déposer ici</span>
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

function TableView({ leads }: { leads: Lead[] }) {
  return (
    <div className="rounded-xl border border-gray-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 bg-gray-900">
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
              <tr key={lead._id} className="border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0', avatarBg(lead.name))}>
                      {getInitials(lead.name)}
                    </div>
                    <div>
                      <p className="text-[13px] text-gray-200">
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
                  <div className="flex items-center gap-1.5">
                    <div className={cn('w-1.5 h-1.5 rounded-full', col?.dotColor ?? 'bg-gray-600')} />
                    <span className={cn('text-xs font-medium', col?.color ?? 'text-gray-400')}>
                      {col?.label ?? lead.pipeline_status}
                    </span>
                  </div>
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
                  <Link
                    to={`/leads/${lead._id}`}
                    className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    Voir <ChevronRight size={12} />
                  </Link>
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
        { icon: Target,      label: 'Total leads',      value: total,        color: 'text-gray-300' },
        { icon: TrendingUp,  label: 'En phase SQL+',     value: sql,          color: 'text-indigo-400' },
        { icon: CheckCircle, label: 'Won',               value: won,          color: 'text-green-400' },
        { icon: Clock,       label: 'Taux conversion',   value: `${convRate}%`, color: 'text-yellow-400' },
      ].map(({ icon: Icon, label, value, color }) => (
        <div key={label} className="rounded-xl bg-gray-900 border border-gray-800 p-4">
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



// ── Page ──────────────────────────────────────────────────────────────────────

export function LeadsPage() {
  const [view, setView]           = useState<'kanban' | 'table'>('kanban')
  const [showCreate, setShowCreate] = useState(false)
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
          <h1 className="text-xl font-bold text-gray-100">Leads & Acquisition</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.total ?? 0} leads au total</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => csvRef.current?.click()}
            disabled={importCsv.isPending}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 disabled:opacity-50 transition-colors"
          >
            <Upload size={14} />
            {importCsv.isPending ? 'Import...' : 'Import CSV'}
          </button>
          <Link to="/payments/offers" className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition-colors">
            Offres
          </Link>
          <Link to="/leads/scoring" className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition-colors">
            Scoring
          </Link>
          <Link to="/leads/tracking" className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition-colors">
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

      {/* Stats */}
      <StatsBar leads={leads} />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-[11px] font-bold uppercase tracking-widest text-gray-600 mr-1 shrink-0">Filtres :</span>

        {/* Search pill */}
        <div className="flex items-center gap-1.5 rounded-full border border-gray-700 bg-gray-900 pl-3 pr-3 py-1.5">
          <Search size={12} className="text-gray-500 shrink-0" />
          <input
            className="bg-transparent text-[13px] text-gray-200 placeholder-gray-600 focus:outline-none w-36"
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
          pipeline ? 'border-indigo-600/50 bg-indigo-900/20' : 'border-gray-700 bg-gray-900',
        )}>
          <select
            className="bg-transparent text-[13px] text-gray-300 focus:outline-none appearance-none cursor-pointer"
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
          source ? 'border-indigo-600/50 bg-indigo-900/20' : 'border-gray-700 bg-gray-900',
        )}>
          <select
            className="bg-transparent text-[13px] text-gray-300 focus:outline-none appearance-none cursor-pointer"
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
            className="flex items-center gap-1 rounded-full border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-[13px] text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors"
          >
            <Filter size={11} />
            <X size={10} />
          </button>
        )}

        {/* View toggle */}
        <div className="ml-auto flex items-center gap-1 rounded-lg bg-gray-900 border border-gray-800 p-1">
          <button
            onClick={() => setView('kanban')}
            className={cn('p-1.5 rounded-md transition-colors', view === 'kanban' ? 'bg-gray-700 text-gray-100' : 'text-gray-500 hover:text-gray-300')}
            title="Vue kanban"
          >
            <Kanban size={16} />
          </button>
          <button
            onClick={() => setView('table')}
            className={cn('p-1.5 rounded-md transition-colors', view === 'table' ? 'bg-gray-700 text-gray-100' : 'text-gray-500 hover:text-gray-300')}
            title="Vue tableau"
          >
            <LayoutList size={16} />
          </button>
        </div>
      </div>

      {/* Import feedback */}
      {importCsv.isSuccess && (
        <div className="mb-3 rounded-lg bg-green-900/20 border border-green-800/30 px-4 py-2 text-xs text-green-400">
          Import terminé — {(importCsv.data?.data as { created?: number })?.created ?? '?'} leads créés
        </div>
      )}
      {importCsv.isError && (
        <div className="mb-3 rounded-lg bg-red-900/20 border border-red-800/30 px-4 py-2 text-xs text-red-400">
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
        />
      ) : (
        <TableView leads={leads} />
      )}
    </div>
  )
}
