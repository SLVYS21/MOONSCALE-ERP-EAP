import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Phone, Mail, Globe, User, Pencil,
  Plus, ExternalLink, Sparkles, CheckCircle, XCircle,
  Clock, ChevronDown, Trash2, GraduationCap,
  GitBranch, Star, PhoneCall, PhoneOff, UserCheck, ChevronUp,
  CalendarClock, Send, X, CalendarDays,
  Video, CreditCard, Link2, Link2Off, AlertCircle,
} from 'lucide-react'
import api from '@/services/api'
import type { Lead, LeadCall, SubscriptionOffer, PipelineStatus, AppSettings, Transaction } from '@/types'
import { cn } from '@/lib/utils'

// ── Constants ──────────────────────────────────────────────────────────────────

const PIPELINE_OPTIONS: { value: PipelineStatus; label: string; color: string }[] = [
  { value: 'nouveau',          label: 'Nouveau',          color: 'text-gray-400' },
  { value: 'mql',              label: 'MQL',              color: 'text-blue-400' },
  { value: 'sql',              label: 'SQL',              color: 'text-indigo-400' },
  { value: 'rdv_programme',    label: 'RDV Programmé',    color: 'text-yellow-400' },
  { value: 'appel_diagnostic', label: 'Appel Diagnostic', color: 'text-orange-400' },
  { value: 'won',              label: 'Won',              color: 'text-green-400' },
  { value: 'lost',             label: 'Lost',             color: 'text-red-400' },
  { value: 'nurturing',        label: 'Nurturing',        color: 'text-purple-400' },
]

const CALL_STATUS: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  planned:   { label: 'Planifié',  icon: Clock,         color: 'text-yellow-400' },
  completed: { label: 'Réalisé',   icon: CheckCircle,   color: 'text-green-400' },
  cancelled: { label: 'Annulé',    icon: XCircle,       color: 'text-red-400' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TX_STATUS_LABEL: Record<string, string> = {
  pending: 'En attente', completed: 'Complété', failed: 'Échoué', refunded: 'Remboursé',
}
const TX_STATUS_COLOR: Record<string, string> = {
  pending: 'text-yellow-400', completed: 'text-green-400', failed: 'text-red-400', refunded: 'text-orange-400',
}
const GATEWAY_LABELS: Record<string, string> = {
  stripe: 'Stripe', chariow: 'Chariow', pawapay: 'PawaPay', fedapay: 'FedaPay',
  wave: 'Wave', orange_money: 'Orange Money', virement: 'Virement', manual: 'Manuel', bank_import: 'Import PDF',
}

function formatDate(str: string | null) {
  if (!str) return '—'
  return new Date(str).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Dynamic Field ─────────────────────────────────────────────────────────────

function DynamicField({ slug, value }: { slug: string; value: string }) {
  const [expanded, setExpanded] = useState(false)
  const label = slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const isLong = value.length > 120

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950 p-3">
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-xs font-medium text-gray-300">{label}</span>
        <span className="text-[10px] text-gray-600 font-mono shrink-0">{slug}</span>
      </div>
      <p className={cn('text-xs text-gray-400 whitespace-pre-wrap', !expanded && isLong && 'line-clamp-3')}>
        {value}
      </p>
      {isLong && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-1.5 flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300"
        >
          {expanded ? <><ChevronUp size={10} /> Réduire</> : <><ChevronDown size={10} /> Voir tout ({value.length} car.)</>}
        </button>
      )}
    </div>
  )
}

// ── Lead Timeline ─────────────────────────────────────────────────────────────

type LeadEventEntry = { type: string; message: string; date: string; actor_id?: string | null }

const EVENT_ICON: Record<string, { icon: React.ElementType; color: string }> = {
  created:                { icon: User,       color: 'text-indigo-400' },
  pipeline_changed:       { icon: GitBranch,  color: 'text-blue-400'   },
  qualification_changed:  { icon: Star,       color: 'text-yellow-400' },
  call_planned:           { icon: PhoneCall,  color: 'text-cyan-400'   },
  call_completed:         { icon: PhoneOff,   color: 'text-green-400'  },
  converted:              { icon: UserCheck,  color: 'text-emerald-400'},
}

function LeadTimeline({ events }: { events: LeadEventEntry[] }) {
  return (
    <div className="relative">
      <div className="absolute left-[13px] top-0 bottom-0 w-px bg-gray-800" />
      <div className="space-y-3">
        {events.map((ev, i) => {
          const meta = EVENT_ICON[ev.type] ?? { icon: Clock, color: 'text-gray-500' }
          const Icon = meta.icon
          return (
            <div key={i} className="flex gap-3 items-start">
              <div className={cn('relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-900 border border-gray-800', meta.color)}>
                <Icon size={13} />
              </div>
              <div className="pt-0.5 min-w-0">
                <p className="text-sm text-gray-300 leading-snug">{ev.message}</p>
                <p className="text-[11px] text-gray-600 mt-0.5">
                  {new Date(ev.date).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Info Section ──────────────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | number | null }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2">
      <Icon size={14} className="text-gray-500 mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm text-gray-200">{value}</p>
      </div>
    </div>
  )
}

// ── Call Card ─────────────────────────────────────────────────────────────────

function CallCard({ leadId, call, offers, onUpdate }: {
  leadId: string
  call: LeadCall
  offers: SubscriptionOffer[]
  onUpdate: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editNotes, setEditNotes] = useState(false)
  const [notes, setNotes] = useState(call.manual_notes)
  const qc = useQueryClient()

  const statusInfo = CALL_STATUS[call.status] ?? CALL_STATUS.planned
  const StatusIcon = statusInfo.icon

  type CallUpdatePayload = Omit<Partial<LeadCall>, 'offer_proposed_id' | 'closer_id'> & {
    offer_proposed_id?: string
    closer_id?: string
    status?: LeadCall['status']
  }

  const updateMutation = useMutation({
    mutationFn: (data: CallUpdatePayload) =>
      api.patch(`/leads/${leadId}/calls/${call._id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lead-calls', leadId] }); onUpdate(); setEditNotes(false) },
  })

  const summarizeMutation = useMutation({
    mutationFn: () => api.post(`/leads/${leadId}/calls/${call._id}/summarize`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-calls', leadId] }),
  })

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800">
      <div
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <StatusIcon size={16} className={statusInfo.color} />
          <div>
            <p className="text-sm font-medium text-gray-200">{formatDate(call.date)}</p>
            <p className="text-xs text-gray-500">
              {call.duration ? `${call.duration} min` : 'Durée inconnue'}
              {call.closer_id ? ` • ${call.closer_id.firstName} ${call.closer_id.lastName}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('text-xs font-medium', statusInfo.color)}>{statusInfo.label}</span>
          <ChevronDown size={16} className={cn('text-gray-500 transition-transform', expanded && 'rotate-180')} />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-800 p-4 space-y-4">
          {/* Status / LeadOffer row */}
          <div className="flex flex-wrap gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Statut</label>
              <select
                className="rounded-lg bg-gray-800 border border-gray-700 px-2 py-1.5 text-xs text-gray-200 focus:outline-none"
                value={call.status}
                onChange={(e) => updateMutation.mutate({ status: e.target.value as LeadCall['status'] })}
              >
                <option value="planned">Planifié</option>
                <option value="completed">Réalisé</option>
                <option value="cancelled">Annulé</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Offre proposée</label>
              <select
                className="rounded-lg bg-gray-800 border border-gray-700 px-2 py-1.5 text-xs text-gray-200 focus:outline-none"
                value={(call.offer_proposed_id as SubscriptionOffer | null)?._id ?? ''}
                onChange={(e) => updateMutation.mutate({ offer_proposed_id: e.target.value || undefined })}
              >
                <option value="">— aucune —</option>
                {offers.map((o) => (
                  <option key={o._id} value={o._id}>{o.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Meet link */}
          {call.google_meet_link && (
            <a
              href={call.google_meet_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300"
            >
              <ExternalLink size={12} /> Ouvrir le Google Meet
            </a>
          )}

          {/* Transcript */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Transcription</label>
            <textarea
              rows={4}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-xs text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none resize-y"
              placeholder="Coller la transcription ici (depuis Plaud AI ou autre)..."
              defaultValue={call.transcript}
              onBlur={(e) => {
                if (e.target.value !== call.transcript) {
                  updateMutation.mutate({ transcript: e.target.value })
                }
              }}
            />
          </div>

          {/* AI Summary */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Résumé IA</label>
              <button
                disabled={!call.transcript || summarizeMutation.isPending}
                onClick={() => summarizeMutation.mutate()}
                className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 disabled:opacity-40"
              >
                <Sparkles size={12} />
                {summarizeMutation.isPending ? 'Génération...' : 'Générer via Claude'}
              </button>
            </div>
            {call.ai_summary ? (
              <div className="rounded-lg bg-indigo-950/30 border border-indigo-900/30 p-3 text-xs text-gray-300 whitespace-pre-wrap">
                {call.ai_summary}
              </div>
            ) : (
              <p className="text-xs text-gray-600">Aucun résumé. Ajoutez la transcription et cliquez "Générer".</p>
            )}
          </div>

          {/* Manual notes */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Notes du closer</label>
              {!editNotes && (
                <button onClick={() => setEditNotes(true)} className="text-xs text-gray-500 hover:text-gray-300">
                  <Pencil size={12} />
                </button>
              )}
            </div>
            {editNotes ? (
              <div className="space-y-2">
                <textarea
                  rows={3}
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-xs text-gray-200 focus:border-indigo-500 focus:outline-none resize-none"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditNotes(false)} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-300">Annuler</button>
                  <button
                    onClick={() => updateMutation.mutate({ manual_notes: notes })}
                    className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-xs text-white"
                  >
                    Sauvegarder
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400 whitespace-pre-wrap">
                {call.manual_notes || <span className="text-gray-600">Aucune note.</span>}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Add Call Modal ─────────────────────────────────────────────────────────────

function AddCallModal({ leadId, leadEmail, onClose }: { leadId: string; leadEmail?: string | null; onClose: () => void }) {
  const qc = useQueryClient()

  const defaultDate = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(10, 0, 0, 0)
    return d.toISOString().slice(0, 16)
  })()

  const [form, setForm] = useState({ date: defaultDate, google_meet_link: '', status: 'planned' as const })
  const [sendEmail, setSendEmail] = useState(!!leadEmail)
  const [emailSent, setEmailSent] = useState(false)

  const mutation = useMutation({
    mutationFn: (data: typeof form & { sendEmail: boolean }) => api.post(`/leads/${leadId}/calls`, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['lead-calls', leadId] })
      if (vars.sendEmail && leadEmail) {
        setEmailSent(true)
        setTimeout(onClose, 2500)
      } else {
        onClose()
      }
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl bg-gray-900 border border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-gray-100 mb-5">Nouvel appel</h2>

        {emailSent ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle size={40} className="text-green-400" />
            <p className="text-sm text-gray-300 text-center">
              Email de confirmation envoyé à{' '}
              <span className="text-white font-medium">{leadEmail}</span>
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Date & heure</label>
                <input
                  type="datetime-local"
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Lien Google Meet</label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                    placeholder="https://meet.google.com/..."
                    value={form.google_meet_link}
                    onChange={(e) => setForm((f) => ({ ...f, google_meet_link: e.target.value }))}
                  />
                  <a
                    href="https://meet.new"
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs text-gray-300 whitespace-nowrap transition-colors"
                  >
                    <Video size={13} />
                    Nouveau Meet
                  </a>
                </div>
              </div>
              {leadEmail ? (
                <button
                  type="button"
                  onClick={() => setSendEmail((v) => !v)}
                  className="flex items-center gap-3 w-full text-left"
                >
                  <div className={cn('w-9 h-5 rounded-full flex items-center px-0.5 transition-colors', sendEmail ? 'bg-indigo-600' : 'bg-gray-700')}>
                    <div className={cn('w-4 h-4 rounded-full bg-white transition-transform', sendEmail ? 'translate-x-4' : 'translate-x-0')} />
                  </div>
                  <span className="text-sm text-gray-300">
                    Envoyer email de confirmation à{' '}
                    <span className="text-white">{leadEmail}</span>
                  </span>
                </button>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-gray-500">
                  <AlertCircle size={12} />
                  Ce lead n'a pas d'adresse email — confirmation impossible.
                </p>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">
                Annuler
              </button>
              <button
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ ...form, sendEmail: sendEmail && !!leadEmail })}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm text-white font-medium disabled:opacity-50"
              >
                {mutation.isPending ? 'Création...' : 'Créer'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Pre-Booking Modal (email pref before Cal.com iframe) ─────────────────────

function PreBookingModal({ leadId, leadEmail, onConfirm, onClose }: {
  leadId: string
  leadEmail?: string | null
  onConfirm: () => void
  onClose: () => void
}) {
  const [sendEmail, setSendEmail] = useState(!!leadEmail)
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await api.post(`/leads/${leadId}/booking-pref`, { sendEmail: sendEmail && !!leadEmail })
    } catch { /* non-blocking */ }
    setLoading(false)
    onConfirm()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays size={18} className="text-indigo-400 mt-0.5" />
            <h2 className="text-base font-semibold text-gray-100">Programmer un appel</h2>
          </div>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-gray-400">
          Cal.com va s'ouvrir pour choisir un créneau. Une invitation calendrier sera envoyée automatiquement par Cal.com.
        </p>
        {leadEmail && (
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => setSendEmail(v => !v)}
              className={`relative w-10 h-5 rounded-full transition-colors ${sendEmail ? 'bg-indigo-600' : 'bg-gray-700'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${sendEmail ? 'translate-x-5' : ''}`} />
            </div>
            <span className="text-sm text-gray-300">
              Envoyer aussi l'email ERP à <span className="text-gray-100">{leadEmail}</span>
            </span>
          </label>
        )}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-gray-700 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition-colors disabled:opacity-60"
          >
            {loading ? 'Chargement…' : 'Ouvrir Cal.com →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Cal.com Booking Modal (iframe approach) ───────────────────────────────────

function CalComBookingModal({ leadName, leadEmail, bookingUrl, onClose }: {
  leadName: string
  leadEmail?: string | null
  bookingUrl?: string
  onClose: () => void
}) {
  const params = new URLSearchParams()
  if (leadName) params.set('name', leadName)
  if (leadEmail) params.set('email', leadEmail)
  const iframeUrl = bookingUrl ? `${bookingUrl}?${params.toString()}` : null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <CalendarDays size={16} className="text-indigo-400" />
          <div>
            <h2 className="text-sm font-semibold text-gray-100">
              Programmer un appel — {leadName}
            </h2>
            <p className="text-xs text-gray-500">
              L'email de confirmation (.ics) sera envoyé automatiquement dès que le RDV est confirmé dans Cal.com
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {iframeUrl && (
            <a
              href={iframeUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 transition-colors"
            >
              <ExternalLink size={12} />
              Ouvrir dans un onglet
            </a>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Content */}
      {!iframeUrl ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <AlertCircle size={40} className="text-yellow-500 mx-auto mb-3" />
            <p className="text-gray-200 font-semibold mb-1">URL Cal.com non configurée</p>
            <p className="text-sm text-gray-500">
              Ajoutez le lien de réservation Cal.com dans{' '}
              <span className="text-indigo-400">Paramètres → Booking URL</span>
            </p>
          </div>
        </div>
      ) : (
        <iframe
          src={iframeUrl}
          className="flex-1 w-full border-none"
          title="Réservation Cal.com"
        />
      )}
    </div>
  )
}

// ── Link Transaction Modal ────────────────────────────────────────────────────

function LinkTransactionModal({
  leadId, leadName, onClose, onLinked,
}: {
  leadId: string; leadName: string
  onClose: () => void; onLinked: () => void
}) {
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['tx-search-link', search],
    queryFn: () => api.get('/finances/transactions', {
      params: { type: 'income', search: search || undefined, limit: 20 },
    }).then(r => r.data as { data: Transaction[] }),
  })

  const linkMutation = useMutation({
    mutationFn: (txId: string) =>
      api.patch(`/finances/transactions/${txId}`, { leadId, leadName }),
    onSuccess: onLinked,
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-gray-900 border border-gray-800 p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-100 flex items-center gap-2">
            <Link2 size={14} className="text-indigo-400" />
            Lier une transaction à {leadName}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={16} /></button>
        </div>

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par description, email, montant…"
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-indigo-500 focus:outline-none mb-3"
          autoFocus
        />

        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {isLoading && <p className="text-center text-xs text-gray-500 py-4">Chargement…</p>}
          {!isLoading && (data?.data ?? []).length === 0 && (
            <p className="text-center text-xs text-gray-600 py-4">Aucune transaction trouvée</p>
          )}
          {(data?.data ?? []).map((tx) => (
            <button
              key={tx._id}
              onClick={() => linkMutation.mutate(tx._id)}
              disabled={linkMutation.isPending}
              className="flex w-full items-center gap-3 rounded-lg bg-gray-800/60 px-3 py-2.5 text-left hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-200 truncate">{tx.description}</p>
                <div className="flex gap-2 mt-0.5 text-[11px] text-gray-500">
                  <span>{new Date(tx.date).toLocaleDateString('fr-FR')}</span>
                  <span>{GATEWAY_LABELS[tx.gateway] ?? tx.gateway}</span>
                  {tx.leadName && <span className="text-yellow-500">→ {tx.leadName}</span>}
                </div>
              </div>
              <p className="text-sm font-semibold text-green-400 shrink-0">
                {tx.amount.toLocaleString('fr-FR')} {tx.currency}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [editNotes, setEditNotes] = useState(false)
  const [notes, setNotes] = useState('')
  const [editBudget, setEditBudget] = useState(false)
  const [budgetInput, setBudgetInput] = useState('')
  const [showAddOffer, setShowAddOffer] = useState(false)
  const [showAddCall, setShowAddCall] = useState(false)
  const [showPreBooking, setShowPreBooking] = useState(false)
  const [showCalBooking, setShowCalBooking] = useState(false)
  const [pollingCalls, setPollingCalls] = useState(false)
  const [showCallLink, setShowCallLink] = useState(false)
  const [callLinkUrl, setCallLinkUrl] = useState('')
  const [callLinkMsg, setCallLinkMsg] = useState('')

  const { data: lead, isLoading } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => api.get(`/leads/${id}`).then((r) => r.data as Lead),
    enabled: !!id,
  })

  const { data: calls = [] } = useQuery({
    queryKey: ['lead-calls', id],
    queryFn: () => api.get(`/leads/${id}/calls`).then((r) => r.data as LeadCall[]),
    enabled: !!id,
    refetchInterval: pollingCalls ? 2000 : false,
  })

  const { data: txData, refetch: refetchTx } = useQuery({
    queryKey: ['lead-transactions', id],
    queryFn: () => api.get('/finances/transactions', { params: { leadId: id, limit: 50 } })
      .then(r => r.data as { data: Transaction[]; total: number }),
    enabled: !!id,
  })
  const linkedTransactions = txData?.data ?? []

  const [showLinkTxModal, setShowLinkTxModal] = useState(false)

  const unlinkTxMutation = useMutation({
    mutationFn: (txId: string) => api.patch(`/finances/transactions/${txId}`, { leadId: null, leadName: null }),
    onSuccess: () => refetchTx(),
  })

  const { data: offers = [] } = useQuery({
    queryKey: ['subscription-offers-active'],
    queryFn: () => api.get('/subscription-offers', { params: { activeOnly: 'true' } }).then((r) => r.data as SubscriptionOffer[]),
  })

  const { data: appSettings } = useQuery<AppSettings>({
    queryKey: ['app-settings'],
    queryFn: () => api.get('/app-settings').then((r) => r.data),
  })

  // Auto-discover the current user's Cal.com booking URL from the Cal.com DB
  const { data: calcomUrlData } = useQuery({
    queryKey: ['calcom-my-booking-url'],
    queryFn: () => api.get('/calcom/my-booking-url').then((r) => r.data as { url: string | null }),
    staleTime: 5 * 60_000,
    retry: false,
  })
  const myBookingUrl = calcomUrlData?.url ?? appSettings?.callBookingUrl ?? ''

  const sendCallLinkMutation = useMutation({
    mutationFn: ({ bookingUrl, message }: { bookingUrl: string; message: string }) =>
      api.post(`/leads/${id}/send-call-link`, { bookingUrl, message }),
    onSuccess: () => setShowCallLink(false),
  })

  const pipelineMutation = useMutation({
    mutationFn: (status: PipelineStatus) => api.patch(`/leads/${id}/pipeline`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead', id] }),
  })


  const notesMutation = useMutation({
    mutationFn: (n: string) => api.patch(`/leads/${id}`, { notes: n }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lead', id] }); setEditNotes(false) },
  })

  const budgetMutation = useMutation({
    mutationFn: (amount: number | null) => api.patch(`/leads/${id}`, { opportunity_amount: amount }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lead', id] }); setEditBudget(false) },
  })

  const offersMutation = useMutation({
    mutationFn: (offerIds: string[]) => api.patch(`/leads/${id}`, { offer_ids: offerIds }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lead', id] }); setShowAddOffer(false) },
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/leads/${id}`),
    onSuccess: () => navigate('/leads'),
  })

  const convertMutation = useMutation({
    mutationFn: () => api.post(`/leads/${id}/convert`).then(r => r.data as { student_id: string; created: boolean }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['lead', id] })
      if (data.created) navigate(`/students/${data.student_id}`)
      else navigate(`/students/${data.student_id}`)
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    )
  }

  if (!lead) return <div className="p-6 text-gray-400">Lead introuvable.</div>

  const pipelineOpt = PIPELINE_OPTIONS.find((p) => p.value === lead.pipeline_status)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {showAddCall && id && <AddCallModal leadId={id} leadEmail={lead?.email} onClose={() => setShowAddCall(false)} />}
      {showPreBooking && id && (
        <PreBookingModal
          leadId={id}
          leadEmail={lead?.email}
          onConfirm={() => { setShowPreBooking(false); setShowCalBooking(true) }}
          onClose={() => setShowPreBooking(false)}
        />
      )}
      {showCalBooking && id && (
        <CalComBookingModal
          leadName={lead?.name ?? ''}
          leadEmail={lead?.email}
          bookingUrl={myBookingUrl}
          onClose={() => {
            setShowCalBooking(false)
            qc.invalidateQueries({ queryKey: ['lead-calls', id] })
            qc.invalidateQueries({ queryKey: ['lead', id] })
            setPollingCalls(true)
            setTimeout(() => setPollingCalls(false), 15000)
          }}
        />
      )}

      {/* Send call link modal */}
      {showCallLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-gray-900 border border-gray-800 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-indigo-400" />
                <h2 className="text-base font-semibold text-gray-100">Envoyer un lien de RDV</h2>
              </div>
              <button onClick={() => setShowCallLink(false)} className="text-gray-500 hover:text-gray-300">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Destinataire</p>
                <p className="text-sm text-gray-300 rounded-lg bg-gray-800 px-3 py-2">
                  {lead.email ?? <span className="text-red-400">Ce lead n'a pas d'email</span>}
                </p>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Lien de réservation *</label>
                <input
                  type="url"
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                  placeholder="https://calendly.com/votre-lien"
                  value={callLinkUrl}
                  onChange={(e) => setCallLinkUrl(e.target.value)}
                  autoFocus
                />
                {myBookingUrl && !callLinkUrl && (
                  <button
                    onClick={() => setCallLinkUrl(myBookingUrl)}
                    className="mt-1 text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    Utiliser le lien par défaut
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Message personnalisé</label>
                <textarea
                  rows={3}
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none resize-none"
                  placeholder="Bonjour, suite à notre échange, je vous invite à réserver votre appel diagnostic..."
                  value={callLinkMsg}
                  onChange={(e) => setCallLinkMsg(e.target.value)}
                />
              </div>

              {sendCallLinkMutation.isError && (
                <p className="text-xs text-red-400">
                  Erreur lors de l'envoi. Vérifiez que le lead a un email valide.
                </p>
              )}
              {sendCallLinkMutation.isSuccess && (
                <p className="text-xs text-emerald-400">Email envoyé avec succès ✓</p>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setShowCallLink(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">
                Annuler
              </button>
              <button
                disabled={!callLinkUrl.trim() || !lead.email || sendCallLinkMutation.isPending}
                onClick={() => sendCallLinkMutation.mutate({ bookingUrl: callLinkUrl, message: callLinkMsg })}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm text-white font-medium disabled:opacity-50 transition-colors"
              >
                <Send size={14} />
                {sendCallLinkMutation.isPending ? 'Envoi...' : 'Envoyer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-3">
          <button onClick={() => navigate('/leads')} className="mt-1 text-gray-500 hover:text-gray-300 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-100">{lead.name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">Entré le {formatDate(lead.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => myBookingUrl ? setShowPreBooking(true) : setShowAddCall(true)}
            className="flex items-center gap-2 rounded-lg border border-indigo-700/50 bg-indigo-900/30 px-3 py-1.5 text-xs text-indigo-300 hover:border-indigo-500 hover:bg-indigo-900/60 transition-colors"
            title={myBookingUrl ? 'Programmer un appel via Cal.com' : 'Programmer un appel manuellement'}
          >
            <CalendarDays size={14} />
            Programmer un appel
          </button>
          <button
            onClick={() => {
              setCallLinkUrl(myBookingUrl)
              setCallLinkMsg('')
              sendCallLinkMutation.reset()
              setShowCallLink(true)
            }}
            className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:border-indigo-500 hover:text-indigo-400 transition-colors"
            title={!lead.email ? 'Ce lead n\'a pas d\'email' : 'Envoyer un lien de réservation'}
          >
            <CalendarClock size={14} />
            Lien de RDV
          </button>
          <button
            onClick={() => { if (confirm('Supprimer ce lead ?')) deleteMutation.mutate() }}
            className="text-gray-600 hover:text-red-400 transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Left column: info + status */}
        <div className="col-span-1 space-y-4">
          {/* Contact info */}
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Contact</h3>
            <InfoRow icon={User}  label="Nom"       value={lead.name} />
            <InfoRow icon={Mail}  label="Email"     value={lead.email ?? undefined} />
            <InfoRow icon={Phone} label="Téléphone" value={lead.phone ?? undefined} />
            <InfoRow icon={User}  label="Âge"       value={lead.age != null ? `${lead.age} ans` : undefined} />
          </div>

          {/* Source */}
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Source</h3>
            <InfoRow icon={Globe} label="UTM Source"    value={lead.utm_source ?? undefined} />
            <InfoRow icon={Globe} label="Réseau déclaré" value={lead.reseau_source ?? undefined} />
            {lead.motivation && (
              <div>
                <p className="text-xs text-gray-500 mb-1">Motivation</p>
                <p className="text-sm text-gray-300 italic">"{lead.motivation}"</p>
              </div>
            )}
          </div>

          {/* Pipeline */}
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pipeline</h3>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Statut pipeline</label>
              <select
                className={cn('w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm font-medium focus:border-indigo-500 focus:outline-none', pipelineOpt?.color ?? 'text-gray-300')}
                value={lead.pipeline_status}
                onChange={(e) => pipelineMutation.mutate(e.target.value as PipelineStatus)}
              >
                {PIPELINE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Budget / montant opportunité */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Budget / valeur opportunité</label>
              {editBudget ? (
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={budgetInput}
                    onChange={e => setBudgetInput(e.target.value)}
                    placeholder="0"
                    className="flex-1 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') budgetMutation.mutate(budgetInput ? Number(budgetInput) : null)
                      if (e.key === 'Escape') setEditBudget(false)
                    }}
                  />
                  <button
                    onClick={() => budgetMutation.mutate(budgetInput ? Number(budgetInput) : null)}
                    disabled={budgetMutation.isPending}
                    className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs text-white font-medium disabled:opacity-50"
                  >
                    {budgetMutation.isPending ? '…' : 'OK'}
                  </button>
                  <button onClick={() => setEditBudget(false)} className="px-2 text-gray-500 hover:text-gray-300">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setBudgetInput(String(lead.opportunity_amount ?? '')); setEditBudget(true) }}
                  className="flex items-center gap-2 w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-left hover:border-indigo-600/50 transition-colors group"
                >
                  <span className={lead.opportunity_amount ? 'text-emerald-400 font-semibold' : 'text-gray-600'}>
                    {lead.opportunity_amount
                      ? `${lead.opportunity_amount.toLocaleString('fr-FR')} F CFA`
                      : 'Non renseigné'}
                  </span>
                  <Pencil size={11} className="text-gray-600 group-hover:text-gray-400 ml-auto" />
                </button>
              )}
            </div>
          </div>

          {/* Convert to student — shown when Won */}
          {lead.pipeline_status === 'won' && (
            <div className="rounded-xl border border-green-800/50 bg-green-950/20 p-4">
              {lead.student_id ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-green-400">
                    <CheckCircle size={15} />
                    Converti en étudiant
                  </div>
                  <button
                    onClick={() => navigate(`/students/${lead.student_id}`)}
                    className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    <ExternalLink size={12} /> Voir la fiche
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-green-300 font-medium">Lead Won 🎉</p>
                  <button
                    disabled={convertMutation.isPending}
                    onClick={() => convertMutation.mutate()}
                    className="flex items-center gap-2 rounded-lg bg-green-700 hover:bg-green-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 transition-colors"
                  >
                    <GraduationCap size={13} />
                    {convertMutation.isPending ? 'Conversion...' : 'Convertir en étudiant'}
                  </button>
                </div>
              )}
              {convertMutation.isError && (
                <p className="mt-2 text-xs text-red-400">
                  {(convertMutation.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur'}
                </p>
              )}
            </div>
          )}

          {/* Offres liées */}
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Offres liées</h3>
              <button
                onClick={() => setShowAddOffer(v => !v)}
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
              >
                <Plus size={12} /> Ajouter
              </button>
            </div>

            {/* Offer selector */}
            {showAddOffer && (
              <div className="mb-3">
                <select
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
                  defaultValue=""
                  onChange={(e) => {
                    if (!e.target.value) return
                    const current = lead.offer_ids.map(o => o._id)
                    if (current.includes(e.target.value)) return
                    offersMutation.mutate([...current, e.target.value])
                  }}
                  disabled={offersMutation.isPending}
                >
                  <option value="">— Sélectionner une offre —</option>
                  {offers
                    .filter(o => !lead.offer_ids.some(lo => lo._id === o._id))
                    .map(o => (
                      <option key={o._id} value={o._id}>{o.name}</option>
                    ))}
                </select>
              </div>
            )}

            {lead.offer_ids.length > 0 ? (
              <div className="space-y-1.5">
                {lead.offer_ids.map((offer) => {
                  const plan = offer.plans?.find((p) => p.isActive) ?? offer.plans?.[0]
                  return (
                    <div key={offer._id} className="flex items-center justify-between rounded-lg bg-gray-800 px-3 py-2">
                      <span className="text-sm text-gray-200">{offer.name}</span>
                      <div className="flex items-center gap-2">
                        {plan && (
                          <span className="text-xs text-gray-400">
                            {plan.price.toLocaleString()} {plan.currency}
                          </span>
                        )}
                        <button
                          onClick={() => {
                            const remaining = lead.offer_ids.filter(o => o._id !== offer._id).map(o => o._id)
                            offersMutation.mutate(remaining)
                          }}
                          disabled={offersMutation.isPending}
                          className="text-gray-600 hover:text-red-400 transition-colors"
                          title="Délier cette offre"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-600">Aucune offre liée.</p>
            )}
          </div>

          {/* Dynamic fields */}
          {lead.dynamic_fields && Object.keys(lead.dynamic_fields).length > 0 && (
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Réponses Typebot</h3>
              <div className="space-y-3">
                {Object.entries(lead.dynamic_fields).map(([k, v]) => (
                  <DynamicField key={k} slug={k} value={String(v ?? '')} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: notes + calls */}
        <div className="col-span-2 space-y-5">
          {/* Notes */}
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</h3>
              {!editNotes && (
                <button onClick={() => { setNotes(lead.notes); setEditNotes(true) }} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1">
                  <Pencil size={12} /> Modifier
                </button>
              )}
            </div>
            {editNotes ? (
              <div className="space-y-2">
                <textarea
                  rows={4}
                  className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none resize-none"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditNotes(false)} className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200">Annuler</button>
                  <button onClick={() => notesMutation.mutate(notes)} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs text-white">
                    {notesMutation.isPending ? 'Sauvegarde...' : 'Sauvegarder'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-300 whitespace-pre-wrap">
                {lead.notes || <span className="text-gray-600">Aucune note.</span>}
              </p>
            )}
          </div>

          {/* Timeline */}
          {lead.events && lead.events.length > 0 && (
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4">Historique</h3>
              <LeadTimeline events={[...lead.events].reverse()} />
            </div>
          )}

          {/* Paiements liés */}
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
                <CreditCard size={12} />
                Paiements liés ({linkedTransactions.length})
              </h3>
              <button
                onClick={() => setShowLinkTxModal(true)}
                className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300"
              >
                <Link2 size={12} /> Lier une transaction
              </button>
            </div>
            {linkedTransactions.length > 0 ? (
              <div className="space-y-2">
                {linkedTransactions.map((tx) => (
                  <div key={tx._id} className="flex items-center gap-3 rounded-lg bg-gray-800/60 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-200 truncate">{tx.description}</span>
                        <span className={cn('text-[11px] font-medium shrink-0', TX_STATUS_COLOR[tx.status] ?? 'text-gray-400')}>
                          {TX_STATUS_LABEL[tx.status] ?? tx.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-500">
                        <span>{new Date(tx.date).toLocaleDateString('fr-FR')}</span>
                        <span>{GATEWAY_LABELS[tx.gateway] ?? tx.gateway}</span>
                        {tx.offerName && <span className="text-indigo-400">{tx.offerName}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cn('text-sm font-semibold', tx.type === 'income' ? 'text-green-400' : 'text-red-400')}>
                        {tx.type === 'expense' ? '−' : '+'}{tx.amount.toLocaleString('fr-FR')} {tx.currency}
                      </p>
                    </div>
                    <button
                      onClick={() => unlinkTxMutation.mutate(tx._id)}
                      disabled={unlinkTxMutation.isPending}
                      className="text-gray-600 hover:text-red-400 transition-colors shrink-0"
                      title="Délier"
                    >
                      <Link2Off size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-xs text-gray-600 py-4">
                Aucun paiement lié. Liez une transaction depuis les finances ou ci-dessus.
              </p>
            )}
          </div>

          {/* Link transaction modal */}
          {showLinkTxModal && id && lead && (
            <LinkTransactionModal
              leadId={id}
              leadName={lead.name}
              onClose={() => setShowLinkTxModal(false)}
              onLinked={() => { refetchTx(); setShowLinkTxModal(false) }}
            />
          )}

          {/* Calls */}
          <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Appels ({calls.length})
              </h3>
              <button
                onClick={() => setShowAddCall(true)}
                className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300"
              >
                <Plus size={12} /> Nouvel appel
              </button>
            </div>
            <div className="space-y-3">
              {calls.map((call) => (
                <CallCard
                  key={call._id}
                  leadId={lead._id}
                  call={call}
                  offers={offers}
                  onUpdate={() => qc.invalidateQueries({ queryKey: ['lead', id] })}
                />
              ))}
              {calls.length === 0 && (
                <p className="text-center text-xs text-gray-600 py-6">
                  Aucun appel enregistré. Planifiez le premier appel diagnostic.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
