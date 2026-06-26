import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Activity, RefreshCw, Trash2, ExternalLink, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import api from '@/services/api'
import { AddAccountModal } from './components/AddAccountModal'
import { PlatformBadge } from './components/PlatformBadge'
import type { TrackedAccount } from './types'

export function ContentTrackingPage() {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)

  const { data: accounts = [], isLoading } = useQuery<TrackedAccount[]>({
    queryKey: ['tracked-accounts'],
    queryFn: () => api.get('/content/tracking/accounts').then((r) => r.data),
  })

  const scrapeMut = useMutation({
    mutationFn: (id: string) => api.post(`/content/tracking/accounts/${id}/scrape-now`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tracked-accounts'] }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/content/tracking/accounts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tracked-accounts'] }),
  })

  const own = accounts.filter((a) => a.type === 'own')
  const competitors = accounts.filter((a) => a.type === 'competitor')

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-violet-600">
            <Activity className="h-3.5 w-3.5" />
            Suivi de contenu
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Comptes trackés</h1>
          <p className="mt-1 text-sm text-gray-500">
            Suis l'évolution quotidienne de tes vidéos et reçois un rapport IA chaque matin.
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" />
          Ajouter un compte
        </Button>
      </div>

      {isLoading && (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-sm text-gray-400">
          Chargement…
        </div>
      )}

      {!isLoading && accounts.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
          <Activity className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-700">Aucun compte tracké pour le moment.</p>
          <p className="mt-1 text-xs text-gray-400">Ajoute ton compte YouTube ou TikTok pour commencer.</p>
        </div>
      )}

      {own.length > 0 && (
        <Section title="Mes comptes" count={own.length}>
          <AccountGrid
            accounts={own}
            onScrape={(id) => scrapeMut.mutate(id)}
            onDelete={(id) => {
              if (window.confirm('Supprimer ce compte et tout son historique ?')) deleteMut.mutate(id)
            }}
            scrapingId={scrapeMut.isPending ? scrapeMut.variables : undefined}
          />
        </Section>
      )}

      {competitors.length > 0 && (
        <Section title="Concurrents" count={competitors.length}>
          <AccountGrid
            accounts={competitors}
            onScrape={(id) => scrapeMut.mutate(id)}
            onDelete={(id) => {
              if (window.confirm('Supprimer ce compte ?')) deleteMut.mutate(id)
            }}
            scrapingId={scrapeMut.isPending ? scrapeMut.variables : undefined}
          />
        </Section>
      )}

      <AddAccountModal open={showAdd} onClose={() => setShowAdd(false)} />
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-700">{title}</h2>
        <span className="text-xs text-gray-400">({count})</span>
      </div>
      {children}
    </section>
  )
}

function AccountGrid({
  accounts,
  onScrape,
  onDelete,
  scrapingId,
}: {
  accounts: TrackedAccount[]
  onScrape: (id: string) => void
  onDelete: (id: string) => void
  scrapingId?: string
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {accounts.map((a) => (
        <div
          key={a._id}
          className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-violet-300"
        >
          <div className="mb-3 flex items-start justify-between">
            <PlatformBadge platform={a.platform} />
            <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={() => onScrape(a._id)}
                disabled={scrapingId === a._id}
                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-violet-600 disabled:opacity-50 cursor-pointer"
                title="Scraper maintenant"
              >
                <RefreshCw className={scrapingId === a._id ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
              </button>
              <a
                href={a.channel_url}
                target="_blank"
                rel="noreferrer"
                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                title="Ouvrir le compte"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <button
                onClick={() => onDelete(a._id)}
                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600 cursor-pointer"
                title="Supprimer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <Link to={`/content/tracking/${a._id}`} className="block">
            <h3 className="truncate text-base font-semibold text-gray-900">{a.name}</h3>
            <p className="mt-0.5 truncate text-xs text-gray-400">@{a.handle}</p>

            <div className="mt-4 flex items-center justify-between text-xs">
              <span className="text-gray-400">
                {a.last_scraped_at
                  ? `Scrapé ${new Date(a.last_scraped_at).toLocaleDateString('fr-FR')}`
                  : 'Pas encore scrapé'}
              </span>
              {!a.is_active && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-500">Inactif</span>}
            </div>

            {a.last_scrape_error && (
              <div className="mt-3 flex items-start gap-1.5 rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                <span className="line-clamp-2">{a.last_scrape_error}</span>
              </div>
            )}
          </Link>
        </div>
      ))}
    </div>
  )
}
