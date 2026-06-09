import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BarChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ComposedChart, Area, Cell,
} from 'recharts'
import {
  BarChart2, RefreshCw, Upload, ExternalLink, CheckCircle,
  AlertCircle, PlayCircle, TrendingUp, Crosshair,
} from 'lucide-react'
import api from '@/services/api'
import { cn } from '@/lib/utils'
import { type Period, periodToDates } from '@/lib/periods'
import { DateRangePicker, SHORT_PERIODS } from '@/components/ui/DateRangePicker'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MetaStatRow {
  date: string
  campaign_name: string
  adset_name: string
  spend: number
  impressions: number
  clicks: number
  conversations: number
  cost_per_conversation: number | null
}

interface MetaTotals {
  spend: number
  conversations: number
  clicks: number
  impressions: number
  cost_per_conversation: number | null
}

interface VideoStatRow {
  platform: string
  video_id: string
  title: string
  date: string
  views: number
  views_delta: number
  likes: number
  comments: number
  shares: number
  watch_time_minutes?: number | null
  subscribers_gained?: number | null
}

interface CorrelationRow {
  date: string
  views_delta: number
  leads: number
}

interface Overview {
  leads: { total: number }
  meta: { spend: number; conversations: number; cost_per_conversation: number | null }
  youtube: { views_delta: number; last_synced: string | null }
  tiktok: { views_delta: number }
}

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

const PIPELINE_STAGES = [
  { key: 'nouveau',           label: 'Nouveau',          color: '#6b7280' },
  { key: 'mql',              label: 'MQL',              color: '#3b82f6' },
  { key: 'sql',              label: 'SQL',              color: '#6366f1' },
  { key: 'rdv_programme',    label: 'RDV Programmé',    color: '#eab308' },
  { key: 'appel_diagnostic', label: 'Appel Diagnostic', color: '#f97316' },
  { key: 'won',              label: 'Won',              color: '#22c55e' },
  { key: 'lost',             label: 'Lost',             color: '#ef4444' },
  { key: 'nurturing',        label: 'Nurturing',        color: '#a855f7' },
]

const SOURCE_LABELS: Record<string, string> = {
  typebot:          'Typebot',
  meta_ads:         'Meta Ads',
  whatsapp_tracked: 'WhatsApp (tracké)',
  whatsapp_direct:  'WhatsApp direct',
  manual:           'Manuel',
  import:           'Import',
}

interface YouTubeConfig {
  channel_id: string
  has_refresh_token: boolean
  last_synced: string | null
  last_meta_synced: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number, decimals = 0) =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: decimals }).format(n)

const fmtDate = (d: string) => {
  try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) }
  catch { return d }
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

const TABS = ['Vue d\'ensemble', 'Meta Ads', 'YouTube', 'TikTok', 'Corrélation'] as const
type Tab = typeof TABS[number]

// ── Page ─────────────────────────────────────────────────────────────────────

export function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>('Vue d\'ensemble')
  const [period, setPeriod] = useState<Period | ''>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const qc = useQueryClient()

  const { from: dateFrom, to: dateTo } = (!period || period === 'custom')
    ? { from: customFrom, to: customTo }
    : periodToDates(period)

  const range = { from: dateFrom, to: dateTo }

  // ── Queries ────────────────────────────────────────────────────────────────

  const overview = useQuery<Overview>({
    queryKey: ['analytics-overview', range],
    queryFn: () => api.get('/analytics/overview', { params: { date_from: range.from, date_to: range.to } }).then(r => r.data),
  })

  const leadKpis = useQuery<AcquisitionKpis>({
    queryKey: ['acquisition-kpis'],
    queryFn: () => api.get('/leads/kpis').then(r => r.data),
    enabled: tab === 'Vue d\'ensemble',
  })

  const metaStats = useQuery<{ stats: MetaStatRow[]; totals: MetaTotals }>({
    queryKey: ['analytics-meta', range],
    queryFn: () => api.get('/analytics/meta/stats', { params: { date_from: range.from, date_to: range.to } }).then(r => r.data),
    enabled: tab === 'Meta Ads',
  })

  const ytStats = useQuery<VideoStatRow[]>({
    queryKey: ['analytics-youtube', range],
    queryFn: () => api.get('/analytics/youtube/stats', { params: { date_from: range.from, date_to: range.to } }).then(r => r.data),
    enabled: tab === 'YouTube',
  })

  const ytConfig = useQuery<YouTubeConfig>({
    queryKey: ['analytics-yt-config'],
    queryFn: () => api.get('/analytics/youtube/config').then(r => r.data),
    enabled: tab === 'YouTube',
  })

  const ttStats = useQuery<VideoStatRow[]>({
    queryKey: ['analytics-tiktok', range],
    queryFn: () => api.get('/analytics/tiktok/stats', { params: { date_from: range.from, date_to: range.to } }).then(r => r.data),
    enabled: tab === 'TikTok',
  })

  const correlation = useQuery<{ platform: string; data: CorrelationRow[] }>({
    queryKey: ['analytics-correlation', range],
    queryFn: () => api.get('/analytics/correlation', { params: { date_from: range.from, date_to: range.to } }).then(r => r.data),
    enabled: tab === 'Corrélation',
  })

  // ── Mutations ──────────────────────────────────────────────────────────────

  const pullMeta = useMutation({
    mutationFn: () => api.post('/analytics/meta/pull'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['analytics-meta'] }),
  })

  const pullYT = useMutation({
    mutationFn: () => api.post('/analytics/youtube/pull'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['analytics-youtube'] })
      qc.invalidateQueries({ queryKey: ['analytics-yt-config'] })
    },
  })

  const ttFileRef = useRef<HTMLInputElement>(null)
  const importTT = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return api.post('/analytics/tiktok/import', fd, { headers: { 'Content-Type': undefined } })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['analytics-tiktok'] }),
  })

  // ── YouTube auth URL ───────────────────────────────────────────────────────
  const ytAuthUrl = useQuery<{ url: string }>({
    queryKey: ['yt-auth-url'],
    queryFn: () => api.get('/analytics/youtube/auth-url').then(r => r.data),
    enabled: tab === 'YouTube',
  })

  // ── Aggregations for charts ────────────────────────────────────────────────
  const metaByDay = (() => {
    if (!metaStats.data?.stats) return []
    const map = new Map<string, { spend: number; conversations: number; clicks: number }>()
    for (const row of metaStats.data.stats) {
      const d = row.date.split('T')[0]
      const cur = map.get(d) ?? { spend: 0, conversations: 0, clicks: 0 }
      cur.spend += row.spend
      cur.conversations += row.conversations
      cur.clicks += row.clicks
      map.set(d, cur)
    }
    return Array.from(map.entries()).sort().map(([date, v]) => ({ date: fmtDate(date), ...v }))
  })()

  const ytByDay = (() => {
    if (!ytStats.data) return []
    const map = new Map<string, number>()
    for (const s of ytStats.data) {
      const d = s.date.split('T')[0]
      map.set(d, (map.get(d) ?? 0) + (s.views_delta ?? 0))
    }
    return Array.from(map.entries()).sort().map(([date, views]) => ({ date: fmtDate(date), views }))
  })()

  const ttByDay = (() => {
    if (!ttStats.data) return []
    const map = new Map<string, number>()
    for (const s of ttStats.data) {
      const d = s.date.split('T')[0]
      map.set(d, (map.get(d) ?? 0) + (s.views_delta ?? 0))
    }
    return Array.from(map.entries()).sort().map(([date, views]) => ({ date: fmtDate(date), views }))
  })()

  const corrData = (correlation.data?.data ?? []).map(r => ({
    date: fmtDate(r.date),
    vues: r.views_delta,
    leads: r.leads,
  }))

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart2 className="h-6 w-6 text-indigo-600" />
          <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
        </div>
        <DateRangePicker
          period={period}
          customFrom={customFrom}
          customTo={customTo}
          onChange={(p, from, to) => { setPeriod(p); setCustomFrom(from); setCustomTo(to) }}
          periods={SHORT_PERIODS}
          placeholder="Toutes les dates"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              tab === t
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-600',
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Vue d'ensemble ─────────────────────────────────────────────────── */}
      {tab === 'Vue d\'ensemble' && (
        <div className="space-y-6">
          {/* Acquisition KPIs */}
          {leadKpis.data && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-indigo-800/40 bg-indigo-950/20 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Crosshair className="h-4 w-4 text-indigo-600" />
                  <p className="text-xs text-gray-500">Total leads</p>
                </div>
                <p className="text-2xl font-bold text-indigo-600">{fmt(leadKpis.data.total)}</p>
                <p className="text-xs text-gray-600 mt-0.5">+{leadKpis.data.new_last_7d} cette semaine</p>
              </div>
              <div className="rounded-xl border border-green-800/40 bg-green-950/20 p-4">
                <p className="text-xs text-gray-500 mb-1">Won</p>
                <p className="text-2xl font-bold text-green-600">{fmt(leadKpis.data.won)}</p>
                <p className="text-xs text-gray-600 mt-0.5">Taux : {leadKpis.data.conversion_rate}%</p>
              </div>
              <StatCard
                label={`Dépenses Meta (période)`}
                value={overview.data ? `${fmt(overview.data.meta.spend, 0)} XOF` : '—'}
                sub={overview.data ? `${fmt(overview.data.meta.conversations)} conversations` : undefined}
              />
              <StatCard
                label="Coût / conversation"
                value={overview.data?.meta.cost_per_conversation != null
                  ? `${fmt(overview.data.meta.cost_per_conversation, 0)} XOF`
                  : '—'}
              />
            </div>
          )}

          {/* Content views */}
          {overview.data && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard
                label="Vues YouTube"
                value={fmt(overview.data.youtube.views_delta)}
                sub={overview.data.youtube.last_synced
                  ? `Sync: ${new Date(overview.data.youtube.last_synced).toLocaleDateString('fr-FR')}`
                  : 'Jamais synchronisé'}
              />
              <StatCard label="Vues TikTok" value={fmt(overview.data.tiktok.views_delta)} />
              <div className="col-span-2 rounded-xl border border-gray-200 bg-white p-4 flex items-center">
                <p className="text-xs text-gray-600">
                  Période : {range.from || '…'} → {range.to || '…'}
                </p>
              </div>
            </div>
          )}

          {/* Lead Funnel */}
          {leadKpis.data && (() => {
            const funnelData = PIPELINE_STAGES.map(s => ({
              label: s.label,
              count: leadKpis.data!.by_pipeline[s.key] ?? 0,
              color: s.color,
              pct: leadKpis.data!.total > 0
                ? Math.round(((leadKpis.data!.by_pipeline[s.key] ?? 0) / leadKpis.data!.total) * 100)
                : 0,
            })).filter(s => s.count > 0)

            return (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Funnel chart */}
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="mb-3 text-sm font-semibold text-gray-800">Entonnoir pipeline</p>
                  {funnelData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={funnelData} layout="vertical" margin={{ left: 0, right: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11, fill: '#6b7280' }} />
                        <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} width={90} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                          formatter={(v, _name, props) => [`${v} leads (${(props.payload as { pct?: number })?.pct ?? 0}%)`, 'Pipeline']}
                        />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                          {funnelData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} fillOpacity={0.85} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-gray-600 py-8 text-center">Aucun lead dans le pipeline</p>
                  )}
                </div>

                {/* Sources */}
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="mb-3 text-sm font-semibold text-gray-800">Sources d'acquisition</p>
                  {leadKpis.data.by_source.length > 0 ? (
                    <div className="space-y-2.5">
                      {leadKpis.data.by_source.map((s) => {
                        const pct = leadKpis.data!.total > 0
                          ? Math.round((s.count / leadKpis.data!.total) * 100)
                          : 0
                        return (
                          <div key={s._id ?? 'inconnu'}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-gray-400">{SOURCE_LABELS[s._id] ?? s._id ?? 'Inconnu'}</span>
                              <span className="text-gray-500">{s.count} · {pct}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-gray-100">
                              <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600 py-8 text-center">Aucune donnée</p>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Platform drill-down shortcuts */}
          <div className="grid grid-cols-3 gap-3">
            {(['Meta Ads', 'YouTube', 'TikTok', 'Corrélation'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t as Tab)}
                className="rounded-xl border border-gray-200 bg-white p-3 text-left hover:border-gray-200 transition-colors"
              >
                <p className="text-sm font-medium text-gray-600">{t}</p>
                <p className="text-xs text-gray-600 mt-0.5">Voir le détail →</p>
              </button>
            ))}
          </div>

          {(overview.isLoading || leadKpis.isLoading) && (
            <p className="text-sm text-gray-500">Chargement...</p>
          )}
        </div>
      )}

      {/* ── Meta Ads ──────────────────────────────────────────────────────── */}
      {tab === 'Meta Ads' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => pullMeta.mutate()}
              disabled={pullMeta.isPending}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              <RefreshCw className={cn('h-4 w-4', pullMeta.isPending && 'animate-spin')} />
              Synchroniser hier
            </button>
            {pullMeta.isSuccess && <span className="flex items-center gap-1 text-sm text-green-600"><CheckCircle className="h-4 w-4" /> Synchronisé</span>}
            {pullMeta.isError && <span className="flex items-center gap-1 text-sm text-red-400"><AlertCircle className="h-4 w-4" /> Erreur</span>}
          </div>

          {metaStats.data && (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                <StatCard label="Dépenses" value={`${fmt(metaStats.data.totals.spend, 0)} XOF`} />
                <StatCard label="Impressions" value={fmt(metaStats.data.totals.impressions)} />
                <StatCard label="Clics" value={fmt(metaStats.data.totals.clicks)} />
                <StatCard label="Conversations WA" value={fmt(metaStats.data.totals.conversations)} />
                <StatCard
                  label="Coût / conv."
                  value={metaStats.data.totals.cost_per_conversation != null ? `${fmt(metaStats.data.totals.cost_per_conversation, 0)} XOF` : '—'}
                />
              </div>

              {metaByDay.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="mb-3 text-sm font-medium text-gray-600">Dépenses & Conversations par jour</p>
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={metaByDay}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#6b7280' }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#6b7280' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }} />
                      <Legend />
                      <Bar yAxisId="left" dataKey="spend" name="Dépenses (XOF)" fill="#6366f1" radius={[3, 3, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="conversations" name="Conversations" stroke="#34d399" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {metaStats.data.stats.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-white">
                      <tr>
                        {['Date', 'Campagne', 'Adset', 'Dépenses', 'Impressions', 'Clics', 'Conv.', 'CPConv.'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-400">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {metaStats.data.stats.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400">{fmtDate(row.date)}</td>
                          <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate">{row.campaign_name}</td>
                          <td className="px-3 py-2 text-gray-400 max-w-[160px] truncate">{row.adset_name}</td>
                          <td className="px-3 py-2 text-gray-600">{fmt(row.spend, 0)}</td>
                          <td className="px-3 py-2 text-gray-400">{fmt(row.impressions)}</td>
                          <td className="px-3 py-2 text-gray-400">{fmt(row.clicks)}</td>
                          <td className="px-3 py-2 text-green-600 font-medium">{row.conversations}</td>
                          <td className="px-3 py-2 text-gray-400">{row.cost_per_conversation != null ? fmt(row.cost_per_conversation, 0) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {metaStats.isLoading && <p className="text-sm text-gray-500">Chargement...</p>}
        </div>
      )}

      {/* ── YouTube ──────────────────────────────────────────────────────────── */}
      {tab === 'YouTube' && (
        <div className="space-y-6">
          {/* Config status */}
          <div className="flex flex-wrap items-center gap-3">
            {ytConfig.data && (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm">
                <PlayCircle className="h-4 w-4 text-red-500" />
                {ytConfig.data.has_refresh_token ? (
                  <span className="flex items-center gap-1.5 text-green-600"><CheckCircle className="h-3.5 w-3.5" /> Connecté</span>
                ) : (
                  <span className="flex items-center gap-1.5 text-yellow-600"><AlertCircle className="h-3.5 w-3.5" /> Non connecté</span>
                )}
                {ytConfig.data.channel_id && <span className="text-gray-500 text-xs">#{ytConfig.data.channel_id}</span>}
              </div>
            )}

            {ytAuthUrl.data && (
              <a
                href={ytAuthUrl.data.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:border-indigo-500 hover:text-indigo-600 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                Connecter YouTube
              </a>
            )}

            <button
              onClick={() => pullYT.mutate()}
              disabled={pullYT.isPending}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              <RefreshCw className={cn('h-4 w-4', pullYT.isPending && 'animate-spin')} />
              Synchroniser hier
            </button>
            {pullYT.isSuccess && <span className="flex items-center gap-1 text-sm text-green-600"><CheckCircle className="h-4 w-4" /> Synchronisé</span>}
            {pullYT.isError && <span className="flex items-center gap-1 text-sm text-red-400"><AlertCircle className="h-4 w-4" /> Erreur</span>}
          </div>

          {ytByDay.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="mb-3 text-sm font-medium text-gray-600">Vues par jour (delta)</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={ytByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }} />
                  <Bar dataKey="views" name="Vues" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {ytStats.data && ytStats.data.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-white">
                  <tr>
                    {['Titre', 'Date', 'Vues (cumul)', 'Δ Vues', 'Likes', 'Commentaires', 'Watch time (min)'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {ytStats.data.slice(0, 50).map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-600 max-w-[220px] truncate" title={row.title}>{row.title}</td>
                      <td className="px-3 py-2 text-gray-400">{fmtDate(row.date)}</td>
                      <td className="px-3 py-2 text-gray-600">{fmt(row.views)}</td>
                      <td className="px-3 py-2 text-indigo-600 font-medium">{fmt(row.views_delta)}</td>
                      <td className="px-3 py-2 text-gray-400">{fmt(row.likes)}</td>
                      <td className="px-3 py-2 text-gray-400">{fmt(row.comments)}</td>
                      <td className="px-3 py-2 text-gray-400">{row.watch_time_minutes != null ? fmt(row.watch_time_minutes) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {ytStats.isLoading && <p className="text-sm text-gray-500">Chargement...</p>}
        </div>
      )}

      {/* ── TikTok ──────────────────────────────────────────────────────────── */}
      {tab === 'TikTok' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".csv"
              ref={ttFileRef}
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) importTT.mutate(f)
                e.target.value = ''
              }}
            />
            <button
              onClick={() => ttFileRef.current?.click()}
              disabled={importTT.isPending}
              className="flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-medium text-white hover:bg-pink-500 disabled:opacity-50"
            >
              <Upload className={cn('h-4 w-4', importTT.isPending && 'animate-pulse')} />
              Importer CSV TikTok
            </button>
            {importTT.isSuccess && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                {(importTT.data?.data as { upserted?: number })?.upserted ?? 0} lignes importées
              </span>
            )}
            {importTT.isError && <span className="flex items-center gap-1 text-sm text-red-400"><AlertCircle className="h-4 w-4" /> Erreur import</span>}
            <p className="text-xs text-gray-600">Exporter depuis TikTok Creator Studio → Analyse → Exporter en CSV</p>
          </div>

          {ttByDay.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="mb-3 text-sm font-medium text-gray-600">Vues par jour (delta)</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={ttByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }} />
                  <Bar dataKey="views" name="Vues" fill="#ec4899" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {ttStats.data && ttStats.data.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-white">
                  <tr>
                    {['Titre', 'Date', 'Vues (cumul)', 'Δ Vues', 'Likes', 'Commentaires', 'Partages'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {ttStats.data.slice(0, 50).map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-600 max-w-[220px] truncate" title={row.title}>{row.title}</td>
                      <td className="px-3 py-2 text-gray-400">{fmtDate(row.date)}</td>
                      <td className="px-3 py-2 text-gray-600">{fmt(row.views)}</td>
                      <td className="px-3 py-2 text-pink-400 font-medium">{fmt(row.views_delta)}</td>
                      <td className="px-3 py-2 text-gray-400">{fmt(row.likes)}</td>
                      <td className="px-3 py-2 text-gray-400">{fmt(row.comments)}</td>
                      <td className="px-3 py-2 text-gray-400">{fmt(row.shares)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {ttStats.isLoading && <p className="text-sm text-gray-500">Chargement...</p>}
        </div>
      )}

      {/* ── Corrélation ─────────────────────────────────────────────────────── */}
      {tab === 'Corrélation' && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-indigo-600" />
            <p className="text-sm text-gray-400">Corrélation entre les vues vidéo et la création de leads</p>
          </div>

          {corrData.length > 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="mb-3 text-sm font-medium text-gray-600">Vues delta vs Leads créés</p>
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={corrData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }} />
                  <Legend />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="vues"
                    name="Vues (toutes plateformes)"
                    fill="#6366f1"
                    fillOpacity={0.15}
                    stroke="#6366f1"
                    strokeWidth={2}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="leads"
                    name="Leads"
                    stroke="#34d399"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#34d399' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Pas de données pour cette période.</p>
          )}
          {correlation.isLoading && <p className="text-sm text-gray-500">Chargement...</p>}
        </div>
      )}
    </div>
  )
}
