import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ShieldOff, ShieldCheck, ExternalLink } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatDate, formatAmount } from '@/lib/utils'
import { CIRCLE_PLAN_LABELS } from '@/lib/constants'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'
import type { StudentDetail, Payment, CirclePaymentStatus, FollowUpStatus } from '@/types'

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

// ── Treat modal (shared with PaymentsPage) ────────────────────────────────────

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
      qc.invalidateQueries({ queryKey: ['student', payment.studentId] })
      onClose()
    },
    onError: () => setError('Erreur lors du traitement du paiement.'),
  })

  const selectCls =
    'w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-gray-100">Traiter le paiement</h2>
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
            className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
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

// ── Status helpers ────────────────────────────────────────────────────────────

const PAYMENT_STATUS_BADGE = {
  'NON TRAITÉ': { variant: 'warning' as const, label: 'NON TRAITÉ' },
  'TRAITÉ': { variant: 'success' as const, label: 'TRAITÉ' },
  'REJETÉ': { variant: 'danger' as const, label: 'REJETÉ' },
}

function followUpLabel(status?: FollowUpStatus) {
  if (!status) return '—'
  return status
}

function circleStatusBadge(status?: CirclePaymentStatus) {
  if (status === 'EN RÈGLE') return <Badge variant="success">EN RÈGLE</Badge>
  if (status === 'EN RETARD') return <Badge variant="danger">EN RETARD</Badge>
  return <Badge variant="default">—</Badge>
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'payments' | 'formation' | 'coaching' | 'notes'

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin'

  const [activeTab, setActiveTab] = useState<Tab>('payments')
  const [note, setNote] = useState('')
  const [lightbox, setLightbox] = useState<{ images: string[]; idx: number } | null>(null)
  const [treatPayment, setTreatPayment] = useState<Payment | null>(null)

  const { data, isLoading } = useQuery<StudentDetail>({
    queryKey: ['student', id],
    queryFn: () => api.get<StudentDetail>(`/students/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  const restrictMutation = useMutation({
    mutationFn: () => api.post(`/students/${id}/restrict`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student', id] }),
  })

  const restoreMutation = useMutation({
    mutationFn: () => api.post(`/students/${id}/restore`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student', id] }),
  })

  const rejectMutation = useMutation({
    mutationFn: (paymentId: string) => api.post(`/payments/${paymentId}/reject`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student', id] }),
  })

  const addNoteMutation = useMutation({
    mutationFn: (text: string) => api.patch(`/students/${id}/notes`, { note: text }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student', id] })
      setNote('')
    },
  })

  if (isLoading) {
    return <div className="p-6 py-8 text-center text-sm text-gray-500">Chargement…</div>
  }

  if (!data) {
    return <div className="p-6 py-8 text-center text-sm text-gray-500">Étudiant introuvable.</div>
  }

  const { student, payments, formation, coaching } = data
  const pendingPayments = payments.filter((p) => p.status === 'NON TRAITÉ')

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'payments', label: 'Paiements', count: payments.length },
    { key: 'formation', label: 'Formation' },
    { key: 'coaching', label: 'Coaching' },
    { key: 'notes', label: 'Notes', count: student.notes.length },
  ]

  return (
    <div className="p-6">
      {/* Back */}
      <button
        onClick={() => navigate('/students')}
        className="mb-4 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux étudiants
      </button>

      {/* Student header */}
      <Card className="mb-5">
        <div className="flex items-start justify-between">
          <div className="flex gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 text-lg font-bold text-indigo-400">
              {student.name[0]?.toUpperCase() ?? '?'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-gray-100">{student.name}</h1>
                <Badge
                  variant={
                    student.infoStatus === 'EXACTE'
                      ? 'success'
                      : student.infoStatus === 'ERRONÉE'
                        ? 'danger'
                        : 'default'
                  }
                >
                  {student.infoStatus}
                </Badge>
              </div>
              <p className="text-sm text-gray-400">{student.email}</p>
              <div className="mt-1 flex gap-4 text-xs text-gray-500">
                {student.whatsapp && <span>📱 {student.whatsapp}</span>}
                {student.occupation && <span>💼 {student.occupation}</span>}
                {student.source && <span>📌 {student.source}</span>}
              </div>
            </div>
          </div>

          {isAdmin && (
            <div className="flex gap-2">
              <Button
                variant="danger"
                loading={restrictMutation.isPending}
                onClick={() => restrictMutation.mutate()}
              >
                <ShieldOff className="h-4 w-4" />
                Restreindre
              </Button>
              <Button
                variant="secondary"
                loading={restoreMutation.isPending}
                onClick={() => restoreMutation.mutate()}
              >
                <ShieldCheck className="h-4 w-4" />
                Restaurer
              </Button>
            </div>
          )}
        </div>

        {/* Pending payments alert */}
        {pendingPayments.length > 0 && (
          <div className="mt-4 rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-2.5 text-sm text-amber-400">
            {pendingPayments.length} paiement{pendingPayments.length > 1 ? 's' : ''} en attente de traitement
          </div>
        )}
      </Card>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-gray-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === t.key
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
            {t.count != null && (
              <span className="rounded-full bg-gray-800 px-1.5 py-0.5 text-xs">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Paiements */}
      {activeTab === 'payments' && (
        <Card>
          {payments.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-500">Aucun paiement.</div>
          ) : (
            <div className="divide-y divide-gray-800">
              {payments.map((p) => {
                const b = PAYMENT_STATUS_BADGE[p.status]
                return (
                  <div key={p._id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant={b.variant}>{b.label}</Badge>
                        <div>
                          <p className="text-sm font-medium text-gray-200">
                            {formatAmount(p.amount, p.currency)} — {p.product ?? '—'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {p.plan ? CIRCLE_PLAN_LABELS[p.plan] ?? p.plan : '—'} · {p.gateway ?? '—'} · {p.source}
                          </p>
                          <p className="text-xs text-gray-600">{formatDate(p.createdAt)}</p>
                        </div>
                      </div>

                      {isAdmin && p.status === 'NON TRAITÉ' && (
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
                      )}
                    </div>

                    {/* Proof images */}
                    {p.proofImages.length > 0 && (
                      <div className="mt-3 flex gap-2">
                        {p.proofImages.map((url, i) => (
                          <button
                            key={i}
                            onClick={() => setLightbox({ images: p.proofImages, idx: i })}
                            className="group relative h-16 w-16 overflow-hidden rounded-lg border border-gray-700"
                          >
                            <img
                              src={url}
                              alt={`Preuve ${i + 1}`}
                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                              <ExternalLink className="h-4 w-4 text-white opacity-0 group-hover:opacity-100" />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {/* Tab: Formation */}
      {activeTab === 'formation' && (
        <Card>
          {!formation ? (
            <div className="py-6 text-center text-sm text-gray-500">Aucun dashboard formation.</div>
          ) : (
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[
                { label: 'Modalité', value: formation.paymentModality ?? '—' },
                { label: 'Statut paiement', value: circleStatusBadge(formation.paymentStatus) },
                {
                  label: 'Prochain paiement',
                  value: formation.nextPaymentDate ? formatDate(formation.nextPaymentDate) : '—',
                },
                { label: 'Relance auto', value: followUpLabel(formation.autoFollowUpStatus) },
                { label: 'Relance manuelle', value: formation.manualFollowUpStatus ?? '—' },
                { label: 'Action', value: formation.action ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg bg-gray-800/40 px-4 py-3">
                  <dt className="text-xs text-gray-500">{label}</dt>
                  <dd className="mt-1 text-sm font-medium text-gray-200">
                    {typeof value === 'string' ? value : value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      )}

      {/* Tab: Coaching */}
      {activeTab === 'coaching' && (
        <Card>
          {!coaching ? (
            <div className="py-6 text-center text-sm text-gray-500">Aucun dashboard coaching.</div>
          ) : (
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {[
                { label: 'Statut paiement', value: circleStatusBadge(coaching.paymentStatus) },
                {
                  label: 'Date paiement',
                  value: coaching.paymentDate ? formatDate(coaching.paymentDate) : '—',
                },
                {
                  label: 'Prochain paiement',
                  value: coaching.nextPaymentDate ? formatDate(coaching.nextPaymentDate) : '—',
                },
                { label: 'Messagerie', value: coaching.messagingEnabled ? 'Activée' : 'Désactivée' },
                { label: 'Relance auto', value: followUpLabel(coaching.autoFollowUpStatus) },
                { label: 'Relance manuelle', value: coaching.manualFollowUpStatus ?? '—' },
                { label: 'Note suivi', value: coaching.followUpNote ?? '—' },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg bg-gray-800/40 px-4 py-3">
                  <dt className="text-xs text-gray-500">{label}</dt>
                  <dd className="mt-1 text-sm font-medium text-gray-200">
                    {typeof value === 'string' ? value : value}
                  </dd>
                </div>
              ))}
              {coaching.tags && coaching.tags.length > 0 && (
                <div className="col-span-full rounded-lg bg-gray-800/40 px-4 py-3">
                  <dt className="mb-2 text-xs text-gray-500">Tags</dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {coaching.tags.map((tag) => (
                      <Badge key={tag} variant="info">{tag}</Badge>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </Card>
      )}

      {/* Tab: Notes */}
      {activeTab === 'notes' && (
        <div className="space-y-4">
          {isAdmin && (
            <Card>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ajouter une note…"
                className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
              />
              <div className="mt-3 flex justify-end">
                <Button
                  loading={addNoteMutation.isPending}
                  disabled={!note.trim()}
                  onClick={() => addNoteMutation.mutate(note.trim())}
                >
                  Ajouter
                </Button>
              </div>
            </Card>
          )}

          <Card>
            {student.notes.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-500">Aucune note.</div>
            ) : (
              <ul className="divide-y divide-gray-800 space-y-0">
                {[...student.notes].reverse().map((n, i) => (
                  <li key={i} className="py-3 text-sm text-gray-300 first:pt-0 last:pb-0">
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {/* Modals */}
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
