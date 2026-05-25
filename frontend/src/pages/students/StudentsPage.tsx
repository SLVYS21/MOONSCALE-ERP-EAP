import { useState, useEffect, type ElementType } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { keepPreviousData } from '@tanstack/react-query'
import {
  Search, ChevronLeft, ChevronRight, AlertTriangle, Clock,
  GraduationCap, CheckCircle, XCircle, TrendingDown, Sparkles,
  CalendarDays, Users, ShieldCheck,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { formatDate, formatAmount, getInitials } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
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
  { value: 'last7',  label: '7 jours' },
  { value: 'last30', label: '30 jours' },
  { value: 'month',  label: 'Ce mois' },
  { value: 'all',    label: 'Tout' },
  { value: 'custom', label: 'Dates…' },
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
  { value: '', label: 'Toutes dettes' },
  { value: 'potential', label: 'Débiteurs potentiels' },
  { value: 'confirmed', label: 'Débiteurs confirmés' },
]

// ── Badges ────────────────────────────────────────────────────────────────────

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

function StudentAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const [imgFailed, setImgFailed] = useState(false)
  const parts = name.trim().split(' ')
  const initials = getInitials(parts[0] ?? '', parts.slice(1).join(' '))

  if (avatarUrl && !imgFailed) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setImgFailed(true)}
        className="h-8 w-8 shrink-0 rounded-full object-cover border border-gray-800 shadow-sm"
      />
    )
  }
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-600/20 text-xs font-semibold text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-gray-700">
      {initials}
    </div>
  )
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, iconBgCls, iconCls }: {
  icon: ElementType
  label: string
  value: number | string
  iconBgCls: string
  iconCls: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-800 bg-white dark:bg-gray-900/60 shadow-sm px-4 py-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBgCls}`}>
        <Icon className={`h-5 w-5 ${iconCls}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="mt-0.5 text-xl font-bold text-gray-100 tabular-nums">{value}</p>
      </div>
    </div>
  )
}

// ── Input class ───────────────────────────────────────────────────────────────

const inputCls = 'rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'

// ── Page ──────────────────────────────────────────────────────────────────────

export function StudentsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const authUser = useAuthStore((s) => s.user)
  const isAdmin = authUser?.role === 'superadmin' || authUser?.role === 'admin'

  const toggleAdminMutation = useMutation({
    mutationFn: (studentId: string) => api.patch(`/students/${studentId}/admin`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['students'] }),
  })

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState('')
  const [debtFilter, setDebtFilter] = useState('')
  const [period, setPeriod] = useState<Period>('all')
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
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Étudiants</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {total} étudiant{total !== 1 ? 's' : ''} au total
          </p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          icon={GraduationCap}
          label="Total"
          value={stats?.total ?? '—'}
          iconBgCls="bg-indigo-50 dark:bg-indigo-600/20"
          iconCls="text-indigo-600 dark:text-indigo-400"
        />
        <StatCard
          icon={CheckCircle}
          label="EN RÈGLE"
          value={stats?.enRegle ?? '—'}
          iconBgCls="bg-emerald-50 dark:bg-emerald-600/20"
          iconCls="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          icon={XCircle}
          label="EN RETARD"
          value={stats?.enRetard ?? '—'}
          iconBgCls="bg-red-50 dark:bg-red-600/20"
          iconCls="text-red-600 dark:text-red-400"
        />
        <StatCard
          icon={TrendingDown}
          label="Débiteurs"
          value={stats?.withDebt ?? '—'}
          iconBgCls="bg-amber-50 dark:bg-amber-600/20"
          iconCls="text-amber-600 dark:text-amber-400"
        />
        <StatCard
          icon={Sparkles}
          label="Nouveaux ce mois"
          value={stats?.newThisMonth ?? '—'}
          iconBgCls="bg-purple-50 dark:bg-purple-600/20"
          iconCls="text-purple-600 dark:text-purple-400"
        />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Period selector */}
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <CalendarDays className="h-3.5 w-3.5" />
        </div>
        <div className="flex gap-1 rounded-xl border border-gray-800 bg-gray-900/30 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => { setPeriod(p.value); setPage(1) }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                period === p.value
                  ? 'bg-white dark:bg-indigo-600 shadow-sm text-gray-100 dark:text-white'
                  : 'text-gray-500 hover:text-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => { setCustomFrom(e.target.value); setPage(1) }}
              className={inputCls}
            />
            <span className="text-xs text-gray-500">→</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => { setCustomTo(e.target.value); setPage(1) }}
              className={inputCls}
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
            className={`w-full pl-9 ${inputCls}`}
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={inputCls}
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={debtFilter}
          onChange={(e) => setDebtFilter(e.target.value)}
          className={inputCls}
        >
          {DEBT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <Card className="p-0">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">Chargement…</div>
        ) : students.length === 0 ? (
          <div className="py-12 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-gray-600" />
            <p className="text-sm font-medium text-gray-400">Aucun étudiant trouvé</p>
            <p className="mt-0.5 text-xs text-gray-500">Essayez d'élargir vos filtres</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/20">
                  <th className="py-3 pl-5 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Étudiant</th>
                  <th className="py-3 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Plan</th>
                  <th className="py-3 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Paiements</th>
                  <th className="py-3 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Statut</th>
                  <th className="py-3 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Dette</th>
                  <th className="py-3 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">WhatsApp</th>
                  <th className="py-3 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Inscrit le</th>
                  {isAdmin && <th className="py-3 pr-5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Admin</th>}
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const pending = s.payments?.filter((p) => p.status === 'NON TRAITÉ').length ?? 0
                  const treated = s.payments?.filter((p) => p.status === 'TRAITÉ') ?? []
                  const totalPaid = treated.reduce((acc, p) => acc + (p.amount ?? 0), 0)
                  const mainCurrency = treated[0]?.currency ?? 'F CFA'

                  return (
                    <tr
                      key={s._id}
                      onClick={() => navigate(`/students/${s._id}`)}
                      className="cursor-pointer border-b border-gray-800/50 transition-colors hover:bg-indigo-50/40 dark:hover:bg-gray-800/30 last:border-0"
                    >
                      <td className="py-3 pl-5 pr-4">
                        <div className="flex items-center gap-2.5">
                          <StudentAvatar name={s.name} avatarUrl={s.circleAvatarUrl} />
                          <div className="min-w-0">
                            <p className="font-medium text-gray-100 truncate">{s.name}</p>
                            <p className="text-xs text-gray-500 truncate">{s.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        {s.plan ? <Badge variant="default">{s.plan}</Badge> : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="py-3 pr-4">
                        {(s.payments?.length ?? 0) === 0 ? (
                          <span className="text-gray-600">—</span>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-semibold tabular-nums text-gray-200">
                              {formatAmount(totalPaid, mainCurrency)}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-gray-500">{s.payments?.length} pmt</span>
                              {pending > 0 && (
                                <span className="flex items-center gap-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400">
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
                      <td className="py-3 pr-4 text-xs text-gray-400">{s.whatsapp ?? '—'}</td>
                      <td className="py-3 pr-4 text-xs text-gray-400">{formatDate(s.createdAt)}</td>
                      {isAdmin && (
                        <td className="py-3 pr-5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => toggleAdminMutation.mutate(s._id)}
                            disabled={toggleAdminMutation.isPending}
                            title={s.isAdmin ? 'Retirer le statut admin' : 'Marquer comme admin'}
                            className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
                              s.isAdmin
                                ? 'border-indigo-200 bg-indigo-50 dark:border-indigo-500/30 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20'
                                : 'border-gray-700 bg-transparent text-gray-500 hover:border-indigo-400 hover:text-indigo-500'
                            }`}
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            {s.isAdmin ? 'Admin' : 'Non'}
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-800 px-5 py-3">
            <p className="text-xs text-gray-500">
              Page {page} / {totalPages} — {total} étudiant{total > 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                aria-label="Page précédente"
                className="rounded-lg border border-gray-800 p-1.5 text-gray-400 disabled:opacity-40 hover:bg-gray-900/30 hover:text-gray-100 transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Page suivante"
                className="rounded-lg border border-gray-800 p-1.5 text-gray-400 disabled:opacity-40 hover:bg-gray-900/30 hover:text-gray-100 transition-colors cursor-pointer"
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
