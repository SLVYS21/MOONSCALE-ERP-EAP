import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Mic, Type, X, Loader2, Square, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import api from '@/services/api'

type Mode = 'text' | 'voice'

export function QuickCaptureFAB() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg shadow-violet-600/30 transition-all hover:scale-105 hover:bg-violet-700"
        title="Capture rapide d'idée"
      >
        <Plus className="h-6 w-6" />
      </button>
      {open && <CaptureModal onClose={() => setOpen(false)} />}
    </>
  )
}

function CaptureModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [mode, setMode] = useState<Mode>('text')
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [transcribing, setTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
      mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const saveMut = useMutation({
    mutationFn: () =>
      api.post('/content/projects/captures', { text: text.trim(), source: mode }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['content-captures'] })
      onClose()
    },
    onError: (e: { message?: string }) => setError(e.message ?? 'Erreur'),
  })

  const startRecording = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        await transcribe(blob)
      }
      recorder.start()
      setRecording(true)
      setElapsed(0)
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000)
    } catch {
      setError('Impossible d\'accéder au micro')
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setRecording(false)
    if (timerRef.current) window.clearInterval(timerRef.current)
  }

  const transcribe = async (blob: Blob) => {
    setTranscribing(true)
    try {
      const fd = new FormData()
      fd.append('audio', blob, 'voice.webm')
      const { data } = await api.post<{ text: string }>('/content/projects/captures/transcribe', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setText((prev) => (prev ? `${prev}\n${data.text}` : data.text))
      setMode('text')
    } catch {
      setError('Transcription échouée — réessaie.')
    } finally {
      setTranscribing(false)
    }
  }

  const submit = () => {
    if (!text.trim()) {
      setError('Capture vide')
      return
    }
    saveMut.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 md:items-center" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Capture rapide</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode('text')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
              mode === 'text'
                ? 'border-violet-500 bg-violet-50 text-violet-700'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
            )}
          >
            <Type className="h-4 w-4" />
            Texte
          </button>
          <button
            type="button"
            onClick={() => setMode('voice')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
              mode === 'voice'
                ? 'border-violet-500 bg-violet-50 text-violet-700'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
            )}
          >
            <Mic className="h-4 w-4" />
            Vocal
          </button>
        </div>

        {mode === 'text' && (
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Note une idée vite fait — un angle, un hook, une intuition…"
            rows={5}
            className="w-full resize-none rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        )}

        {mode === 'voice' && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
            {!recording && !transcribing && (
              <>
                <button
                  onClick={startRecording}
                  className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg transition-colors hover:bg-violet-700"
                >
                  <Mic className="h-7 w-7" />
                </button>
                <p className="mt-3 text-xs text-gray-500">Tape sur le micro pour démarrer</p>
              </>
            )}

            {recording && (
              <>
                <button
                  onClick={stopRecording}
                  className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-red-600/30 transition-colors hover:bg-red-700"
                >
                  <Square className="h-6 w-6 fill-current" />
                </button>
                <p className="mt-3 font-mono text-sm font-semibold text-red-600">
                  {Math.floor(elapsed / 60).toString().padStart(2, '0')}:
                  {(elapsed % 60).toString().padStart(2, '0')}
                </p>
                <p className="mt-1 text-xs text-gray-500">Enregistrement…</p>
              </>
            )}

            {transcribing && (
              <>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-200">
                  <Loader2 className="h-7 w-7 animate-spin text-violet-600" />
                </div>
                <p className="mt-3 text-sm text-gray-700">Transcription…</p>
              </>
            )}

            {text && !recording && !transcribing && (
              <div className="mt-4 rounded-lg border border-gray-200 bg-white p-3 text-left text-xs text-gray-700">
                {text}
              </div>
            )}
          </div>
        )}

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button onClick={submit} loading={saveMut.isPending} disabled={!text.trim()}>
            Enregistrer
          </Button>
        </div>
      </div>
    </div>
  )
}
