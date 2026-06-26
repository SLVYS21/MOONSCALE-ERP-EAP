import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Sparkles, X, Check, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import api from '@/services/api'
import type { ContentSuggestion, VideoProject } from '../types'

export function SuggestionsPanel() {
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data: suggestions = [] } = useQuery<ContentSuggestion[]>({
    queryKey: ['content-suggestions'],
    queryFn: () => api.get('/content/projects/suggestions').then((r) => r.data),
  })

  const generateMut = useMutation({
    mutationFn: () => api.post('/content/projects/suggestions/generate').then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content-suggestions'] }),
  })

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'dismissed' }) =>
      api.patch(`/content/projects/suggestions/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content-suggestions'] }),
  })

  const saveMut = useMutation({
    mutationFn: (id: string) => api.post<VideoProject>(`/content/projects/suggestions/${id}/save`).then((r) => r.data),
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ['content-suggestions'] })
      qc.invalidateQueries({ queryKey: ['content-projects'] })
      navigate(`/content/projects/${project._id}`)
    },
  })

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-600" />
          <h3 className="text-sm font-semibold text-gray-900">Suggestions IA du jour</h3>
        </div>
        <Button size="sm" variant="ghost" onClick={() => generateMut.mutate()} loading={generateMut.isPending}>
          <RotateCw className="h-3 w-3" />
          {suggestions.length === 0 ? 'Générer' : 'Regénérer'}
        </Button>
      </div>

      {suggestions.length === 0 && !generateMut.isPending && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gradient-to-br from-violet-50/50 to-fuchsia-50/50 p-6 text-center">
          <p className="text-xs text-gray-500">Aucune suggestion. Clique "Générer" pour en créer 6 inspirées de tes créateurs de référence.</p>
        </div>
      )}

      <div className="space-y-2">
        {suggestions.map((s) => (
          <div key={s._id} className="group rounded-lg border border-violet-200 bg-violet-50/30 p-3 transition-colors hover:border-violet-400">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{s.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-gray-600">{s.rationale}</p>
                {s.creator_inspiration && (
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-violet-600">
                    inspiré par {s.creator_inspiration}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => saveMut.mutate(s._id)}
                  className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50"
                  title="Convertir en projet"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => statusMut.mutate({ id: s._id, status: 'dismissed' })}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  title="Rejeter"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
