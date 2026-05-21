import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, ShieldOff, ShieldCheck, ExternalLink, Clock,
  Zap, CheckCircle2, AlertTriangle, RefreshCw, UserMinus, Lock, Unlock,
} from 'lucide-react'
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
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={selectCls} placeholder="0" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Devise</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value as import('@/types').PaymentCurrency)} className={selectCls}>
              {['F CFA', 'USD', 'EURO'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Gateway</label>
            <input value={gateway} onChange={(e) => setGateway(e.target.value)} className={selectCls} placeholder="FedaPay, Wave…" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Plan Circle</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value)} className={selectCls}>
              {Object.entries(CIRCLE_PLAN_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-gray-400">Notes</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none" />
        </div>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button loading={isPending} onClick={() => mutate({ modality, amount: Number(amount), currency, product, gateway, plan, notes })}>
            Traiter
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Plans Circle qui donnent accès aux espaces coaching privés
const COACHING_ACCESS_TAGS = ['elite', 'all-in-one', 'all_in_one']

function hasCoachingAccess(tags?: { id: number; name: string }[]): boolean {
  if (!tags || tags.length === 0) return false
  return tags.some((t) =>
    COACHING_ACCESS_TAGS.some((key) => t.name.toLowerCase().includes(key)),
  )
}

// ── Status helpers ────────────────────────────────────────────────────────────

const PAYMENT_STATUS_BADGE = {
  'NON TRAITÉ': { variant: 'warning' as const, label: 'NON TRAITÉ' },
  'TRAITÉ':     { variant: 'success' as const, label: 'TRAITÉ' },
  'REJETÉ':     { variant: 'danger' as const,  label: 'REJETÉ' },
}

const SOURCE_LABELS: Record<string, { label: string; cls: string }> = {
  tally:   { label: 'Tally',   cls: 'bg-violet-500/10 text-violet-400' },
  chariow: { label: 'Chariow', cls: 'bg-sky-500/10 text-sky-400' },
  manual:  { label: 'Manuel',  cls: 'bg-gray-700 text-gray-400' },
}

function followUpLabel(status?: FollowUpStatus) {
  return status ?? '—'
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

  const circleRefreshMutation = useMutation({
    mutationFn: () => api.post(`/students/${id}/circle-refresh`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student', id] }),
  })

  const removeCoachingMutation = useMutation({
    mutationFn: () => api.post(`/students/${id}/remove-coaching`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student', id] }),
  })

  if (isLoading) return <div className="p-6 py-8 text-center text-sm text-gray-500">Chargement…</div>
  if (!data) return <div className="p-6 py-8 text-center text-sm text-gray-500">Étudiant introuvable.</div>

  const { student, payments, formation, coaching } = data
  const pendingPayments = payments.filter((p) => p.status === 'NON TRAITÉ')

  // Payment summary
  const treatedPayments = payments.filter((p) => p.status === 'TRAITÉ')
  const totalValidated = treatedPayments.reduce((s, p) => s + (p.amount ?? 0), 0)
  const mainCurrency = treatedPayments[0]?.currency ?? 'F CFA'
  const hasPartial = payments.some((p) => p.modality === 'Partiel')

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'payments', label: 'Paiements', count: payments.length },
    { key: 'formation', label: 'Formation' },
    { key: 'coaching', label: 'Coaching' },
    { key: 'notes', label: 'Notes', count: student.notes ? 1 : undefined },
  ]

  return (
    <div className="p-6">
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
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-semibold text-gray-100">{student.name}</h1>
                <Badge
                  variant={
                    student.infoStatus === 'EXACTE' ? 'success'
                    : student.infoStatus === 'ERRONÉE' ? 'danger'
                    : 'default'
                  }
                >
                  {student.infoStatus}
                </Badge>
                {student.debtStatus !== 'ok' && (
                  <Badge variant="danger">
                    {student.debtStatus === 'confirmed' ? 'Débiteur confirmé' : 'Débiteur potentiel'}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-gray-400">{student.email}</p>
              <div className="mt-1 flex gap-4 flex-wrap text-xs text-gray-500">
                {student.whatsapp && <span>📱 {student.whatsapp}</span>}
                {student.occupation && <span>💼 {student.occupation}</span>}
                {student.source && <span>📌 {student.source}</span>}
              </div>

              {/* Circle info row */}
              {student.circleId && (
                <div className="mt-3 flex items-center gap-2 flex-wrap border-t border-gray-800 pt-3">
                  <Zap className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  {student.circleIsActive != null && (
                    <Badge variant={student.circleIsActive ? 'success' : 'danger'}>
                      {student.circleIsActive ? 'Actif' : 'Inactif'}
                    </Badge>
                  )}
                  {student.circleTags?.map((tag) => (
                    <Badge key={tag.id} variant="info">{tag.name}</Badge>
                  ))}
                  {student.circleJoinedAt && (
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      Rejoint {formatDate(student.circleJoinedAt)}
                    </span>
                  )}
                  {student.circleAcceptedAt && (
                    <span className="text-xs text-gray-500">
                      · Invit. acceptée {formatDate(student.circleAcceptedAt)}
                    </span>
                  )}
                  {student.circleProfile && (
                    <a
                      href={student.circleProfile}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Profil Circle
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          {isAdmin && (
            <div className="flex gap-2 shrink-0">
              <Button variant="danger" size="sm" loading={restrictMutation.isPending} onClick={() => restrictMutation.mutate()}>
                <ShieldOff className="h-4 w-4" />
                Restreindre
              </Button>
              <Button variant="secondary" size="sm" loading={restoreMutation.isPending} onClick={() => restoreMutation.mutate()}>
                <ShieldCheck className="h-4 w-4" />
                Restaurer
              </Button>
            </div>
          )}
        </div>

        {pendingPayments.length > 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-2.5 text-sm text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
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
              <span className="rounded-full bg-gray-800 px-1.5 py-0.5 text-xs">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Paiements ──────────────────────────────────────────────── */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          {/* Summary bar */}
          {payments.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-center">
                <p className="text-lg font-bold text-emerald-400">{formatAmount(totalValidated, mainCurrency)}</p>
                <p className="text-xs text-gray-500 mt-0.5">Total validé</p>
              </div>
              <div className="rounded-xl border border-gray-700 bg-gray-800/50 px-4 py-3 text-center">
                <p className="text-lg font-bold text-gray-200">{payments.length}</p>
                <p className="text-xs text-gray-500 mt-0.5">paiement{payments.length > 1 ? 's' : ''}</p>
              </div>
              <div className="rounded-xl border border-gray-700 bg-gray-800/50 px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1.5">
                  {hasPartial
                    ? <Badge variant="warning">Partiel</Badge>
                    : <Badge variant="success">Complet</Badge>}
                </div>
                <p className="text-xs text-gray-500 mt-1">modalité</p>
              </div>
            </div>
          )}

          <Card>
            {payments.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-500">Aucun paiement.</div>
            ) : (
              <div className="divide-y divide-gray-800">
                {payments.map((p) => {
                  const b = PAYMENT_STATUS_BADGE[p.status]
                  const src = SOURCE_LABELS[p.source] ?? SOURCE_LABELS.manual
                  const planLabel = p.plan ? (CIRCLE_PLAN_LABELS[p.plan.toLowerCase()] ?? p.plan) : null
                  return (
                    <div key={p._id} className="py-4 first:pt-0 last:pb-0">
                      {/* Row 1: badges + actions */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={b.variant}>{b.label}</Badge>
                          <Badge variant={p.modality === 'Complet' ? 'success' : 'warning'}>
                            {p.modality}
                          </Badge>
                          {planLabel && <Badge variant="info">{planLabel}</Badge>}
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${src.cls}`}>
                            {src.label}
                          </span>
                        </div>
                        {isAdmin && p.status === 'NON TRAITÉ' && (
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => setTreatPayment(p)}>Traiter</Button>
                            <Button
                              size="sm"
                              variant="danger"
                              loading={rejectMutation.isPending}
                              onClick={() => rejectMutation.mutate(p._id)}
                            >
                              Rejeter
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Row 2: amount + details */}
                      <div className="mt-2 flex items-baseline gap-4 flex-wrap">
                        <span className="text-xl font-bold text-gray-100">
                          {formatAmount(p.amount, p.currency)}
                        </span>
                        <span className="text-sm text-gray-400">{p.product ?? '—'}</span>
                        {p.gateway && <span className="text-xs text-gray-500">{p.gateway}</span>}
                        <span className="ml-auto flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="h-3 w-3" />
                          {formatDate(p.createdAt)}
                        </span>
                      </div>

                      {/* Notes from Tally (modality declaration) */}
                      {p.notes && (
                        <p className="mt-1.5 text-xs text-gray-500 italic">{p.notes}</p>
                      )}

                      {/* Proof images */}
                      {p.proofImages.length > 0 && (
                        <div className="mt-3 flex gap-2 flex-wrap">
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
        </div>
      )}

      {/* ── Tab: Formation ─────────────────────────────────────────────── */}
      {activeTab === 'formation' && (
        <div className="space-y-4">

          {/* ── Section Circle ───────────────────────────────────────── */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-gray-200">Accès Circle</h3>
                {student.circleLastSync && (
                  <span className="text-xs text-gray-500">
                    · synchro {formatDate(student.circleLastSync)}
                  </span>
                )}
              </div>
              {isAdmin && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={circleRefreshMutation.isPending}
                    onClick={() => circleRefreshMutation.mutate()}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Resync
                  </Button>
                  {hasCoachingAccess(student.circleTags) && (
                    <Button
                      size="sm"
                      variant="danger"
                      loading={removeCoachingMutation.isPending}
                      onClick={() => removeCoachingMutation.mutate()}
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                      Retirer coaching
                    </Button>
                  )}
                </div>
              )}
            </div>

            {!student.circleId ? (
              <p className="text-sm text-gray-500">Aucun compte Circle trouvé pour cet étudiant.</p>
            ) : (
              <div className="space-y-4">
                {/* Status + tags */}
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant={student.circleIsActive ? 'success' : 'danger'}>
                    {student.circleIsActive ? 'Actif' : 'Inactif'}
                  </Badge>
                  {student.circleTags?.map((tag) => (
                    <Badge key={tag.id} variant="info">{tag.name}</Badge>
                  ))}
                  {(!student.circleTags || student.circleTags.length === 0) && (
                    <span className="text-xs text-gray-500">Aucun tag</span>
                  )}
                </div>

                {/* Accès dérivé des tags */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={`rounded-lg border px-4 py-3 flex items-center gap-3 ${
                    student.circleIsActive
                      ? 'border-emerald-500/20 bg-emerald-500/10'
                      : 'border-gray-700 bg-gray-800/40'
                  }`}>
                    {student.circleIsActive
                      ? <Unlock className="h-4 w-4 text-emerald-400 shrink-0" />
                      : <Lock className="h-4 w-4 text-gray-500 shrink-0" />}
                    <div>
                      <p className="text-xs font-medium text-gray-300">Espaces généraux</p>
                      <p className="text-xs text-gray-500">18 espaces de formation</p>
                    </div>
                  </div>
                  <div className={`rounded-lg border px-4 py-3 flex items-center gap-3 ${
                    hasCoachingAccess(student.circleTags)
                      ? 'border-indigo-500/20 bg-indigo-500/10'
                      : 'border-gray-700 bg-gray-800/40'
                  }`}>
                    {hasCoachingAccess(student.circleTags)
                      ? <Unlock className="h-4 w-4 text-indigo-400 shrink-0" />
                      : <Lock className="h-4 w-4 text-gray-500 shrink-0" />}
                    <div>
                      <p className="text-xs font-medium text-gray-300">Espaces coaching</p>
                      <p className="text-xs text-gray-500">
                        {hasCoachingAccess(student.circleTags) ? '3 espaces privés' : 'Accès restreint'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Dates */}
                <div className="flex gap-6 text-xs text-gray-500">
                  {student.circleJoinedAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Rejoint le {formatDate(student.circleJoinedAt)}
                    </span>
                  )}
                  {student.circleAcceptedAt && (
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Invitation acceptée le {formatDate(student.circleAcceptedAt)}
                    </span>
                  )}
                  {student.circleProfile && (
                    <a
                      href={student.circleProfile}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Voir profil Circle
                    </a>
                  )}
                </div>
              </div>
            )}
          </Card>

          {/* ── Dashboard Formation ──────────────────────────────────── */}
          <Card>
            <div className="mb-4 flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-200">Dashboard formation</h3>
            </div>
            {!formation ? (
              <div className="py-4 text-center text-sm text-gray-500">Aucun dashboard formation.</div>
            ) : (
              <>
                <div className="mb-4 flex items-center gap-3">
                  {formation.paymentStatus === 'EN RETARD'
                    ? <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
                    : <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />}
                  <div>
                    <p className="text-xs text-gray-500">Statut paiement</p>
                    {circleStatusBadge(formation.paymentStatus)}
                  </div>
                  {formation.nextPaymentDate && (
                    <div className="ml-auto text-right">
                      <p className="text-xs text-gray-500">Prochain paiement</p>
                      <p className={`text-sm font-semibold ${new Date(formation.nextPaymentDate) < new Date() ? 'text-red-400' : 'text-gray-200'}`}>
                        {formatDate(formation.nextPaymentDate)}
                      </p>
                    </div>
                  )}
                </div>

                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    { label: 'Modalité', value: formation.paymentModality ?? '—' },
                    { label: 'Relance auto', value: followUpLabel(formation.autoFollowUpStatus) },
                    { label: 'Relance manuelle', value: formation.manualFollowUpStatus ?? '—' },
                    { label: 'Action', value: formation.action ?? '—' },
                    ...(formation.notes ? [{ label: 'Notes', value: formation.notes }] : []),
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg bg-gray-800/40 px-4 py-3">
                      <dt className="text-xs text-gray-500">{label}</dt>
                      <dd className="mt-1 text-sm font-medium text-gray-200">{value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </Card>
        </div>
      )}

      {/* ── Tab: Coaching ──────────────────────────────────────────────── */}
      {activeTab === 'coaching' && (
        <Card>
          {!coaching ? (
            <div className="py-6 text-center text-sm text-gray-500">Aucun dashboard coaching.</div>
          ) : (
            <>
              {/* Highlight */}
              <div className="mb-5 flex items-center gap-3">
                {coaching.paymentStatus === 'EN RETARD'
                  ? <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
                  : <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />}
                <div>
                  <p className="text-sm font-semibold text-gray-200">Statut coaching</p>
                  {circleStatusBadge(coaching.paymentStatus)}
                </div>
                {coaching.nextPaymentDate && (
                  <div className="ml-auto text-right">
                    <p className="text-xs text-gray-500">Prochain paiement</p>
                    <p className={`text-sm font-semibold ${new Date(coaching.nextPaymentDate) < new Date() ? 'text-red-400' : 'text-gray-200'}`}>
                      {formatDate(coaching.nextPaymentDate)}
                    </p>
                  </div>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  { label: 'Date paiement', value: coaching.paymentDate ? formatDate(coaching.paymentDate) : '—' },
                  { label: 'Messagerie', value: coaching.messagingEnabled ? 'Activée' : 'Désactivée' },
                  { label: 'Relance auto', value: followUpLabel(coaching.autoFollowUpStatus) },
                  { label: 'Relance manuelle', value: coaching.manualFollowUpStatus ?? '—' },
                  { label: 'Note suivi', value: coaching.followUpNote ?? '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg bg-gray-800/40 px-4 py-3">
                    <dt className="text-xs text-gray-500">{label}</dt>
                    <dd className="mt-1 text-sm font-medium text-gray-200">{value}</dd>
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
            </>
          )}
        </Card>
      )}

      {/* ── Tab: Notes ─────────────────────────────────────────────────── */}
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
                <Button loading={addNoteMutation.isPending} disabled={!note.trim()} onClick={() => addNoteMutation.mutate(note.trim())}>
                  Enregistrer
                </Button>
              </div>
            </Card>
          )}
          <Card>
            {student.notes ? (
              <p className="whitespace-pre-wrap text-sm text-gray-300 leading-relaxed">{student.notes}</p>
            ) : (
              <div className="py-6 text-center text-sm text-gray-500">Aucune note.</div>
            )}
          </Card>
        </div>
      )}

      {/* Modals */}
      {treatPayment && <TreatModal payment={treatPayment} onClose={() => setTreatPayment(null)} />}
      {lightbox && (
        <ImageLightbox images={lightbox.images} initialIndex={lightbox.idx} onClose={() => setLightbox(null)} />
      )}
    </div>
  )
}
