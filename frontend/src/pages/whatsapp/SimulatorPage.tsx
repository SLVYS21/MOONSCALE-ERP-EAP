import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Send, RefreshCw, User, Smartphone, Terminal, Bot, ArrowLeftRight, Trash2 } from 'lucide-react'
import { whatsapp, type Message } from '@/services/whatsapp'
import { useWhatsAppSocket } from '@/hooks/useWhatsAppSocket'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

interface LogEntry {
  ts: Date
  kind: 'inbound' | 'outbound' | 'event' | 'error' | 'llm' | 'tool'
  label: string
  detail?: string
  meta?: { tokensIn?: number; tokensOut?: number; costUsd?: number; provider?: string; model?: string }
}

const PRESETS = [
  { phone: '+2250500000001', name: 'Test client #1' },
  { phone: '+2250500000002', name: 'Test client #2' },
  { phone: '+2250500000003', name: 'Test client #3' },
]

function formatTime(d: Date): string {
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function SimulatorPage() {
  const [phone, setPhone] = useState(PRESETS[0].phone)
  const [name, setName] = useState(PRESETS[0].name)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const threadRef = useRef<HTMLDivElement>(null)
  const logRef = useRef<HTMLDivElement>(null)

  // Find conversation for this phone
  const convsQ = useQuery({
    queryKey: ['wa.sim.conversations', phone],
    queryFn: () => whatsapp.listConversations(),
    refetchOnWindowFocus: false,
  })
  const conv = convsQ.data?.find((c) => c.phone === phone) ?? null

  const messagesQ = useQuery({
    queryKey: ['wa.sim.messages', conv?._id],
    queryFn: () => conv ? whatsapp.listMessages(conv._id) : Promise.resolve([]),
    enabled: !!conv,
    refetchOnWindowFocus: false,
  })
  const messages = messagesQ.data ?? []

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' })
  }, [logs.length])

  function addLog(entry: Omit<LogEntry, 'ts'>) {
    setLogs((prev) => [...prev, { ...entry, ts: new Date() }].slice(-200))
  }

  useWhatsAppSocket({
    onNewMessage: ({ conversationId, message }) => {
      if (conv && conversationId === conv._id) {
        messagesQ.refetch()
        if (message.fromType === 'bot') {
          // Log tool calls first if any
          if (Array.isArray(message.toolCalls) && message.toolCalls.length > 0) {
            for (const tc of message.toolCalls) {
              const argsStr = JSON.stringify(tc.args ?? {}).slice(0, 80)
              const resOk = (tc.result as any)?.ok
              addLog({
                kind: 'tool',
                label: `TOOL ${tc.name}`,
                detail: `args=${argsStr} • ${resOk === false ? 'ERR' : 'OK'} • ${tc.ms ?? '?'}ms`,
              })
            }
          }
          addLog({
            kind: 'llm',
            label: `BOT ${message.llmProvider ?? '?'}`,
            detail: message.content?.slice(0, 120) || '(no text — tools only)',
            meta: {
              tokensIn: message.tokensIn,
              tokensOut: message.tokensOut,
              costUsd: message.costUsd,
              provider: message.llmProvider,
              model: message.llmModel,
            },
          })
        } else if (message.fromType === 'system') {
          addLog({
            kind: 'event',
            label: `SYS ${message.intent ?? ''}`,
            detail: message.content?.slice(0, 100) || message.errorMessage,
          })
        } else {
          addLog({
            kind: message.direction === 'in' ? 'inbound' : 'outbound',
            label: `${message.direction === 'in' ? 'IN' : 'OUT'} ${message.fromType}`,
            detail: message.content?.slice(0, 100),
          })
        }
      }
    },
    onConversationCreated: (c) => {
      if (c.phone === phone) {
        convsQ.refetch()
        addLog({ kind: 'event', label: 'Conversation créée', detail: `id=${c._id}` })
      }
    },
    onConversationUpdated: () => convsQ.refetch(),
    onConversationDeleted: () => convsQ.refetch(),
    onSimulatorOutbound: ({ phone: p, message }) => {
      if (p === phone) {
        addLog({ kind: 'outbound', label: `OUT ${message.fromType}`, detail: message.content?.slice(0, 100) })
      }
    },
  })

  async function handleSend() {
    if (!draft.trim() || sending) return
    setSending(true)
    try {
      await whatsapp.simulateInbound({ from: phone, text: draft.trim(), fromName: name })
      addLog({ kind: 'inbound', label: 'IN client (sim)', detail: draft.trim() })
      setDraft('')
    } catch (e: any) {
      addLog({ kind: 'error', label: 'Erreur', detail: e?.message ?? 'unknown' })
    } finally {
      setSending(false)
    }
  }

  async function handleReset() {
    if (!confirm(`Supprimer toute la conversation avec ${phone} ?`)) return
    await whatsapp.resetSimulatedConversation(phone)
    addLog({ kind: 'event', label: 'Conversation réinitialisée' })
    convsQ.refetch()
    setLogs([])
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] gap-4 bg-[#f5f6fa] p-4">
      {/* ── Phone view (left) ── */}
      <div className="flex w-[400px] shrink-0 flex-col rounded-2xl border border-gray-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-3 rounded-t-2xl">
          <div className="flex items-center gap-2 text-white">
            <Smartphone className="h-4 w-4" />
            <div>
              <p className="text-sm font-bold">Simulateur WhatsApp</p>
              <p className="text-[10px] opacity-90">{name} · {phone}</p>
            </div>
          </div>
          <button onClick={handleReset} className="rounded-md p-1.5 text-white/80 hover:bg-white/10 cursor-pointer" title="Réinitialiser">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </header>

        {/* Preset client selector */}
        <div className="border-b border-gray-100 bg-gray-50 px-3 py-2">
          <div className="flex items-center gap-2 text-[11px]">
            <User className="h-3 w-3 text-gray-400" />
            <span className="text-gray-500">Client :</span>
            <select
              value={phone}
              onChange={(e) => {
                const p = PRESETS.find((x) => x.phone === e.target.value)!
                setPhone(p.phone)
                setName(p.name)
                setLogs([])
              }}
              className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
            >
              {PRESETS.map((p) => (
                <option key={p.phone} value={p.phone}>{p.name} — {p.phone}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Conversation thread */}
        <div ref={threadRef} className="flex-1 space-y-2 overflow-y-auto bg-[#eae6df] p-3">
          {messages.length === 0 && (
            <p className="mt-12 text-center text-xs text-gray-500">Aucun message. Tape ton premier message ci-dessous.</p>
          )}
          {messages.map((m) => <SimBubble key={m._id} msg={m} />)}
        </div>

        {/* Composer (client side) */}
        <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-2 rounded-b-2xl">
          <div className="flex items-end gap-2">
            <textarea
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void handleSend()
                }
              }}
              placeholder="Tape comme si tu étais le client…"
              className="flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              style={{ maxHeight: '120px' }}
            />
            <button
              onClick={handleSend}
              disabled={!draft.trim() || sending}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 disabled:opacity-40 cursor-pointer"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Tech log (right) ── */}
      <div className="flex flex-1 flex-col rounded-2xl border border-gray-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-semibold text-gray-900">Log technique</h3>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <span>{logs.length} évts</span>
            <Button variant="ghost" size="sm" onClick={() => setLogs([])}>
              <RefreshCw className="h-3 w-3" /> Vider
            </Button>
          </div>
        </header>
        <div ref={logRef} className="flex-1 overflow-y-auto p-4 text-xs font-mono">
          {logs.length === 0 && (
            <p className="text-center text-gray-400">Envoie un message pour démarrer le log…</p>
          )}
          {logs.map((l, i) => (
            <div key={i} className={cn(
              'flex flex-col gap-1 border-l-2 pl-2 py-1.5',
              l.kind === 'inbound' && 'border-emerald-400',
              l.kind === 'outbound' && 'border-indigo-400',
              l.kind === 'llm' && 'border-violet-400',
              l.kind === 'tool' && 'border-orange-400',
              l.kind === 'event' && 'border-gray-300',
              l.kind === 'error' && 'border-red-400',
            )}>
              <div className="flex items-start gap-2">
                <span className="shrink-0 text-gray-400">{formatTime(l.ts)}</span>
                <span className={cn(
                  'shrink-0 font-semibold',
                  l.kind === 'inbound' && 'text-emerald-600',
                  l.kind === 'outbound' && 'text-indigo-600',
                  l.kind === 'llm' && 'text-violet-600',
                  l.kind === 'tool' && 'text-orange-600',
                  l.kind === 'event' && 'text-gray-500',
                  l.kind === 'error' && 'text-red-600',
                )}>
                  {l.label}
                </span>
                {l.detail && <span className="text-gray-600 break-all">{l.detail}</span>}
              </div>
              {l.meta && (
                <div className="ml-12 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-gray-500">
                  {l.meta.model && <span>model={l.meta.model}</span>}
                  {l.meta.tokensIn != null && <span>in={l.meta.tokensIn}</span>}
                  {l.meta.tokensOut != null && <span>out={l.meta.tokensOut}</span>}
                  {l.meta.costUsd != null && <span className="font-semibold text-emerald-600">${l.meta.costUsd.toFixed(6)}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
        <footer className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1"><Bot className="h-3 w-3" /> Si l'IA est désactivée, le message va dans l'inbox closer.</p>
            {conv && (
              <span className="font-mono text-emerald-600">
                Total: ${messages.reduce((s, m) => s + (m.costUsd ?? 0), 0).toFixed(6)}
              </span>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}

function SimBubble({ msg }: { msg: Message }) {
  const isClient = msg.direction === 'in'
  return (
    <div className={cn('flex w-full', isClient ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-[80%] rounded-2xl px-3 py-1.5 text-sm shadow-sm',
        isClient ? 'bg-emerald-500 text-white' : 'bg-white text-gray-900 border border-gray-200',
      )}>
        {msg.fromType === 'bot' && (
          <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold text-indigo-600">
            <Bot className="h-3 w-3" /> Assistant
          </div>
        )}
        {msg.fromType === 'closer' && (
          <div className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold text-gray-500">
            <ArrowLeftRight className="h-3 w-3" /> Closer
          </div>
        )}
        {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}
        <p className={cn('mt-0.5 text-[10px] text-right', isClient ? 'text-white/70' : 'text-gray-400')}>
          {new Date(msg.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}
