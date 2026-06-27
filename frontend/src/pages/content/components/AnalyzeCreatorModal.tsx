import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Search, Sparkles, ExternalLink, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { CinematicLoader, type CinematicStep } from '@/components/ui/CinematicLoader'
import { cn } from '@/lib/utils'
import api from '@/services/api'
import type { CreatorAnalysis } from '../types'

const ANALYZE_STEPS_TIKTOK: CinematicStep[] = [
  { label: 'Connexion à TikTok', description: 'Ouverture du profil et lecture de la bio.', duration: 3 },
  { label: 'Lecture des dernières vidéos', description: 'Récupération du flux récent du créateur.', duration: 5 },
  { label: 'Capture des métriques', description: 'Vues, likes, commentaires, partages par vidéo.', duration: 4 },
  { label: "Analyse IA des patterns", description: 'Hooks récurrents, formats, angle, gaps à exploiter.', duration: 12 },
  { label: 'Mise en forme du rapport', description: 'Génération des idées inspirées + score d\'opportunité.', duration: 2 },
]

const ANALYZE_STEPS_YOUTUBE: CinematicStep[] = [
  { label: 'Connexion à YouTube', description: 'Ouverture du profil et lecture du channel.', duration: 3 },
  { label: 'Lecture des dernières vidéos', description: 'Récupération de la liste via yt-dlp.', duration: 5 },
  { label: 'Capture des métriques par vidéo', description: 'Extraction des vues, likes, commentaires (~5s/vidéo).', duration: 20 },
  { label: "Analyse IA des patterns", description: 'Hooks récurrents, formats, angle, gaps à exploiter.', duration: 12 },
  { label: 'Mise en forme du rapport', description: 'Génération des idées inspirées + score d\'opportunité.', duration: 2 },
]

export function AnalyzeCreatorModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [platform, setPlatform] = useState<'youtube' | 'tiktok'>('youtube')
  const [handle, setHandle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [activeAnalysis, setActiveAnalysis] = useState<CreatorAnalysis | null>(null)
  // Snapshot of the platform used at submission time, so the loader steps stay
  // consistent even if the user toggles the select mid-analysis.
  const [pendingPlatform, setPendingPlatform] = useState<'youtube' | 'tiktok'>('youtube')

  const { data: history = [] } = useQuery<CreatorAnalysis[]>({
    queryKey: ['creator-analyses'],
    queryFn: () => api.get('/content/tracking/creator-analyses?limit=20').then((r) => r.data),
  })

  const analyzeMut = useMutation({
    mutationFn: () =>
      api
        .post<CreatorAnalysis>('/content/tracking/analyze-creator', { platform, handle: handle.trim().replace(/^@/, '') })
        .then((r) => r.data),
    onSuccess: (data) => {
      setActiveAnalysis(data)
      qc.invalidateQueries({ queryKey: ['creator-analyses'] })
      setError(null)
    },
    onError: (e: { response?: { data?: { message?: string } }; message?: string }) =>
      setError(e.response?.data?.message ?? e.message ?? 'Erreur'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-600" />
            <h2 className="text-base font-semibold text-gray-900">Analyser un créateur</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <aside className="hidden w-56 shrink-0 border-r border-gray-200 bg-gray-50 md:block">
            <div className="border-b border-gray-200 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
              Analyses récentes
            </div>
            <div className="max-h-full space-y-0.5 overflow-y-auto p-2">
              {history.length === 0 && <p className="px-2 py-3 text-xs text-gray-400">Aucune analyse</p>}
              {history.map((h) => (
                <button
                  key={h._id}
                  onClick={() => setActiveAnalysis(h)}
                  className={cn(
                    'block w-full rounded-lg border border-transparent px-2.5 py-2 text-left text-xs transition-colors hover:bg-white',
                    activeAnalysis?._id === h._id && 'border-violet-200 bg-white',
                  )}
                >
                  <p className="truncate font-semibold text-gray-900">@{h.handle}</p>
                  <p className="truncate text-[10px] text-gray-500">
                    {h.platform} · {new Date(h.createdAt).toLocaleDateString('fr-FR')}
                  </p>
                </button>
              ))}
            </div>
          </aside>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[120px_1fr_auto]">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-700">Plateforme</label>
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as 'youtube' | 'tiktok')}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                >
                  <option value="youtube">YouTube</option>
                  <option value="tiktok">TikTok</option>
                </select>
              </div>
              <Input
                label="Handle (sans @)"
                placeholder="ex: moonscale"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
              />
              <div className="flex items-end">
                <Button
                  onClick={() => {
                    setPendingPlatform(platform)
                    analyzeMut.mutate()
                  }}
                  loading={analyzeMut.isPending}
                  disabled={!handle.trim()}
                >
                  <Search className="h-4 w-4" />
                  Analyser
                </Button>
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            {analyzeMut.isPending && (
              <CinematicLoader
                key={`${pendingPlatform}-${analyzeMut.submittedAt ?? 0}`}
                steps={pendingPlatform === 'tiktok' ? ANALYZE_STEPS_TIKTOK : ANALYZE_STEPS_YOUTUBE}
                done={false}
                headline={`Analyse de @${handle.replace(/^@/, '')} sur ${pendingPlatform}`}
                accent="violet"
              />
            )}

            {!analyzeMut.isPending && activeAnalysis && <AnalysisView analysis={activeAnalysis} />}

            {!analyzeMut.isPending && !activeAnalysis && (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-12 text-center text-sm text-gray-500">
                Entre un handle YouTube ou TikTok et clique "Analyser" pour générer un rapport IA actionnable.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AnalysisView({ analysis }: { analysis: CreatorAnalysis }) {
  const topVideos = [...analysis.videos].sort((a, b) => b.views - a.views).slice(0, 5)

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${analysis.platform === 'youtube' ? 'text-red-600' : 'text-violet-600'}`}>
              {analysis.platform}
            </span>
            <h3 className="text-lg font-bold text-gray-900">@{analysis.handle}</h3>
            <a href={analysis.channel_url} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-violet-600">
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
          <p className="mt-0.5 text-[10px] uppercase tracking-wider text-gray-400">
            {new Date(analysis.createdAt).toLocaleString('fr-FR')} · {analysis.llm_provider}/{analysis.llm_model}
          </p>
        </div>
      </div>

      {analysis.summary && (
        <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-4 text-sm leading-relaxed text-gray-700 whitespace-pre-line">
          {analysis.summary}
        </div>
      )}

      <Grid2>
        <Section title="Ton" content={analysis.tone} />
        <Section title="Angle unique" content={analysis.angle} />
      </Grid2>

      <Grid2>
        <ListBlock icon="✓" title="Hooks récurrents" items={analysis.recurring_hooks} accent="text-emerald-600" />
        <ListBlock icon="•" title="Formats récurrents" items={analysis.recurring_formats} accent="text-blue-600" />
      </Grid2>

      <ListBlock icon="✓" title="Ce qui marche pour eux" items={analysis.what_works_for_them} accent="text-emerald-600" />

      <ListBlock icon="!" title="Gaps qu'on peut exploiter" items={analysis.gaps_to_exploit} accent="text-amber-600" />

      <ListBlock icon="✦" title="Idées de vidéos inspirées" items={analysis.idea_seeds} accent="text-violet-600" />

      {topVideos.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-700">Top vidéos par vues</h4>
          <div className="space-y-1.5">
            {topVideos.map((v) => (
              <a
                key={v.platform_video_id}
                href={v.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-2 transition-colors hover:border-violet-300"
              >
                <img src={v.thumbnail_url} alt="" className="h-10 w-16 shrink-0 rounded object-cover" onError={(e) => ((e.target as HTMLImageElement).style.opacity = '0.3')} />
                <p className="flex-1 truncate text-sm text-gray-800">{v.title}</p>
                <span className="flex shrink-0 items-center gap-1 text-xs text-gray-500">
                  <TrendingUp className="h-3 w-3" />
                  {v.views.toLocaleString('fr-FR')}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, content }: { title: string; content: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{title}</p>
      <p className="text-sm text-gray-800">{content || '—'}</p>
    </div>
  )
}

function ListBlock({ icon, title, items, accent }: { icon: string; title: string; items: string[]; accent: string }) {
  if (items.length === 0) return null
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-700">{title}</h4>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
            <span className={`${accent} font-bold`}>{icon}</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{children}</div>
}
