import { useState, type ElementType } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { keepPreviousData } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, ExternalLink, CalendarDays,
  Clock, CheckCircle2, XCircle, Banknote,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatDate, formatAmount } from '@/lib/utils'
import { CIRCLE_PLAN_LABELS } from '@/lib/constants'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'
import type { Payment, PaymentStatus, PaginatedResponse } from '@/types'

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
  tally: 'Tally',
  chariow: 'Chariow',
  manual: 'Manuel',
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: ElementType
  label: string
  value: number | string
  sub?: string
  color: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3.5">
      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="truncate text-lg font-semibold text-gray-100">{value}</p>
        {sub && <p className="text-xs text-gray-500">{sub}</p>}
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
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        <img
          src={images[idx]}
          alt={`Preuve ${idx + 1}`}
          className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain shadow-2xl"
        />
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
          onClick={onClose}
          className="absolute -top-3 -right-3 flex h-7 w-7 items-center justify-center rounded-full bg-gray-800 text-gray-300 hover:bg-gray-700"
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
  const [currency, setCurrency] = useState(payment.currency ?? 'F CFA')
  const [product, setProduct] = useState(payment.product ?? 'ECOM AFRICA PRO')
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

  const selectCls =
    'w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-xl">
        <h2 className="mb-1 text-base font-semibold text-gray-100">Traiter le paiement</h2>
        <p className="mb-4 text-sm text-gray-500">{payment.studentName} — {payment.studentEmail}</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Modalité</label>
            <select value={modality} onChange={(e) => setModality(e.target.value as 'Complet' | 'Partiel')} className={selectCls}>
              <option value="Complet">Complet (soldé)</option>
              <option value="Partiel">Partiel (acompte)</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Produit</label>
            <select value={product} onChange={(e) => setProduct(e.target.value as import('@/types').PaymentProduct)} className={selectCls}>
              <option value="ECOM AFRICA PRO">ECOM AFRICA PRO</option>
              <option value="ECOM REVOLUTION">ECOM REVOLUTION</option>
              <option value="COACHING">COACHING</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Montant</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={selectCls}
              placeholder="0"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Devise</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value as import('@/types').PaymentCurrency)} className={selectCls}>
              {['F CFA', 'USD', 'EURO'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Gateway</label>
            <input
              value={gateway}
              onChange={(e) => setGateway(e.target.value)}
              className={selectCls}
              placeholder="FedaPay, Wave, Carte Bancaire…"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Plan Circle</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value)} className={selectCls}>
              {Object.entries(CIRCLE_PLAN_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-gray-400">Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full resize-none rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button
            loading={isPending}
            onClick={() => mutate({ modality, amount: Number(amount), currency, product, gateway, plan, notes })}
          >
            Traiter
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
  const [period, setPeriod] = useState<Period>('last7')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [page, setPage] = useState(1)
  const limit = 25
  const [treatPayment, setTreatPayment] = useState<Payment | null>(null)
  const [lightbox, setLightbox] = useState<{ images: string[]; idx: number } | null>(null)

  const { dateFrom, dateTo } = periodToDates(period, customFrom, customTo)

  const { data: stats } = useQuery<PaymentStats>({
    queryKey: ['payments-stats'],
    queryFn: () => api.get<PaymentStats>('/payments/stats').then((r) => r.data),
    staleTime: 60_000,
  })

  const { data, isLoading } = useQuery<PaginatedResponse<Payment>>({
    queryKey: ['payments', { status: activeStatus, page, dateFrom, dateTo }],
    queryFn: () =>
      api.get<PaginatedResponse<Payment>>('/payments', {
        params: {
          status: activeStatus,
          page,
          limit,
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

      {/* KPI cards — global totals */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          icon={Clock}
          label="En attente"
          value={stats?.nonTraite ?? '—'}
          color="bg-amber-600/20 text-amber-400"
        />
        <StatCard
          icon={CheckCircle2}
          label="Traités (total)"
          value={stats?.traite ?? '—'}
          color="bg-emerald-600/20 text-emerald-400"
        />
        <StatCard
          icon={XCircle}
          label="Rejetés"
          value={stats?.rejete ?? '—'}
          color="bg-red-600/20 text-red-400"
        />
        <StatCard
          icon={CalendarDays}
          label="Reçus aujourd'hui"
          value={formatAmountList(stats?.todayByAmount ?? [])}
          color="bg-blue-600/20 text-blue-400"
        />
        <StatCard
          icon={Banknote}
          label="Reçus ce mois"
          value={formatAmountList(stats?.monthByAmount ?? [])}
          color="bg-purple-600/20 text-purple-400"
        />
      </div>

      {/* Period filter */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <CalendarDays className="h-3.5 w-3.5" />
          <span>Période</span>
        </div>
        <div className="flex gap-1 rounded-lg border border-gray-800 bg-gray-900 p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => { setPeriod(p.value); setPage(1) }}
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

      {/* Status tabs */}
      <div className="mb-4 flex gap-1 border-b border-gray-800">
        {STATUS_TABS.map((t) => (
          <button
            key={t.status}
            onClick={() => { setActiveStatus(t.status); setPage(1) }}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeStatus === t.status
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
            {t.status === 'NON TRAITÉ' && stats && stats.nonTraite > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-400">
                {stats.nonTraite}
              </span>
            )}
          </button>
        ))}
      </div>

      <Card>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-gray-500">Chargement…</div>
        ) : payments.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">Aucun paiement dans cette catégorie.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-xs text-gray-500">
                  <th className="pb-3 font-medium">Étudiant</th>
                  <th className="pb-3 font-medium">Montant</th>
                  <th className="pb-3 font-medium">Modalité</th>
                  <th className="pb-3 font-medium">Produit</th>
                  <th className="pb-3 font-medium">Source</th>
                  <th className="pb-3 font-medium">Plan</th>
                  <th className="pb-3 font-medium">Preuves</th>
                  <th className="pb-3 font-medium">Date</th>
                  {isAdmin && activeStatus === 'NON TRAITÉ' && (
                    <th className="pb-3 font-medium">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {payments.map((p) => {
                  const b = STATUS_BADGE[p.status]
                  return (
                    <tr key={p._id} className="transition-colors hover:bg-gray-800/20">
                      <td className="py-3 pr-4">
                        <button
                          onClick={() => p.studentId && navigate(`/students/${p.studentId}`)}
                          className={`text-left ${p.studentId ? 'hover:underline' : 'cursor-default'}`}
                        >
                          <p className="font-medium text-gray-100">{p.studentName}</p>
                          <p className="text-xs text-gray-500">{p.studentEmail}</p>
                        </button>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-gray-200">{formatAmount(p.amount, p.currency)}</p>
                      </td>
                      <td className="py-3 pr-4">
                        {p.modality === 'Complet' && <Badge variant="success">Complet</Badge>}
                        {p.modality === 'Partiel' && <Badge variant="warning">Partiel</Badge>}
                        {!p.modality && <span className="text-gray-600">—</span>}
                      </td>
                      <td className="py-3 pr-4 text-gray-400">{p.product ?? '—'}</td>
                      <td className="py-3 pr-4">
                        <Badge variant="default">{SOURCE_LABELS[p.source] ?? p.source}</Badge>
                      </td>
                      <td className="py-3 pr-4 text-xs text-gray-400">
                        {p.plan ? (CIRCLE_PLAN_LABELS[p.plan.toLowerCase()] ?? p.plan) : '—'}
                      </td>
                      <td className="py-3 pr-4">
                        {p.proofImages.length > 0 ? (
                          <div className="flex gap-1">
                            {p.proofImages.map((url, i) => (
                              <button
                                key={i}
                                onClick={() => setLightbox({ images: p.proofImages, idx: i })}
                                className="group relative h-10 w-10 overflow-hidden rounded border border-gray-700"
                              >
                                <img src={url} alt="" className="h-full w-full object-cover" />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
                                  <ExternalLink className="h-3 w-3 text-white opacity-0 group-hover:opacity-100" />
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-xs text-gray-400">
                        {formatDate(p.createdAt)}
                        {p.status !== 'NON TRAITÉ' && (
                          <Badge variant={b.variant} className="mt-1 block w-fit">{b.label}</Badge>
                        )}
                      </td>
                      {isAdmin && activeStatus === 'NON TRAITÉ' && (
                        <td className="py-3">
                          <div className="flex gap-2">
                            <Button onClick={() => setTreatPayment(p)}>Traiter</Button>
                            <Button
                              variant="danger"
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
          <div className="mt-4 flex items-center justify-between border-t border-gray-800 pt-4">
            <p className="text-xs text-gray-500">Page {page} / {totalPages} — {total} paiement{total > 1 ? 's' : ''}</p>
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
