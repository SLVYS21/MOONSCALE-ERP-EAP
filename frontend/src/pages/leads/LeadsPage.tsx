import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Plus, Search, Kanban, LayoutList,
  Phone, Mail, Globe, ChevronRight,
  TrendingUp, Target, Clock, CheckCircle, Upload, X, CalendarDays, ChevronDown,
} from 'lucide-react'
import api from '@/services/api'
import type { Lead, PipelineStatus, AppSettings } from '@/types'
import { cn } from '@/lib/utils'
import { type Period, PERIODS, periodToDates, periodLabel as getPeriodLabel } from '@/lib/periods'

// ── Constants ──────────────────────────────────────────────────────────────────

const PIPELINE_COLUMNS: { status: PipelineStatus; label: string; color: string; bg: string }[] = [
  { status: 'nouveau',         label: 'Nouveau',          color: 'text-gray-400',   bg: 'bg-gray-800/40' },
  { status: 'mql',             label: 'MQL',              color: 'text-blue-400',   bg: 'bg-blue-900/20' },
  { status: 'sql',             label: 'SQL',              color: 'text-indigo-400', bg: 'bg-indigo-900/20' },
  { status: 'rdv_programme',   label: 'RDV Programmé',    color: 'text-yellow-400', bg: 'bg-yellow-900/20' },
  { status: 'appel_diagnostic',label: 'Appel Diagnostic', color: 'text-orange-400', bg: 'bg-orange-900/20' },
  { status: 'won',             label: 'Won',              color: 'text-green-400',  bg: 'bg-green-900/20' },
  { status: 'lost',            label: 'Lost',             color: 'text-red-400',    bg: 'bg-red-900/20' },
  { status: 'nurturing',       label: 'Nurturing',        color: 'text-purple-400', bg: 'bg-purple-900/20' },
]

const SOURCE_LABELS: Record<string, string> = {
  typebot: 'Typebot',
  meta_ads: 'Meta Ads',
  whatsapp_tracked: 'WhatsApp',
  whatsapp_direct: 'WhatsApp direct',
  manual: 'Manuel',
  import: 'Import',
}

const QUAL_BADGE: Record<string, string> = {
  mql: 'bg-blue-900/30 text-blue-300',
  sql: 'bg-indigo-900/30 text-indigo-300',
  non_qualifie: 'bg-gray-800 text-gray-400',
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

// ── Lead Card (kanban) ─────────────────────────────────────────────────────────

function LeadCard({ lead }: { lead: Lead }) {
  const pays   = lead.pays   ?? (lead.dynamic_fields?.pays   as string | undefined) ?? null
  const budget = lead.budget ?? (lead.dynamic_fields?.budget as number | undefined) ?? null

  return (
    <Link
      to={`/leads/${lead._id}`}
      className="block rounded-lg bg-gray-900 border border-gray-800 hover:border-gray-700 p-3 transition-colors group"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-200 group-hover:text-white line-clamp-1">{lead.name}</p>
        <ChevronRight size={14} className="shrink-0 text-gray-600 group-hover:text-gray-400 mt-0.5" />
      </div>

      {lead.email && (
        <p className="mt-1 text-xs text-gray-500 truncate">{lead.email}</p>
      )}

      {/* Age · Pays · Budget */}
      {(lead.age || pays || budget != null) && (
        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-gray-500">
          {lead.age && <span>{lead.age} ans</span>}
          {pays && <span>📍 {pays}</span>}
          {budget != null && <span className="text-emerald-400/80">💰 {Number(budget).toLocaleString()}</span>}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {lead.qualification_status && (
          <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', QUAL_BADGE[lead.qualification_status])}>
            {lead.qualification_status.toUpperCase()}
          </span>
        )}
        {lead.source_form_name ? (
          <span className="rounded-full bg-violet-900/30 px-2 py-0.5 text-xs text-violet-300 truncate max-w-[120px]" title={lead.source_form_name}>
            {lead.source_form_name}
          </span>
        ) : lead.utm_source ? (
          <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
            {lead.utm_source}
          </span>
        ) : null}
      </div>

      {lead.closer_id && (
        <p className="mt-2 text-xs text-gray-500">
          Closer : {lead.closer_id.firstName} {lead.closer_id.lastName}
        </p>
      )}

      {lead.opportunity_amount != null && (
        <p className="mt-1 text-xs font-medium text-green-400">
          {lead.opportunity_amount.toLocaleString()} {lead.offer_ids[0]?.plans?.[0]?.currency ?? 'XOF'}
        </p>
      )}
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
  const [overCol, setOverCol] = useState<PipelineStatus | null>(null)

  const grouped = PIPELINE_COLUMNS.reduce<Record<string, Lead[]>>((acc, col) => {
    acc[col.status] = leads.filter((l) => l.pipeline_status === col.status)
    return acc
  }, {})

  const visibleCols = pipelineFilter
    ? PIPELINE_COLUMNS.filter((c) => c.status === pipelineFilter)
    : PIPELINE_COLUMNS

  const draggingLead = draggingId ? leads.find((l) => l._id === draggingId) : null

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 select-none" style={{ minWidth: 0 }}>
      {visibleCols.map((col) => {
        const isTarget = overCol === col.status && draggingId !== null && draggingLead?.pipeline_status !== col.status
        const colLeads = grouped[col.status] ?? []

        return (
          <div key={col.status} className="shrink-0 w-64 flex flex-col">
            {/* Header */}
            <div className={cn(
              'rounded-t-lg px-3 py-2 flex items-center justify-between transition-colors',
              isTarget ? 'bg-indigo-600/25' : col.bg,
            )}>
              <span className={cn('text-xs font-semibold uppercase tracking-wide transition-colors', isTarget ? 'text-indigo-300' : col.color)}>
                {col.label}
              </span>
              <span className={cn('text-xs font-bold transition-colors', isTarget ? 'text-indigo-300' : col.color)}>
                {colLeads.length}
              </span>
            </div>

            {/* Drop zone */}
            <div
              className={cn(
                'flex-1 rounded-b-lg border border-t-0 p-2 space-y-2 min-h-[200px] transition-colors',
                isTarget ? 'bg-indigo-900/10 border-indigo-600/40' : 'bg-gray-950 border-gray-800',
              )}
              onDragOver={(e) => { e.preventDefault(); if (overCol !== col.status) setOverCol(col.status) }}
              onDragEnter={(e) => { e.preventDefault(); setOverCol(col.status) }}
              onDrop={(e) => {
                e.preventDefault()
                if (draggingId && draggingLead?.pipeline_status !== col.status) {
                  onStatusChange(draggingId, col.status)
                }
                setDraggingId(null)
                setOverCol(null)
              }}
            >
              {colLeads.map((lead) => (
                <div
                  key={lead._id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move'
                    setDraggingId(lead._id)
                  }}
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
                  isTarget ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-gray-800/60',
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
            {['Nom', 'Contact', 'Source', 'Qualification', 'Pipeline', 'Closer', ''].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => {
            const col = PIPELINE_COLUMNS.find((c) => c.status === lead.pipeline_status)
            return (
              <tr key={lead._id} className="border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-200">{lead.name}</p>
                  {lead.age && <p className="text-xs text-gray-500">{lead.age} ans</p>}
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
                  {lead.qualification_status ? (
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', QUAL_BADGE[lead.qualification_status])}>
                      {lead.qualification_status.toUpperCase()}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-600">—</span>
                  )}
                  <p className="mt-0.5 text-xs text-gray-600">{lead.qualification_score} pts</p>
                </td>
                <td className="px-4 py-3">
                  <span className={cn('text-xs font-medium', col?.color ?? 'text-gray-400')}>
                    {col?.label ?? lead.pipeline_status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {lead.closer_id ? (
                    <span className="text-xs text-gray-400">
                      {lead.closer_id.firstName} {lead.closer_id.lastName}
                    </span>
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
              <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-500">
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
  const total = leads.length
  const won   = leads.filter((l) => l.pipeline_status === 'won').length
  const sql   = leads.filter((l) => l.pipeline_status === 'sql' || l.pipeline_status === 'rdv_programme' || l.pipeline_status === 'appel_diagnostic').length
  const convRate = total > 0 ? Math.round((won / total) * 100) : 0

  return (
    <div className="grid grid-cols-4 gap-3 mb-5">
      {[
        { icon: Target, label: 'Total leads', value: total, color: 'text-gray-300' },
        { icon: TrendingUp, label: 'En phase SQL+', value: sql, color: 'text-indigo-400' },
        { icon: CheckCircle, label: 'Won', value: won, color: 'text-green-400' },
        { icon: Clock, label: 'Taux conversion', value: `${convRate}%`, color: 'text-yellow-400' },
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputCls = 'rounded-lg bg-gray-900 border border-gray-800 px-3 py-2 text-sm text-gray-300 focus:border-indigo-500 focus:outline-none'

// ── Page ──────────────────────────────────────────────────────────────────────

export function LeadsPage() {
  const [view, setView] = useState<'kanban' | 'table'>('kanban')
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [pipeline, setPipeline] = useState('')
  const [source, setSource] = useState('')
  const [period, setPeriod] = useState<Period | ''>('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const csvRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const { from: dateFrom, to: dateTo } = period === 'custom'
    ? { from: customFrom, to: customTo }
    : periodToDates(period)

  const activePeriodLabel = getPeriodLabel(period, customFrom, customTo)

  const activeFilters = [pipeline, source, period].filter(Boolean).length

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
        type="file"
        accept=".csv"
        ref={csvRef}
        className="hidden"
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
            title="Importer CSV Typebot"
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            className="w-52 rounded-lg bg-gray-900 border border-gray-800 pl-9 pr-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Status */}
        <select className={inputCls} value={pipeline} onChange={(e) => setPipeline(e.target.value)}>
          <option value="">Tous les statuts</option>
          {PIPELINE_COLUMNS.map((c) => (
            <option key={c.status} value={c.status}>{c.label}</option>
          ))}
        </select>

        {/* Source */}
        <select className={inputCls} value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Toutes les sources</option>
          {Object.entries(SOURCE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {/* Period picker */}
        <div className="flex flex-col gap-1.5">
          <div className="relative">
            <CalendarDays size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <select
              className={cn(inputCls, 'pl-8 pr-7 appearance-none cursor-pointer', period && 'border-indigo-600 text-indigo-300')}
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period | '')}
            >
              <option value="">Toutes les dates</option>
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>

          {/* Custom date inputs — shown only when "Personnalisé" is selected */}
          {period === 'custom' && (
            <div className="flex items-center gap-1.5 rounded-lg bg-gray-900 border border-indigo-700/50 px-3 py-2">
              <input
                type="date"
                className="bg-transparent text-xs text-gray-300 focus:outline-none w-28 [color-scheme:dark]"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                placeholder="Du"
              />
              <span className="text-gray-600 text-xs">→</span>
              <input
                type="date"
                className="bg-transparent text-xs text-gray-300 focus:outline-none w-28 [color-scheme:dark]"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                placeholder="Au"
              />
            </div>
          )}
        </div>

        {/* Active period badge + clear */}
        {activeFilters > 0 && (
          <div className="flex items-center gap-2 self-start">
            {activePeriodLabel && (
              <span className="rounded-full bg-indigo-900/40 border border-indigo-700/40 px-2.5 py-1 text-xs text-indigo-300 font-medium">
                {activePeriodLabel}
              </span>
            )}
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-400 hover:text-gray-200 border border-gray-700 hover:border-gray-600 transition-colors"
            >
              <X size={13} />
              Effacer ({activeFilters})
            </button>
          </div>
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
