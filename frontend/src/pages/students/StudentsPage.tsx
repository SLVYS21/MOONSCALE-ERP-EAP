import { useState, useEffect, type ElementType } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { keepPreviousData } from '@tanstack/react-query'
import {
  Search, ChevronLeft, ChevronRight, AlertTriangle, Clock,
  GraduationCap, CheckCircle, XCircle, TrendingDown, Sparkles,
  CalendarDays,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatDate, formatAmount, getInitials } from '@/lib/utils'
import api from '@/services/api'
import type { Student, FormationDashboard, Payment, PaginatedResponse, CirclePaymentStatus, DebtStatus } from '@/types'

type StudentRow = Student & {
  formation?: FormationDashboard
  payments?: Payment[]
}

interface StudentStats {
  total: number
  enRegle: number
  enRetard: number
  withDebt: number
  newThisMonth: number
}

// ── Period ────────────────────────────────────────────────────────────────────

type Period = 'last7' | 'last30' | 'month' | 'all' | 'custom'

const PERIODS: { value: Period; label: string }[] = [
  { value: 'last7',  label: '7 derniers jours' },
  { value: 'last30', label: '30 derniers jours' },
  { value: 'month',  label: 'Ce mois' },
  { value: 'all',    label: 'Tout' },
  { value: 'custom', label: 'Personnalisé' },
]

function toISO(d: Date) { return d.toISOString().slice(0, 10) }

function periodToDates(period: Period, customFrom: string, customTo: string) {
  const now = new Date()
  if (period === 'last7') {
    const from = new Date(now); from.setDate(now.getDate() - 6)
    return { dateFrom: toISO(from), dateTo: toISO(now) }
  }
  if (period === 'last30') {
    const from = new Date(now); from.setDate(now.getDate() - 29)
    return { dateFrom: toISO(from), dateTo: toISO(now) }
  }
  if (period === 'month') {
    return { dateFrom: toISO(new Date(now.getFullYear(), now.getMonth(), 1)), dateTo: toISO(now) }
  }
  if (period === 'custom') {
    return { dateFrom: customFrom || undefined, dateTo: customTo || undefined }
  }
  return { dateFrom: undefined, dateTo: undefined }
}

// ── Filters ───────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: '', label: 'Tous les statuts' },
  { value: 'EN RÈGLE', label: 'EN RÈGLE' },
  { value: 'EN RETARD', label: 'EN RETARD' },
]

const DEBT_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: 'potential', label: 'Débiteurs potentiels' },
  { value: 'confirmed', label: 'Débiteurs confirmés' },
]

// ── Badges ────────────────────────────────────────────────────────────────────

const PLAN_PRIORITY = ['Elite', 'Premium', 'All-In-One', 'Standard', 'Produits Gagnants', 'Support Direct', 'Lives']
const PLAN_BADGE: Record<string, { variant: 'info' | 'warning' | 'success' | 'default'; label: string }> = {
  'Elite':            { variant: 'info',    label: 'Elite' },
  'Premium':          { variant: 'success', label: 'Premium' },
  'All-In-One':       { variant: 'warning', label: 'All-In-One' },
  'Standard':         { variant: 'default', label: 'Standard' },
  'Produits Gagnants':{ variant: 'default', label: 'Produits Gagnants' },
  'Support Direct':   { variant: 'default', label: 'Support Direct' },
  'Lives':            { variant: 'default', label: 'Lives' },
}

function planBadge(tags?: { id: number; name: string }[]) {
  if (!tags || tags.length === 0) return null
  for (const key of PLAN_PRIORITY) {
    const found = tags.find((t) => t.name.toLowerCase().includes(key.toLowerCase()))
    if (found) {
      const cfg = PLAN_BADGE[key] ?? { variant: 'default' as const, label: found.name }
      return <Badge variant={cfg.variant}>{cfg.label}</Badge>
    }
  }
  return <Badge variant="default">{tags[0].name}</Badge>
}

function statusBadge(status?: CirclePaymentStatus) {
  if (status === 'EN RÈGLE') return <Badge variant="success">EN RÈGLE</Badge>
  if (status === 'EN RETARD') return <Badge variant="danger">EN RETARD</Badge>
  return <Badge variant="default">Nouveau</Badge>
}

function debtBadge(debtStatus?: DebtStatus) {
  if (debtStatus === 'potential') return <Badge variant="warning"><AlertTriangle className="mr-1 h-3 w-3 inline" />Potentiel</Badge>
  if (debtStatus === 'confirmed') return <Badge variant="danger">Confirmé</Badge>
  return null
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function StudentAvatar({ name, circleProfile }: { name: string; circleProfile?: string }) {
  const [imgFailed, setImgFailed] = useState(false)
  const parts = name.trim().split(' ')
  const initials = getInitials(parts[0] ?? '', parts.slice(1).join(' '))

  if (circleProfile && !imgFailed) {
    return (
      <img
        src={circleProfile}
        alt={name}
        onError={() => setImgFailed(true)}
        className="h-8 w-8 shrink-0 rounded-full object-cover border border-gray-700"
      />
    )
  }
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 text-xs font-semibold text-indigo-400 border border-gray-700">
      {initials}
    </div>
  )
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color }: {
  icon: ElementType
  label: string
  value: number | string
  color: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3.5">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-lg font-semibold text-gray-100">{value}</p>
      </div>
    </div>
  )
}

// ── Period pill bar ───────────────────────────────────────────────────────────

function PeriodBar({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex gap-1 rounded-lg border border-gray-800 bg-gray-900 p-1">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            period === p.value
              ? 'bg-indigo-600 text-white'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function StudentsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState('')
  const [debtFilter, setDebtFilter] = useState('')
  const [period, setPeriod] = useState<Period>('last7')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [page, setPage] = useState(1)
  const limit = 25

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { setPage(1) }, [debouncedSearch, status, debtFilter, period, customFrom, customTo])

  const { dateFrom, dateTo } = periodToDates(period, customFrom, customTo)

  const { data: stats } = useQuery<StudentStats>({
    queryKey: ['students-stats'],
    queryFn: () => api.get<StudentStats>('/students/stats').then((r) => r.data),
    staleTime: 60_000,
  })

  const { data, isLoading } = useQuery<PaginatedResponse<StudentRow>>({
    queryKey: ['students', { search: debouncedSearch, status, debtFilter, page, dateFrom, dateTo }],
    queryFn: () =>
      api.get<PaginatedResponse<StudentRow>>('/students', {
        params: {
          search: debouncedSearch || undefined,
          status: status || undefined,
          debtStatus: debtFilter || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          page,
          limit,
        },
      }).then((r) => r.data),
    placeholderData: keepPreviousData,
  })

  const students = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = data ? (data.totalPages ?? Math.ceil(data.total / limit)) : 1

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-100">Étudiants</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {total} étudiant{total !== 1 ? 's' : ''} affichés
        </p>
      </div>

      {/* KPI cards — global totals */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard icon={GraduationCap} label="Total étudiants"    value={stats?.total        ?? '—'} color="bg-indigo-600/20 text-indigo-400" />
        <StatCard icon={CheckCircle}   label="EN RÈGLE"           value={stats?.enRegle      ?? '—'} color="bg-emerald-600/20 text-emerald-400" />
        <StatCard icon={XCircle}       label="EN RETARD"          value={stats?.enRetard     ?? '—'} color="bg-red-600/20 text-red-400" />
        <StatCard icon={TrendingDown}  label="Débiteurs"          value={stats?.withDebt     ?? '—'} color="bg-amber-600/20 text-amber-400" />
        <StatCard icon={Sparkles}      label="Nouveaux ce mois"   value={stats?.newThisMonth ?? '—'} color="bg-purple-600/20 text-purple-400" />
      </div>

      {/* Period + search + filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <CalendarDays className="h-3.5 w-3.5" />
          <span>Période</span>
        </div>
        <PeriodBar period={period} onChange={(p) => { setPeriod(p); setPage(1) }} />

        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => { setCustomFrom(e.target.value); setPage(1) }}
              className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-1.5 text-xs text-gray-100 focus:border-indigo-500 focus:outline-none"
            />
            <span className="text-xs text-gray-500">→</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => { setCustomTo(e.target.value); setPage(1) }}
              className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-1.5 text-xs text-gray-100 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Rechercher par nom ou email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-800/50 py-2 pl-9 pr-3 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={debtFilter}
          onChange={(e) => setDebtFilter(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          {DEBT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <Card>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-gray-500">Chargement…</div>
        ) : students.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">Aucun étudiant trouvé.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-xs text-gray-500">
                  <th className="pb-3 font-medium">Nom</th>
                  <th className="pb-3 font-medium">Plan</th>
                  <th className="pb-3 font-medium">Paiements</th>
                  <th className="pb-3 font-medium">Statut</th>
                  <th className="pb-3 font-medium">Dette</th>
                  <th className="pb-3 font-medium">WhatsApp</th>
                  <th className="pb-3 font-medium">Inscrit le</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {students.map((s) => {
                  const pending = s.payments?.filter((p) => p.status === 'NON TRAITÉ').length ?? 0
                  const treated = s.payments?.filter((p) => p.status === 'TRAITÉ') ?? []
                  const totalPaid = treated.reduce((acc, p) => acc + (p.amount ?? 0), 0)
                  const mainCurrency = treated[0]?.currency ?? 'F CFA'

                  return (
                    <tr
                      key={s._id}
                      onClick={() => navigate(`/students/${s._id}`)}
                      className="cursor-pointer transition-colors hover:bg-gray-800/40"
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2.5">
                          <StudentAvatar name={s.name} circleProfile={s.circleProfile} />
                          <div className="min-w-0">
                            <p className="font-medium text-gray-100 truncate">{s.name}</p>
                            <p className="text-xs text-gray-500 truncate">{s.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        {planBadge(s.circleTags) ?? <span className="text-gray-600">—</span>}
                      </td>
                      <td className="py-3 pr-4">
                        {(s.payments?.length ?? 0) === 0 ? (
                          <span className="text-gray-600">—</span>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium text-gray-200">
                              {formatAmount(totalPaid, mainCurrency)}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-500">{s.payments?.length} pmt</span>
                              {pending > 0 && (
                                <span className="flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-400">
                                  <Clock className="h-2.5 w-2.5" />
                                  {pending}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-4">{statusBadge(s.formation?.paymentStatus)}</td>
                      <td className="py-3 pr-4">{debtBadge(s.debtStatus) ?? <span className="text-gray-600">—</span>}</td>
                      <td className="py-3 pr-4 text-gray-400 text-xs">{s.whatsapp ?? '—'}</td>
                      <td className="py-3 text-xs text-gray-400">{formatDate(s.createdAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-gray-800 pt-4">
            <p className="text-xs text-gray-500">
              Page {page} / {totalPages} — {total} étudiant{total > 1 ? 's' : ''}
            </p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-gray-700 p-1.5 text-gray-400 disabled:opacity-40 hover:bg-gray-800 hover:text-gray-100 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-gray-700 p-1.5 text-gray-400 disabled:opacity-40 hover:bg-gray-800 hover:text-gray-100 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
