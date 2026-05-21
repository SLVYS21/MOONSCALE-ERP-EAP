import { useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import {
  Crosshair, TrendingUp, Trophy, Users,
  ArrowRight, CreditCard, ChevronRight, Search, X,
} from 'lucide-react'
import api from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AcquisitionKpis {
  total: number
  new_last_7d: number
  new_last_30d: number
  won: number
  sql_plus: number
  conversion_rate: number
  by_pipeline: Record<string, number>
  by_source: Array<{ _id: string; count: number }>
}

interface AnalyticsOverview {
  leads: { total: number }
  meta: { spend: number; conversations: number; cost_per_conversation: number | null }
  youtube: { views_delta: number; last_synced: string | null }
  tiktok: { views_delta: number }
}

interface Lead {
  _id: string
  name: string
  email: string | null
  pipeline_status: string
  source_type: string
  createdAt: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { key: 'nouveau',          label: 'Nouveau',          color: '#6b7280' },
  { key: 'mql',             label: 'MQL',              color: '#3b82f6' },
  { key: 'sql',             label: 'SQL',              color: '#6366f1' },
  { key: 'rdv_programme',   label: 'RDV',              color: '#eab308' },
  { key: 'appel_diagnostic',label: 'Appel Diag.',      color: '#f97316' },
  { key: 'won',             label: 'Won',              color: '#22c55e' },
  { key: 'lost',            label: 'Lost',             color: '#ef4444' },
  { key: 'nurturing',       label: 'Nurturing',        color: '#a855f7' },
]

const SOURCE_LABELS: Record<string, string> = {
  typebot:           'Typebot',
  meta_ads:          'Meta Ads',
  whatsapp_tracked:  'WhatsApp (tracké)',
  whatsapp_direct:   'WhatsApp direct',
  manual:            'Manuel',
  import:            'Import',
}

const PIPELINE_COLORS: Record<string, string> = {
  nouveau:           'text-gray-400',
  mql:               'text-blue-400',
  sql:               'text-indigo-400',
  rdv_programme:     'text-yellow-400',
  appel_diagnostic:  'text-orange-400',
  won:               'text-green-400',
  lost:              'text-red-400',
  nurturing:         'text-purple-400',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(n)

function ago30d() {
  const d = new Date(); d.setDate(d.getDate() - 30)
  return d.toISOString().split('T')[0]
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, color, href,
}: {
  label: string; value: string | number; sub?: string
  icon: React.ElementType; color: string; href?: string
}) {
  const inner = (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className={cn('mt-1 text-2xl font-bold', color)}>{value}</p>
          {sub && <p className="mt-0.5 text-xs text-gray-600">{sub}</p>}
        </div>
        <div className={cn('rounded-lg bg-gray-800 p-2', color)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  )
  return href ? <Link to={href}>{inner}</Link> : inner
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const [leadSearch, setLeadSearch] = useState('')

  const searchQuery = useQuery({
    queryKey: ['leads-search-dash', leadSearch],
    queryFn: () =>
      api.get('/leads', { params: { search: leadSearch, limit: 8 } })
        .then(r => (r.data as { data: Lead[] }).data),
    enabled: leadSearch.length >= 2,
  })

  const [kpisQ, overviewQ, recentQ, paymentsQ] = useQueries({
    queries: [
      {
        queryKey: ['acquisition-kpis'],
        queryFn: () => api.get('/leads/kpis').then(r => r.data as AcquisitionKpis),
      },
      {
        queryKey: ['analytics-overview-dash'],
        queryFn: () =>
          api.get('/analytics/overview', { params: { date_from: ago30d() } })
            .then(r => r.data as AnalyticsOverview),
      },
      {
        queryKey: ['recent-leads-dash'],
        queryFn: () =>
          api.get('/leads', { params: { limit: 6 } })
            .then(r => (r.data as { data: Lead[] }).data),
      },
      {
        queryKey: ['dashboard-pending'],
        queryFn: () =>
          api.get('/payments', { params: { status: 'NON TRAITÉ', limit: 1 } })
            .then(r => (r.data as { total: number }).total),
      },
    ],
  })

  const kpis = kpisQ.data
  const overview = overviewQ.data
  const recent = recentQ.data ?? []

  // Funnel data for chart
  const funnelData = PIPELINE_STAGES.map(s => ({
    label: s.label,
    count: kpis?.by_pipeline[s.key] ?? 0,
    color: s.color,
  })).filter(s => s.count > 0)

  // Cost metrics (Meta 30d)
  const metaSpend       = overview?.meta.spend ?? 0
  const totalLeads      = kpis?.total ?? 0
  const wonCount        = kpis?.won ?? 0
  const costPerLead     = totalLeads > 0 && metaSpend > 0 ? Math.round(metaSpend / totalLeads) : null
  const costPerWon      = wonCount > 0 && metaSpend > 0 ? Math.round(metaSpend / wonCount) : null

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-100">
          Bonjour, {user?.firstName}
        </h1>
        <p className="mt-0.5 text-sm text-gray-500">Vue d'ensemble de l'acquisition Moonscale</p>
      </div>

      {/* ── Acquisition KPIs ─────────────────────────────────────────────── */}
      <section>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-600">Acquisition</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            label="Total leads"
            value={kpisQ.isLoading ? '…' : fmt(kpis?.total ?? 0)}
            sub={`+${kpis?.new_last_7d ?? 0} cette semaine`}
            icon={Crosshair}
            color="text-indigo-400"
            href="/leads"
          />
          <KpiCard
            label="SQL+ (pipeline chaud)"
            value={kpisQ.isLoading ? '…' : fmt(kpis?.sql_plus ?? 0)}
            sub="SQL · RDV · Appel · Won"
            icon={TrendingUp}
            color="text-blue-400"
            href="/leads"
          />
          <KpiCard
            label="Won"
            value={kpisQ.isLoading ? '…' : fmt(kpis?.won ?? 0)}
            sub={`Taux : ${kpis?.conversion_rate ?? 0}%`}
            icon={Trophy}
            color="text-green-400"
            href="/leads"
          />
          <KpiCard
            label="Paiements en attente"
            value={paymentsQ.isLoading ? '…' : fmt(paymentsQ.data ?? 0)}
            icon={CreditCard}
            color="text-amber-400"
            href="/payments"
          />
        </div>
      </section>

      {/* ── Meta Ads cost metrics ─────────────────────────────────────────── */}
      {metaSpend > 0 && (
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-600">
            Meta Ads — 30 derniers jours
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Dépenses</p>
              <p className="mt-1 text-xl font-bold text-gray-100">{fmt(metaSpend)} <span className="text-sm font-normal text-gray-500">XOF</span></p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Conversations WA</p>
              <p className="mt-1 text-xl font-bold text-gray-100">{fmt(overview?.meta.conversations ?? 0)}</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Coût par lead</p>
              <p className="mt-1 text-xl font-bold text-gray-100">
                {costPerLead != null ? `${fmt(costPerLead)} XOF` : '—'}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">Dépenses ÷ leads</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Coût par Won</p>
              <p className="mt-1 text-xl font-bold text-green-400">
                {costPerWon != null ? `${fmt(costPerWon)} XOF` : '—'}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">Dépenses ÷ won</p>
            </div>
          </div>
        </section>
      )}

      {/* ── Funnel + Sources ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* Funnel chart */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-gray-200">Pipeline</p>
            <Link to="/leads" className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
              Voir tous <ChevronRight size={12} />
            </Link>
          </div>
          {funnelData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={funnelData} layout="vertical" margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} width={70} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => [v, 'leads']}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {funnelData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-600 py-8 text-center">Aucun lead pour l'instant</p>
          )}
        </div>

        {/* Sources */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="mb-4 text-sm font-semibold text-gray-200">Sources d'acquisition</p>
          {kpis?.by_source.length ? (
            <div className="space-y-2.5">
              {kpis.by_source.map((s) => {
                const pct = kpis.total > 0 ? Math.round((s.count / kpis.total) * 100) : 0
                return (
                  <div key={s._id ?? 'inconnu'}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">{SOURCE_LABELS[s._id] ?? s._id ?? 'Inconnu'}</span>
                      <span className="text-gray-500">{s.count} · {pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-800">
                      <div
                        className="h-1.5 rounded-full bg-indigo-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-600 py-8 text-center">Aucune donnée</p>
          )}

          {/* Content views */}
          {(overview?.youtube.views_delta || overview?.tiktok.views_delta) ? (
            <div className="mt-5 border-t border-gray-800 pt-4 grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-500">Vues YouTube (30j)</p>
                <p className="text-lg font-bold text-red-400">{fmt(overview?.youtube.views_delta ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Vues TikTok (30j)</p>
                <p className="text-lg font-bold text-pink-400">{fmt(overview?.tiktok.views_delta ?? 0)}</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Recent / Search leads ─────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-600">Leads</p>
          <Link to="/leads" className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
            Voir tous <ArrowRight size={12} />
          </Link>
        </div>

        {/* Search input */}
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          <input
            className="w-full rounded-lg bg-gray-900 border border-gray-800 pl-9 pr-9 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
            placeholder="Rechercher un lead par nom, email, téléphone..."
            value={leadSearch}
            onChange={(e) => setLeadSearch(e.target.value)}
          />
          {leadSearch && (
            <button
              onClick={() => setLeadSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {leadSearch.length >= 2 && (
          <div className="mb-2 text-xs text-gray-600">
            {searchQuery.isLoading ? 'Recherche…' : `${searchQuery.data?.length ?? 0} résultat(s) pour "${leadSearch}"`}
          </div>
        )}

        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-900">
              <tr>
                {['Nom', 'Source', 'Pipeline', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {(() => {
                const displayLeads = leadSearch.length >= 2
                  ? (searchQuery.data ?? [])
                  : recent
                if (displayLeads.length === 0 && !searchQuery.isLoading) {
                  return (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-xs text-gray-600">
                        {leadSearch.length >= 2
                          ? 'Aucun lead trouvé'
                          : <>Aucun lead pour l'instant — <Link to="/leads" className="text-indigo-400 hover:text-indigo-300">créer le premier</Link></>
                        }
                      </td>
                    </tr>
                  )
                }
                return displayLeads.map((lead) => (
                  <tr key={lead._id} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-200">{lead.name}</p>
                      {lead.email && <p className="text-xs text-gray-600">{lead.email}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">
                      {SOURCE_LABELS[lead.source_type] ?? lead.source_type}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn('text-xs font-medium', PIPELINE_COLORS[lead.pipeline_status] ?? 'text-gray-400')}>
                        {lead.pipeline_status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        to={`/leads/${lead._id}`}
                        className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
                      >
                        Voir <ChevronRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))
              })()}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Quick links ────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { to: '/leads/scoring',  label: 'Configurer le scoring MQL/SQL', icon: TrendingUp },
          { to: '/leads/tracking', label: 'Liens WhatsApp trackés',         icon: Crosshair },
          { to: '/analytics',      label: 'Analytics & Corrélation',        icon: Users },
          { to: '/leads/offers',   label: 'Gérer les offres',               icon: Trophy },
        ].map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 p-3 hover:border-gray-700 transition-colors"
          >
            <Icon className="h-4 w-4 shrink-0 text-gray-500" />
            <span className="text-xs text-gray-400">{label}</span>
          </Link>
        ))}
      </section>
    </div>
  )
}
