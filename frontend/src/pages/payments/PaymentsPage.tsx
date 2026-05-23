import { useState, useEffect, type ElementType } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { keepPreviousData } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, ExternalLink, CalendarDays,
  Clock, CheckCircle2, XCircle, Banknote, CreditCard, Search,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatDate, formatAmount } from '@/lib/utils'
import { CIRCLE_PLAN_LABELS } from '@/lib/constants'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'
import type { Payment, PaymentStatus, PaymentProduct, PaymentCurrency, PaginatedResponse } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PaymentStats {
  total: number
  nonTraite: number
  traite: number
  rejete: number
  todayByAmount: { currency: string; total: number }[]
  monthByAmount: { currency: string; total: number }[]
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAmountList(list: { currency: string; total: number }[]) {
  if (!list || list.length === 0) return '—'
  return list.map((a) => formatAmount(a.total, a.currency)).join(' · ')
}

const STATUS_TABS: { status: PaymentStatus; label: string }[] = [
  { status: 'NON TRAITÉ', label: 'Non traités' },
  { status: 'TRAITÉ',     label: 'Traités' },
  { status: 'REJETÉ',     label: 'Rejetés' },
]

const STATUS_BADGE: Record<PaymentStatus, { variant: 'warning' | 'success' | 'danger'; label: string }> = {
  'NON TRAITÉ': { variant: 'warning', label: 'NON TRAITÉ' },
  'TRAITÉ':     { variant: 'success', label: 'TRAITÉ' },
  'REJETÉ':     { variant: 'danger',  label: 'REJETÉ' },
}

const SOURCE_LABELS: Record<string, string> = {
  tally:   'Tally',
  chariow: 'Chariow',
  manual:  'Manuel',
}

// ── Input class ───────────────────────────────────────────────────────────────

const inputCls = 'w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'

// ── KPI card ──────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, iconBgCls, iconCls }: {
  icon: ElementType
  label: string
  value: number | string
  sub?: string
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
        <p className="mt-0.5 text-xl font-bold text-gray-100 tabular-nums truncate">{value}</p>
        {sub && <p className="mt-0.5 text-[11px] text-gray-500">{sub}</p>}
      </div>
    </div>
  )
}

// ── Image lightbox ─────────────────────────────────────────────────────────────

function ImageLightbox({ images, initialIndex = 0, onClose }: {
  images: string[]
  initialIndex?: number
  onClose: () => void
}) {
  const [idx, setIdx] = useState(initialIndex)
  const isPdf = (url: string) => url.toLowerCase().includes('.pdf') || !url.match(/\.(jpe?g|png|gif|webp)(\?|$)/i)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        {isPdf(images[idx]) ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-gray-200 bg-white p-8 shadow-2xl">
            <p className="text-sm font-medium text-gray-600">Fichier PDF</p>
            <a
              href={images[idx]}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Ouvrir dans un nouvel onglet
            </a>
          </div>
        ) : (
          <img
            src={images[idx]}
            alt={`Preuve ${idx + 1}`}
            className="max-h-[85vh] max-w-[85vw] rounded-xl object-contain shadow-2xl"
          />
        )}
        {images.length > 1 && (
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className={`h-2 w-2 rounded-full transition-colors ${i === idx ? 'bg-white' : 'bg-white/40'}`}
              />
            ))}
          </div>
        )}
        <button
          aria-label="Fermer"
          onClick={onClose}
          className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md text-gray-500 hover:text-gray-900 transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// ── Treat modal ───────────────────────────────────────────────────────────────

function TreatModal({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const qc = useQueryClient()
  const [modality, setModality] = useState<'Complet' | 'Partiel'>(payment.modality ?? 'Complet')
  const [amount, setAmount] = useState(String(payment.amount ?? ''))
  const [currency, setCurrency] = useState<PaymentCurrency>(payment.currency ?? 'F CFA')
  const [product, setProduct] = useState<PaymentProduct>(payment.product ?? 'ECOM AFRICA PRO')
  const [gateway, setGateway] = useState(payment.gateway ?? '')
  const [plan, setPlan] = useState<string>(payment.plan ?? 'standard')
  const [notes, setNotes] = useState(payment.notes ?? '')
  const [error, setError] = useState('')

  const { mutate, isPending } = useMutation({
    mutationFn: (body: object) => api.post(`/payments/${payment._id}/treat`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] })
      qc.invalidateQueries({ queryKey: ['payments-stats'] })
      onClose()
    },
    onError: () => setError('Erreur lors du traitement du paiement.'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-xl">
        <h2 className="mb-0.5 text-base font-semibold text-gray-100">Traiter le paiement</h2>
        <p className="mb-5 text-sm text-gray-500">{payment.studentName} — {payment.studentEmail}</p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Modalité</label>
            <select value={modality} onChange={(e) => setModality(e.target.value as 'Complet' | 'Partiel')} className={inputCls}>
              <option value="Complet">Complet (soldé)</option>
              <option value="Partiel">Partiel (acompte)</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Produit</label>
            <select value={product} onChange={(e) => setProduct(e.target.value as PaymentProduct)} className={inputCls}>
              <option value="ECOM AFRICA PRO">ECOM AFRICA PRO</option>
              <option value="ECOM REVOLUTION">ECOM REVOLUTION</option>
              <option value="COACHING">COACHING</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Montant</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} placeholder="0" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Devise</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value as PaymentCurrency)} className={inputCls}>
              {['F CFA', 'USD', 'EURO'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Gateway</label>
            <input value={gateway} onChange={(e) => setGateway(e.target.value)} className={inputCls} placeholder="FedaPay, Wave…" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Plan Circle</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value)} className={inputCls}>
              {Object.entries(CIRCLE_PLAN_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-gray-400">Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {error && (
          <p className="mt-2 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button
            loading={isPending}
            onClick={() => mutate({ modality, amount: Number(amount), currency, product, gateway, plan, notes })}
          >
            Traiter le paiement
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Payments page ─────────────────────────────────────────────────────────────

export function PaymentsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin'

  const [activeStatus, setActiveStatus] = useState<PaymentStatus>('NON TRAITÉ')
  const [period, setPeriod] = useState<Period>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const limit = 25
  const [treatPayment, setTreatPayment] = useState<Payment | null>(null)
  const [lightbox, setLightbox] = useState<{ images: string[]; idx: number } | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { setPage(1) }, [debouncedSearch, activeStatus, period, customFrom, customTo])

  const { dateFrom, dateTo } = periodToDates(period, customFrom, customTo)

  const { data: stats } = useQuery<PaymentStats>({
    queryKey: ['payments-stats'],
    queryFn: () => api.get<PaymentStats>('/payments/stats').then((r) => r.data),
    staleTime: 60_000,
  })

  const { data, isLoading } = useQuery<PaginatedResponse<Payment>>({
    queryKey: ['payments', { status: activeStatus, page, dateFrom, dateTo, search: debouncedSearch }],
    queryFn: () =>
      api.get<PaginatedResponse<Payment>>('/payments', {
        params: {
          status: activeStatus,
          page,
          limit,
          search: debouncedSearch || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        },
      }).then((r) => r.data),
    placeholderData: keepPreviousData,
  })

  const rejectMutation = useMutation({
    mutationFn: (paymentId: string) => api.post(`/payments/${paymentId}/reject`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] })
      qc.invalidateQueries({ queryKey: ['payments-stats'] })
    },
  })

  const payments = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = data ? (data.totalPages ?? Math.ceil(data.total / limit)) : 1

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-100">Paiements</h1>
        <p className="mt-0.5 text-sm text-gray-500">{total} paiement{total !== 1 ? 's' : ''} affichés</p>
      </div>

      {/* KPI cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          icon={Clock}
          label="En attente"
          value={stats?.nonTraite ?? '—'}
          iconBgCls="bg-amber-50 dark:bg-amber-600/20"
          iconCls="text-amber-600 dark:text-amber-400"
        />
        <StatCard
          icon={CheckCircle2}
          label="Traités (total)"
          value={stats?.traite ?? '—'}
          iconBgCls="bg-emerald-50 dark:bg-emerald-600/20"
          iconCls="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          icon={XCircle}
          label="Rejetés"
          value={stats?.rejete ?? '—'}
          iconBgCls="bg-red-50 dark:bg-red-600/20"
          iconCls="text-red-600 dark:text-red-400"
        />
        <StatCard
          icon={CalendarDays}
          label="Reçus aujourd'hui"
          value={formatAmountList(stats?.todayByAmount ?? [])}
          iconBgCls="bg-blue-50 dark:bg-blue-600/20"
          iconCls="text-blue-600 dark:text-blue-400"
        />
        <StatCard
          icon={Banknote}
          label="Reçus ce mois"
          value={formatAmountList(stats?.monthByAmount ?? [])}
          iconBgCls="bg-purple-50 dark:bg-purple-600/20"
          iconCls="text-purple-600 dark:text-purple-400"
        />
      </div>

      {/* Period filter */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <CalendarDays className="h-3.5 w-3.5" />
          <span>Période</span>
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

      {/* Search bar */}
      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Rechercher par nom ou email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-800/50 pl-9 pr-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Status tabs */}
      <div className="mb-4 flex gap-1 border-b border-gray-800">
        {STATUS_TABS.map((t) => (
          <button
            key={t.status}
            onClick={() => { setActiveStatus(t.status); setPage(1) }}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeStatus === t.status
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-200'
            }`}
          >
            {t.label}
            {t.status === 'NON TRAITÉ' && stats && stats.nonTraite > 0 && (
              <span className="rounded-full bg-amber-100 dark:bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400 font-semibold tabular-nums">
                {stats.nonTraite}
              </span>
            )}
          </button>
        ))}
      </div>

      <Card className="p-0">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-gray-500">Chargement…</div>
        ) : payments.length === 0 ? (
          <div className="py-12 text-center">
            <CreditCard className="mx-auto mb-3 h-8 w-8 text-gray-600" />
            <p className="text-sm font-medium text-gray-400">Aucun paiement dans cette catégorie</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/20">
                  <th className="py-3 pl-5 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Étudiant</th>
                  <th className="py-3 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Montant</th>
                  <th className="py-3 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Modalité</th>
                  <th className="py-3 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Produit</th>
                  <th className="py-3 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Source</th>
                  <th className="py-3 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Preuves</th>
                  <th className="py-3 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Date</th>
                  {isAdmin && activeStatus === 'NON TRAITÉ' && (
                    <th className="py-3 pr-5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const b = STATUS_BADGE[p.status]
                  return (
                    <tr key={p._id} className="border-b border-gray-800/50 transition-colors hover:bg-indigo-50/40 dark:hover:bg-gray-800/30 last:border-0">
                      <td className="py-3 pl-5 pr-4">
                        <button
                          onClick={() => p.studentId && navigate(`/students/${p.studentId}`)}
                          className={`text-left ${p.studentId ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
                        >
                          <p className="font-medium text-gray-100">{p.studentName}</p>
                          <p className="text-xs text-gray-500">{p.studentEmail}</p>
                        </button>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-semibold tabular-nums text-gray-100">{formatAmount(p.amount, p.currency)}</p>
                      </td>
                      <td className="py-3 pr-4">
                        {p.modality === 'Complet' && <Badge variant="success">Complet</Badge>}
                        {p.modality === 'Partiel' && <Badge variant="warning">Partiel</Badge>}
                        {!p.modality && <span className="text-gray-600">—</span>}
                      </td>
                      <td className="py-3 pr-4 text-xs text-gray-400">{p.product ?? '—'}</td>
                      <td className="py-3 pr-4">
                        <Badge variant="default">{SOURCE_LABELS[p.source] ?? p.source}</Badge>
                      </td>
                      <td className="py-3 pr-4">
                        {p.proofImages.length > 0 ? (
                          <div className="flex gap-1">
                            {p.proofImages.slice(0, 3).map((url, i) => (
                              <button
                                key={i}
                                onClick={() => setLightbox({ images: p.proofImages, idx: i })}
                                className="group relative h-10 w-10 overflow-hidden rounded-lg border border-gray-800 shadow-sm cursor-pointer"
                                aria-label={`Voir preuve ${i + 1}`}
                              >
                                <img src={url} alt="" className="h-full w-full object-cover" />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
                                  <ExternalLink className="h-3 w-3 text-white opacity-0 group-hover:opacity-100" />
                                </div>
                              </button>
                            ))}
                            {p.proofImages.length > 3 && (
                              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-800 bg-gray-900/30 text-xs text-gray-500">
                                +{p.proofImages.length - 3}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <p className="text-xs text-gray-400 tabular-nums">{formatDate(p.paidAt ?? p.createdAt)}</p>
                        {p.status !== 'NON TRAITÉ' && (
                          <Badge variant={b.variant} className="mt-1">{b.label}</Badge>
                        )}
                      </td>
                      {isAdmin && activeStatus === 'NON TRAITÉ' && (
                        <td className="py-3 pr-5">
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => setTreatPayment(p)}>Traiter</Button>
                            <Button
                              variant="danger"
                              size="sm"
                              loading={rejectMutation.isPending}
                              onClick={() => rejectMutation.mutate(p._id)}
                            >
                              Rejeter
                            </Button>
                          </div>
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
              Page {page} / {totalPages} — {total} paiement{total > 1 ? 's' : ''}
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

      {treatPayment && (
        <TreatModal payment={treatPayment} onClose={() => setTreatPayment(null)} />
      )}
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.idx}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}
