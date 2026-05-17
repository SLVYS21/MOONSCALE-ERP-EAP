import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { keepPreviousData } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatDate, formatAmount } from '@/lib/utils'
import { CIRCLE_PLAN_LABELS } from '@/lib/constants'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'
import type { Payment, PaymentStatus, PaginatedResponse } from '@/types'

// ── Image lightbox ────────────────────────────────────────────────────────────

function ImageLightbox({
  images,
  initialIndex = 0,
  onClose,
}: {
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
  const [gateway, setGateway] = useState(payment.gateway ?? 'VIREMENT')
  const [plan, setPlan] = useState<string>(payment.plan ?? 'standard')
  const [notes, setNotes] = useState(payment.notes ?? '')
  const [error, setError] = useState('')

  const { mutate, isPending } = useMutation({
    mutationFn: (body: object) => api.post(`/payments/${payment._id}/treat`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] })
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
            <select value={gateway} onChange={(e) => setGateway(e.target.value as import('@/types').PaymentGateway)} className={selectCls}>
              {['STRIPE', 'PAYPAL', 'WAVE', 'ORANGE_MONEY', 'VIREMENT', 'AUTRE'].map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
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
            onClick={() =>
              mutate({ modality, amount: Number(amount), currency, product, gateway, plan, notes })
            }
          >
            Traiter
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Payments page ─────────────────────────────────────────────────────────────

const STATUS_TABS: { status: PaymentStatus; label: string }[] = [
  { status: 'NON TRAITÉ', label: 'Non traités' },
  { status: 'TRAITÉ', label: 'Traités' },
  { status: 'REJETÉ', label: 'Rejetés' },
]

const STATUS_BADGE: Record<PaymentStatus, { variant: 'warning' | 'success' | 'danger'; label: string }> = {
  'NON TRAITÉ': { variant: 'warning', label: 'NON TRAITÉ' },
  'TRAITÉ': { variant: 'success', label: 'TRAITÉ' },
  'REJETÉ': { variant: 'danger', label: 'REJETÉ' },
}

const SOURCE_LABELS: Record<string, string> = {
  tally: 'Tally',
  chariow: 'Chariow',
  manual: 'Manuel',
}

export function PaymentsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin'

  const [activeStatus, setActiveStatus] = useState<PaymentStatus>('NON TRAITÉ')
  const [page, setPage] = useState(1)
  const limit = 25
  const [treatPayment, setTreatPayment] = useState<Payment | null>(null)
  const [lightbox, setLightbox] = useState<{ images: string[]; idx: number } | null>(null)

  const { data, isLoading } = useQuery<PaginatedResponse<Payment>>({
    queryKey: ['payments', { status: activeStatus, page }],
    queryFn: () =>
      api.get<PaginatedResponse<Payment>>('/payments', {
        params: { status: activeStatus, page, limit },
      }).then((r) => r.data),
    placeholderData: keepPreviousData,
  })

  const rejectMutation = useMutation({
    mutationFn: (paymentId: string) => api.post(`/payments/${paymentId}/reject`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payments'] }),
  })

  const payments = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = data ? (data.totalPages ?? Math.ceil(data.total / limit)) : 1

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Paiements</h1>
          <p className="mt-0.5 text-sm text-gray-500">{total} paiement{total !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Tabs */}
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
                          onClick={() => navigate(`/students/${p.studentId}`)}
                          className="text-left hover:underline"
                        >
                          <p className="font-medium text-gray-100">{p.studentName}</p>
                          <p className="text-xs text-gray-500">{p.studentEmail}</p>
                        </button>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-gray-200">{formatAmount(p.amount, p.currency)}</p>
                      </td>
                      <td className="py-3 pr-4">
                        {p.modality === 'Complet' && (
                          <Badge variant="success">Complet</Badge>
                        )}
                        {p.modality === 'Partiel' && (
                          <Badge variant="warning">Partiel</Badge>
                        )}
                        {!p.modality && <span className="text-gray-600">—</span>}
                      </td>
                      <td className="py-3 pr-4 text-gray-400">{p.product ?? '—'}</td>
                      <td className="py-3 pr-4">
                        <Badge variant="default">{SOURCE_LABELS[p.source] ?? p.source}</Badge>
                      </td>
                      <td className="py-3 pr-4 text-xs text-gray-400">
                        {p.plan ? (CIRCLE_PLAN_LABELS[p.plan] ?? p.plan) : '—'}
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-gray-800 pt-4">
            <p className="text-xs text-gray-500">Page {page} / {totalPages}</p>
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
