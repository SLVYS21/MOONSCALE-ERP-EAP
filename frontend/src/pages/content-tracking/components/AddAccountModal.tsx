import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import api from '@/services/api'
import { cn } from '@/lib/utils'
import type { TrackedPlatform, TrackedAccountType } from '../types'

export function AddAccountModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [platform, setPlatform] = useState<TrackedPlatform>('youtube')
  const [handle, setHandle] = useState('')
  const [type, setType] = useState<TrackedAccountType>('own')
  const [error, setError] = useState<string | null>(null)

  const createMut = useMutation({
    mutationFn: () =>
      api.post('/content/tracking/accounts', { name, platform, handle, type }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tracked-accounts'] })
      setName('')
      setHandle('')
      setType('own')
      setError(null)
      onClose()
    },
    onError: (err) => {
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      setError(e.response?.data?.message ?? e.message ?? 'Erreur inconnue')
    },
  })

  const submit = () => {
    if (!name.trim() || !handle.trim()) {
      setError('Nom et handle requis')
      return
    }
    createMut.mutate()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Ajouter un compte à tracker</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <Input
            label="Nom affiché"
            placeholder="Ex: Moonscale officiel"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Plateforme</label>
            <div className="grid grid-cols-2 gap-2">
              {(['youtube', 'tiktok'] as TrackedPlatform[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors cursor-pointer',
                    platform === p
                      ? 'border-violet-500 bg-violet-50 text-violet-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <Input
            label={platform === 'youtube' ? 'Handle de la chaîne (sans @)' : "Username TikTok (sans @)"}
            placeholder={platform === 'youtube' ? 'moonscale' : 'moonscale.officiel'}
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(['own', 'competitor'] as TrackedAccountType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-medium transition-colors cursor-pointer',
                    type === t
                      ? 'border-violet-500 bg-violet-50 text-violet-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                  )}
                >
                  {t === 'own' ? 'Mon compte' : 'Concurrent'}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit} loading={createMut.isPending}>
            Ajouter
          </Button>
        </div>
      </div>
    </div>
  )
}
