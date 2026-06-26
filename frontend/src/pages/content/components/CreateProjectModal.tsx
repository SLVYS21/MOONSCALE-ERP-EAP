import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { X, Sparkles, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import api from '@/services/api'
import type { VideoProject, ContentCategory, ContentFormat, DurationType } from '../types'

interface StructureResult {
  title: string
  category: ContentCategory
  format: ContentFormat
  duration_type: DurationType
  notes: string
}

export function CreateProjectModal({ onClose, initialBrainDump = '' }: { onClose: () => void; initialBrainDump?: string }) {
  const navigate = useNavigate()
  const [step, setStep] = useState<'dump' | 'form'>(initialBrainDump ? 'form' : 'dump')
  const [brainDump, setBrainDump] = useState(initialBrainDump)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<ContentCategory>('educatif')
  const [duration, setDuration] = useState<DurationType>('long')
  const [format, setFormat] = useState<ContentFormat>('talking-head')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  const structureMut = useMutation({
    mutationFn: () =>
      api.post<StructureResult>('/content/projects/quick-structure', { raw_idea: brainDump }).then((r) => r.data),
    onSuccess: (data) => {
      setTitle(data.title)
      setCategory(data.category)
      setFormat(data.format)
      setDuration(data.duration_type)
      setNotes(data.notes)
      setStep('form')
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setError(e.response?.data?.message ?? 'Erreur'),
  })

  const createMut = useMutation({
    mutationFn: () =>
      api
        .post<VideoProject>('/content/projects', {
          title,
          category,
          format,
          duration_type: duration,
          brain_dump: brainDump,
          notes,
        })
        .then((r) => r.data),
    onSuccess: (project) => {
      onClose()
      navigate(`/content/projects/${project._id}`)
    },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      setError(e.response?.data?.message ?? 'Erreur'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            {step === 'dump' ? 'Nouvelle idée' : 'Confirme ton projet'}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {step === 'dump' && (
            <>
              <p className="text-sm text-gray-600">
                Décris l'idée en quelques mots — l'IA structure le reste (titre, format, plan).
              </p>
              <textarea
                autoFocus
                value={brainDump}
                onChange={(e) => setBrainDump(e.target.value)}
                rows={5}
                placeholder="Ex: Pourquoi 9 dropshippers sur 10 échouent en Afrique — étude de cas avec mes 3 erreurs des débuts…"
                className="w-full resize-none rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep('form')}>
                  Saisir manuellement
                </Button>
                <Button onClick={() => structureMut.mutate()} loading={structureMut.isPending} disabled={!brainDump.trim()}>
                  <Sparkles className="h-4 w-4" />
                  Structurer avec l'IA
                </Button>
              </div>
            </>
          )}

          {step === 'form' && (
            <>
              <Input label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre accrocheur" />

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Catégorie</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['educatif', 'preuve-sociale', 'viral', 'podcast'] as ContentCategory[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={cn(
                        'rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors',
                        category === c
                          ? 'border-violet-500 bg-violet-50 text-violet-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                      )}
                    >
                      {c.replace('-', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Durée</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['court', 'long'] as DurationType[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDuration(d)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                        duration === d
                          ? 'border-violet-500 bg-violet-50 text-violet-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                      )}
                    >
                      {d === 'court' ? 'Court (Shorts/Reels)' : 'Long (YouTube 5-20 min)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Format</label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as ContentFormat)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                >
                  <option value="talking-head">Talking Head</option>
                  <option value="valeur-ecommerce">Valeur E-commerce</option>
                  <option value="mindset">Mindset</option>
                  <option value="etude-de-cas">Étude de cas</option>
                  <option value="erreurs-lecons">Erreurs & Leçons</option>
                  <option value="interview-etudiant">Interview étudiant</option>
                  <option value="challenge">Challenge</option>
                  <option value="comparatif">Comparatif & Débat</option>
                  <option value="vision-marche">Vision Marché Africain</option>
                  <option value="coulisses">Coulisses</option>
                  <option value="personnalite">Personnalité</option>
                  <option value="podcast">Podcast</option>
                </select>
              </div>

              {notes && (
                <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-3 text-xs text-gray-700">
                  <p className="mb-1 font-semibold text-violet-700">Notes IA</p>
                  {notes}
                </div>
              )}

              {error && <p className="text-xs text-red-600">{error}</p>}

              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep('dump')}>← Retour</Button>
                <Button onClick={() => createMut.mutate()} loading={createMut.isPending} disabled={!title.trim()}>
                  Créer
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
