import { useState, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, User, Bot, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/services/api'
import type { VideoProject } from '../types'

export function ScriptChat({ project }: { project: VideoProject }) {
  const qc = useQueryClient()
  const [instruction, setInstruction] = useState('')
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)

  const correctMut = useMutation({
    mutationFn: (msg: string) =>
      api.post<VideoProject>(`/content/projects/${project._id}/correct-script`, { instruction: msg }).then((r) => r.data),
    onSuccess: (data) => {
      qc.setQueryData(['content-project', project._id], data)
      setInstruction('')
    },
  })

  const history = project.script_correction_history

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [history.length])

  const submit = () => {
    if (!instruction.trim() || correctMut.isPending) return
    correctMut.mutate(instruction)
  }

  const toggle = (id: string) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="rounded-lg border border-violet-200 bg-gradient-to-br from-violet-50/50 to-fuchsia-50/30">
      <div className="border-b border-violet-200 px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">
          Corrections itératives
        </p>
        <p className="mt-0.5 text-[11px] text-violet-600/70">
          Demande une modif — l'IA réécrit le script en gardant ce qui marche.
        </p>
      </div>

      {history.length === 0 ? (
        <div className="p-6 text-center text-xs text-gray-500">
          Aucune correction pour le moment. Écris une instruction ci-dessous pour démarrer.
        </div>
      ) : (
        <div ref={scrollRef} className="max-h-96 space-y-3 overflow-y-auto p-4">
          {history.map((c) => {
            const expanded = expandedMessages.has(c.id)
            const excerpt = c.result.slice(0, 240)
            const hasMore = c.result.length > excerpt.length
            return (
              <div key={c.id} className="space-y-2">
                {/* User instruction (right) */}
                <div className="flex justify-end gap-2">
                  <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-violet-600 px-3.5 py-2 text-sm text-white shadow-sm">
                    {c.instruction}
                  </div>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                    <User className="h-3.5 w-3.5" />
                  </div>
                </div>

                {/* AI response (left) */}
                <div className="flex gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-violet-600 border border-violet-200">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                  <div className="max-w-[80%] flex-1">
                    <div className="rounded-2xl rounded-tl-sm border border-violet-200 bg-white px-3.5 py-2.5 text-sm text-gray-800 shadow-sm">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-violet-600">
                        Script réécrit
                      </p>
                      <p className="whitespace-pre-line leading-relaxed">
                        {expanded ? c.result : excerpt}
                        {!expanded && hasMore && '…'}
                      </p>
                      {hasMore && (
                        <button
                          onClick={() => toggle(c.id)}
                          className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-violet-600 hover:text-violet-800"
                        >
                          {expanded ? (
                            <>
                              <ChevronUp className="h-3 w-3" /> Réduire
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3 w-3" /> Voir le script complet
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    <p className="mt-1 pl-1 text-[10px] text-gray-400">
                      {new Date(c.at).toLocaleString('fr-FR')}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}

          {correctMut.isPending && (
            <div className="flex gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-violet-600 border border-violet-200">
                <Bot className="h-3.5 w-3.5" />
              </div>
              <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-violet-200 bg-white px-4 py-3 shadow-sm">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400" style={{ animationDelay: '0ms' }} />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400" style={{ animationDelay: '150ms' }} />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-violet-200 p-3">
        <div className="flex items-end gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2 focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-500/20">
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="Ex: raccourcis l'intro, ajoute un CTA à 3 min, plus de storytelling…"
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
            style={{ minHeight: 20, maxHeight: 120 }}
          />
          <button
            onClick={submit}
            disabled={!instruction.trim() || correctMut.isPending}
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors',
              instruction.trim() && !correctMut.isPending
                ? 'bg-violet-600 text-white hover:bg-violet-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed',
            )}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
