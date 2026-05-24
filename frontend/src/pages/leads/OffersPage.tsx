import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Pencil, EyeOff, Eye, Tag, X, ChevronDown, ChevronUp } from 'lucide-react'
import api from '@/services/api'
import type { LeadOffer as Offer } from '@/types'
import { cn } from '@/lib/utils'

const TYPE_LABELS: Record<string, string> = {
  online: 'En ligne',
  presentiel: 'Présentiel',
  one_to_one: 'One-to-one',
  bootcamp: 'Bootcamp',
}

const TYPE_COLORS: Record<string, string> = {
  online: 'bg-blue-900/30 text-blue-300',
  presentiel: 'bg-green-900/30 text-green-300',
  one_to_one: 'bg-purple-900/30 text-purple-300',
  bootcamp: 'bg-orange-900/30 text-orange-300',
}

function OfferModal({
  offer,
  onClose,
}: {
  offer?: Offer
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: offer?.name ?? '',
    description: offer?.description ?? '',
    features: offer?.features ?? [] as string[],
    type: offer?.type ?? 'online',
    price: String(offer?.price ?? '0'),
    currency: offer?.currency ?? 'XOF',
    is_active: offer?.is_active ?? true,
    can_be_coupled: offer?.can_be_coupled ?? false,
  })
  const [newFeature, setNewFeature] = useState('')

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      offer
        ? api.patch(`/offers/${offer._id}`, { ...data, price: Number(data.price) })
        : api.post('/offers', { ...data, price: Number(data.price) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['offers'] }); onClose() },
  })

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  function addFeature() {
    const trimmed = newFeature.trim()
    if (!trimmed) return
    setForm((f) => ({ ...f, features: [...f.features, trimmed] }))
    setNewFeature('')
  }

  function removeFeature(i: number) {
    setForm((f) => ({ ...f, features: f.features.filter((_, idx) => idx !== i) }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl bg-gray-900 border border-gray-800 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-100 mb-5">
          {offer ? 'Modifier l\'offre' : 'Nouvelle offre'}
        </h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Nom *</label>
            <input
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
              placeholder="Formation EAP"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Description (pour les closers)</label>
            <textarea
              rows={3}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none resize-none"
              placeholder="Ce que contient cette offre, à qui elle s'adresse..."
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Points clés de l'offre</label>
            <div className="space-y-1.5">
              {form.features.map((f, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-gray-800/60 border border-gray-700 px-3 py-1.5">
                  <span className="flex-1 text-sm text-gray-300">{f}</span>
                  <button onClick={() => removeFeature(i)} className="text-gray-600 hover:text-red-400 transition-colors">
                    <X size={13} />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded-lg bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                  placeholder="Ex: Accès à vie à la formation"
                  value={newFeature}
                  onChange={(e) => setNewFeature(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFeature() } }}
                />
                <button
                  onClick={addFeature}
                  disabled={!newFeature.trim()}
                  className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs text-gray-200 disabled:opacity-40 transition-colors"
                >
                  + Ajouter
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Type</label>
              <select
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:outline-none"
                value={form.type}
                onChange={(e) => set('type', e.target.value)}
              >
                {Object.entries(TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Devise</label>
              <select
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:outline-none"
                value={form.currency}
                onChange={(e) => set('currency', e.target.value)}
              >
                <option value="XOF">XOF (F CFA)</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Prix</label>
            <input
              type="number"
              min="0"
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none"
              value={form.price}
              onChange={(e) => set('price', e.target.value)}
            />
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => set('is_active', e.target.checked)}
                className="rounded border-gray-600 bg-gray-800"
              />
              <span className="text-sm text-gray-300">Offre active</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.can_be_coupled}
                onChange={(e) => set('can_be_coupled', e.target.checked)}
                className="rounded border-gray-600 bg-gray-800"
              />
              <span className="text-sm text-gray-300">Couplable (ex: Afrispy)</span>
            </label>
          </div>
        </div>

        {mutation.error && (
          <p className="mt-3 text-xs text-red-400">
            {(mutation.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur'}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">
            Annuler
          </button>
          <button
            disabled={!form.name || mutation.isPending}
            onClick={() => mutation.mutate(form)}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm text-white font-medium disabled:opacity-50"
          >
            {mutation.isPending ? 'Sauvegarde...' : offer ? 'Modifier' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function OffersPage() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Offer | undefined>()
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: offers = [], isLoading } = useQuery({
    queryKey: ['offers'],
    queryFn: () => api.get('/offers').then((r) => r.data as Offer[]),
  })

  const toggleMutation = useMutation({
    mutationFn: (offer: Offer) => api.patch(`/offers/${offer._id}`, { is_active: !offer.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offers'] }),
  })

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {(modal === 'create' || modal === 'edit') && (
        <OfferModal
          offer={editing}
          onClose={() => { setModal(null); setEditing(undefined) }}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/leads" className="text-gray-500 hover:text-gray-300 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-100">Offres</h1>
            <p className="text-sm text-gray-500 mt-0.5">Gérer les offres commerciales</p>
          </div>
        </div>
        <button
          onClick={() => { setEditing(undefined); setModal('create') }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm text-white font-medium transition-colors"
        >
          <Plus size={16} /> Nouvelle offre
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-3">
          {offers.map((offer) => {
            const isExpanded = expanded === offer._id
            return (
              <div
                key={offer._id}
                className={cn(
                  'rounded-xl border transition-opacity',
                  offer.is_active ? 'bg-gray-900 border-gray-800' : 'bg-gray-950 border-gray-800/50 opacity-60',
                )}
              >
                <div className="p-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-gray-200">{offer.name}</p>
                      {offer.can_be_coupled && (
                        <span className="rounded-full bg-yellow-900/20 text-yellow-400 px-2 py-0.5 text-xs font-medium">
                          Couplable
                        </span>
                      )}
                      {!offer.is_active && (
                        <span className="rounded-full bg-gray-800 text-gray-500 px-2 py-0.5 text-xs">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', TYPE_COLORS[offer.type])}>
                        {TYPE_LABELS[offer.type]}
                      </span>
                      {offer.features.length > 0 && (
                        <span className="text-xs text-gray-500">{offer.features.length} point(s) clé(s)</span>
                      )}
                    </div>
                    {offer.description && (
                      <p className="mt-1.5 text-xs text-gray-500 line-clamp-1">{offer.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-base font-bold text-gray-100">
                        {offer.price > 0 ? offer.price.toLocaleString() : '—'}
                      </p>
                      <p className="text-xs text-gray-500">{offer.currency}</p>
                    </div>

                    <div className="flex items-center gap-1">
                      {(offer.description || offer.features.length > 0) && (
                        <button
                          onClick={() => setExpanded(isExpanded ? null : offer._id)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
                          title="Voir le détail"
                        >
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      )}
                      <button
                        onClick={() => { setEditing(offer); setModal('edit') }}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => toggleMutation.mutate(offer)}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
                        title={offer.is_active ? 'Désactiver' : 'Activer'}
                      >
                        {offer.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                </div>

                {isExpanded && (offer.description || offer.features.length > 0) && (
                  <div className="border-t border-gray-800 px-4 pb-4 pt-3">
                    {offer.description && (
                      <p className="text-sm text-gray-400 mb-3">{offer.description}</p>
                    )}
                    {offer.features.length > 0 && (
                      <ul className="space-y-1.5">
                        {offer.features.map((f, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                            <span className="mt-0.5 h-4 w-4 rounded-full bg-indigo-900/40 text-indigo-400 flex items-center justify-center text-[10px] shrink-0">✓</span>
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {offers.length === 0 && (
            <div className="rounded-xl bg-gray-900 border border-gray-800 py-16 text-center">
              <Tag size={32} className="mx-auto text-gray-700 mb-3" />
              <p className="text-gray-500">Aucune offre. Créez la première.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
