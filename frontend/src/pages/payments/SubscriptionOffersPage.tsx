import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Pencil, Trash2, Clock, Eye, EyeOff, X } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { formatAmount } from '@/lib/utils'
import api from '@/services/api'
import type { Offer, OfferPlan } from '@/types'

// ── Dynamic product colors (deterministic by name) ────────────────────────────

const PALETTE = [
  { border: 'border-indigo-500/30', badge: 'bg-indigo-100 dark:bg-indigo-50 text-indigo-700 dark:text-indigo-600' },
  { border: 'border-violet-500/30', badge: 'bg-violet-100 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400' },
  { border: 'border-amber-500/30',  badge: 'bg-amber-100  dark:bg-amber-500/10  text-amber-700  dark:text-amber-400'  },
  { border: 'border-emerald-500/30',badge: 'bg-emerald-100 dark:bg-emerald-50 text-emerald-700 dark:text-emerald-600' },
  { border: 'border-rose-500/30',   badge: 'bg-rose-100   dark:bg-rose-50   text-rose-700   dark:text-rose-600'   },
  { border: 'border-sky-500/30',    badge: 'bg-sky-100    dark:bg-sky-500/10    text-sky-700    dark:text-sky-400'    },
  { border: 'border-teal-500/30',   badge: 'bg-teal-100   dark:bg-teal-500/10   text-teal-700   dark:text-teal-400'   },
  { border: 'border-fuchsia-500/30',badge: 'bg-fuchsia-100 dark:bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400' },
]

function productMeta(name: string) {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlanDraft {
  _id?: string
  name: string
  durationMonths: number
  price: number
  currency: string
  partialDueAfterDays: number
  isActive: boolean
}

const CURRENCIES = ['F CFA', 'USD', 'EURO'] as const

const emptyPlan = (): PlanDraft => ({
  name: '', durationMonths: 1, price: 0, currency: 'F CFA', partialDueAfterDays: 30, isActive: true,
})

// ── Shared styles ─────────────────────────────────────────────────────────────

const inp = 'rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'
const lbl = 'mb-1 block text-xs font-medium text-gray-400'

// ── Plan row in modal ─────────────────────────────────────────────────────────

function PlanDraftRow({
  plan, index, onChange, onRemove,
}: {
  plan: PlanDraft
  index: number
  onChange: (i: number, patch: Partial<PlanDraft>) => void
  onRemove: (i: number) => void
}) {
  return (
    <div className="grid grid-cols-[1fr_60px_90px_80px_60px_28px] items-center gap-2 py-2 border-b border-gray-200/50 last:border-0">
      <input
        value={plan.name}
        onChange={(e) => onChange(index, { name: e.target.value })}
        placeholder="Nom (ex: Elite)"
        className={inp}
      />
      <input
        type="number" min={1}
        value={plan.durationMonths}
        onChange={(e) => onChange(index, { durationMonths: Number(e.target.value) })}
        className={`${inp} text-center`}
      />
      <input
        type="number" min={0}
        value={plan.price}
        onChange={(e) => onChange(index, { price: Number(e.target.value) })}
        placeholder="Prix"
        className={inp}
      />
      <select
        value={plan.currency}
        onChange={(e) => onChange(index, { currency: e.target.value })}
        className={inp}
      >
        {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <input
        type="number" min={1}
        value={plan.partialDueAfterDays}
        onChange={(e) => onChange(index, { partialDueAfterDays: Number(e.target.value) })}
        title="Jours avant rappel paiement partiel"
        className={`${inp} text-center`}
      />
      <button
        onClick={() => onRemove(index)}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ── Offer modal (create + edit) ───────────────────────────────────────────────

function OfferModal({
  offer, existingProducts, onClose,
}: {
  offer?: Offer
  existingProducts: string[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const isEdit = !!offer

  const [name, setName] = useState(offer?.name ?? '')
  const [description, setDescription] = useState(offer?.description ?? '')
  const [plans, setPlans] = useState<PlanDraft[]>(
    offer?.plans?.map((p) => ({ ...p, _id: (p as OfferPlan & { _id: string })._id })) ?? [emptyPlan()],
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const suggestions = existingProducts.filter(
    (p) => !isEdit && p !== name && p.toLowerCase().includes(name.toLowerCase()),
  )

  const addPlan = () => setPlans((prev) => [...prev, emptyPlan()])
  const removePlan = (i: number) => setPlans((prev) => prev.filter((_, idx) => idx !== i))
  const updatePlan = (i: number, patch: Partial<PlanDraft>) =>
    setPlans((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Le nom de l'offre est obligatoire."); return }
    const invalid = plans.find((p) => !p.name.trim() || p.durationMonths < 1)
    if (invalid) { setError('Chaque plan doit avoir un nom et une durée ≥ 1 mois.'); return }

    setSaving(true)
    setError('')
    try {
      if (isEdit) {
        await api.patch(`/subscription-offers/${offer!._id}`, { description })

        const currentIds = new Set(plans.filter((p) => p._id).map((p) => p._id))
        for (const orig of offer!.plans) {
          const origId = (orig as OfferPlan & { _id: string })._id
          if (!currentIds.has(origId)) {
            await api.delete(`/subscription-offers/${offer!._id}/plans/${origId}`)
          }
        }
        for (const plan of plans) {
          if (!plan._id) {
            await api.post(`/subscription-offers/${offer!._id}/plans`, plan)
          } else {
            await api.patch(`/subscription-offers/${offer!._id}/plans/${plan._id}`, plan)
          }
        }
      } else {
        const res = await api.post<{ _id: string }>('/subscription-offers', {
          name: name.trim(),
          description,
        })
        const offerId = res.data._id
        for (const plan of plans) {
          await api.post(`/subscription-offers/${offerId}/plans`, plan)
        }
      }

      qc.invalidateQueries({ queryKey: ['subscription-offers'] })
      onClose()
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
          ?? 'Erreur lors de la sauvegarde.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? `Modifier — ${offer!.name}` : 'Nouvelle offre'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {isEdit
                ? 'Modifiez les plans ou la description'
                : "Nommez l'offre et ajoutez vos plans de souscription"}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-4 space-y-5 flex-1">

          {/* Nom + description */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Nom de l'offre</label>
              {isEdit ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                  {offer!.name}
                </div>
              ) : (
                <div className="relative">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="ex: COACHING PRO, ECOM AFRICA…"
                    className={`${inp} w-full`}
                    autoComplete="off"
                  />
                  {/* Suggestions from existing products */}
                  {suggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-lg border border-gray-200 bg-gray-100 shadow-xl overflow-hidden">
                      {suggestions.map((s) => (
                        <button
                          key={s}
                          onClick={() => setName(s)}
                          className="w-full px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-200 hover:text-white transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className={lbl}>Description <span className="text-gray-600">(optionnel)</span></label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Notes internes…"
                className={`${inp} w-full`}
              />
            </div>
          </div>

          {/* Plans */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={`${lbl} mb-0`}>Plans de souscription</label>
              <button
                onClick={addPlan}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-300 transition-colors font-medium"
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter un plan
              </button>
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[1fr_60px_90px_80px_60px_28px] gap-2 mb-1">
              {['Nom', 'Mois', 'Prix', 'Devise', 'Part.j', ''].map((h, i) => (
                <span key={i} className="text-[10px] font-medium uppercase tracking-wider text-gray-600">{h}</span>
              ))}
            </div>

            {plans.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 py-6 text-center">
                <p className="text-xs text-gray-500">Cliquez "Ajouter un plan" pour commencer</p>
              </div>
            ) : (
              plans.map((plan, i) => (
                <PlanDraftRow
                  key={plan._id ?? `new-${i}`}
                  plan={plan}
                  index={i}
                  onChange={updatePlan}
                  onRemove={removePlan}
                />
              ))
            )}
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Annuler</Button>
          <Button loading={saving} onClick={handleSubmit}>
            {isEdit
              ? 'Enregistrer'
              : `Créer${plans.length > 0 ? ` (${plans.length} plan${plans.length > 1 ? 's' : ''})` : ''}`}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Offer card ────────────────────────────────────────────────────────────────

function OfferCard({ offer, onEdit }: { offer: Offer; onEdit: () => void }) {
  const qc = useQueryClient()
  const meta = productMeta(offer.name)
  const activePlans = (offer.plans ?? []).filter((p) => p.isActive)

  const toggleMutation = useMutation({
    mutationFn: () => api.patch(`/subscription-offers/${offer._id}`, { isActive: !offer.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscription-offers'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/subscription-offers/${offer._id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscription-offers'] }),
    onError: (err: unknown) => {
      alert((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur')
    },
  })

  return (
    <div className={`rounded-xl border-2 bg-white p-5 ${meta.border} ${!offer.isActive ? 'opacity-60' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${meta.badge}`}>
            {offer.name}
          </span>
          {offer.description && (
            <p className="mt-2 text-xs text-gray-500">{offer.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-white hover:bg-gray-200 transition-colors"
          >
            <Pencil className="h-3 w-3" />
            Modifier
          </button>
          <button
            onClick={() => toggleMutation.mutate()}
            disabled={toggleMutation.isPending}
            title={offer.isActive ? 'Désactiver' : 'Activer'}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
          >
            {offer.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
          <button
            onClick={() => { if (confirm(`Supprimer "${offer.name}" ?`)) deleteMutation.mutate() }}
            disabled={deleteMutation.isPending}
            title="Supprimer"
            className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Plans grid */}
      {offer.plans?.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 py-4 text-center">
          <p className="text-xs text-gray-500">Aucun plan — cliquez "Modifier" pour en ajouter</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {offer.plans?.map((plan) => {
            const pWithId = plan as OfferPlan & { _id: string }
            return (
              <div
                key={pWithId._id}
                className={`rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 ${!plan.isActive ? 'opacity-40' : ''}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-semibold text-gray-900">{plan.name}</span>
                  {!plan.isActive && (
                    <span className="text-[10px] text-gray-600 uppercase tracking-wide">inactif</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {plan.durationMonths} mois
                  </span>
                  {plan.price > 0 && (
                    <span className="font-medium text-gray-600">{formatAmount(plan.price, plan.currency)}</span>
                  )}
                  {plan.partialDueAfterDays !== 30 && (
                    <span className="text-gray-600">partiel {plan.partialDueAfterDays}j</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-3 text-[11px] text-gray-600">
        {activePlans?.length} plan{activePlans?.length !== 1 ? 's' : ''} actif{activePlans?.length !== 1 ? 's' : ''}
        {offer.plans?.length > activePlans?.length && ` · ${offer.plans?.length - activePlans?.length} inactif${offer.plans?.length - activePlans?.length > 1 ? 's' : ''}`}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

// ── Backfill panel ────────────────────────────────────────────────────────────

// interface BackfillPreview {
//   total: number
//   willCreate: number
//   alreadyHaveSubscription: number
//   noOfferMatch: number
//   breakdown: { offerName: string; planName: string; durationMonths: number; count: number }[]
// }
// 1
// function BackfillPanel() {
//   // const [preview, setPreview] = useState<BackfillPreview | null>(null)
//   // const [loading, setLoading] = useState(false)
//   // const [result, setResult] = useState<{ created: number; skipped: number; errors: number } | null>(null)

//   // const loadPreview = async () => {
//   //   setLoading(true)
//   //   try {
//   //     const res = await api.get<BackfillPreview>('/subscription-offers/backfill/preview')
//   //     setPreview(res.data)
//   //     setResult(null)
//   //   } finally {
//   //     setLoading(false)
//   //   }
//   // }

//   // const runBackfill = async () => {
//   //   if (!confirm(`Créer ${preview?.willCreate} souscription(s) à partir des paiements traités ?`)) return
//   //   setLoading(true)
//   //   try {
//   //     const res = await api.post<{ created: number; skipped: number; errors: number }>('/subscription-offers/backfill/run')
//   //     setResult(res.data)
//   //     setPreview(null)
//   //   } finally {
//   //     setLoading(false)
//   //   }
//   // }

//   // return (
//   //   <div className="mt-8 rounded-xl border border-gray-200 bg-white p-5">
//   //     <div className="flex items-center justify-between mb-4">
//   //       {/* <div>
//   //         <h2 className="text-sm font-semibold text-gray-800">Retracer les souscriptions</h2>
//   //         <p className="text-xs text-gray-500 mt-0.5">Crée des souscriptions à partir des paiements traités existants</p>
//   //       </div> */}
//   //       {/* <Button variant="secondary" onClick={loadPreview} loading={loading && !preview}>
//   //         <RefreshCw className="h-3.5 w-3.5" />
//   //         Analyser
//   //       </Button> */}
//   //     </div>

//   //     {/* {result && (
//   //       <div className="rounded-lg bg-emerald-50 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-300">
//   //         ✓ {result.created} souscription{result.created !== 1 ? 's' : ''} créée{result.created !== 1 ? 's' : ''} · {result.skipped} ignorées · {result.errors} erreur{result.errors !== 1 ? 's' : ''}
//   //       </div>
//   //     )}

//   //     {preview && (
//   //       <div className="space-y-3">
//   //         <div className="grid grid-cols-3 gap-3 text-center">
//   //           {[
//   //             { label: 'À créer', value: preview.willCreate, cls: 'text-indigo-600' },
//   //             { label: 'Déjà liées', value: preview.alreadyHaveSubscription, cls: 'text-gray-400' },
//   //             { label: 'Sans offre', value: preview.noOfferMatch, cls: 'text-amber-400' },
//   //           ].map((s) => (
//   //             <div key={s.label} className="rounded-lg border border-gray-200 bg-gray-50 py-3">
//   //               <p className={`text-xl font-bold tabular-nums ${s.cls}`}>{s.value}</p>
//   //               <p className="text-[11px] text-gray-500 mt-0.5">{s.label}</p>
//   //             </div>
//   //           ))}
//   //         </div>

//   //         {preview.breakdown.length > 0 && (
//   //           <div className="rounded-lg border border-gray-200 divide-y divide-gray-800 overflow-hidden">
//   //             {preview.breakdown.map((b) => (
//   //               <div key={`${b.offerName}::${b.planName}`} className="flex items-center justify-between px-3 py-2 text-xs">
//   //                 <span className="text-gray-600 font-medium">{b.offerName} — {b.planName}</span>
//   //                 <span className="text-gray-500">{b.durationMonths} mois · <span className="text-indigo-600 font-semibold">{b.count} paiement{b.count !== 1 ? 's' : ''}</span></span>
//   //               </div>
//   //             ))}
//   //           </div>
//   //         )}

//   //         {preview.willCreate > 0 && (
//   //           <Button onClick={runBackfill} loading={loading} className="w-full">
//   //             <Play className="h-3.5 w-3.5" />
//   //             Créer {preview.willCreate} souscription{preview.willCreate !== 1 ? 's' : ''}
//   //           </Button>
//   //         )}
//   //       </div> */}
      
//   //   </div>
//   // )
// }

// ── Page ──────────────────────────────────────────────────────────────────────

export function SubscriptionOffersPage() {
  const [modal, setModal] = useState<{ open: boolean; offer?: Offer }>({ open: false })

  const { data: offers = [], isLoading } = useQuery<Offer[]>({
    queryKey: ['subscription-offers'],
    queryFn: () => api.get<Offer[]>('/subscription-offers').then((r) => r.data),
  })

  const existingProducts = [...new Set(offers.map((o) => o.name).filter(Boolean))]

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/payments" className="text-gray-500 hover:text-gray-800 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Offres & Plans</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {offers.length} offre{offers.length !== 1 ? 's' : ''} · {offers.reduce((s, o) => s + (o.plans ?? []).filter((p) => p.isActive).length, 0)} plans actifs
            </p>
          </div>
        </div>
        <Button onClick={() => setModal({ open: true })}>
          <Plus className="h-4 w-4" />
          Nouvelle offre
        </Button>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-gray-500">Chargement…</div>
      ) : offers.length === 0 ? (
        <Card>
          <div className="py-16 text-center">
            <p className="text-sm text-gray-500 mb-3">Aucune offre — commencez par en créer une.</p>
            <Button onClick={() => setModal({ open: true })}>
              <Plus className="h-4 w-4" />
              Créer la première offre
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {offers.map((offer) => (
            <OfferCard
              key={offer._id}
              offer={offer}
              onEdit={() => setModal({ open: true, offer })}
            />
          ))}
        </div>
      )}

      {/* <BackfillPanel /> */}

      {modal.open && (
        <OfferModal
          offer={modal.offer}
          existingProducts={existingProducts}
          onClose={() => setModal({ open: false })}
        />
      )}
    </div>
  )
}
