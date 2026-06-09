import { useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  TrendingUp, TrendingDown, DollarSign, Zap, FileText,
  CheckCircle, ArrowUpRight, ArrowDownLeft, Trophy,
  FolderKanban, Wallet, Clock,
  CreditCard, BarChart2, Activity,
} from 'lucide-react'
import api from '@/services/api'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AcquisitionKpis {
  total: number
  won: number
  new_last_7d: number
  new_last_30d: number
  conversion_rate: number
  by_pipeline: Record<string, number>
  period_new: number | null
  period_won: number | null
}

interface FinanceStats {
  currency: string
  month: { income: number; expense: number; net: number }
  year: { income: number; expense: number; net: number }
  byMonth: { label: string; income: number; expense: number }[]
}

interface Automation {
  _id: string
  name: string
  isActive: boolean
  runCount: number
  lastRunAt: string | null
  triggerType: string
}

interface Form {
  _id: string
  name: string
  responseCount: number
  isPublished: boolean
}

interface Transaction {
  _id: string
  type: 'income' | 'expense'
  amount: number
  currency: string
  description: string
  customerName?: string | null
  productName?: string | null
  gateway: string
  status: string
  date: string
  createdAt: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n))
}
function fmtCurrency(n: number, cur: string): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M ${cur}`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k ${cur}`
  return `${fmt(n)} ${cur}`
}
function relativeTime(dateStr: string | null): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'à l\'instant'
  if (m < 60) return `il y a ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h}h`
  const d = Math.floor(h / 24)
  return `il y a ${d}j`
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

// Sparkline — lightweight line/area for cards
function Sparkline({ data, dataKey, color, type = 'line' }: {
  data: object[]
  dataKey: string
  color: string
  type?: 'line' | 'area' | 'bar'
}) {
  if (!data.length) return <div className="h-12" />
  return (
    <ResponsiveContainer width="100%" height={48}>
      {type === 'bar' ? (
        <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Bar dataKey={dataKey} fill={color} radius={[2, 2, 0, 0]} maxBarSize={16} />
        </BarChart>
      ) : type === 'area' ? (
        <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5}
            fill={`url(#grad-${dataKey})`} dot={false} />
        </AreaChart>
      ) : (
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 0, left: 0 }}>
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2}
            dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
        </LineChart>
      )}
    </ResponsiveContainer>
  )
}

// Small stat (icon + number + label)
function QuickStat({ icon: Icon, value, label, iconColor, iconBg, loading }: {
  icon: React.ElementType
  value: string | number
  label: string
  iconColor: string
  iconBg: string
  loading?: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: iconBg }}>
        <Icon className="h-4.5 w-4.5" style={{ color: iconColor }} />
      </div>
      <div className="min-w-0">
        <p className={cn('text-xl font-bold leading-tight text-gray-900', loading && 'text-gray-300')}>
          {loading ? '—' : value}
        </p>
        <p className="text-[11px] text-gray-400 truncate">{label}</p>
      </div>
    </div>
  )
}

// Module summary card
function ModuleCard({ mod, stat1, stat2, chartData, chartKey, chartColor, href }: {
  mod: { label: string; Icon: React.ElementType; iconColor: string; iconBg: string; borderColor: string }
  stat1: { value: string | number; label: string }
  stat2: { value: string | number; label: string }
  chartData: object[]
  chartKey: string
  chartColor: string
  href: string
}) {
  return (
    <div className="flex flex-col rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden" style={{ borderLeftColor: mod.borderColor, borderLeftWidth: 4 }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: mod.iconBg }}>
          <mod.Icon className="h-3.5 w-3.5" style={{ color: mod.iconColor }} />
        </div>
        <span className="text-sm font-bold text-gray-800">{mod.label}</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 px-4 pb-2">
        <div>
          <p className="text-xl font-bold text-gray-900 leading-tight">{stat1.value}</p>
          <p className="text-[11px] text-gray-400">{stat1.label}</p>
        </div>
        <div>
          <p className="text-xl font-bold text-gray-900 leading-tight">{stat2.value}</p>
          <p className="text-[11px] text-gray-400">{stat2.label}</p>
        </div>
      </div>

      {/* Sparkline */}
      <div className="flex-1 px-1">
        <Sparkline data={chartData} dataKey={chartKey} color={chartColor} type="line" />
      </div>

      {/* Footer */}
      <Link
        to={href}
        className="flex items-center justify-between border-t border-gray-50 px-4 py-2.5 text-xs font-medium text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
      >
        <span>Voir le dashboard</span>
        <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}

// ── Pipeline stages ───────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { key: 'nouveau',           label: 'Nouveau',    color: '#6b7280' },
  { key: 'mql',              label: 'MQL',         color: '#3b82f6' },
  { key: 'sql',              label: 'SQL',         color: '#6366f1' },
  { key: 'rdv_programme',    label: 'RDV',         color: '#eab308' },
  { key: 'appel_diagnostic', label: 'Appel',       color: '#f97316' },
  { key: 'won',              label: 'Won',         color: '#22c55e' },
  { key: 'lost',             label: 'Lost',        color: '#ef4444' },
  { key: 'nurturing',        label: 'Nurturing',   color: '#a855f7' },
]

// ── Module card configs ───────────────────────────────────────────────────────

const MOD_SALES      = { label: 'Sales',      Icon: TrendingUp,  iconColor: '#22c55e', iconBg: '#dcfce7', borderColor: '#22c55e' }
const MOD_PROJECTS   = { label: 'Projects',   Icon: FolderKanban,iconColor: '#8b5cf6', iconBg: '#ede9fe', borderColor: '#8b5cf6' }
const MOD_WORKSPACE  = { label: 'Workspace',  Icon: Zap,         iconColor: '#3b82f6', iconBg: '#dbeafe', borderColor: '#3b82f6' }
const MOD_FINANCE    = { label: 'Finance',    Icon: Wallet,      iconColor: '#f97316', iconBg: '#ffedd5', borderColor: '#f97316' }

// ── Main Dashboard ────────────────────────────────────────────────────────────

export function DashboardPage() {
  const [displayCurrency] = useState('XOF')

  const [
    leadKpisQ,
    financeStatsQ,
    automationsQ,
    formsQ,
    recentTransactionsQ,
  ] = useQueries({
    queries: [
      {
        queryKey: ['lead-kpis-dash'],
        queryFn: () => api.get<AcquisitionKpis>('/leads/kpis').then((r) => r.data),
      },
      {
        queryKey: ['finance-stats-dash'],
        queryFn: () => api.get<FinanceStats>('/finances/stats', { params: { currency: 'XOF' } }).then((r) => r.data),
      },
      {
        queryKey: ['automations-dash'],
        queryFn: () => api.get<Automation[]>('/automations').then((r) => r.data),
      },
      {
        queryKey: ['forms-dash'],
        queryFn: () => api.get<Form[]>('/forms').then((r) => r.data),
      },
      {
        queryKey: ['recent-transactions-dash'],
        queryFn: () =>
          api.get<{ data: Transaction[] }>('/finances/transactions', { params: { limit: 8 } })
            .then((r) => r.data.data),
      },
    ],
  })

  const kpis    = leadKpisQ.data
  const fin     = financeStatsQ.data
  const autos   = automationsQ.data ?? []
  const forms   = formsQ.data ?? []
  const recent  = recentTransactionsQ.data ?? []

  const activeAutos = autos.filter((a) => a.isActive)
  const totalRuns   = autos.reduce((s, a) => s + (a.runCount ?? 0), 0)
  const publishedForms = forms.filter((f) => f.isPublished)

  // Revenue trend (last 6 months)
  const revTrend = (fin?.byMonth ?? []).slice(-6)
  const expTrend = (fin?.byMonth ?? []).slice(-6)

  // Month vs prev month
  const months = fin?.byMonth ?? []
  const thisMonth = months[months.length - 1]?.income ?? fin?.month.income ?? 0
  const prevMonth = months[months.length - 2]?.income ?? 0
  const revTrendPct = prevMonth > 0 ? ((thisMonth - prevMonth) / prevMonth * 100).toFixed(1) : null
  const revIsUp = prevMonth > 0 ? thisMonth >= prevMonth : true

  // Pipeline health donut
  const wonCount  = kpis?.won ?? 0
  const totalLeads = kpis?.total ?? 0
  const lostCount = kpis?.by_pipeline?.lost ?? 0
  const otherCount = Math.max(0, totalLeads - wonCount - lostCount)
  const pipelineDonut = [
    { name: 'Won', value: wonCount,   fill: '#22c55e' },
    { name: 'Lost', value: lostCount,  fill: '#ef4444' },
    { name: 'Active', value: otherCount, fill: '#e5e7eb' },
  ]

  // Leads sparkline from pipeline stages
  const leadSparkData = PIPELINE_STAGES.map((s) => ({
    name: s.label,
    value: kpis?.by_pipeline[s.key] ?? 0,
  }))

  // Form responses sparkline (per form)
  const formSparkData = forms.slice(0, 6).map((f) => ({
    name: f.name,
    value: f.responseCount,
  }))

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-5 p-6">

        {/* ── Row 1: Three large KPI cards ──────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

          {/* Card 1 — Total Revenue */}
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Total Revenus</p>
                <p className="mt-1.5 text-3xl font-bold text-gray-900">
                  {financeStatsQ.isLoading ? (
                    <span className="text-gray-200">———</span>
                  ) : fmtCurrency(fin?.month.income ?? 0, displayCurrency)}
                </p>
                <p className="mt-1 text-xs text-gray-400">Ce mois · {fmtCurrency(fin?.year.income ?? 0, displayCurrency)} cette année</p>
              </div>
              {revTrendPct && (
                <div className={cn(
                  'flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold',
                  revIsUp ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500',
                )}>
                  {revIsUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {revIsUp ? '+' : ''}{revTrendPct}%
                </div>
              )}
            </div>
            <div className="mt-3">
              <Sparkline data={revTrend} dataKey="income" color="#22c55e" type="area" />
            </div>
          </div>

          {/* Card 2 — Total Leads */}
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Pipeline Leads</p>
                <p className="mt-1.5 text-3xl font-bold text-gray-900">
                  {leadKpisQ.isLoading ? <span className="text-gray-200">——</span> : fmt(totalLeads)}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  {kpis?.new_last_7d ?? 0} nouveaux · {wonCount} won
                </p>
              </div>
              <div className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-xs font-semibold text-green-600">
                Actifs
              </div>
            </div>
            <div className="mt-3">
              <Sparkline data={leadSparkData} dataKey="value" color="#8b5cf6" type="bar" />
            </div>
          </div>

          {/* Card 3 — Pipeline Health (donut) */}
          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Pipeline Health</p>
            {leadKpisQ.isLoading || totalLeads === 0 ? (
              <div className="flex flex-col items-center justify-center h-28 text-center">
                <p className="text-sm font-semibold text-gray-400">Aujourd'hui</p>
                <p className="mt-0.5 text-xl font-bold text-gray-300">No data</p>
              </div>
            ) : (
              <div className="flex items-center gap-4 mt-2">
                <ResponsiveContainer width={100} height={100}>
                  <PieChart>
                    <Pie data={pipelineDonut} cx="50%" cy="50%" innerRadius={28} outerRadius={44}
                      dataKey="value" startAngle={90} endAngle={-270} paddingAngle={2}>
                      {pipelineDonut.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} stroke="none" />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {pipelineDonut.filter(d => d.value > 0).map((d) => (
                    <div key={d.name} className="flex items-center gap-2 text-xs">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: d.fill }} />
                      <span className="text-gray-500">{d.name}</span>
                      <span className="ml-auto font-semibold text-gray-700">{d.value}</span>
                    </div>
                  ))}
                  <p className="text-xs text-gray-400">
                    Taux: <span className="font-bold text-green-600">{kpis?.conversion_rate ?? 0}%</span>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Row 2: Six quick stats ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <QuickStat icon={DollarSign} value={fmtCurrency(fin?.month.net ?? 0, 'XOF')}
            label="Profit net" iconColor="#22c55e" iconBg="#dcfce7" loading={financeStatsQ.isLoading} />
          <QuickStat icon={Trophy} value={fmt(wonCount)}
            label="Leads won" iconColor="#8b5cf6" iconBg="#ede9fe" loading={leadKpisQ.isLoading} />
          <QuickStat icon={Zap} value={activeAutos.length}
            label="Automatisations" iconColor="#f97316" iconBg="#ffedd5" loading={automationsQ.isLoading} />
          <QuickStat icon={FileText} value={publishedForms.length}
            label="Formulaires actifs" iconColor="#3b82f6" iconBg="#dbeafe" loading={formsQ.isLoading} />
          <QuickStat icon={Activity} value={totalRuns}
            label="Exécutions totales" iconColor="#6366f1" iconBg="#e0e7ff" loading={automationsQ.isLoading} />
          <QuickStat icon={BarChart2} value={`${kpis?.conversion_rate ?? 0}%`}
            label="Taux conversion" iconColor="#ec4899" iconBg="#fce7f3" loading={leadKpisQ.isLoading} />
        </div>

        {/* ── Row 3: Four module cards ───────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ModuleCard
            mod={MOD_SALES}
            stat1={{ value: fmt(kpis?.new_last_7d ?? 0), label: 'Nouveaux leads' }}
            stat2={{ value: fmt(wonCount), label: 'Won · étudiants' }}
            chartData={revTrend}
            chartKey="income"
            chartColor="#22c55e"
            href="/leads"
          />
          <ModuleCard
            mod={MOD_PROJECTS}
            stat1={{ value: forms.length, label: 'Formulaires total' }}
            stat2={{ value: publishedForms.length, label: 'Publiés' }}
            chartData={formSparkData}
            chartKey="value"
            chartColor="#8b5cf6"
            href="/forms"
          />
          <ModuleCard
            mod={MOD_WORKSPACE}
            stat1={{ value: autos.length, label: 'Automatisations' }}
            stat2={{ value: activeAutos.length, label: 'Actives' }}
            chartData={formSparkData}
            chartKey="value"
            chartColor="#3b82f6"
            href="/automations"
          />
          <ModuleCard
            mod={MOD_FINANCE}
            stat1={{ value: fmtCurrency(fin?.month.income ?? 0, 'XOF'), label: 'Revenus / mois' }}
            stat2={{ value: fmt(recent.filter(t => t.type === 'income' && t.status !== 'failed').length), label: 'Transactions' }}
            chartData={expTrend}
            chartKey="income"
            chartColor="#f97316"
            href="/finances"
          />
        </div>

        {/* ── Row 4: Revenue chart + Recent transactions ─────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">

          {/* Revenue area chart */}
          <div className="lg:col-span-3 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-800">Revenus vs Dépenses</h3>
                <p className="text-xs text-gray-400 mt-0.5">12 derniers mois</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5 text-gray-500">
                  <span className="h-2 w-2 rounded-full bg-green-500" /> Revenus
                </span>
                <span className="flex items-center gap-1.5 text-gray-500">
                  <span className="h-2 w-2 rounded-full bg-red-400" /> Dépenses
                </span>
              </div>
            </div>

            {(fin?.byMonth ?? []).length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={fin?.byMonth ?? []} margin={{ left: -10, right: 0, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gExpense" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false}
                    tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${Math.round(v / 1_000)}k` : String(v)} />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #f3f4f6', borderRadius: 10, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,.08)' }}
                    labelStyle={{ color: '#374151', fontWeight: 600 }}
                  />
                  <Area type="monotone" dataKey="income" stroke="#22c55e" strokeWidth={2}
                    fill="url(#gIncome)" dot={false} activeDot={{ r: 4, fill: '#22c55e', strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={1.5}
                    fill="url(#gExpense)" dot={false} activeDot={{ r: 3, fill: '#ef4444', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[200px] items-center justify-center rounded-lg bg-gray-50">
                <p className="text-sm text-gray-400">Aucune transaction enregistrée</p>
              </div>
            )}
          </div>

          {/* Recent transactions */}
          <div className="lg:col-span-2 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-800">Dernières transactions</h3>
              <Link to="/finances" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                Voir tout →
              </Link>
            </div>

            {recentTransactionsQ.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="h-8 w-8 rounded-full bg-gray-100 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-24 rounded bg-gray-100" />
                      <div className="h-2.5 w-14 rounded bg-gray-50" />
                    </div>
                    <div className="h-3 w-16 rounded bg-gray-100" />
                  </div>
                ))}
              </div>
            ) : recent.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-36 gap-2">
                <CreditCard className="h-8 w-8 text-gray-200" />
                <p className="text-sm text-gray-400">Aucune transaction</p>
              </div>
            ) : (
              <div className="space-y-1">
                {recent.map((tx) => {
                  const isIncome = tx.type === 'income'
                  const label = tx.customerName ?? tx.description ?? tx.productName ?? '—'
                  const sub = tx.productName && tx.customerName ? tx.productName : tx.gateway
                  return (
                    <div key={tx._id}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-gray-50">
                      <div className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                        isIncome ? 'bg-green-50' : 'bg-red-50',
                      )}>
                        {isIncome
                          ? <ArrowDownLeft className="h-3.5 w-3.5 text-green-500" />
                          : <ArrowUpRight className="h-3.5 w-3.5 text-red-500" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{label}</p>
                        <p className="text-[10px] text-gray-400 truncate">{sub}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn('text-xs font-semibold', isIncome ? 'text-green-600' : 'text-red-500')}>
                          {isIncome ? '+' : '−'}{fmt(tx.amount)} {tx.currency}
                        </p>
                        <p className="text-[10px] text-gray-400">{relativeTime(tx.date ?? tx.createdAt)}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Row 5: Automations grid ────────────────────────────────────── */}
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-bold text-gray-800">Automatisations</h3>
              <span className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
                activeAutos.length > 0 ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500',
              )}>
                {activeAutos.length} active{activeAutos.length !== 1 ? 's' : ''}
              </span>
              <span className="text-xs text-gray-400">{totalRuns} exécutions</span>
            </div>
            <Link to="/automations" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
              Voir tout →
            </Link>
          </div>

          {automationsQ.isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 rounded-lg bg-gray-50 animate-pulse" />
              ))}
            </div>
          ) : autos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Zap className="h-8 w-8 text-gray-200" />
              <p className="text-sm text-gray-400">Aucune automatisation configurée</p>
              <Link to="/automations" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                Créer une automatisation
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {autos.slice(0, 8).map((auto) => (
                <Link
                  key={auto._id}
                  to="/automations"
                  className="group flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 transition-all hover:border-indigo-100 hover:bg-indigo-50/50"
                >
                  <div className={cn(
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                    auto.isActive ? 'bg-indigo-100' : 'bg-gray-200',
                  )}>
                    <Zap className={cn('h-3.5 w-3.5', auto.isActive ? 'text-indigo-600' : 'text-gray-400')} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-700 truncate group-hover:text-indigo-700">{auto.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      {auto.isActive
                        ? <span className="flex items-center gap-1 text-[10px] text-green-600"><CheckCircle className="h-3 w-3" /> Active</span>
                        : <span className="flex items-center gap-1 text-[10px] text-gray-400"><Clock className="h-3 w-3" /> Inactive</span>
                      }
                      <span className="text-[10px] text-gray-400">{auto.runCount ?? 0}×</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
