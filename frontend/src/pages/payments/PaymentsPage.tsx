import { useState, useEffect, useRef, useCallback, type ElementType, type ReactNode } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { keepPreviousData } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, ExternalLink, CalendarDays,
  Clock, CheckCircle2, XCircle, Banknote, CreditCard, Search, ChevronDown, Package, Filter, X,
  Plus, GraduationCap, User,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cn, formatDate, formatAmount } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'
import { type Period, periodToDates } from '@/lib/periods'
import { DateRangePicker, SHORT_PERIODS } from '@/components/ui/DateRangePicker'
import type { Payment, PaymentStatus, PaymentCurrency, PaymentModality, PaginatedResponse, Offer } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PaymentStats {
  total: number
  nonTraite: number
  traite: number
  rejete: number
  todayByAmount: { currency: string; total: number }[]
  monthByAmount: { currency: string; total: number }[]
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

const STATUS_OPTIONS: { value: PaymentStatus; label: string; badge: ReactNode }[] = [
  { value: 'NON TRAITÉ', label: 'Non traité',  badge: <Badge variant="warning">NON TRAITÉ</Badge> },
  { value: 'TRAITÉ',     label: 'Traité',      badge: <Badge variant="success">TRAITÉ</Badge> },
  { value: 'REJETÉ',     label: 'Rejeté',      badge: <Badge variant="danger">REJETÉ</Badge> },
]

const MODALITY_OPTIONS: { value: PaymentModality; label: string; badge: ReactNode }[] = [
  { value: 'Complet', label: 'Complet (soldé)',   badge: <Badge variant="success">Complet</Badge> },
  { value: 'Partiel', label: 'Partiel (acompte)', badge: <Badge variant="warning">Partiel</Badge> },
]

const planLabel = (plan: string | null | undefined) => plan ?? '—'

const inputCls = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'

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
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white dark:bg-white shadow-sm px-4 py-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBgCls}`}>
        <Icon className={`h-5 w-5 ${iconCls}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className="mt-0.5 text-xl font-bold text-gray-900 tabular-nums truncate">{value}</p>
        {sub && <p className="mt-0.5 text-[11px] text-gray-500">{sub}</p>}
      </div>
    </div>
  )
}

// ── Inline dropdown ───────────────────────────────────────────────────────────

function InlineDropdown<T extends string>({
  options, onSelect, pending, children,
}: {
  options: { value: T; label: string; badge?: ReactNode }[]
  onSelect: (v: T) => void
  pending?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const fn = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [open])

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (pending) return
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: r.left })
    }
    setOpen((o) => !o)
  }

  return (
    <div className="inline-flex">
      <button
        ref={btnRef}
        onClick={handleOpen}
        disabled={pending}
        className={cn(
          'group flex items-center gap-1 rounded-lg px-1.5 py-0.5 transition-colors',
          pending ? 'cursor-wait opacity-60' : 'hover:bg-gray-100/70 cursor-pointer',
        )}
      >
        {children}
        <ChevronDown className={cn(
          'h-3 w-3 shrink-0 transition-all',
          pending ? 'text-gray-500 animate-pulse' : 'text-gray-600 group-hover:text-gray-600',
          open && 'rotate-180 text-gray-600',
        )} />
      </button>

      {open && pos && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[9999] min-w-[180px] rounded-xl border border-gray-200 bg-white p-1 shadow-2xl"
            style={{ top: pos.top, left: pos.left }}
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={(e) => { e.stopPropagation(); onSelect(opt.value); setOpen(false) }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100"
              >
                <span className="flex-1">{opt.badge ?? <span className="text-gray-800">{opt.label}</span>}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Image lightbox ────────────────────────────────────────────────────────────

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

function TreatModal({ payment, offers, onClose }: { payment: Payment; offers: Offer[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [modality, setModality] = useState<'Complet' | 'Partiel'>(payment.modality ?? 'Complet')
  const [amount, setAmount] = useState(String(payment.amount ?? ''))
  const [currency, setCurrency] = useState<PaymentCurrency>(payment.currency ?? 'F CFA')
  const [gateway, setGateway] = useState(payment.gateway ?? '')
  const [notes, setNotes] = useState(payment.notes ?? '')
  const [error, setError] = useState('')

  const defaultOffer = offers.find((o) => o.name === payment.product) ?? offers[0]
  const [selectedOfferName, setSelectedOfferName] = useState(defaultOffer?.name ?? '')
  const selectedOffer = offers.find((o) => o.name === selectedOfferName)
  const availablePlans = (selectedOffer?.plans ?? []).filter((p) => p.isActive)
  const defaultPlan = availablePlans.find((p) => p.name === payment.plan) ?? availablePlans[0]
  const [selectedPlanName, setSelectedPlanName] = useState(defaultPlan?.name ?? '')

  const handleOfferChange = (name: string) => {
    setSelectedOfferName(name)
    const o = offers.find((o) => o.name === name)
    setSelectedPlanName(o?.plans.find((p) => p.isActive)?.name ?? '')
  }

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
      <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white dark:bg-white p-6 shadow-xl">
        <h2 className="mb-0.5 text-base font-semibold text-gray-900">Traiter le paiement</h2>
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
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Offre</label>
            <select value={selectedOfferName} onChange={(e) => handleOfferChange(e.target.value)} className={inputCls}>
              {offers.length === 0 && <option value="">Chargement…</option>}
              {offers.map((o) => <option key={o._id} value={o.name}>{o.name}</option>)}
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
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Plan</label>
            <select value={selectedPlanName} onChange={(e) => setSelectedPlanName(e.target.value)} className={inputCls} disabled={availablePlans.length === 0}>
              {availablePlans.length === 0 && <option value="">— aucun plan —</option>}
              {availablePlans.map((p) => <option key={p._id} value={p.name}>{p.name} · {p.durationMonths} mois</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Gateway</label>
            <input value={gateway} onChange={(e) => setGateway(e.target.value)} className={inputCls} placeholder="FedaPay, Wave…" />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-gray-400">Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {error && (
          <p className="mt-2 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button
            loading={isPending}
            onClick={() => mutate({ modality, amount: Number(amount), currency, product: selectedOfferName, plan: selectedPlanName, gateway, notes })}
          >
            Traiter le paiement
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Create payment modal ──────────────────────────────────────────────────────

type ClientResult = { type: 'student' | 'lead'; _id: string; name: string; email: string | null; extra?: string }

const CURRENCIES = ['F CFA', 'EURO', 'USD'] as const
const MODALITIES = ['Complet', 'Partiel'] as const

function CreatePaymentModal({ offers, onClose, onCreated }: {
  offers: Offer[]
  onClose: () => void
  onCreated: () => void
}) {
  const [clientQuery, setClientQuery] = useState('')
  const [clientResults, setClientResults] = useState<ClientResult[]>([])
  const [selectedClient, setSelectedClient] = useState<ClientResult | null>(null)
  const [showResults, setShowResults] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  const [product, setProduct] = useState(offers[0]?.name ?? '')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<typeof CURRENCIES[number]>('F CFA')
  const [modality, setModality] = useState<typeof MODALITIES[number]>('Complet')
  const [gateway, setGateway] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setClientResults([]); return }
    try {
      const res = await api.get<ClientResult[]>('/payments/client-search', { params: { q } })
      setClientResults(res.data)
      setShowResults(true)
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => search(clientQuery), 280)
    return () => clearTimeout(t)
  }, [clientQuery, search])

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (!searchRef.current?.contains(e.target as Node)) setShowResults(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const selectClient = (c: ClientResult) => {
    setSelectedClient(c)
    setClientQuery(c.name)
    setShowResults(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClient) { setError('Sélectionnez un client'); return }
    if (!product) { setError('Choisissez un produit'); return }
    if (!amount || isNaN(Number(amount))) { setError('Montant invalide'); return }
    setError('')
    setSubmitting(true)
    try {
      await api.post('/payments', {
        studentEmail: selectedClient.email ?? '',
        studentName: selectedClient.name,
        product,
        modality,
        amount: Number(amount),
        currency,
        gateway: gateway.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      onCreated()
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Erreur lors de la création')
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100'
  const labelCls = 'mb-1 block text-xs font-medium text-gray-600'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Nouveau paiement</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Client search */}
          <div>
            <label className={labelCls}>Client <span className="text-red-500">*</span></label>
            <div ref={searchRef} className="relative">
              <div className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2',
                selectedClient ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white',
              )}>
                <Search size={14} className="shrink-0 text-gray-400" />
                <input
                  className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                  placeholder="Rechercher par nom ou email…"
                  value={clientQuery}
                  onChange={(e) => { setClientQuery(e.target.value); setSelectedClient(null) }}
                  onFocus={() => clientResults.length > 0 && setShowResults(true)}
                />
                {selectedClient && (
                  <button type="button" onClick={() => { setSelectedClient(null); setClientQuery('') }}>
                    <X size={12} className="text-gray-400 hover:text-gray-600" />
                  </button>
                )}
              </div>

              {/* Selected client badge */}
              {selectedClient && (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2">
                  {selectedClient.type === 'student'
                    ? <GraduationCap size={14} className="text-indigo-600 shrink-0" />
                    : <User size={14} className="text-purple-600 shrink-0" />
                  }
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-900 truncate">{selectedClient.name}</p>
                    <p className="text-[11px] text-gray-500 truncate">{selectedClient.email}</p>
                  </div>
                  <span className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    selectedClient.type === 'student' ? 'bg-indigo-100 text-indigo-700' : 'bg-purple-100 text-purple-700',
                  )}>
                    {selectedClient.type === 'student' ? 'Étudiant' : 'Lead'}
                  </span>
                </div>
              )}

              {/* Autocomplete results */}
              {showResults && clientResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden">
                  {clientResults.map((c) => (
                    <button
                      key={`${c.type}-${c._id}`}
                      type="button"
                      onClick={() => selectClient(c)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                    >
                      {c.type === 'student'
                        ? <GraduationCap size={14} className="text-indigo-500 shrink-0" />
                        : <User size={14} className="text-purple-500 shrink-0" />
                      }
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                        <p className="text-xs text-gray-500 truncate">{c.email ?? '—'}</p>
                      </div>
                      <span className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        c.type === 'student' ? 'bg-indigo-50 text-indigo-600' : 'bg-purple-50 text-purple-600',
                      )}>
                        {c.type === 'student' ? 'Étudiant' : 'Lead'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {showResults && clientResults.length === 0 && clientQuery.trim().length >= 2 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-xl">
                  <p className="text-sm text-gray-500">Aucun résultat pour «&nbsp;{clientQuery}&nbsp;»</p>
                </div>
              )}
            </div>
          </div>

          {/* Product + Modality */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Produit <span className="text-red-500">*</span></label>
              <select className={inputCls} value={product} onChange={(e) => setProduct(e.target.value)} required>
                {offers.map((o) => (
                  <option key={o._id} value={o.name}>{o.name}</option>
                ))}
                <option value="COMPLEMENT">COMPLEMENT</option>
                <option value="COACHING">COACHING</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Modalité <span className="text-red-500">*</span></label>
              <select className={inputCls} value={modality} onChange={(e) => setModality(e.target.value as typeof MODALITIES[number])} required>
                {MODALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          {/* Amount + Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Montant <span className="text-red-500">*</span></label>
              <input
                type="number"
                min="0"
                step="any"
                className={inputCls}
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <label className={labelCls}>Devise</label>
              <select className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value as typeof CURRENCIES[number])}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Gateway */}
          <div>
            <label className={labelCls}>Moyen de paiement</label>
            <input
              className={inputCls}
              placeholder="Fedapay, Carte Bancaire, Wave…"
              value={gateway}
              onChange={(e) => setGateway(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              className={cn(inputCls, 'resize-none')}
              rows={2}
              placeholder="Remarques éventuelles…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 transition-colors">
              Annuler
            </button>
            <Button type="submit" disabled={submitting || !selectedClient}>
              {submitting ? 'Création…' : 'Créer le paiement'}
            </Button>
          </div>
        </form>
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
  const [period, setPeriod] = useState<Period | ''>('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const limit = 25
  const [treatPayment, setTreatPayment] = useState<Payment | null>(null)
  const [lightbox, setLightbox] = useState<{ images: string[]; idx: number } | null>(null)
  const [updatingCell, setUpdatingCell] = useState<{ id: string; field: string } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { setPage(1) }, [debouncedSearch, activeStatus, period, customFrom, customTo])

  const _r = (!period || period === 'custom') ? { from: customFrom, to: customTo } : periodToDates(period)
  const dateFrom = _r.from
  const dateTo = _r.to

  const { data: stats } = useQuery<PaymentStats>({
    queryKey: ['payments-stats'],
    queryFn: () => api.get<PaymentStats>('/payments/stats').then((r) => r.data),
    staleTime: 60_000,
  })

  const { data: offers = [] } = useQuery<Offer[]>({
    queryKey: ['subscription-offers'],
    queryFn: () => api.get<Offer[]>('/subscription-offers').then((r) => r.data),
    staleTime: 5 * 60_000,
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

  const updateMutation = useMutation({
    mutationFn: ({ id, fields }: { id: string; fields: Record<string, unknown> }) =>
      api.patch(`/payments/${id}`, fields).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] })
      qc.invalidateQueries({ queryKey: ['payments-stats'] })
      setUpdatingCell(null)
    },
    onError: () => setUpdatingCell(null),
  })

  const updateField = (id: string, field: string, value: unknown) => {
    setUpdatingCell({ id, field })
    updateMutation.mutate({ id, fields: { [field]: value } })
  }

  const isPendingCell = (id: string, field: string) =>
    updatingCell?.id === id && updatingCell?.field === field

  const payments = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = data ? (data.totalPages ?? Math.ceil(data.total / limit)) : 1

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Paiements</h1>
          <p className="mt-0.5 text-sm text-gray-500">{total} paiement{total !== 1 ? 's' : ''} affichés</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5"
            >
              <Plus size={14} />
              Nouveau paiement
            </Button>
          )}
          <Link
            to="/payments/offers"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm text-gray-600 hover:text-gray-900 transition-colors border border-gray-200"
          >
            <Package size={14} />
            Offres & Souscriptions
          </Link>
        </div>
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
          iconCls="text-emerald-600 dark:text-emerald-600"
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
          iconCls="text-blue-600 dark:text-blue-600"
        />
        <StatCard
          icon={Banknote}
          label="Reçus ce mois"
          value={formatAmountList(stats?.monthByAmount ?? [])}
          iconBgCls="bg-purple-50 dark:bg-purple-600/20"
          iconCls="text-purple-600 dark:text-purple-700"
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-[11px] font-bold uppercase tracking-widest text-gray-600 mr-1 shrink-0">Filtres :</span>

        {/* Search pill */}
        <div className={cn(
          'flex items-center gap-1.5 rounded-full border py-1.5 pl-3 pr-3',
          search ? 'border-indigo-600/50 bg-indigo-50' : 'border-gray-200 bg-white',
        )}>
          <Search size={12} className={search ? 'text-indigo-600 shrink-0' : 'text-gray-500 shrink-0'} />
          <input
            className="bg-transparent text-[13px] text-gray-800 placeholder-gray-400 focus:outline-none w-40"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-500 hover:text-gray-600">
              <X size={11} />
            </button>
          )}
        </div>

        {/* Date range */}
        <DateRangePicker
          period={period}
          customFrom={customFrom}
          customTo={customTo}
          onChange={(p, from, to) => { setPeriod(p); setCustomFrom(from); setCustomTo(to) }}
          periods={SHORT_PERIODS}
          placeholder="Toutes les dates"
        />

        {/* Clear all */}
        {(search || period || customFrom || customTo) && (
          <button
            onClick={() => { setSearch(''); setPeriod(''); setCustomFrom(''); setCustomTo('') }}
            className="flex items-center gap-1 rounded-full border border-gray-200 px-2.5 py-1.5 text-[12px] text-gray-500 hover:text-gray-600 hover:border-gray-600 transition-colors"
          >
            <Filter size={11} /><X size={10} />
          </button>
        )}
      </div>

      {/* Status tabs */}
      <div className="mb-4 flex gap-1 border-b border-gray-200">
        {STATUS_TABS.map((t) => (
          <button
            key={t.status}
            onClick={() => { setActiveStatus(t.status); setPage(1) }}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeStatus === t.status
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
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
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="py-3 pl-5 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Étudiant</th>
                  <th className="py-3 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Montant</th>
                  <th className="py-3 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Statut</th>
                  <th className="py-3 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Modalité</th>
                  <th className="py-3 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Produit</th>
                  <th className="py-3 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Plan Circle</th>
                  <th className="py-3 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Plateforme</th>
                  <th className="py-3 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Preuves</th>
                  <th className="py-3 pr-4 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Date</th>
                  {isAdmin && activeStatus === 'NON TRAITÉ' && (
                    <th className="py-3 pr-5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p._id} className="border-b border-gray-200/50 transition-colors hover:bg-indigo-50/40 dark:hover:bg-gray-50 last:border-0">

                    {/* Étudiant */}
                    <td className="py-3 pl-5 pr-4">
                      <button
                        onClick={() => p.studentId && navigate(`/students/${p.studentId}`)}
                        className={`text-left ${p.studentId ? 'hover:underline cursor-pointer' : 'cursor-default'}`}
                      >
                        <p className="font-medium text-gray-900">{p.studentName}</p>
                        <p className="text-xs text-gray-500">{p.studentEmail}</p>
                      </button>
                    </td>

                    {/* Montant */}
                    <td className="py-3 pr-4">
                      <p className="font-semibold tabular-nums text-gray-900">
                        {p.amount != null ? formatAmount(p.amount, p.currency) : '—'}
                      </p>
                    </td>

                    {/* Statut — inline editable */}
                    <td className="py-3 pr-4">
                      {isAdmin ? (
                        <InlineDropdown
                          options={STATUS_OPTIONS}
                          onSelect={(v) => updateField(p._id, 'status', v)}
                          pending={isPendingCell(p._id, 'status')}
                        >
                          {STATUS_OPTIONS.find((o) => o.value === p.status)?.badge ?? (
                            <Badge variant="warning">{p.status}</Badge>
                          )}
                        </InlineDropdown>
                      ) : (
                        STATUS_OPTIONS.find((o) => o.value === p.status)?.badge ?? (
                          <Badge variant="warning">{p.status}</Badge>
                        )
                      )}
                    </td>

                    {/* Modalité — inline editable */}
                    <td className="py-3 pr-4">
                      {isAdmin && p.modality ? (
                        <InlineDropdown
                          options={MODALITY_OPTIONS}
                          onSelect={(v) => updateField(p._id, 'modality', v)}
                          pending={isPendingCell(p._id, 'modality')}
                        >
                          {p.modality === 'Complet'
                            ? <Badge variant="success">Complet</Badge>
                            : <Badge variant="warning">Partiel</Badge>}
                        </InlineDropdown>
                      ) : p.modality ? (
                        p.modality === 'Complet'
                          ? <Badge variant="success">Complet</Badge>
                          : <Badge variant="warning">Partiel</Badge>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>

                    {/* Produit — inline editable */}
                    <td className="py-3 pr-4">
                      {isAdmin ? (
                        <InlineDropdown
                          options={offers.map((o) => ({ value: o.name, label: o.name }))}
                          onSelect={(v) => {
                            const newOffer = offers.find((o) => o.name === v)
                            const firstPlan = newOffer?.plans.find((pl) => pl.isActive)?.name ?? null
                            setUpdatingCell({ id: p._id, field: 'product' })
                            updateMutation.mutate({ id: p._id, fields: { product: v, plan: firstPlan } })
                          }}
                          pending={isPendingCell(p._id, 'product')}
                        >
                          <span className="text-xs font-medium text-gray-600">{p.product ?? '—'}</span>
                        </InlineDropdown>
                      ) : (
                        <span className="text-xs text-gray-400">{p.product ?? '—'}</span>
                      )}
                    </td>

                    {/* Plan — inline editable, filtered by current offer */}
                    <td className="py-3 pr-4">
                      {isAdmin ? (
                        <InlineDropdown
                          options={(offers.find((o) => o.name === p.product)?.plans ?? [])
                            .filter((pl) => pl.isActive)
                            .map((pl) => ({ value: pl.name, label: `${pl.name} · ${pl.durationMonths} mois` }))}
                          onSelect={(v) => updateField(p._id, 'plan', v)}
                          pending={isPendingCell(p._id, 'plan')}
                        >
                          <span className="text-xs font-medium text-gray-600">
                            {planLabel(p.plan)}
                          </span>
                        </InlineDropdown>
                      ) : (
                        <span className="text-xs text-gray-400">
                          {planLabel(p.plan)}
                        </span>
                      )}
                    </td>

                    {/* Plateforme (gateway) */}
                    <td className="py-3 pr-4">
                      {p.gateway ? (
                        <span className="rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
                          {p.gateway}
                        </span>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>

                    {/* Preuves */}
                    <td className="py-3 pr-4">
                      {p.proofImages.length > 0 ? (
                        <div className="flex gap-1">
                          {p.proofImages.slice(0, 3).map((url, i) => (
                            <button
                              key={i}
                              onClick={(e) => { e.stopPropagation(); setLightbox({ images: p.proofImages, idx: i }) }}
                              className="group relative h-10 w-10 overflow-hidden rounded-lg border border-gray-200 shadow-sm cursor-pointer"
                              aria-label={`Voir preuve ${i + 1}`}
                            >
                              <img src={url} alt="" className="h-full w-full object-cover" />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
                                <ExternalLink className="h-3 w-3 text-white opacity-0 group-hover:opacity-100" />
                              </div>
                            </button>
                          ))}
                          {p.proofImages.length > 3 && (
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white/30 text-xs text-gray-500">
                              +{p.proofImages.length - 3}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>

                    {/* Date */}
                    <td className="py-3 pr-4">
                      <p className="text-xs text-gray-400 tabular-nums whitespace-nowrap">
                        {formatDate(p.paidAt ?? p.createdAt)}
                      </p>
                      {p.processedAt && (
                        <p className="mt-0.5 text-[10px] text-gray-600">
                          Traité le {formatDate(p.processedAt)}
                        </p>
                      )}
                    </td>

                    {/* Actions (NON TRAITÉ admin only) */}
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
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
            <p className="text-xs text-gray-500">
              Page {page} / {totalPages} — {total} paiement{total > 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                aria-label="Page précédente"
                className="rounded-lg border border-gray-200 p-1.5 text-gray-400 disabled:opacity-40 hover:bg-white/30 hover:text-gray-900 transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Page suivante"
                className="rounded-lg border border-gray-200 p-1.5 text-gray-400 disabled:opacity-40 hover:bg-white/30 hover:text-gray-900 transition-colors cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </Card>

      {treatPayment && (
        <TreatModal payment={treatPayment} offers={offers} onClose={() => setTreatPayment(null)} />
      )}
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.idx}
          onClose={() => setLightbox(null)}
        />
      )}
      {createOpen && (
        <CreatePaymentModal
          offers={offers}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['payments'] })
            qc.invalidateQueries({ queryKey: ['payments-stats'] })
          }}
        />
      )}
    </div>
  )
}
