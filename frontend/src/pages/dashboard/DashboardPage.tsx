import { useQueries } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import {
  TrendingUp, Trophy, Users, CreditCard, ChevronRight,
  Zap, FileText, AlertTriangle, CheckCircle, Clock,
  ArrowUpRight, Activity, GraduationCap,
} from 'lucide-react'
import api from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PaymentStats {
  nonTraite: number
  traite: number
  todayByAmount: { currency: string; total: number }[]
  monthByAmount: { currency: string; total: number }[]
}

interface StudentStats {
  total: number
  withDebt: number
  newThisMonth: number
  enRegle: number
  enRetard: number
}

interface AcquisitionKpis {
  total: number
  won: number
  new_last_7d: number
  conversion_rate: number
  by_pipeline: Record<string, number>
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

interface Payment {
  _id: string
  studentName: string
  studentEmail: string
  amount: number
  currency: string
  status: string
  processedAt: string | null
  createdAt: string
  product?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n))

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'à l\'instant'
  if (m < 60) return `il y a ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h}h`
  const d = Math.floor(h / 24)
  return `il y a ${d}j`
}

function todayDate(): string {
  return new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

// ── Metric Card ───────────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, icon: Icon, accent, href, loading,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  accent: 'indigo' | 'emerald' | 'amber' | 'rose' | 'blue' | 'violet'
  href?: string
  loading?: boolean
}) {
  const accents = {
    indigo:  { bg: 'bg-indigo-500/10',  icon: 'text-indigo-400',  val: 'text-indigo-300',  ring: 'hover:ring-indigo-500/30' },
    emerald: { bg: 'bg-emerald-500/10', icon: 'text-emerald-400', val: 'text-emerald-300', ring: 'hover:ring-emerald-500/30' },
    amber:   { bg: 'bg-amber-500/10',   icon: 'text-amber-400',   val: 'text-amber-300',   ring: 'hover:ring-amber-500/30' },
    rose:    { bg: 'bg-rose-500/10',    icon: 'text-rose-400',    val: 'text-rose-300',    ring: 'hover:ring-rose-500/30' },
    blue:    { bg: 'bg-blue-500/10',    icon: 'text-blue-400',    val: 'text-blue-300',    ring: 'hover:ring-blue-500/30' },
    violet:  { bg: 'bg-violet-500/10',  icon: 'text-violet-400',  val: 'text-violet-300',  ring: 'hover:ring-violet-500/30' },
  }
  const a = accents[accent]

  const inner = (
    <div className={cn(
      'relative rounded-2xl border border-gray-800 bg-gray-900/80 p-5 transition-all duration-200',
      'hover:border-gray-700 hover:bg-gray-900 ring-1 ring-transparent',
      a.ring,
    )}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-500 tracking-wide">{label}</p>
          <p className={cn('mt-2 text-2xl font-bold leading-none', loading ? 'text-gray-700' : a.val)}>
            {loading ? '···' : value}
          </p>
          {sub && !loading && (
            <p className="mt-1.5 text-xs text-gray-600 truncate">{sub}</p>
          )}
        </div>
        <div className={cn('rounded-xl p-2.5 shrink-0', a.bg)}>
          <Icon className={cn('h-5 w-5', a.icon)} />
        </div>
      </div>
      {href && (
        <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
          <ArrowUpRight className="h-3.5 w-3.5 text-gray-600" />
        </div>
      )}
    </div>
  )

  return href ? (
    <Link to={href} className="group block">
      {inner}
    </Link>
  ) : inner
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionTitle({ children, href }: { children: React.ReactNode; href?: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-semibold text-gray-300">{children}</h2>
      {href && (
        <Link to={href} className="flex items-center gap-1 text-xs text-gray-600 hover:text-indigo-400 transition-colors">
          Voir tout <ChevronRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  )
}

// ── Pipeline stages ────────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { key: 'nouveau',           label: 'Nouveau',    color: '#6b7280' },
  { key: 'mql',              label: 'MQL',         color: '#3b82f6' },
  { key: 'sql',              label: 'SQL',         color: '#6366f1' },
  { key: 'rdv_programme',    label: 'RDV',         color: '#eab308' },
  { key: 'appel_diagnostic', label: 'Appel diag.', color: '#f97316' },
  { key: 'won',              label: 'Won',         color: '#22c55e' },
  { key: 'lost',             label: 'Lost',        color: '#ef4444' },
  { key: 'nurturing',        label: 'Nurturing',   color: '#a855f7' },
]

const TRIGGER_LABELS: Record<string, string> = {
  payment_treated:     'Paiement traité',
  lead_won:            'Lead gagné',
  reminder_due:        'Rappel dû',
  debt_detected:       'Dette détectée',
  form_submitted:      'Formulaire soumis',
  subscription_created:'Souscription créée',
  webhook:             'Webhook',
  scheduled:           'Planifié',
}

// ── Custom chart tooltip ───────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-2.5 text-xs shadow-xl">
      <p className="mb-1.5 font-semibold text-gray-300">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
          <span className="text-gray-400">{p.name === 'income' ? 'Revenus' : 'Dépenses'}</span>
          <span className="ml-auto font-medium text-gray-200">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)

  const [
    paymentStatsQ,
    studentStatsQ,
    leadKpisQ,
    financeStatsQ,
    automationsQ,
    formsQ,
    recentPaymentsQ,
  ] = useQueries({
    queries: [
      {
        queryKey: ['payment-stats-dash'],
        queryFn: () => api.get('/payments/stats').then((r) => r.data as PaymentStats),
      },
      {
        queryKey: ['student-stats-dash'],
        queryFn: () => api.get('/students/stats').then((r) => r.data as StudentStats),
      },
      {
        queryKey: ['lead-kpis-dash'],
        queryFn: () => api.get('/leads/kpis').then((r) => r.data as AcquisitionKpis),
      },
      {
        queryKey: ['finance-stats-dash'],
        queryFn: () =>
          api.get('/finances/stats', { params: { currency: 'XOF' } }).then((r) => r.data as FinanceStats),
      },
      {
        queryKey: ['automations-dash'],
        queryFn: () => api.get('/automations').then((r) => r.data as Automation[]),
      },
      {
        queryKey: ['forms-dash'],
        queryFn: () => api.get('/forms').then((r) => r.data as Form[]),
      },
      {
        queryKey: ['recent-payments-dash'],
        queryFn: () =>
          api.get('/payments', { params: { status: 'TRAITÉ', limit: 6 } })
            .then((r) => (r.data as { data: Payment[] }).data),
      },
    ],
  })

  const pStats = paymentStatsQ.data
  const sStats = studentStatsQ.data
  const kpis   = leadKpisQ.data
  const fin    = financeStatsQ.data
  const autos  = automationsQ.data ?? []
  const forms  = formsQ.data ?? []
  const recent = recentPaymentsQ.data ?? []

  // Today's revenue — pick XOF or fallback to first
  const todayXOF    = pStats?.todayByAmount.find((a) => a.currency === 'XOF')?.total ?? 0
  const todayOther  = pStats?.todayByAmount.filter((a) => a.currency !== 'XOF') ?? []
  const todaySubMsg = todayOther.length
    ? todayOther.map((a) => `+${fmt(a.total)} ${a.currency}`).join(' · ')
    : pStats?.monthByAmount.find((a) => a.currency === 'XOF')
      ? `${fmt(pStats.monthByAmount.find((a) => a.currency === 'XOF')!.total)} XOF ce mois`
      : undefined

  // Active automations
  const activeAutos = autos.filter((a) => a.isActive)
  const totalRuns   = autos.reduce((s, a) => s + (a.runCount ?? 0), 0)

  // Funnel data
  const funnelData = PIPELINE_STAGES
    .map((s) => ({ label: s.label, count: kpis?.by_pipeline[s.key] ?? 0, color: s.color }))
    .filter((s) => s.count > 0)

  // Chart data — last 12 months revenue
  const chartData = fin?.byMonth ?? []

  // Max form responses (for bar width)
  const maxResponses = Math.max(...forms.map((f) => f.responseCount), 1)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl p-6 space-y-8">

        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-100">
              Bonjour, {user?.firstName} 👋
            </h1>
            <p className="mt-1 text-sm text-gray-500 capitalize">{todayDate()}</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-900 px-3 py-2">
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-xs text-gray-400">
              {activeAutos.length} automatisation{activeAutos.length !== 1 ? 's' : ''} active{activeAutos.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* ── KPI Cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard
            label="Revenus aujourd'hui"
            value={`${fmt(todayXOF)} XOF`}
            sub={todaySubMsg ?? 'Paiements traités'}
            icon={TrendingUp}
            accent="emerald"
            href="/finances"
            loading={paymentStatsQ.isLoading}
          />
          <MetricCard
            label="Paiements en attente"
            value={pStats?.nonTraite ?? '···'}
            sub="À traiter"
            icon={Clock}
            accent="amber"
            href="/payments"
            loading={paymentStatsQ.isLoading}
          />
          <MetricCard
            label="Nouveaux étudiants"
            value={sStats?.newThisMonth ?? '···'}
            sub={`${sStats?.total ?? 0} au total · ${sStats?.withDebt ?? 0} en retard`}
            icon={GraduationCap}
            accent="indigo"
            href="/students"
            loading={studentStatsQ.isLoading}
          />
          <MetricCard
            label="Leads Won"
            value={kpis?.won ?? '···'}
            sub={`Taux : ${kpis?.conversion_rate ?? 0}% · +${kpis?.new_last_7d ?? 0} cette semaine`}
            icon={Trophy}
            accent="violet"
            href="/leads"
            loading={leadKpisQ.isLoading}
          />
        </div>

        {/* ── Revenue chart + Activity feed ─────────────────────────── */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">

          {/* Revenue area chart */}
          <div className="lg:col-span-3 rounded-2xl border border-gray-800 bg-gray-900/80 p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-semibold text-gray-200">Revenus — 12 derniers mois</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Ce mois : <span className="text-emerald-400 font-medium">{fmt(fin?.month.income ?? 0)} XOF</span>
                  {' · '}
                  Année : <span className="text-blue-400 font-medium">{fmt(fin?.year.income ?? 0)} XOF</span>
                </p>
              </div>
              <Link to="/finances" className="text-xs text-gray-600 hover:text-indigo-400 transition-colors flex items-center gap-1">
                Finances <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData} margin={{ left: -10, right: 0, top: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false}
                    tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="income" stroke="#6366f1" strokeWidth={2} fill="url(#incomeGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  <Area type="monotone" dataKey="expense" stroke="#f43f5e" strokeWidth={1.5} fill="url(#expenseGrad)" dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[200px] items-center justify-center">
                <p className="text-sm text-gray-600">Aucune transaction enregistrée</p>
              </div>
            )}
          </div>

          {/* Activity feed — recent treated payments */}
          <div className="lg:col-span-2 rounded-2xl border border-gray-800 bg-gray-900/80 p-5">
            <SectionTitle href="/payments">Activité récente</SectionTitle>
            {recentPaymentsQ.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl bg-gray-800/40 p-3 animate-pulse">
                    <div className="h-8 w-8 rounded-full bg-gray-700 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-24 rounded bg-gray-700" />
                      <div className="h-2.5 w-16 rounded bg-gray-800" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recent.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <CheckCircle className="h-8 w-8 text-gray-700" />
                <p className="text-sm text-gray-600">Aucun paiement traité récemment</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recent.map((p) => (
                  <div
                    key={p._id}
                    className="flex items-center gap-3 rounded-xl bg-gray-800/30 px-3 py-2.5 hover:bg-gray-800/60 transition-colors"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                      <CreditCard className="h-3.5 w-3.5 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-200 truncate">{p.studentName}</p>
                      <p className="text-xs text-emerald-400 font-medium">
                        {fmt(p.amount)} {p.currency}
                        {p.product && <span className="ml-1.5 text-gray-600 font-normal">· {p.product}</span>}
                      </p>
                    </div>
                    <span className="text-xs text-gray-600 shrink-0 whitespace-nowrap">
                      {relativeTime(p.processedAt ?? p.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Pipeline + Forms ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

          {/* Lead pipeline funnel */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900/80 p-5">
            <SectionTitle href="/leads">Pipeline Leads</SectionTitle>
            <div className="mb-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-200">{fmt(kpis?.total ?? 0)}</span>
              <span className="text-xs text-gray-500">leads au total</span>
              <span className="ml-auto text-xs text-emerald-400 font-medium">
                {kpis?.won ?? 0} Won · {kpis?.conversion_rate ?? 0}%
              </span>
            </div>
            {funnelData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={funnelData} layout="vertical" margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} width={68} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 12, fontSize: 12 }}
                    formatter={(v) => [v, 'leads']}
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={16}>
                    {funnelData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="py-8 text-center text-sm text-gray-600">Aucun lead</p>
            )}
          </div>

          {/* Forms */}
          <div className="rounded-2xl border border-gray-800 bg-gray-900/80 p-5">
            <SectionTitle href="/forms">Formulaires</SectionTitle>
            {formsQ.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-1.5 animate-pulse">
                    <div className="h-3 w-32 rounded bg-gray-800" />
                    <div className="h-2 w-full rounded bg-gray-800/60" />
                  </div>
                ))}
              </div>
            ) : forms.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <FileText className="h-8 w-8 text-gray-700" />
                <p className="text-sm text-gray-600">Aucun formulaire créé</p>
                <Link to="/forms" className="text-xs text-indigo-400 hover:text-indigo-300">Créer un formulaire</Link>
              </div>
            ) : (
              <div className="space-y-3">
                {forms.slice(0, 6).map((form) => {
                  const pct = Math.round((form.responseCount / maxResponses) * 100)
                  return (
                    <div key={form._id}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={cn(
                            'h-1.5 w-1.5 rounded-full shrink-0',
                            form.isPublished ? 'bg-emerald-400' : 'bg-gray-600',
                          )} />
                          <span className="text-xs text-gray-300 truncate">{form.name}</span>
                        </div>
                        <span className="ml-2 text-xs font-medium text-gray-400 shrink-0">
                          {form.responseCount} rép.
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-800">
                        <div
                          className="h-1.5 rounded-full bg-indigo-500/60 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Automations ───────────────────────────────────────────── */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900/80 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <SectionTitle href="/automations">Automatisations</SectionTitle>
              <div className="flex items-center gap-1.5 -mt-4">
                <span className={cn(
                  'inline-flex h-5 items-center rounded-full px-2 text-xs font-medium',
                  activeAutos.length > 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gray-800 text-gray-500',
                )}>
                  {activeAutos.length} active{activeAutos.length !== 1 ? 's' : ''}
                </span>
                <span className="text-xs text-gray-600">{totalRuns} exécutions totales</span>
              </div>
            </div>
          </div>

          {automationsQ.isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-xl bg-gray-800/40 animate-pulse" />
              ))}
            </div>
          ) : autos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Zap className="h-8 w-8 text-gray-700" />
              <p className="text-sm text-gray-600">Aucune automatisation configurée</p>
              <Link to="/automations" className="text-xs text-indigo-400 hover:text-indigo-300">Créer une automatisation</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {autos.slice(0, 9).map((auto) => (
                <Link
                  key={auto._id}
                  to="/automations"
                  className="flex items-start gap-3 rounded-xl border border-gray-800 bg-gray-800/20 px-3 py-3 hover:border-gray-700 hover:bg-gray-800/40 transition-colors"
                >
                  <div className={cn(
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                    auto.isActive ? 'bg-indigo-500/15' : 'bg-gray-800',
                  )}>
                    <Zap className={cn('h-3.5 w-3.5', auto.isActive ? 'text-indigo-400' : 'text-gray-600')} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-200 truncate">{auto.name}</p>
                    <p className="mt-0.5 text-xs text-gray-600 truncate">
                      {TRIGGER_LABELS[auto.triggerType] ?? auto.triggerType}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      {auto.isActive ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-400">
                          <CheckCircle className="h-3 w-3" /> Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-gray-600">
                          <AlertTriangle className="h-3 w-3" /> Inactive
                        </span>
                      )}
                      <span className="text-gray-700">·</span>
                      <span className="text-xs text-gray-600">{auto.runCount ?? 0} runs</span>
                      {auto.lastRunAt && (
                        <>
                          <span className="text-gray-700">·</span>
                          <span className="text-xs text-gray-600">{relativeTime(auto.lastRunAt)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ── Bottom stats strip ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            {
              label: 'Paiements traités',
              value: fmt(pStats?.traite ?? 0),
              icon: CheckCircle,
              color: 'text-emerald-400',
              href: '/payments',
            },
            {
              label: 'Étudiants total',
              value: fmt(sStats?.total ?? 0),
              icon: Users,
              color: 'text-indigo-400',
              href: '/students',
            },
            {
              label: 'En retard de paiement',
              value: fmt(sStats?.withDebt ?? 0),
              icon: AlertTriangle,
              color: sStats?.withDebt ? 'text-rose-400' : 'text-gray-600',
              href: '/students',
            },
            {
              label: 'Leads ce mois',
              value: `+${kpis?.new_last_7d ?? 0}`,
              icon: TrendingUp,
              color: 'text-blue-400',
              href: '/leads',
            },
          ].map(({ label, value, icon: Icon, color, href }) => (
            <Link
              key={label}
              to={href}
              className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3 hover:border-gray-700 hover:bg-gray-900 transition-colors"
            >
              <Icon className={cn('h-4 w-4 shrink-0', color)} />
              <div className="min-w-0">
                <p className="text-xs text-gray-500 truncate">{label}</p>
                <p className={cn('text-sm font-bold', color)}>{value}</p>
              </div>
            </Link>
          ))}
        </div>

      </div>
    </div>
  )
}
