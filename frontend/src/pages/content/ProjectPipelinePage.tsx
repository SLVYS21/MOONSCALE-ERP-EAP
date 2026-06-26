import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Sparkles, Wand2, Image as ImageIcon, Clock, CheckSquare,
  ExternalLink, Plus, X, Trash2, ThumbsUp, AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import api from '@/services/api'
import { PipelineStage } from './components/PipelineStage'
import { ScriptChat } from './components/ScriptChat'
import { STATUS_CONFIG, type VideoProject } from './types'

export function ProjectPipelinePage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data: project, isLoading } = useQuery<VideoProject>({
    queryKey: ['content-project', id],
    queryFn: () => api.get(`/content/projects/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  const updateMut = useMutation({
    mutationFn: (patch: Partial<VideoProject>) => api.patch(`/content/projects/${id}`, patch).then((r) => r.data),
    onSuccess: (data) => qc.setQueryData(['content-project', id], data),
  })

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/content/projects/${id}`),
    onSuccess: () => navigate('/content'),
  })

  if (isLoading || !project) {
    return <div className="mx-auto max-w-4xl px-6 py-8 text-sm text-gray-400">Chargement…</div>
  }

  const status = STATUS_CONFIG[project.status]

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link to="/content" className="mb-4 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-violet-600">
        <ArrowLeft className="h-3.5 w-3.5" />
        Dashboard contenu
      </Link>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex-1">
          <span className={cn('mb-2 inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', status.bg, status.color)}>
            {status.label}
          </span>
          <h1 className="text-2xl font-bold text-gray-900">{project.title}</h1>
          <p className="mt-1 text-xs text-gray-400">
            {project.format} · {project.duration_type === 'court' ? 'Format court' : 'Format long'} · créé le {new Date(project.createdAt).toLocaleDateString('fr-FR')}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <select
            value={project.status}
            onChange={(e) => updateMut.mutate({ status: e.target.value as VideoProject['status'] })}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-500 focus:outline-none"
          >
            <option value="idee">Idée</option>
            <option value="script">Script</option>
            <option value="tournage">Tournage</option>
            <option value="montage">Montage</option>
            <option value="publie">Publié</option>
          </select>
          <button
            onClick={() => {
              if (window.confirm('Supprimer ce projet ?')) deleteMut.mutate()
            }}
            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Pipeline stages */}
      <div className="space-y-3">
        <Stage1Idea project={project} onChange={(patch) => updateMut.mutate(patch)} />
        <Stage2References project={project} />
        <Stage3Script project={project} />
        <Stage4Thumbnails project={project} />
        <Stage5PublishTime project={project} />
        <Stage6Checklist project={project} />
      </div>
    </div>
  )
}

// ── Stage 1: Idée & contexte ─────────────────────────────────────────────────

function Stage1Idea({ project, onChange }: { project: VideoProject; onChange: (patch: Partial<VideoProject>) => void }) {
  const [brainDump, setBrainDump] = useState(project.brain_dump)
  const [notes, setNotes] = useState(project.notes)

  const completed = !!project.brain_dump || !!project.notes

  return (
    <PipelineStage
      index={1}
      title="Idée & contexte"
      subtitle="L'angle, le contexte, les points clés à transmettre."
      completed={completed}
      defaultOpen={!completed}
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Brainstorm (idée brute)</label>
          <textarea
            value={brainDump}
            onChange={(e) => setBrainDump(e.target.value)}
            onBlur={() => brainDump !== project.brain_dump && onChange({ brain_dump: brainDump })}
            rows={3}
            placeholder="Pourquoi cette vidéo ? Pour qui ? Quel angle ?"
            className="w-full resize-none rounded-lg border border-gray-200 bg-white p-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Notes additionnelles</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== project.notes && onChange({ notes })}
            rows={2}
            className="w-full resize-none rounded-lg border border-gray-200 bg-white p-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </div>
      </div>
    </PipelineStage>
  )
}

// ── Stage 2: Vidéos de référence ─────────────────────────────────────────────

function Stage2References({ project }: { project: VideoProject }) {
  const qc = useQueryClient()
  const [urls, setUrls] = useState<string[]>([''])
  const [error, setError] = useState<string | null>(null)

  const analyzeMut = useMutation({
    mutationFn: () =>
      api
        .post<VideoProject>(`/content/projects/${project._id}/analyze-references`, {
          video_urls: urls.map((u) => u.trim()).filter(Boolean),
        })
        .then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(['content-project', project._id], data)
      setUrls([''])
      setError(null)
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setError(e.response?.data?.message ?? 'Erreur'),
  })

  const completed = project.reference_videos.length > 0

  return (
    <PipelineStage
      index={2}
      title="Vidéos de référence"
      subtitle="Colle 1-5 URLs YouTube — l'IA récupère les transcripts et identifie ce qu'on garde / ce qu'on laisse."
      completed={completed}
      defaultOpen={!completed}
    >
      <div className="space-y-3">
        {urls.map((u, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              placeholder="https://www.youtube.com/watch?v=…"
              value={u}
              onChange={(e) => setUrls((arr) => arr.map((v, idx) => (idx === i ? e.target.value : v)))}
            />
            <button
              type="button"
              onClick={() => setUrls((arr) => (arr.length === 1 ? [''] : arr.filter((_, idx) => idx !== i)))}
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <div className="flex justify-between">
          <Button variant="ghost" size="sm" onClick={() => setUrls((arr) => [...arr, ''])} disabled={urls.length >= 5}>
            <Plus className="h-3 w-3" />
            Ajouter une URL
          </Button>
          <Button
            onClick={() => analyzeMut.mutate()}
            loading={analyzeMut.isPending}
            disabled={!urls.some((u) => u.trim())}
          >
            <Sparkles className="h-4 w-4" />
            Analyser
          </Button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}

        {project.reference_videos.length > 0 && (
          <div className="mt-4 space-y-3">
            {project.reference_videos.map((ref, i) => (
              <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="line-clamp-1 text-sm font-semibold text-gray-900">{ref.title}</p>
                  <a href={ref.url} target="_blank" rel="noreferrer" className="shrink-0 text-gray-400 hover:text-violet-600">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
                {ref.why_it_works && (
                  <p className="mb-3 text-xs italic text-gray-600">"{ref.why_it_works}"</p>
                )}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">À reprendre</p>
                    <ul className="space-y-1 text-xs text-gray-700">
                      {ref.keep_points.map((k, j) => (
                        <li key={j} className="flex gap-1.5">
                          <ThumbsUp className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                          <span>{k}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700">À laisser</p>
                    <ul className="space-y-1 text-xs text-gray-700">
                      {ref.discard_points.map((d, j) => (
                        <li key={j} className="flex gap-1.5">
                          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PipelineStage>
  )
}

// ── Stage 3: Script ─────────────────────────────────────────────────────────

function Stage3Script({ project }: { project: VideoProject }) {
  const qc = useQueryClient()

  const analyzeMut = useMutation({
    mutationFn: () => api.post<VideoProject>(`/content/projects/${project._id}/analyze`).then((r) => r.data),
    onSuccess: (data) => qc.setQueryData(['content-project', project._id], data),
  })

  const generateMut = useMutation({
    mutationFn: () => api.post<{ script: string }>(`/content/projects/${project._id}/generate-script`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content-project', project._id] }),
  })

  const completed = !!project.full_script
  const hasAnalysis = !!project.analysis

  return (
    <PipelineStage
      index={3}
      title="Script"
      subtitle="Analyse → génération → corrections itératives."
      completed={completed}
      defaultOpen={!completed}
    >
      <div className="space-y-4">
        {/* Hooks */}
        {project.hooks.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-700">Accroches générées</p>
            <div className="space-y-1.5">
              {project.hooks.map((h, i) => (
                <button
                  key={i}
                  onClick={() => api.post(`/content/projects/${project._id}/select-hook`, { hook_index: i }).then(() => qc.invalidateQueries({ queryKey: ['content-project', project._id] }))}
                  className={cn(
                    'block w-full rounded-lg border p-2.5 text-left text-sm transition-colors',
                    h.selected
                      ? 'border-violet-500 bg-violet-50 text-violet-900'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
                  )}
                >
                  "{h.text}"
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => analyzeMut.mutate()} loading={analyzeMut.isPending}>
            <Wand2 className="h-4 w-4" />
            {hasAnalysis ? 'Re-analyser' : 'Analyser (hooks + plan)'}
          </Button>
          <Button onClick={() => generateMut.mutate()} loading={generateMut.isPending} disabled={!hasAnalysis}>
            <Sparkles className="h-4 w-4" />
            {project.full_script ? 'Regénérer le script' : 'Générer le script'}
          </Button>
        </div>

        {project.script_outline && (
          <details className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-gray-600">
              Plan du script
            </summary>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-gray-700">{project.script_outline}</pre>
          </details>
        )}

        {project.full_script && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-700">Script actuel</p>
            <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm leading-relaxed text-gray-800 whitespace-pre-line max-h-96 overflow-y-auto">
              {project.full_script}
            </div>
          </div>
        )}

        {project.full_script && <ScriptChat project={project} />}
      </div>
    </PipelineStage>
  )
}

// ── Stage 4: Miniatures ──────────────────────────────────────────────────────

function Stage4Thumbnails({ project }: { project: VideoProject }) {
  const qc = useQueryClient()
  const [generatingIdx, setGeneratingIdx] = useState<number | null>(null)

  const generateMut = useMutation({
    mutationFn: ({ description, index }: { description: string; index: number }) =>
      api.post(`/content/projects/${project._id}/generate-thumbnail`, {
        description,
        thumbnail_index: index,
      }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content-project', project._id] }),
  })

  const completed = project.generated_thumbnails.length > 0

  return (
    <PipelineStage
      index={4}
      title="Miniatures"
      subtitle="3 propositions générées par Gemini."
      completed={completed}
    >
      {project.thumbnail_descriptions.length === 0 ? (
        <p className="text-xs text-gray-500">Lance "Analyser" à l'étape 3 pour obtenir des descriptions de miniatures.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {project.thumbnail_descriptions.map((desc, i) => {
            const generated = project.generated_thumbnails[i]
            return (
              <div key={i} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="mb-2 aspect-video overflow-hidden rounded bg-gray-100">
                  {generated ? (
                    <img src={`data:image/png;base64,${generated}`} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-gray-300">
                      <ImageIcon className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <p className="line-clamp-2 text-xs text-gray-600">{desc}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2 w-full"
                  onClick={() => {
                    setGeneratingIdx(i)
                    generateMut.mutate({ description: desc, index: i }, { onSettled: () => setGeneratingIdx(null) })
                  }}
                  loading={generatingIdx === i}
                >
                  {generated ? 'Regénérer' : 'Générer'}
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </PipelineStage>
  )
}

// ── Stage 5: Heure de publication ────────────────────────────────────────────

function Stage5PublishTime({ project }: { project: VideoProject }) {
  const qc = useQueryClient()

  const suggestMut = useMutation({
    mutationFn: () => api.post<VideoProject>(`/content/projects/${project._id}/suggest-publish-time`).then((r) => r.data),
    onSuccess: (data) => qc.setQueryData(['content-project', project._id], data),
  })

  const completed = !!project.publish_time_suggestion

  return (
    <PipelineStage
      index={5}
      title="Heure de publication"
      subtitle="Basée sur les perfs historiques de tes comptes."
      completed={completed}
    >
      <div className="space-y-3">
        <Button onClick={() => suggestMut.mutate()} loading={suggestMut.isPending}>
          <Clock className="h-4 w-4" />
          {project.publish_time_suggestion ? 'Re-calculer' : 'Suggérer une heure'}
        </Button>

        {project.publish_time_suggestion && (
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-4">
            <p className="text-base font-bold text-violet-900">{project.publish_time_suggestion}</p>
            {project.publish_time_rationale && (
              <p className="mt-1 text-xs leading-relaxed text-violet-700">{project.publish_time_rationale}</p>
            )}
          </div>
        )}
      </div>
    </PipelineStage>
  )
}

// ── Stage 6: Checklist ───────────────────────────────────────────────────────

function Stage6Checklist({ project }: { project: VideoProject }) {
  const qc = useQueryClient()

  const toggleMut = useMutation({
    mutationFn: (itemId: string) =>
      api.post(`/content/projects/${project._id}/checklist/${itemId}/toggle`).then((r) => r.data),
    onSuccess: (data) => qc.setQueryData(['content-project', project._id], data),
  })

  const done = project.checklist.filter((c) => c.done).length
  const total = project.checklist.length
  const completed = done === total && total > 0

  return (
    <PipelineStage
      index={6}
      title={`Checklist (${done}/${total})`}
      subtitle="Tournage, montage, publication."
      completed={completed}
    >
      <ul className="space-y-1.5">
        {project.checklist.map((item) => (
          <li key={item.id}>
            <button
              onClick={() => toggleMut.mutate(item.id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors',
                item.done
                  ? 'border-emerald-200 bg-emerald-50/50 text-gray-500 line-through'
                  : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50',
              )}
            >
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                  item.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-300 bg-white',
                )}
              >
                {item.done && <CheckSquare className="h-3 w-3" />}
              </span>
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </PipelineStage>
  )
}
