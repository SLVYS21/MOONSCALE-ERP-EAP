import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Phone, Mail, Globe, User, Pencil,
  Plus, ExternalLink, Sparkles, CheckCircle, XCircle,
  Clock, ChevronDown, Trash2, GraduationCap,
  GitBranch, Star, PhoneCall, PhoneOff, UserCheck, ChevronUp,
  CalendarClock, Send, X, CalendarDays, ChevronLeft, ChevronRight,
  Video, Loader2,
} from 'lucide-react'
import api from '@/services/api'
import type { Lead, LeadCall, SubscriptionOffer, PipelineStatus, AppSettings } from '@/types'
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

function AddCallModal({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ date: '', google_meet_link: '', status: 'planned' as const })

  const mutation = useMutation({
    mutationFn: (data: typeof form) => api.post(`/leads/${leadId}/calls`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lead-calls', leadId] }); onClose() },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl bg-gray-900 border border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-gray-100 mb-5">Nouvel appel</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Date & heure</label>
            <input type="datetime-local" className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Lien Google Meet</label>
            <input className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none" placeholder="https://meet.google.com/..." value={form.google_meet_link} onChange={(e) => setForm((f) => ({ ...f, google_meet_link: e.target.value }))} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">Annuler</button>
          <button
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(form)}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm text-white font-medium disabled:opacity-50"
          >
            {mutation.isPending ? 'Création...' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Cal.com Booking Modal ─────────────────────────────────────────────────────

function CalComBookingModal({ leadId, leadName, onClose }: {
  leadId: string
  leadName: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [weekOffset, setWeekOffset] = useState(0)

  const { data: slots, isLoading, error } = useQuery<Record<string, { time: string }[]>>({
    queryKey: ['calcom-slots', leadId],
    queryFn: () => api.get(`/leads/${leadId}/calcom/slots`).then(r => r.data),
    staleTime: 60_000,
    retry: false,
  })

  const bookMutation = useMutation({
    mutationFn: (slot: string) => api.post(`/leads/${leadId}/calcom/book`, { slot }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-calls', leadId] })
      qc.invalidateQueries({ queryKey: ['lead', leadId] })
      onClose()
    },
  })

  const sortedDates = useMemo(() => Object.keys(slots ?? {}).sort(), [slots])

  // Week navigation over available dates
  const WEEK = 7
  const startIdx = weekOffset * WEEK
  const visibleDates = sortedDates.slice(startIdx, startIdx + WEEK)
  const canPrev = weekOffset > 0
  const canNext = startIdx + WEEK < sortedDates.length

  function fmtDate(iso: string) {
    const d = new Date(iso + 'T12:00:00')
    return {
      day: d.toLocaleDateString('fr-FR', { weekday: 'short' }),
      num: d.getDate(),
      month: d.toLocaleDateString('fr-FR', { month: 'short' }),
    }
  }

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('fr-FR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Abidjan',
    })
  }

  const slotsForDate = selectedDate ? (slots?.[selectedDate] ?? []) : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-gray-900 border border-gray-700 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <CalendarDays size={18} className="text-indigo-400" />
            <div>
              <h2 className="text-[15px] font-semibold text-gray-100">Programmer un appel</h2>
              <p className="text-xs text-gray-500">{leadName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={24} className="text-indigo-400 animate-spin" />
              <p className="text-sm text-gray-500">Chargement des créneaux…</p>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
              {(error as { response?: { data?: { message?: string } } }).response?.data?.message
                ?? "Impossible de charger les créneaux. Vérifiez que votre profil a un Cal.com event type configuré."}
            </div>
          )}

          {!isLoading && !error && sortedDates.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-500">
              Aucun créneau disponible dans les 14 prochains jours.
            </div>
          )}

          {!isLoading && !error && sortedDates.length > 0 && (
            <>
              {/* Date selector */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Choisir une date</p>
                  <div className="flex items-center gap-1">
                    <button
                      disabled={!canPrev}
                      onClick={() => { setWeekOffset(w => w - 1); setSelectedDate(null); setSelectedSlot(null) }}
                      className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      disabled={!canNext}
                      onClick={() => { setWeekOffset(w => w + 1); setSelectedDate(null); setSelectedSlot(null) }}
                      className="p-1 rounded hover:bg-gray-800 text-gray-500 hover:text-gray-300 disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {visibleDates.map(d => {
                    const f = fmtDate(d)
                    const active = d === selectedDate
                    const count = slots?.[d]?.length ?? 0
                    return (
                      <button
                        key={d}
                        onClick={() => { setSelectedDate(d); setSelectedSlot(null) }}
                        className={cn(
                          'flex flex-col items-center rounded-xl py-2.5 px-1 transition-all text-center',
                          active
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-800/60 hover:bg-gray-800 text-gray-300',
                        )}
                      >
                        <span className="text-[10px] font-medium uppercase opacity-70 capitalize">{f.day}</span>
                        <span className="text-[17px] font-bold leading-tight">{f.num}</span>
                        <span className="text-[10px] opacity-60 capitalize">{f.month}</span>
                        <span className={cn(
                          'mt-1 text-[10px] font-semibold',
                          active ? 'text-indigo-200' : 'text-indigo-400',
                        )}>
                          {count}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Time slots */}
              {selectedDate && (
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2.5">
                    Créneaux disponibles
                  </p>
                  {slotsForDate.length === 0 ? (
                    <p className="text-sm text-gray-500">Aucun créneau pour cette date.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-1.5 max-h-44 overflow-y-auto pr-1">
                      {slotsForDate.map(s => (
                        <button
                          key={s.time}
                          onClick={() => setSelectedSlot(s.time)}
                          className={cn(
                            'rounded-lg py-2 text-[13px] font-medium transition-all',
                            selectedSlot === s.time
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-800 hover:bg-gray-700 text-gray-300',
                          )}
                        >
                          {fmtTime(s.time)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Confirm */}
              {selectedSlot && (
                <div className="rounded-xl border border-indigo-700/40 bg-indigo-950/30 px-4 py-3 mb-4">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Video size={13} className="text-indigo-400" />
                    <p className="text-xs font-semibold text-indigo-300">Récapitulatif</p>
                  </div>
                  <p className="text-sm text-gray-200">
                    {new Date(selectedSlot).toLocaleDateString('fr-FR', {
                      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Abidjan',
                    })}
                    {' à '}
                    {new Date(selectedSlot).toLocaleTimeString('fr-FR', {
                      hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Abidjan',
                    })}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Un email de confirmation avec fichier .ics sera envoyé automatiquement.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Error from booking */}
          {bookMutation.isError && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-2.5 text-sm text-red-400 mb-3">
              {(bookMutation.error as { response?: { data?: { message?: string } } }).response?.data?.message
                ?? 'Erreur lors de la réservation.'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-800">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors">
            Annuler
          </button>
          <button
            disabled={!selectedSlot || bookMutation.isPending}
            onClick={() => selectedSlot && bookMutation.mutate(selectedSlot)}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {bookMutation.isPending && <Loader2 size={13} className="animate-spin" />}
            {bookMutation.isPending ? 'Réservation...' : 'Confirmer le RDV'}
          </button>
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
  const [showAddCall, setShowAddCall] = useState(false)
  const [showCalBooking, setShowCalBooking] = useState(false)
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
  })

  const { data: offers = [] } = useQuery({
    queryKey: ['subscription-offers-active'],
    queryFn: () => api.get('/subscription-offers', { params: { activeOnly: 'true' } }).then((r) => r.data as SubscriptionOffer[]),
  })

  const { data: appSettings } = useQuery<AppSettings>({
    queryKey: ['app-settings'],
    queryFn: () => api.get('/app-settings').then((r) => r.data),
  })

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
      {showAddCall && id && <AddCallModal leadId={id} onClose={() => setShowAddCall(false)} />}
      {showCalBooking && id && (
        <CalComBookingModal
          leadId={id}
          leadName={lead?.name ?? ''}
          onClose={() => setShowCalBooking(false)}
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
                {appSettings?.callBookingUrl && !callLinkUrl && (
                  <button
                    onClick={() => setCallLinkUrl(appSettings.callBookingUrl ?? '')}
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
            onClick={() => setShowCalBooking(true)}
            className="flex items-center gap-2 rounded-lg border border-indigo-700/50 bg-indigo-900/30 px-3 py-1.5 text-xs text-indigo-300 hover:border-indigo-500 hover:bg-indigo-900/60 transition-colors"
            title="Programmer un appel via Cal.com"
          >
            <CalendarDays size={14} />
            Programmer un appel
          </button>
          <button
            onClick={() => {
              setCallLinkUrl(appSettings?.callBookingUrl ?? '')
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
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Offres liées</h3>
            {lead.offer_ids.length > 0 ? (
              <div className="space-y-1.5">
                {lead.offer_ids.map((offer) => {
                  const plan = offer.plans?.find((p) => p.isActive) ?? offer.plans?.[0]
                  return (
                    <div key={offer._id} className="flex items-center justify-between rounded-lg bg-gray-800 px-3 py-2">
                      <span className="text-sm text-gray-200">{offer.name}</span>
                      {plan && (
                        <span className="text-xs text-gray-400">
                          {plan.price.toLocaleString()} {plan.currency}
                        </span>
                      )}
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
