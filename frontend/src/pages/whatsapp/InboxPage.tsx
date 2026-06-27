import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  MessageSquare, Send, Search, Bot, Lock, Unlock, Tag, AlertTriangle, X,
  Paperclip, Check, CheckCheck, Phone, Wrench, UserSearch, ArrowRightFromLine, Mail, Star, FileText, Tags,
  UserCircle2, ShieldCheck, Clock, Inbox,
} from 'lucide-react'
import { whatsapp, type Conversation, type Message, type ComplaintCategory, COMPLAINT_LABELS } from '@/services/whatsapp'
import { useWhatsAppSocket } from '@/hooks/useWhatsAppSocket'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'

// ── helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'À l\'instant'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}j`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

// ── Conversation list item ───────────────────────────────────────────────────

function LastSenderLine({ conv }: { conv: Conversation }) {
  const type = conv.lastSenderType
  const name = conv.lastSenderName?.trim()

  if (type === 'client') {
    return (
      <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-amber-700">
        <Clock className="h-3 w-3" />
        En attente — dernier message de {name || 'client'}
      </div>
    )
  }
  if (type === 'bot') {
    return (
      <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-indigo-600">
        <Bot className="h-3 w-3" />
        Répondu par Assistant
      </div>
    )
  }
  if (type === 'admin') {
    return (
      <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-violet-700">
        <ShieldCheck className="h-3 w-3" />
        Répondu par {name || 'admin'}
      </div>
    )
  }
  if (type === 'closer') {
    return (
      <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-emerald-700">
        <UserCircle2 className="h-3 w-3" />
        Répondu par {name || 'closer'}
      </div>
    )
  }
  return (
    <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-400">
      <MessageSquare className="h-3 w-3" />
      Système
    </div>
  )
}

function ConvItem({ conv, active, onClick }: { conv: Conversation; active: boolean; onClick: () => void }) {
  const initials = (conv.contactName ?? conv.phone).slice(0, 2).toUpperCase()
  const isPending = conv.lastSenderType === 'client'
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors cursor-pointer',
        active ? 'bg-indigo-50' : 'hover:bg-gray-50',
        isPending && !active && 'bg-amber-50/40',
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-xs font-bold text-white">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-semibold text-gray-900">
            {conv.contactName ?? conv.phone}
          </p>
          <span className="shrink-0 text-[10px] text-gray-400">{timeAgo(conv.lastMessageAt)}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-500">{conv.lastMessagePreview || '—'}</p>
        <LastSenderLine conv={conv} />
        <div className="mt-1.5 flex items-center gap-1.5">
          {conv.contactType === 'lead' && <Badge variant="success" className="text-[10px]">Lead</Badge>}
          {conv.contactType === 'student' && <Badge variant="info" className="text-[10px]">Étudiant</Badge>}
          {!conv.aiEnabled && <Badge variant="warning" className="text-[10px]">IA off</Badge>}
          {conv.unreadCount > 0 && (
            <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-white">
              {conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Message bubble ───────────────────────────────────────────────────────────

const TOOL_ICONS: Record<string, { Icon: any; label: string; color: string }> = {
  lookup_contact:        { Icon: UserSearch, label: 'lookup',     color: 'text-blue-600 bg-blue-50' },
  create_complaint:      { Icon: FileText,   label: 'plainte',    color: 'text-red-600 bg-red-50' },
  escalate_to_human:     { Icon: ArrowRightFromLine, label: 'escalade', color: 'text-amber-700 bg-amber-50' },
  request_email:         { Icon: Mail,       label: 'email',      color: 'text-gray-600 bg-gray-100' },
  mark_as_qualified_lead:{ Icon: Star,       label: 'qualifié',   color: 'text-emerald-700 bg-emerald-50' },
  send_typebot:          { Icon: FileText,   label: 'typebot',    color: 'text-violet-700 bg-violet-50' },
  tag_conversation:      { Icon: Tags,       label: 'tag',        color: 'text-indigo-700 bg-indigo-50' },
}

function ToolChips({ toolCalls }: { toolCalls: Message['toolCalls'] }) {
  if (!toolCalls?.length) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {toolCalls.map((tc, i) => {
        const meta = TOOL_ICONS[tc.name] ?? { Icon: Wrench, label: tc.name, color: 'text-gray-600 bg-gray-100' }
        const ok = (tc.result as any)?.ok !== false
        return (
          <span
            key={i}
            title={`${tc.name}(${JSON.stringify(tc.args ?? {})})${tc.ms != null ? ` • ${tc.ms}ms` : ''}${ok ? '' : ' • ERR'}`}
            className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium', meta.color, !ok && 'opacity-60 line-through')}
          >
            <meta.Icon className="h-2.5 w-2.5" />
            {meta.label}
          </span>
        )
      })}
    </div>
  )
}

function Bubble({ msg }: { msg: Message }) {
  const isOut = msg.direction === 'out'
  const bubbleColor =
    msg.fromType === 'system' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
    msg.fromType === 'bot' ? 'bg-indigo-50 text-gray-900 border border-indigo-100' :
    isOut ? 'bg-emerald-500 text-white' : 'bg-white text-gray-900 border border-gray-200'

  if (msg.fromType === 'system') {
    return (
      <div className="flex w-full justify-center">
        <div className={cn('rounded-lg px-2.5 py-1 text-xs', bubbleColor)}>
          {msg.content || msg.errorMessage || msg.intent}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex w-full', isOut ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[70%]">
        <div className={cn('rounded-2xl px-3.5 py-2 text-sm shadow-sm', bubbleColor)}>
          {msg.fromType === 'bot' && (
            <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-indigo-600">
              <Bot className="h-3 w-3" /> Assistant
              {msg.llmProvider && <span className="text-gray-400 font-normal">· {msg.llmProvider}</span>}
            </div>
          )}
          {msg.mediaUrl && msg.mediaType === 'image' && (
            <img src={msg.mediaUrl} alt="" className="mb-1 max-h-60 rounded-lg" />
          )}
          {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}
          <ToolChips toolCalls={msg.toolCalls} />
          <div className={cn('mt-1 flex items-center justify-end gap-1 text-[10px]', isOut && msg.fromType !== 'bot' ? 'text-white/80' : 'text-gray-400')}>
            <span>{formatTime(msg.createdAt)}</span>
            {isOut && (msg.status === 'delivered' || msg.status === 'read') && <CheckCheck className="h-3 w-3" />}
            {isOut && msg.status === 'sent' && <Check className="h-3 w-3" />}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Complaint modal ──────────────────────────────────────────────────────────

function ComplaintModal({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const [category, setCategory] = useState<ComplaintCategory>('access_circle')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!description.trim()) return
    setSaving(true)
    try {
      await whatsapp.createComplaint(conversationId, { category, description })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Créer une plainte</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-700">Catégorie</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              {Object.entries(COMPLAINT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              placeholder="Détaille la plainte du client…"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Annuler</Button>
          <Button size="sm" onClick={submit} loading={saving} disabled={!description.trim()}>Créer</Button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export function InboxPage() {
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((s) => s.user?._id)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'answered'>('all')
  const [search, setSearch] = useState('')
  const [composer, setComposer] = useState('')
  const [showComplaint, setShowComplaint] = useState(false)
  const [sending, setSending] = useState(false)
  const threadRef = useRef<HTMLDivElement>(null)

  // ── Queries ──
  // Fetch all matching the search; filter pending/answered client-side so counts stay accurate.
  const convsQ = useQuery({
    queryKey: ['wa.conversations', search],
    queryFn: () => whatsapp.listConversations({
      search: search || undefined,
    }),
    refetchOnWindowFocus: false,
  })
  const allConversations = convsQ.data ?? []
  const counts = useMemo(() => ({
    pending: allConversations.filter((c) => c.lastSenderType === 'client').length,
    answered: allConversations.filter((c) => c.lastSenderType !== 'client').length,
    total: allConversations.length,
  }), [allConversations])
  const conversations = useMemo(() => {
    if (filter === 'pending') return allConversations.filter((c) => c.lastSenderType === 'client')
    if (filter === 'answered') return allConversations.filter((c) => c.lastSenderType !== 'client')
    return allConversations
  }, [allConversations, filter])

  const messagesQ = useQuery({
    queryKey: ['wa.messages', activeId],
    queryFn: () => activeId ? whatsapp.listMessages(activeId) : Promise.resolve([]),
    enabled: !!activeId,
    refetchOnWindowFocus: false,
  })
  const messages = messagesQ.data ?? []

  const active = useMemo(() => conversations.find((c) => c._id === activeId) ?? null, [conversations, activeId])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, activeId])

  // Mark as read when opening
  useEffect(() => {
    if (!activeId) return
    whatsapp.markRead(activeId).catch(() => {})
  }, [activeId])

  // Realtime
  useWhatsAppSocket({
    onNewMessage: ({ conversationId, message }) => {
      queryClient.setQueryData<Message[]>(['wa.messages', conversationId], (prev) => {
        if (!prev) return prev
        if (prev.some((m) => m._id === message._id)) return prev
        return [...prev, message]
      })
      queryClient.invalidateQueries({ queryKey: ['wa.conversations'] })
    },
    onConversationCreated: () => queryClient.invalidateQueries({ queryKey: ['wa.conversations'] }),
    onConversationUpdated: (conv) => {
      queryClient.invalidateQueries({ queryKey: ['wa.conversations'] })
      if (conv._id === activeId) queryClient.setQueryData(['wa.conversation', activeId], conv)
    },
    onConversationDeleted: ({ conversationId }) => {
      if (conversationId === activeId) setActiveId(null)
      queryClient.invalidateQueries({ queryKey: ['wa.conversations'] })
    },
  })

  async function handleSend() {
    if (!active || !composer.trim() || sending) return
    setSending(true)
    try {
      await whatsapp.sendMessage(active._id, { text: composer.trim() })
      setComposer('')
    } finally {
      setSending(false)
    }
  }

  async function handleToggleAi() {
    if (!active) return
    await whatsapp.toggleAi(active._id, !active.aiEnabled)
    queryClient.invalidateQueries({ queryKey: ['wa.conversations'] })
  }

  async function handleLock() {
    if (!active) return
    const locked = active.lockedBy && active.lockedBy === currentUserId
    if (locked) await whatsapp.unlock(active._id)
    else await whatsapp.lock(active._id)
    queryClient.invalidateQueries({ queryKey: ['wa.conversations'] })
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-[#f5f6fa]">
      {/* ── Conversations list ── */}
      <aside className="flex w-[340px] shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="mt-2 flex gap-1">
            {([
              { key: 'all',      label: 'Tous',       Icon: Inbox,   count: counts.total },
              { key: 'pending',  label: 'En attente', Icon: Clock,   count: counts.pending },
              { key: 'answered', label: 'Répondus',   Icon: CheckCheck, count: counts.answered },
            ] as const).map(({ key, label, Icon, count }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer',
                  filter === key
                    ? key === 'pending'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-indigo-100 text-indigo-700'
                    : 'text-gray-500 hover:bg-gray-100',
                )}
              >
                <Icon className="h-3 w-3" />
                {label}
                <span className={cn('rounded-full px-1.5 text-[10px]', filter === key ? 'bg-white/60' : 'bg-gray-100')}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {convsQ.isLoading && <p className="p-4 text-center text-xs text-gray-400">Chargement…</p>}
          {!convsQ.isLoading && conversations.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center">
              <MessageSquare className="h-8 w-8 text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">Aucune conversation</p>
              <p className="mt-1 text-xs text-gray-400">Utilisez le simulateur pour en créer une.</p>
            </div>
          )}
          {conversations.map((c) => (
            <ConvItem key={c._id} conv={c} active={c._id === activeId} onClick={() => setActiveId(c._id)} />
          ))}
        </div>
      </aside>

      {/* ── Thread ── */}
      <section className="flex flex-1 flex-col bg-[#eae6df]">
        {!active ? (
          <div className="flex h-full flex-col items-center justify-center text-gray-400">
            <MessageSquare className="h-12 w-12" />
            <p className="mt-3 text-sm">Sélectionne une conversation</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-xs font-bold text-white">
                  {(active.contactName ?? active.phone).slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{active.contactName ?? active.phone}</p>
                  <p className="truncate text-[11px] text-gray-500">{active.phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleToggleAi}
                  title={active.aiEnabled ? 'Désactiver l\'IA' : 'Activer l\'IA'}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium cursor-pointer',
                    active.aiEnabled ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500',
                  )}
                >
                  <Bot className="h-3.5 w-3.5" /> {active.aiEnabled ? 'IA ON' : 'IA OFF'}
                </button>
                <button
                  onClick={handleLock}
                  title={active.lockedBy ? 'Déverrouiller' : 'Verrouiller pour moi'}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-md cursor-pointer',
                    active.lockedBy && active.lockedBy === currentUserId
                      ? 'bg-amber-100 text-amber-700'
                      : 'text-gray-500 hover:bg-gray-100',
                  )}
                >
                  {active.lockedBy ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => setShowComplaint(true)}
                  title="Créer une plainte"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 cursor-pointer"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                </button>
              </div>
            </header>

            {/* Lock notice */}
            {active.lockedBy && active.lockedBy !== currentUserId && (
              <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-700">
                Conversation verrouillée par un autre closer. Tu peux lire mais pas répondre.
              </div>
            )}

            {/* Messages */}
            <div ref={threadRef} className="flex-1 space-y-2 overflow-y-auto p-4">
              {messagesQ.isLoading && <p className="text-center text-xs text-gray-400">Chargement…</p>}
              {messages.map((m) => <Bubble key={m._id} msg={m} />)}
            </div>

            {/* Composer */}
            <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-2.5">
              <div className="flex items-end gap-2">
                <button className="flex h-9 w-9 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 cursor-pointer" title="Joindre">
                  <Paperclip className="h-4 w-4" />
                </button>
                <textarea
                  rows={1}
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void handleSend()
                    }
                  }}
                  placeholder="Tape ton message (Entrée pour envoyer, Maj+Entrée pour saut de ligne)…"
                  className="flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  style={{ maxHeight: '120px' }}
                />
                <button
                  onClick={handleSend}
                  disabled={!composer.trim() || sending}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm transition-opacity hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ── Side panel ── */}
      {active && (
        <aside className="hidden w-[280px] shrink-0 flex-col border-l border-gray-200 bg-white p-4 xl:flex">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">Contact</h3>
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-lg font-bold text-white">
              {(active.contactName ?? active.phone).slice(0, 2).toUpperCase()}
            </div>
            <p className="mt-2 text-sm font-semibold text-gray-900">{active.contactName ?? '—'}</p>
            <p className="flex items-center gap-1 text-xs text-gray-500"><Phone className="h-3 w-3" />{active.phone}</p>
            <div className="mt-2 flex flex-wrap gap-1 justify-center">
              {active.contactType === 'lead' && <Badge variant="success">Lead</Badge>}
              {active.contactType === 'student' && <Badge variant="info">Étudiant</Badge>}
              {active.contactType === 'unknown' && <Badge variant="default">Inconnu</Badge>}
              <Badge variant={active.aiEnabled ? 'info' : 'warning'}>{active.aiEnabled ? 'IA active' : 'Humain'}</Badge>
            </div>
          </div>

          <hr className="my-4 border-gray-100" />

          <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-400">Tags</h4>
          <div className="flex flex-wrap gap-1">
            {active.tags.length === 0 && <p className="text-xs text-gray-400">Aucun tag</p>}
            {active.tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">
                <Tag className="h-2.5 w-2.5" />
                {t}
                <button
                  onClick={() => whatsapp.removeTag(active._id, t).then(() => queryClient.invalidateQueries({ queryKey: ['wa.conversations'] }))}
                  className="text-gray-400 hover:text-red-500 cursor-pointer"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        </aside>
      )}

      {showComplaint && active && (
        <ComplaintModal conversationId={active._id} onClose={() => setShowComplaint(false)} />
      )}
    </div>
  )
}
