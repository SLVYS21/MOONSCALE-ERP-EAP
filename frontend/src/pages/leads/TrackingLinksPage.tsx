import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Copy, ExternalLink, Trash2, Pencil, MousePointer, MessageCircle, Bot, Link2 } from 'lucide-react'
import api from '@/services/api'
import type { WhatsAppTrackingLink } from '@/types'
import { cn } from '@/lib/utils'

type LinkType = 'whatsapp' | 'typebot' | 'link'

const TYPE_CONFIG: Record<LinkType, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, color: 'text-green-400', bg: 'bg-green-900/20' },
  typebot:  { label: 'Typebot',  icon: Bot,           color: 'text-violet-400', bg: 'bg-violet-900/20' },
  link:     { label: 'Lien',     icon: Link2,          color: 'text-blue-400',  bg: 'bg-blue-900/20' },
}

function LinkModal({ link, onClose }: { link?: WhatsAppTrackingLink; onClose: () => void }) {
  const qc = useQueryClient()
  const [type, setType] = useState<LinkType>(link?.type ?? 'whatsapp')
  const [form, setForm] = useState({
    src: link?.src ?? '',
    description: link?.description ?? '',
    whatsapp_number: link?.whatsapp_number ?? '',
    target_url: link?.target_url ?? '',
    utm_source: link?.utm_source ?? '',
    utm_campaign: link?.utm_campaign ?? '',
  })

  const mutation = useMutation({
    mutationFn: (data: typeof form & { type: LinkType }) =>
      link
        ? api.patch(`/leads/tracking-links/${link._id}`, data)
        : api.post('/leads/tracking-links', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tracking-links'] }); onClose() },
  })

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const isValid = form.src && (
    (type === 'whatsapp' && form.whatsapp_number) ||
    (type !== 'whatsapp' && form.target_url)
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl bg-gray-900 border border-gray-800 p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-100 mb-5">
          {link ? 'Modifier le lien' : 'Nouveau lien tracké'}
        </h2>

        <div className="space-y-3">
          {/* Type selector */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Type de lien</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(TYPE_CONFIG) as [LinkType, typeof TYPE_CONFIG[LinkType]][]).map(([t, cfg]) => {
                const Icon = cfg.icon
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    disabled={!!link}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border p-2.5 text-xs font-medium transition-colors',
                      type === t
                        ? `${cfg.bg} border-current ${cfg.color}`
                        : 'border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-400',
                    )}
                  >
                    <Icon size={16} />
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* src */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Identifiant unique (src) *</label>
            <input
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none font-mono"
              placeholder={type === 'whatsapp' ? 'tiktok_bio_mai2026' : type === 'typebot' ? 'typebot_formation_mai2026' : 'lien_youtube_mai2026'}
              value={form.src}
              onChange={(e) => set('src', e.target.value.replace(/\s+/g, '_').toLowerCase())}
              disabled={!!link}
            />
            <p className="mt-1 text-xs text-gray-600">URL-safe, minuscules, pas d'espaces.</p>
          </div>

          {/* description */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Description</label>
            <input
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
              placeholder="Lien bio TikTok — mai 2026"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          {/* WhatsApp specific */}
          {type === 'whatsapp' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Numéro WhatsApp *</label>
              <input
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                placeholder="+22900000000"
                value={form.whatsapp_number}
                onChange={(e) => set('whatsapp_number', e.target.value)}
              />
            </div>
          )}

          {/* Typebot / link specific */}
          {type !== 'whatsapp' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">
                {type === 'typebot' ? 'URL du formulaire Typebot *' : 'URL de destination *'}
              </label>
              <input
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                placeholder={type === 'typebot' ? 'https://type.example.com/bot/form-nom' : 'https://example.com/page'}
                value={form.target_url}
                onChange={(e) => set('target_url', e.target.value)}
              />
            </div>
          )}

          {/* UTM parameters */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-400 mb-1">UTM Source</label>
              <input
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                placeholder="tiktok"
                value={form.utm_source}
                onChange={(e) => set('utm_source', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">UTM Campaign</label>
              <input
                className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                placeholder="formation_mai2026"
                value={form.utm_campaign}
                onChange={(e) => set('utm_campaign', e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-gray-600">Les paramètres UTM sont injectés automatiquement dans l'URL de destination.</p>
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
            disabled={!isValid || mutation.isPending}
            onClick={() => mutation.mutate({ ...form, type })}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm text-white font-medium disabled:opacity-50"
          >
            {mutation.isPending ? 'Sauvegarde...' : link ? 'Modifier' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function TrackingLinksPage() {
  const qc = useQueryClient()
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<WhatsAppTrackingLink | undefined>()
  const [copied, setCopied] = useState<string | null>(null)

  const { data: links = [], isLoading } = useQuery({
    queryKey: ['tracking-links'],
    queryFn: () => api.get('/leads/tracking-links').then((r) => r.data as WhatsAppTrackingLink[]),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/leads/tracking-links/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tracking-links'] }),
  })

  const baseUrl = window.location.origin

  function copyLink(src: string) {
    navigator.clipboard.writeText(`${baseUrl}/api/r?src=${src}`)
    setCopied(src)
    setTimeout(() => setCopied(null), 2000)
  }

  function linkDestination(link: WhatsAppTrackingLink) {
    if (link.type === 'whatsapp') return `wa.me/${(link.whatsapp_number ?? '').replace(/\D/g, '')}`
    const url = link.target_url ?? ''
    const params: string[] = []
    if (link.utm_source) params.push(`utm_source=${link.utm_source}`)
    if (link.utm_campaign) params.push(`utm_campaign=${link.utm_campaign}`)
    if (params.length === 0) return url
    return `${url}${url.includes('?') ? '&' : '?'}${params.join('&')}`
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {(modal === 'create' || modal === 'edit') && (
        <LinkModal
          link={editing}
          onClose={() => { setModal(null); setEditing(undefined) }}
        />
      )}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/leads" className="text-gray-500 hover:text-gray-300">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-100">Liens trackés</h1>
            <p className="text-sm text-gray-500 mt-0.5">WhatsApp, Typebot, liens génériques — clics tracés</p>
          </div>
        </div>
        <button
          onClick={() => { setEditing(undefined); setModal('create') }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm text-white font-medium"
        >
          <Plus size={16} /> Nouveau lien
        </button>
      </div>

      <div className="rounded-xl bg-indigo-950/20 border border-indigo-900/30 p-3 mb-5 text-xs text-indigo-300">
        Format : <code className="bg-indigo-950/40 px-1 rounded">{baseUrl}/api/r?src=IDENTIFIANT</code> — UTM params injectés automatiquement à la redirection.
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((link) => {
            const cfg = TYPE_CONFIG[link.type ?? 'whatsapp']
            const Icon = cfg.icon
            return (
              <div key={link._id} className="rounded-xl bg-gray-900 border border-gray-800 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', cfg.bg, cfg.color)}>
                        <Icon size={11} /> {cfg.label}
                      </span>
                      <p className="font-medium text-gray-200">{link.description || link.src}</p>
                      <div className="flex items-center gap-1 text-xs text-green-400">
                        <MousePointer size={11} />
                        <span>{link.click_count} clics</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">→ {linkDestination(link)}</p>
                    {(link.utm_source || link.utm_campaign) && (
                      <p className="text-xs text-gray-600 mt-0.5">
                        UTM: {[link.utm_source, link.utm_campaign].filter(Boolean).join(' / ')}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <code className="text-xs text-indigo-400 bg-gray-800 rounded px-2 py-0.5 truncate max-w-xs">
                        {baseUrl}/api/r?src={link.src}
                      </code>
                      <button
                        onClick={() => copyLink(link.src)}
                        className="text-gray-500 hover:text-gray-300 transition-colors"
                        title="Copier le lien"
                      >
                        {copied === link.src ? (
                          <span className="text-xs text-green-400">Copié !</span>
                        ) : (
                          <Copy size={13} />
                        )}
                      </button>
                      <a
                        href={`${baseUrl}/api/r?src=${link.src}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-500 hover:text-gray-300"
                        title="Tester le lien"
                      >
                        <ExternalLink size={13} />
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => { setEditing(link); setModal('edit') }}
                      className="p-1.5 text-gray-500 hover:text-gray-300"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => { if (confirm('Supprimer ce lien ?')) deleteMutation.mutate(link._id) }}
                      className="p-1.5 text-gray-500 hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          {links.length === 0 && (
            <div className="rounded-xl bg-gray-900 border border-gray-800 py-16 text-center">
              <MousePointer size={32} className="mx-auto text-gray-700 mb-3" />
              <p className="text-gray-500">Aucun lien tracké. Créez le premier.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
