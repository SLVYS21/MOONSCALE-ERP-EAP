import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Mic, Type, Trash2, ArrowRight, Lightbulb } from 'lucide-react'
import api from '@/services/api'
import { Button } from '@/components/ui/Button'
import type { ContentCapture } from '../types'
import { CreateProjectModal } from './CreateProjectModal'

export function CapturesPanel() {
  const qc = useQueryClient()
  const [convertingFrom, setConvertingFrom] = useState<string | null>(null)

  const { data: captures = [] } = useQuery<ContentCapture[]>({
    queryKey: ['content-captures'],
    queryFn: () => api.get('/content/projects/captures').then((r) => r.data),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/content/projects/captures/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content-captures'] }),
  })

  const activeCapture = captures.find((c) => c._id === convertingFrom)

  if (captures.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
        <Lightbulb className="mx-auto mb-2 h-5 w-5 text-gray-300" />
        <p className="text-xs text-gray-500">Aucun brouillon — utilise le bouton + pour capturer une idée.</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2">
        {captures.map((c) => (
          <div key={c._id} className="group rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:border-violet-300">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 rounded bg-gray-100 p-1 text-gray-500">
                {c.source === 'voice' ? <Mic className="h-3 w-3" /> : <Type className="h-3 w-3" />}
              </span>
              <p className="flex-1 line-clamp-3 whitespace-pre-line text-sm text-gray-800">{c.text}</p>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] uppercase text-gray-400">{new Date(c.createdAt).toLocaleDateString('fr-FR')}</span>
              <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Button size="sm" variant="ghost" onClick={() => setConvertingFrom(c._id)}>
                  <ArrowRight className="h-3 w-3" />
                  Projet
                </Button>
                <button
                  onClick={() => {
                    if (window.confirm('Supprimer cette capture ?')) deleteMut.mutate(c._id)
                  }}
                  className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {activeCapture && (
        <CreateProjectModal
          onClose={() => setConvertingFrom(null)}
          initialBrainDump={activeCapture.text}
        />
      )}
    </>
  )
}
