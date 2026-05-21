import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/services/api'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import {
  Plus, X, Play, Sparkles, Check, ChevronDown, ChevronRight,
  Trash2, Mic, Video, Zap, Users, TrendingUp, Loader2,
  Download, ExternalLink, ArrowRight, Settings, Target, List,
  BookOpen, FileText, Square, Calendar, ArrowUpDown,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type ContentStatus = 'idee' | 'script' | 'tournage' | 'montage' | 'publie'
type ContentCategory = 'educatif' | 'preuve-sociale' | 'viral' | 'podcast'
type ContentFormat =
  | 'talking-head' | 'valeur-ecommerce' | 'mindset' | 'etude-de-cas' | 'erreurs-lecons'
  | 'interview-etudiant' | 'challenge'
  | 'comparatif' | 'vision-marche' | 'coulisses' | 'personnalite'
  | 'podcast'
type DurationType = 'court' | 'long'
type SuggestionStatus = 'new' | 'saved' | 'dismissed'

interface ChecklistItem { id: string; label: string; done: boolean }
interface Hook { text: string; selected: boolean }

interface VideoProject {
  _id: string
  title: string
  status: ContentStatus
  category: ContentCategory
  format: ContentFormat
  duration_type: DurationType
  target_date: string | null
  published_url: string | null
  youtube_ref_url: string | null
  notes: string
  brain_dump: string
  value_proposition: string
  key_points: string[]
  guest_name: string | null
  guest_value: string
  analysis: string
  hooks: Hook[]
  script_outline: string
  full_script: string
  thumbnail_descriptions: string[]
  generated_thumbnails: string[]
  suggested_questions: string[]
  checklist: ChecklistItem[]
  createdAt: string
}

interface ContentSuggestion {
  _id: string
  title: string
  rationale: string
  category: ContentCategory
  format: ContentFormat
  duration_type: DurationType
  creator_inspiration: string
  status: SuggestionStatus
  createdAt: string
}

interface ContentCreator {
  _id: string
  name: string
  channel_url: string
  platform: 'youtube' | 'tiktok' | 'instagram'
}

interface ContentCapture {
  _id: string
  text: string
  source: 'text' | 'voice'
  createdAt: string
}

interface CreateModalInitialData {
  brain_dump?: string
  title?: string
  category?: ContentCategory
  format?: ContentFormat
  duration_type?: DurationType
  notes?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<ContentCategory, {
  label: string
  icon: React.ElementType
  color: string
  bg: string
  activeBorder: string
  formats: ContentFormat[]
}> = {
  educatif: {
    label: 'Éducatif', icon: Video,
    color: 'text-blue-400', bg: 'bg-blue-500/10', activeBorder: 'border-blue-500',
    formats: ['talking-head', 'valeur-ecommerce', 'mindset', 'etude-de-cas', 'erreurs-lecons'],
  },
  'preuve-sociale': {
    label: 'Preuve Sociale', icon: Users,
    color: 'text-emerald-400', bg: 'bg-emerald-500/10', activeBorder: 'border-emerald-500',
    formats: ['interview-etudiant', 'challenge'],
  },
  viral: {
    label: 'Viral & Lifestyle', icon: TrendingUp,
    color: 'text-orange-400', bg: 'bg-orange-500/10', activeBorder: 'border-orange-500',
    formats: ['comparatif', 'vision-marche', 'coulisses', 'personnalite'],
  },
  podcast: {
    label: 'Podcast', icon: Mic,
    color: 'text-purple-400', bg: 'bg-purple-500/10', activeBorder: 'border-purple-500',
    formats: ['podcast'],
  },
}

const FORMAT_LABELS: Record<ContentFormat, string> = {
  'talking-head': 'Talking Head',
  'valeur-ecommerce': 'Valeur E-commerce',
  'mindset': 'Mindset',
  'etude-de-cas': 'Étude de Cas',
  'erreurs-lecons': 'Erreurs & Leçons',
  'interview-etudiant': 'Interview Étudiant',
  'challenge': 'Challenge',
  'comparatif': 'Comparatif & Débat',
  'vision-marche': 'Vision Marché Africain',
  'coulisses': 'Coulisses',
  'personnalite': 'Personnalité Publique',
  'podcast': 'Podcast',
}

const STATUS_STEPS: { key: ContentStatus; label: string }[] = [
  { key: 'idee',     label: 'Idée' },
  { key: 'script',   label: 'Script' },
  { key: 'tournage', label: 'Tournage' },
  { key: 'montage',  label: 'Montage' },
  { key: 'publie',   label: 'Publié' },
]

const STATUS_IDX: Record<ContentStatus, number> = {
  idee: 0, script: 1, tournage: 2, montage: 3, publie: 4,
}

// ── YouTube Embed ─────────────────────────────────────────────────────────────

function extractYTId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

function YouTubeCard({ url }: { url: string }) {
  const [showPlayer, setShowPlayer] = useState(false)
  const [title, setTitle] = useState<string | null>(null)
  const id = extractYTId(url)

  useEffect(() => {
    if (!id) return
    fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`)
      .then(r => r.json()).then(d => setTitle(d.title)).catch(() => {})
  }, [id])

  if (!id) return null
  return (
    <div className="rounded-lg overflow-hidden border border-gray-800">
      {showPlayer ? (
        <iframe src={`https://www.youtube.com/embed/${id}?autoplay=1`} className="w-full aspect-video" allow="autoplay; encrypted-media" allowFullScreen />
      ) : (
        <div className="relative cursor-pointer group" onClick={() => setShowPlayer(true)}>
          <img src={`https://img.youtube.com/vi/${id}/hqdefault.jpg`} className="w-full aspect-video object-cover" alt={title ?? ''} />
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 group-hover:bg-black/40 transition-colors">
            <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
            </div>
          </div>
          {title && (
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-3">
              <p className="text-xs text-white font-medium line-clamp-1">{title}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Project Card ──────────────────────────────────────────────────────────────

function ProjectCard({ project, onClick }: { project: VideoProject; onClick: () => void }) {
  const cat = CATEGORY_CONFIG[project.category] ?? CATEGORY_CONFIG.educatif
  const CatIcon = cat.icon
  const statusIdx = STATUS_IDX[project.status] ?? 0
  const done = project.checklist.filter(c => c.done).length
  const total = project.checklist.length
  const selectedHook = project.hooks.find(h => h.selected)?.text ?? project.hooks[0]?.text

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 hover:bg-gray-800 transition-all duration-150 cursor-pointer group"
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn('flex items-center gap-1 text-xs px-2 py-0.5 rounded-md font-medium', cat.bg, cat.color)}>
            <CatIcon className="w-3 h-3" />
            {cat.label}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-md bg-gray-800 text-gray-400 border border-gray-700">
            {FORMAT_LABELS[project.format] ?? project.format}
          </span>
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded font-bold tracking-wide uppercase',
            project.duration_type === 'court'
              ? 'bg-amber-500/15 text-amber-400'
              : 'bg-blue-500/15 text-blue-400',
          )}>
            {project.duration_type === 'court' ? 'Court' : 'Long'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {STATUS_STEPS.map((s, i) => (
            <div
              key={s.key}
              className={cn(
                'w-1.5 h-1.5 rounded-full transition-all',
                i < statusIdx ? 'bg-emerald-500' : i === statusIdx ? 'bg-blue-400' : 'bg-gray-700',
              )}
            />
          ))}
        </div>
      </div>

      <h3 className="text-sm font-semibold text-gray-100 leading-snug mb-1.5 group-hover:text-white transition-colors">
        {project.title}
      </h3>

      {project.format === 'podcast' && project.guest_name ? (
        <p className="text-xs text-purple-400 mb-2">Invité · {project.guest_name}</p>
      ) : selectedHook ? (
        <p className="text-xs text-gray-500 mb-2 line-clamp-1 italic">"{selectedHook}"</p>
      ) : project.value_proposition ? (
        <p className="text-xs text-gray-500 mb-2 line-clamp-1">{project.value_proposition}</p>
      ) : null}

      {total > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.round((done / total) * 100)}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-600 tabular-nums">{done}/{total}</span>
        </div>
      )}
    </button>
  )
}

// ── Create Modal (brain dump → structured form) ────────────────────────────────

function CreateModal({ onClose, onCreate, initialData }: {
  onClose: () => void
  onCreate: (data: { title: string; category: ContentCategory; format: ContentFormat; duration_type: DurationType; guest_name?: string; youtube_ref_url?: string; brain_dump?: string; notes?: string }) => void
  initialData?: CreateModalInitialData
}) {
  // If we have initialData (from a capture conversion), start at 'form'
  const resolvedCategory = (initialData?.category && CATEGORY_CONFIG[initialData.category])
    ? initialData.category : 'educatif'
  const validFormats = CATEGORY_CONFIG[resolvedCategory].formats
  const resolvedFormat = (initialData?.format && validFormats.includes(initialData.format))
    ? initialData.format : validFormats[0]

  const [step, setStep] = useState<'dump' | 'form'>(initialData ? 'form' : 'dump')
  const [brainDump, setBrainDump] = useState(initialData?.brain_dump ?? '')
  const [isStructuring, setIsStructuring] = useState(false)

  // Form fields
  const [title, setTitle] = useState(initialData?.title ?? '')
  const [category, setCategory] = useState<ContentCategory>(resolvedCategory)
  const [format, setFormat] = useState<ContentFormat>(resolvedFormat)
  const [duration, setDuration] = useState<DurationType>(initialData?.duration_type ?? 'long')
  const [guestName, setGuestName] = useState('')
  const [ytUrl, setYtUrl] = useState('')
  const [showRef, setShowRef] = useState(false)
  const [aiNotes, setAiNotes] = useState(initialData?.notes ?? '')
  const ytId = extractYTId(ytUrl)

  const handleCategoryChange = (c: ContentCategory) => {
    setCategory(c)
    setFormat(CATEGORY_CONFIG[c].formats[0])
  }

  const handleStructureWithAI = async () => {
    if (!brainDump.trim()) return
    setIsStructuring(true)
    try {
      const { data } = await api.post('/content/projects/quick-structure', { raw_idea: brainDump.trim() })
      setTitle(data.title ?? '')
      if (data.category && CATEGORY_CONFIG[data.category as ContentCategory]) {
        setCategory(data.category)
        const validFormats = CATEGORY_CONFIG[data.category as ContentCategory].formats
        setFormat(validFormats.includes(data.format) ? data.format : validFormats[0])
      }
      if (data.duration_type) setDuration(data.duration_type)
      if (data.notes) setAiNotes(data.notes)
      setStep('form')
    } catch {
      setStep('form')
    } finally {
      setIsStructuring(false)
    }
  }

  const handleCreate = () => {
    if (!title.trim()) return
    onCreate({
      title: title.trim(),
      category,
      format,
      duration_type: duration,
      ...(category === 'podcast' && guestName.trim() && { guest_name: guestName.trim() }),
      ...(ytUrl.trim() && { youtube_ref_url: ytUrl.trim() }),
      ...(brainDump.trim() && { brain_dump: brainDump.trim() }),
      ...(aiNotes && { notes: aiNotes }),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            {step === 'form' && brainDump.trim() && (
              <button
                onClick={() => setStep('dump')}
                className="text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
            )}
            <h2 className="text-base font-semibold text-gray-100">
              {step === 'dump' ? 'Capture ton idée' : 'Nouvelle idée'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === 'dump' ? (
          /* ── Step 1: Brain dump ── */
          <div className="px-5 py-5">
            <p className="text-xs text-gray-500 mb-4">
              Décris ton idée librement — la structure, le format, l'angle. L'IA va organiser ça pour toi.
            </p>
            <textarea
              autoFocus
              value={brainDump}
              onChange={e => setBrainDump(e.target.value)}
              placeholder="Une idée sur les erreurs que font les débutants en dropshipping... ou je veux faire une vidéo sur mon expérience de 0 à 100 ventes..."
              rows={6}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-gray-600 transition-colors resize-none leading-relaxed"
            />
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={handleStructureWithAI}
                disabled={!brainDump.trim() || isStructuring}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isStructuring
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Structuration en cours...</>
                  : <><Sparkles className="w-4 h-4" /> Structurer avec l'IA</>
                }
              </button>
              <button
                onClick={() => setStep('form')}
                className="w-full py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
              >
                Remplir manuellement
              </button>
            </div>
          </div>
        ) : (
          /* ── Step 2: Structured form ── */
          <>
            <div className="px-5 py-4 space-y-4">
              {/* AI-structured badge */}
              {brainDump.trim() && aiNotes && (
                <div className="flex items-start gap-2 p-3 bg-blue-500/5 border border-blue-500/15 rounded-xl">
                  <Sparkles className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-300 leading-relaxed">{aiNotes}</p>
                </div>
              )}

              {/* Title */}
              <div>
                <input
                  autoFocus
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && title.trim()) handleCreate() }}
                  placeholder="Titre de la vidéo..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-gray-600 transition-colors"
                />
              </div>

              {/* Category chips */}
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-widest mb-2 block">Catégorie</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.entries(CATEGORY_CONFIG) as [ContentCategory, typeof CATEGORY_CONFIG[ContentCategory]][]).map(([key, cfg]) => {
                    const Icon = cfg.icon
                    const isActive = category === key
                    return (
                      <button
                        key={key}
                        onClick={() => handleCategoryChange(key)}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all duration-150 cursor-pointer',
                          isActive
                            ? cn('border', cfg.activeBorder, cfg.bg, cfg.color)
                            : 'border-gray-800 text-gray-500 hover:border-gray-700 hover:text-gray-400',
                        )}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{cfg.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Format */}
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-widest mb-2 block">Format</label>
                <select
                  value={format}
                  onChange={e => setFormat(e.target.value as ContentFormat)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-gray-600 transition-colors cursor-pointer"
                >
                  {CATEGORY_CONFIG[category].formats.map(f => (
                    <option key={f} value={f}>{FORMAT_LABELS[f]}</option>
                  ))}
                </select>
              </div>

              {/* Duration */}
              <div>
                <label className="text-[10px] text-gray-500 uppercase tracking-widest mb-2 block">Format vidéo</label>
                <div className="grid grid-cols-2 gap-2">
                  {([['long', 'Long', 'YouTube (5-20 min)'], ['court', 'Court', 'Short / Reel (<90s)']] as const).map(([val, label, sub]) => (
                    <button
                      key={val}
                      onClick={() => setDuration(val)}
                      className={cn(
                        'flex flex-col items-start px-3 py-2.5 rounded-xl border text-left transition-all duration-150 cursor-pointer',
                        duration === val
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-gray-800 hover:border-gray-700',
                      )}
                    >
                      <span className={cn('text-sm font-semibold', duration === val ? 'text-blue-400' : 'text-gray-400')}>
                        {label}
                      </span>
                      <span className="text-[10px] text-gray-600 mt-0.5">{sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Guest name (podcast only) */}
              {category === 'podcast' && (
                <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                  <label className="text-[10px] text-gray-500 uppercase tracking-widest mb-2 block">Nom de l'invité</label>
                  <input
                    value={guestName}
                    onChange={e => setGuestName(e.target.value)}
                    placeholder="Prénom Nom"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-gray-600 transition-colors"
                  />
                </div>
              )}

              {/* YouTube reference (toggle) */}
              <div>
                <button
                  onClick={() => setShowRef(!showRef)}
                  className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-400 uppercase tracking-widest transition-colors cursor-pointer"
                >
                  {showRef ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  Vidéo de référence (optionnel)
                </button>
                {showRef && (
                  <div className="mt-2 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
                    <input
                      value={ytUrl}
                      onChange={e => setYtUrl(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-gray-600 transition-colors"
                    />
                    {ytId && <YouTubeCard url={ytUrl} />}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 px-5 pb-5">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-gray-800 text-sm text-gray-500 hover:text-gray-300 hover:border-gray-700 transition-all duration-150 cursor-pointer"
              >
                Annuler
              </button>
              <button
                disabled={!title.trim()}
                onClick={handleCreate}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer"
              >
                Créer <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Capture Modal (text + voice via MediaRecorder + Whisper) ──────────────────

function CaptureModal({ onClose, onSave }: {
  onClose: () => void
  onSave: (text: string, source: 'text' | 'voice') => void
}) {
  const [text, setText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [source, setSource] = useState<'text' | 'voice'>('text')
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [recordError, setRecordError] = useState('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (!isRecording) { setRecordingSeconds(0); return }
    const interval = setInterval(() => setRecordingSeconds(s => s + 1), 1000)
    return () => clearInterval(interval)
  }, [isRecording])

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
  }, [])

  const startRecording = async () => {
    setRecordError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      audioChunksRef.current = []

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : 'audio/mp4'

      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
        setIsRecording(false)

        if (audioChunksRef.current.length === 0) return

        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        setIsTranscribing(true)
        try {
          const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm'
          const formData = new FormData()
          formData.append('audio', blob, `capture.${ext}`)
          const { data } = await api.post('/content/projects/captures/transcribe', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
          setText(prev => prev ? prev + ' ' + data.text : data.text)
          setSource('voice')
        } catch {
          setRecordError('Transcription échouée. Réessaie ou tape ton idée.')
        } finally {
          setIsTranscribing(false)
        }
      }

      recorder.start()
      setIsRecording(true)
      setSource('voice')
    } catch {
      setRecordError('Microphone inaccessible. Vérifie les permissions de ton navigateur.')
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
  }

  const handleSave = () => {
    const full = text.trim()
    if (!full) return
    onClose()
    onSave(full, source)
  }

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={(!isRecording && !isTranscribing) ? onClose : undefined} />
      <div className="relative bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-800">
          <div className="flex items-center gap-3">
            {isRecording ? (
              <>
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                <span className="text-sm font-semibold text-gray-100">Enregistrement</span>
                <span className="text-sm font-mono text-gray-500">{formatTime(recordingSeconds)}</span>
              </>
            ) : isTranscribing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-blue-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-gray-100">Transcription en cours...</span>
              </>
            ) : (
              <h2 className="text-base font-semibold text-gray-100">Capture rapide</h2>
            )}
          </div>
          {!isRecording && !isTranscribing && (
            <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="px-5 py-4 space-y-3">
          <textarea
            autoFocus={!isRecording && !isTranscribing}
            value={text}
            onChange={e => { if (!isRecording && !isTranscribing) setText(e.target.value) }}
            readOnly={isRecording || isTranscribing}
            placeholder={
              isRecording ? 'Parle, j\'enregistre...'
              : isTranscribing ? 'Transcription en cours...'
              : 'Tape ou dicte ton idée en vrac...'
            }
            rows={6}
            className={cn(
              'w-full border rounded-xl px-4 py-3 text-sm placeholder:text-gray-500 focus:outline-none resize-none leading-relaxed transition-colors',
              isRecording
                ? 'bg-red-500/5 border-red-500/30 text-gray-300 cursor-default'
                : isTranscribing
                ? 'bg-blue-500/5 border-blue-500/20 text-gray-400 cursor-default'
                : 'bg-gray-800 border-gray-700 text-gray-100 focus:border-gray-600',
            )}
          />

          {recordError && (
            <p className="text-xs text-red-400">{recordError}</p>
          )}

          <div className="flex items-center gap-2">
            {isTranscribing ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-blue-500/20 text-blue-400 text-sm flex-shrink-0">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Whisper...
              </div>
            ) : isRecording ? (
              <button
                onClick={stopRecording}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-all duration-150 cursor-pointer flex-shrink-0"
              >
                <Square className="w-3.5 h-3.5 fill-white" />
                Arrêter
              </button>
            ) : (
              <button
                onClick={startRecording}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/5 text-sm transition-all duration-150 cursor-pointer flex-shrink-0"
              >
                <Mic className="w-4 h-4" />
                Voix
              </button>
            )}

            <button
              disabled={!text.trim() || isRecording || isTranscribing}
              onClick={handleSave}
              className="flex-1 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm text-gray-200 font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              Sauvegarder
            </button>
          </div>

          {isRecording && (
            <p className="text-[11px] text-gray-600 text-center">
              Clique sur "Arrêter" — Whisper va transcrire automatiquement
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Captures Panel (brouillons bank) ─────────────────────────────────────────

function CapturesPanel({ onConvert }: {
  onConvert: (capture: ContentCapture, structured: CreateModalInitialData | null) => void
}) {
  const qc = useQueryClient()
  const [collapsed, setCollapsed] = useState(false)
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const { data: captures = [] } = useQuery<ContentCapture[]>({
    queryKey: ['content-captures'],
    queryFn: () => api.get('/content/projects/captures').then(r => r.data),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/content/projects/captures/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content-captures'] }),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      api.patch(`/content/projects/captures/${id}`, { text }).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['content-captures'] }); setEditingId(null) },
  })

  const handleConvert = async (capture: ContentCapture) => {
    setConvertingId(capture._id)
    try {
      const { data } = await api.post('/content/projects/quick-structure', { raw_idea: capture.text })
      onConvert(capture, data as CreateModalInitialData)
    } catch {
      onConvert(capture, null)
    } finally {
      setConvertingId(null)
    }
  }

  const formatDate = (dateStr: string) => {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
    if (diff < 60) return 'à l\'instant'
    if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`
    if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  if (captures.length === 0) return null

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-4">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-gray-800/50 transition-colors cursor-pointer"
      >
        {collapsed ? <ChevronRight className="w-4 h-4 text-gray-600" /> : <ChevronDown className="w-4 h-4 text-gray-600" />}
        <BookOpen className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-medium text-gray-300">Brouillons</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium">
          {captures.length}
        </span>
        <span className="ml-auto text-[11px] text-gray-600">
          {collapsed ? 'Afficher' : 'Réduire'}
        </span>
      </button>

      {!collapsed && (
        <div className="border-t border-gray-800 p-3 space-y-2">
          {captures.map(c => (
            <div
              key={c._id}
              className="group flex items-start gap-3 p-3 rounded-xl bg-gray-800/40 border border-gray-800 hover:border-gray-700 transition-all duration-150"
            >
              {/* Source icon */}
              <div className="flex-shrink-0 mt-0.5">
                {c.source === 'voice'
                  ? <Mic className="w-3.5 h-3.5 text-red-400/70" />
                  : <FileText className="w-3.5 h-3.5 text-gray-600" />
                }
              </div>

              {/* Content */}
              {editingId === c._id ? (
                <div className="flex-1 space-y-2">
                  <textarea
                    autoFocus
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    rows={3}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-gray-600 resize-none transition-colors"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateMut.mutate({ id: c._id, text: editText })}
                      disabled={updateMut.isPending || !editText.trim()}
                      className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs text-gray-200 disabled:opacity-40 cursor-pointer transition-all"
                    >
                      Enregistrer
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-300 cursor-pointer transition-colors"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm text-gray-300 leading-relaxed line-clamp-3 cursor-text hover:text-gray-200 transition-colors"
                      onClick={() => { setEditingId(c._id); setEditText(c.text) }}
                    >
                      {c.text}
                    </p>
                    <p className="text-[11px] text-gray-600 mt-1">{formatDate(c.createdAt)}</p>
                  </div>

                  {/* Actions (show on hover) */}
                  <div className="flex-shrink-0 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleConvert(c)}
                      disabled={convertingId === c._id}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-blue-400 hover:bg-blue-500/10 border border-blue-500/20 hover:border-blue-500/40 disabled:opacity-50 transition-all cursor-pointer"
                    >
                      {convertingId === c._id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Sparkles className="w-3 h-3" />
                      }
                      Idée
                    </button>
                    <button
                      onClick={() => deleteMut.mutate(c._id)}
                      className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Creators Modal ─────────────────────────────────────────────────────────────

function CreatorsModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [platform, setPlatform] = useState<'youtube' | 'tiktok' | 'instagram'>('youtube')

  const { data: creators = [] } = useQuery<ContentCreator[]>({
    queryKey: ['content-creators'],
    queryFn: () => api.get('/content/projects/creators').then(r => r.data),
  })

  const addMut = useMutation({
    mutationFn: () => api.post('/content/projects/creators', { name, channel_url: url, platform }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['content-creators'] })
      setName('')
      setUrl('')
    },
  })

  const removeMut = useMutation({
    mutationFn: (id: string) => api.delete(`/content/projects/creators/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content-creators'] }),
  })

  const PLATFORM_ICON: Record<string, React.ElementType> = {
    youtube: Play,
    tiktok: Play,
    instagram: Zap,
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-sm shadow-2xl">

        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-800">
          <h2 className="text-base font-semibold text-gray-100">Créateurs à suivre</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-gray-500">
            L'IA s'inspire de ces créateurs pour générer des idées de contenu chaque jour.
          </p>

          {/* Add form */}
          <div className="space-y-2">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nom du créateur"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-gray-600 transition-colors"
            />
            <div className="flex gap-2">
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && name.trim() && url.trim()) addMut.mutate() }}
                placeholder="URL de la chaîne..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-gray-600 transition-colors"
              />
              <select
                value={platform}
                onChange={e => setPlatform(e.target.value as typeof platform)}
                className="bg-gray-800 border border-gray-700 rounded-xl px-2 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-gray-600 transition-colors cursor-pointer"
              >
                <option value="youtube">YouTube</option>
                <option value="tiktok">TikTok</option>
                <option value="instagram">Instagram</option>
              </select>
            </div>
            <button
              disabled={!name.trim() || !url.trim() || addMut.isPending}
              onClick={() => addMut.mutate()}
              className="w-full py-2.5 rounded-xl bg-gray-800 border border-gray-700 hover:bg-gray-700 text-sm text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer"
            >
              {addMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Ajouter
            </button>
          </div>

          {/* Creators list */}
          {creators.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-gray-500 uppercase tracking-widest">Créateurs configurés</p>
              {creators.map(c => {
                const PlatformIcon = PLATFORM_ICON[c.platform] ?? Play
                return (
                  <div key={c._id} className="flex items-center gap-3 py-2 px-3 rounded-xl bg-gray-800/50 border border-gray-800 group">
                    <PlatformIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 font-medium truncate">{c.name}</p>
                      <p className="text-[11px] text-gray-600 truncate">{c.channel_url}</p>
                    </div>
                    <button
                      onClick={() => removeMut.mutate(c._id)}
                      className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {creators.length === 0 && (
            <div className="text-center py-4">
              <p className="text-sm text-gray-600">Aucun créateur configuré</p>
              <p className="text-xs text-gray-700 mt-1">Ajoute des créateurs pour que l'IA génère des idées inspirées de leur style</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Suggestions Panel ─────────────────────────────────────────────────────────

function SuggestionsPanel({ onSaved }: { onSaved: (projectId: string) => void }) {
  const qc = useQueryClient()
  const [showCreators, setShowCreators] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const { data: suggestions = [], isLoading } = useQuery<ContentSuggestion[]>({
    queryKey: ['content-suggestions'],
    queryFn: () => api.get('/content/projects/suggestions').then(r => r.data),
  })

  const activeSuggestions = suggestions.filter(s => s.status !== 'dismissed')

  const generateMut = useMutation({
    mutationFn: () => api.post('/content/projects/suggestions/generate').then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content-suggestions'] }),
  })

  const saveMut = useMutation({
    mutationFn: (id: string) => api.post(`/content/projects/suggestions/${id}/save`).then(r => r.data),
    onSuccess: (project: VideoProject) => {
      qc.invalidateQueries({ queryKey: ['content-suggestions'] })
      qc.invalidateQueries({ queryKey: ['video-projects'] })
      onSaved(project._id)
    },
  })

  const dismissMut = useMutation({
    mutationFn: (id: string) => api.patch(`/content/projects/suggestions/${id}`, { status: 'dismissed' }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content-suggestions'] }),
  })

  const { data: creators = [] } = useQuery<ContentCreator[]>({
    queryKey: ['content-creators'],
    queryFn: () => api.get('/content/projects/creators').then(r => r.data),
  })

  return (
    <>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-6">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-2 text-sm font-medium text-gray-300 hover:text-gray-100 transition-colors cursor-pointer"
          >
            {collapsed ? <ChevronRight className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
            <Sparkles className="w-4 h-4 text-violet-400" />
            Idées IA du jour
            {activeSuggestions.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 font-medium">
                {activeSuggestions.length}
              </span>
            )}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreators(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-all duration-150 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              {creators.length > 0 ? `${creators.length} créateur${creators.length > 1 ? 's' : ''}` : 'Configurer'}
            </button>
            <button
              onClick={() => generateMut.mutate()}
              disabled={generateMut.isPending}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 border border-violet-500/20 hover:border-violet-500/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer"
            >
              {generateMut.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Sparkles className="w-3.5 h-3.5" />
              }
              Générer
            </button>
          </div>
        </div>

        {/* Content */}
        {!collapsed && (
          <div className="p-4">
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-24 bg-gray-800 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : generateMut.isPending ? (
              <div className="flex items-center justify-center gap-3 py-8 text-sm text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
                L'IA génère vos idées du jour...
              </div>
            ) : activeSuggestions.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-gray-500 mb-1">Aucune suggestion pour le moment</p>
                <p className="text-xs text-gray-600 mb-4">
                  {creators.length === 0
                    ? 'Configure des créateurs de référence puis génère des idées'
                    : 'Clique sur Générer pour obtenir des idées IA basées sur tes créateurs'}
                </p>
                {creators.length === 0 && (
                  <button
                    onClick={() => setShowCreators(true)}
                    className="text-xs text-violet-400 hover:text-violet-300 underline transition-colors cursor-pointer"
                  >
                    Ajouter des créateurs →
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {activeSuggestions.map(s => {
                  const cat = CATEGORY_CONFIG[s.category] ?? CATEGORY_CONFIG.educatif
                  const CatIcon = cat.icon
                  return (
                    <div key={s._id} className="group bg-gray-800/50 border border-gray-800 rounded-xl p-3 flex flex-col gap-2 hover:border-gray-700 transition-all duration-150">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={cn('flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded font-medium', cat.bg, cat.color)}>
                          <CatIcon className="w-3 h-3" />
                          {cat.label}
                        </span>
                        <span className="text-[11px] text-gray-600">{FORMAT_LABELS[s.format] ?? s.format}</span>
                        <span className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded font-bold',
                          s.duration_type === 'court' ? 'text-amber-500' : 'text-blue-500',
                        )}>
                          {s.duration_type === 'court' ? 'Court' : 'Long'}
                        </span>
                      </div>

                      <p className="text-sm font-semibold text-gray-200 leading-snug">{s.title}</p>

                      {s.rationale && (
                        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{s.rationale}</p>
                      )}

                      {s.creator_inspiration && (
                        <p className="text-[11px] text-violet-500 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          {s.creator_inspiration}
                        </p>
                      )}

                      <div className="flex gap-2 mt-auto pt-1">
                        <button
                          onClick={() => saveMut.mutate(s._id)}
                          disabled={saveMut.isPending}
                          className="flex-1 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs text-white font-medium disabled:opacity-40 transition-all duration-150 cursor-pointer flex items-center justify-center gap-1"
                        >
                          {saveMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                          Enregistrer
                        </button>
                        <button
                          onClick={() => dismissMut.mutate(s._id)}
                          className="px-2.5 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-all duration-150 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {showCreators && <CreatorsModal onClose={() => setShowCreators(false)} />}
    </>
  )
}

// ── Project Drawer ─────────────────────────────────────────────────────────────

function Divider() {
  return <div className="border-t border-gray-800 my-1" />
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-3">{children}</p>
}

function ProjectDrawer({ initialProject, onClose }: {
  initialProject: VideoProject
  onClose: () => void
}) {
  const qc = useQueryClient()
  const autoAnalyzed = useRef(false)
  const [newCheckItem, setNewCheckItem] = useState('')
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [generatingImages, setGeneratingImages] = useState<Record<number, boolean>>({})
  const [localImages, setLocalImages] = useState<Record<number, string>>({})

  const { data: project = initialProject } = useQuery<VideoProject>({
    queryKey: ['video-project', initialProject._id],
    queryFn: () => api.get(`/content/projects/${initialProject._id}`).then(r => r.data),
    initialData: initialProject,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['video-projects'] })
    qc.invalidateQueries({ queryKey: ['video-project', project._id] })
  }

  const patchMut = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.patch(`/content/projects/${project._id}`, data).then(r => r.data),
    onSuccess: invalidate,
  })

  const analyzeMut = useMutation({
    mutationFn: () => api.post(`/content/projects/${project._id}/analyze`).then(r => r.data),
    onSuccess: invalidate,
  })

  const scriptMut = useMutation({
    mutationFn: () => api.post(`/content/projects/${project._id}/generate-script`).then(r => r.data),
    onSuccess: invalidate,
  })

  const hookMut = useMutation({
    mutationFn: (idx: number) => api.post(`/content/projects/${project._id}/select-hook`, { hook_index: idx }).then(r => r.data),
    onSuccess: invalidate,
  })

  const toggleMut = useMutation({
    mutationFn: (itemId: string) => api.post(`/content/projects/${project._id}/checklist/${itemId}/toggle`).then(r => r.data),
    onSuccess: invalidate,
  })

  const addCheckMut = useMutation({
    mutationFn: (label: string) => api.post(`/content/projects/${project._id}/checklist`, { label }).then(r => r.data),
    onSuccess: invalidate,
  })

  const removeCheckMut = useMutation({
    mutationFn: (itemId: string) => api.delete(`/content/projects/${project._id}/checklist/${itemId}`).then(r => r.data),
    onSuccess: invalidate,
  })

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/content/projects/${project._id}`),
    onSuccess: () => { invalidate(); onClose() },
  })

  // Auto-analyze on first open if no analysis yet
  useEffect(() => {
    if (!project.analysis && !autoAnalyzed.current) {
      autoAnalyzed.current = true
      const t = setTimeout(() => analyzeMut.mutate(), 600)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cat = CATEGORY_CONFIG[project.category] ?? CATEGORY_CONFIG.educatif
  const CatIcon = cat.icon
  const isPodcast = project.format === 'podcast'
  const currentStatusIdx = STATUS_IDX[project.status] ?? 0
  const nextStatus = STATUS_STEPS[currentStatusIdx + 1]
  const checkDone = project.checklist.filter(c => c.done).length
  const checkTotal = project.checklist.length
  const hasAnalysis = !!project.analysis
  const isAnalyzing = analyzeMut.isPending

  const handleGenerateThumbnail = async (description: string, idx: number) => {
    setGeneratingImages(prev => ({ ...prev, [idx]: true }))
    try {
      const { data } = await api.post(`/content/projects/${project._id}/generate-thumbnail`, {
        description, thumbnail_index: idx,
      })
      setLocalImages(prev => ({ ...prev, [idx]: `data:${data.mime_type};base64,${data.image_base64}` }))
      invalidate()
    } finally {
      setGeneratingImages(prev => ({ ...prev, [idx]: false }))
    }
  }

  const handleCategoryChange = (newCat: string) => {
    const c = newCat as ContentCategory
    const validFormats = CATEGORY_CONFIG[c]?.formats ?? []
    const newFormat = validFormats.includes(project.format) ? project.format : validFormats[0]
    patchMut.mutate({ category: c, format: newFormat })
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/60 cursor-pointer" onClick={onClose} />

      <div className="w-[580px] bg-gray-950 border-l border-gray-800 flex flex-col h-full">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-5 pt-5 pb-3 border-b border-gray-800">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <textarea
                key={project._id}
                defaultValue={project.title}
                onBlur={e => { if (e.target.value.trim() && e.target.value !== project.title) patchMut.mutate({ title: e.target.value.trim() }) }}
                rows={2}
                className="w-full bg-transparent text-gray-100 font-semibold text-base leading-snug resize-none focus:outline-none placeholder:text-gray-600"
                placeholder="Titre..."
              />
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <span className={cn('flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-medium', cat.bg, cat.color)}>
                  <CatIcon className="w-3 h-3" />
                  {cat.label}
                </span>
                <span className="text-[11px] text-gray-500">{FORMAT_LABELS[project.format]}</span>
                <button
                  onClick={() => patchMut.mutate({ duration_type: project.duration_type === 'long' ? 'court' : 'long' })}
                  className={cn(
                    'text-[10px] px-2 py-0.5 rounded font-bold tracking-wide uppercase cursor-pointer transition-all duration-150',
                    project.duration_type === 'court'
                      ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
                      : 'bg-blue-500/15 text-blue-400 hover:bg-blue-500/25',
                  )}
                >
                  {project.duration_type === 'court' ? 'Court' : 'Long'}
                </button>
                {isPodcast && project.guest_name && (
                  <span className="text-[11px] text-purple-400">· {project.guest_name}</span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-gray-600 hover:text-gray-300 transition-colors flex-shrink-0 cursor-pointer mt-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Status stepper ──────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-5 py-2.5 border-b border-gray-800 flex items-center gap-1">
          {STATUS_STEPS.map((step, i) => {
            const isDone = i < currentStatusIdx
            const isActive = i === currentStatusIdx
            return (
              <div key={step.key} className="flex items-center gap-1">
                <button
                  onClick={() => patchMut.mutate({ status: step.key })}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer',
                    isActive ? 'bg-blue-500/15 text-blue-400' :
                    isDone ? 'text-emerald-400 hover:bg-emerald-500/10' :
                    'text-gray-600 hover:text-gray-400',
                  )}
                >
                  {isDone && <Check className="w-3 h-3" />}
                  {step.label}
                </button>
                {i < STATUS_STEPS.length - 1 && (
                  <div className={cn('w-4 h-px', i < currentStatusIdx ? 'bg-emerald-700' : 'bg-gray-800')} />
                )}
              </div>
            )
          })}
          {nextStatus && (
            <button
              onClick={() => patchMut.mutate({ status: nextStatus.key })}
              className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-all duration-150 cursor-pointer"
            >
              {nextStatus.label} <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* ── Scrollable body ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-5 space-y-6">

            {/* ──── SECTION: ANALYSE IA ──── */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <SectionTitle>Analyse IA</SectionTitle>
                {hasAnalysis && !isAnalyzing && (
                  <button
                    onClick={() => analyzeMut.mutate()}
                    className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" /> Relancer
                  </button>
                )}
              </div>

              {isAnalyzing && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm text-gray-400 mb-4">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                    <span>L'IA analyse votre idée...</span>
                  </div>
                  {[40, 60, 50, 70, 45].map((w, i) => (
                    <div key={i} className="h-10 bg-gray-800 rounded-xl animate-pulse" style={{ width: `${w + 15}%` } as React.CSSProperties} />
                  ))}
                </div>
              )}

              {!hasAnalysis && !isAnalyzing && (
                <button
                  onClick={() => analyzeMut.mutate()}
                  className="w-full group rounded-xl border-2 border-dashed border-gray-700 hover:border-blue-500/50 hover:bg-blue-500/5 p-6 flex flex-col items-center gap-3 transition-all duration-200 cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                    <Sparkles className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-gray-200">Analyser avec l'IA</p>
                    <p className="text-xs text-gray-500 mt-1">Génère accroches, valeur, points clés, plan et idées de miniatures</p>
                  </div>
                </button>
              )}

              {hasAnalysis && !isAnalyzing && (
                <div className="space-y-4">

                  {/* Value proposition */}
                  {project.value_proposition && (
                    <div className="p-3.5 bg-emerald-500/5 border border-emerald-500/15 rounded-xl">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Target className="w-3.5 h-3.5 text-emerald-400" />
                        <p className="text-[10px] text-emerald-400 uppercase tracking-widest font-medium">Valeur apportée</p>
                      </div>
                      <p className="text-sm text-gray-300 leading-relaxed">{project.value_proposition}</p>
                    </div>
                  )}

                  {/* Key points */}
                  {project.key_points.length > 0 && (
                    <div className="border border-gray-800 rounded-xl p-3.5">
                      <div className="flex items-center gap-2 mb-2.5">
                        <List className="w-3.5 h-3.5 text-gray-500" />
                        <p className="text-[10px] text-gray-500 uppercase tracking-widest">Points clés à couvrir</p>
                      </div>
                      <div className="space-y-1.5">
                        {project.key_points.map((pt, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm text-gray-400">
                            <span className="text-gray-600 font-mono text-xs mt-0.5 flex-shrink-0">{i + 1}.</span>
                            <span className="leading-relaxed">{pt}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Hooks */}
                  {project.hooks.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest">
                        {isPodcast ? 'Accroches d\'intro' : 'Choisir une accroche'}
                      </p>
                      {project.hooks.map((hook, idx) => (
                        <button
                          key={idx}
                          onClick={() => hookMut.mutate(idx)}
                          className={cn(
                            'w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all duration-150 cursor-pointer',
                            hook.selected
                              ? 'border-blue-500/50 bg-blue-500/10 text-gray-100'
                              : 'border-gray-800 bg-gray-900 text-gray-400 hover:border-gray-700 hover:text-gray-300',
                          )}
                        >
                          <div className="flex items-start gap-2.5">
                            <div className={cn(
                              'w-4 h-4 rounded-full border flex-shrink-0 mt-0.5 flex items-center justify-center transition-all',
                              hook.selected ? 'border-blue-400 bg-blue-500' : 'border-gray-700',
                            )}>
                              {hook.selected && <Check className="w-2.5 h-2.5 text-white" />}
                            </div>
                            <span className="leading-relaxed">{hook.text}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Suggested questions (podcast) */}
                  {isPodcast && project.suggested_questions.length > 0 && (
                    <div>
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">Questions suggérées</p>
                      <div className="space-y-1.5 bg-gray-900 border border-gray-800 rounded-xl p-3">
                        {project.suggested_questions.map((q, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm text-gray-400">
                            <span className="text-gray-600 font-mono text-xs mt-0.5 flex-shrink-0">{i + 1}.</span>
                            <span>{q}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Analysis text (collapsible) */}
                  {project.analysis && (
                    <div className="border border-gray-800 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setAnalysisOpen(!analysisOpen)}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-[11px] text-gray-500 hover:text-gray-400 hover:bg-gray-800/50 transition-colors cursor-pointer"
                      >
                        <span className="uppercase tracking-widest">Analyse détaillée</span>
                        {analysisOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                      {analysisOpen && (
                        <div className="px-4 pb-4 border-t border-gray-800">
                          <div className="prose prose-invert prose-sm max-w-none text-gray-400 pt-3">
                            <ReactMarkdown>{project.analysis}</ReactMarkdown>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>

            <Divider />

            {/* ──── SECTION: SCRIPT ──── */}
            <section>
              <SectionTitle>Script</SectionTitle>

              {project.script_outline && (
                <div className="border border-gray-800 rounded-xl overflow-hidden mb-4">
                  <button
                    onClick={() => setOutlineOpen(!outlineOpen)}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-[11px] text-gray-500 hover:text-gray-400 hover:bg-gray-800/50 transition-colors cursor-pointer"
                  >
                    <span className="uppercase tracking-widest">Plan du script</span>
                    {outlineOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                  {outlineOpen && (
                    <div className="px-4 pb-4 border-t border-gray-800">
                      <div className="prose prose-invert prose-sm max-w-none text-gray-400 pt-3">
                        <ReactMarkdown>{project.script_outline}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => scriptMut.mutate()}
                disabled={scriptMut.isPending}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-gray-800 hover:border-violet-500/50 hover:bg-violet-500/5 text-sm text-gray-400 hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer mb-4"
              >
                {scriptMut.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Génération en cours...</>
                  : <><Zap className="w-4 h-4 text-violet-400" /> {project.full_script ? 'Regénérer le script' : 'Générer le script complet'}</>
                }
              </button>

              {(project.full_script || scriptMut.isPending) && (
                <textarea
                  key={project.full_script?.slice(0, 20)}
                  defaultValue={project.full_script}
                  onBlur={e => { if (e.target.value !== project.full_script) patchMut.mutate({ full_script: e.target.value }) }}
                  rows={14}
                  placeholder="Le script apparaîtra ici..."
                  className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm text-gray-300 placeholder:text-gray-600 focus:outline-none focus:border-gray-700 resize-none font-mono leading-relaxed transition-colors"
                />
              )}
            </section>

            <Divider />

            {/* ──── SECTION: PARAMÈTRES ──── */}
            <section>
              <SectionTitle>Paramètres</SectionTitle>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-gray-600 mb-1 block">Catégorie</label>
                  <select
                    value={project.category}
                    onChange={e => handleCategoryChange(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-gray-600 transition-colors cursor-pointer"
                  >
                    {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-600 mb-1 block">Format</label>
                  <select
                    value={project.format}
                    onChange={e => patchMut.mutate({ format: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-gray-600 transition-colors cursor-pointer"
                  >
                    {(CATEGORY_CONFIG[project.category]?.formats ?? []).map(f => (
                      <option key={f} value={f}>{FORMAT_LABELS[f as ContentFormat]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-gray-600 mb-1 block">Durée</label>
                  <select
                    value={project.duration_type}
                    onChange={e => patchMut.mutate({ duration_type: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-gray-600 transition-colors cursor-pointer"
                  >
                    <option value="long">Long</option>
                    <option value="court">Court</option>
                  </select>
                </div>
              </div>

              {isPodcast && (
                <div className="mt-3 p-3 bg-purple-500/5 border border-purple-500/15 rounded-xl space-y-2">
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">Nom de l'invité</label>
                    <input
                      key={project._id + '-guest'}
                      defaultValue={project.guest_name ?? ''}
                      onBlur={e => { if (e.target.value !== (project.guest_name ?? '')) patchMut.mutate({ guest_name: e.target.value || null }) }}
                      placeholder="Prénom Nom"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-purple-500/40 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 mb-1 block">Valeur que le podcast apporte</label>
                    <textarea
                      key={project._id + '-guestval'}
                      defaultValue={project.guest_value}
                      onBlur={e => { if (e.target.value !== project.guest_value) patchMut.mutate({ guest_value: e.target.value }) }}
                      rows={2}
                      placeholder="Ce que l'audience va apprendre ou ressentir..."
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-purple-500/40 transition-colors resize-none"
                    />
                  </div>
                </div>
              )}
            </section>

            <Divider />

            {/* ──── SECTION: RÉFÉRENCE & NOTES ──── */}
            <section>
              <SectionTitle>Référence & Notes</SectionTitle>

              <div className="space-y-3">
                {/* Brain dump display */}
                {project.brain_dump && (
                  <div className="p-3 bg-gray-800/40 border border-gray-800 rounded-xl">
                    <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Idée originale</p>
                    <p className="text-xs text-gray-500 leading-relaxed italic">"{project.brain_dump}"</p>
                  </div>
                )}

                <div>
                  <label className="text-[10px] text-gray-600 mb-1 block">Vidéo de référence YouTube</label>
                  <input
                    key={project._id + '-yt'}
                    defaultValue={project.youtube_ref_url ?? ''}
                    onBlur={e => {
                      const val = e.target.value.trim() || null
                      if (val !== project.youtube_ref_url) patchMut.mutate({ youtube_ref_url: val })
                    }}
                    placeholder="https://youtube.com/watch?v=..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-gray-600 transition-colors"
                  />
                  {project.youtube_ref_url && extractYTId(project.youtube_ref_url) && (
                    <div className="mt-2">
                      <YouTubeCard url={project.youtube_ref_url} />
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[10px] text-gray-600 mb-1 block">Notes</label>
                  <textarea
                    key={project._id + '-notes'}
                    defaultValue={project.notes}
                    onBlur={e => { if (e.target.value !== project.notes) patchMut.mutate({ notes: e.target.value }) }}
                    rows={2}
                    placeholder="Remarques, idées supplémentaires..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-gray-600 transition-colors resize-none"
                  />
                </div>
              </div>
            </section>

            <Divider />

            {/* ──── SECTION: PRODUCTION ──── */}
            <section>
              <SectionTitle>Production</SectionTitle>

              <div className="mb-4">
                <label className="text-[10px] text-gray-600 mb-1 block">Date cible</label>
                <input
                  type="date"
                  defaultValue={project.target_date ? project.target_date.substring(0, 10) : ''}
                  onBlur={e => patchMut.mutate({ target_date: e.target.value || null })}
                  className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-gray-600 transition-colors cursor-pointer"
                />
              </div>

              {/* Checklist */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] text-gray-500 uppercase tracking-widest">Checklist</label>
                  {checkTotal > 0 && (
                    <span className="text-[10px] text-gray-600 tabular-nums">{checkDone}/{checkTotal}</span>
                  )}
                </div>
                {checkTotal > 0 && (
                  <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden mb-3">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.round((checkDone / checkTotal) * 100)}%` }}
                    />
                  </div>
                )}
                <div className="space-y-1">
                  {project.checklist.map(item => (
                    <div key={item.id} className="flex items-center gap-2.5 group py-0.5">
                      <button
                        onClick={() => toggleMut.mutate(item.id)}
                        className={cn(
                          'w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all duration-150 cursor-pointer',
                          item.done ? 'border-emerald-500 bg-emerald-500' : 'border-gray-700 hover:border-gray-500',
                        )}
                      >
                        {item.done && <Check className="w-2.5 h-2.5 text-white" />}
                      </button>
                      <span className={cn('flex-1 text-sm transition-colors', item.done ? 'text-gray-600 line-through' : 'text-gray-300')}>
                        {item.label}
                      </span>
                      <button
                        onClick={() => removeCheckMut.mutate(item.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-red-400 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2 mt-2">
                    <input
                      value={newCheckItem}
                      onChange={e => setNewCheckItem(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newCheckItem.trim()) {
                          e.preventDefault()
                          addCheckMut.mutate(newCheckItem.trim())
                          setNewCheckItem('')
                        }
                      }}
                      placeholder="Ajouter une étape..."
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-gray-600 transition-colors"
                    />
                    <button
                      onClick={() => {
                        if (!newCheckItem.trim()) return
                        addCheckMut.mutate(newCheckItem.trim())
                        setNewCheckItem('')
                      }}
                      className="px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-all duration-150 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Thumbnails */}
              {project.thumbnail_descriptions.length > 0 && (
                <div className="mb-4">
                  <label className="text-[10px] text-gray-500 uppercase tracking-widest mb-3 block">Idées de miniatures</label>
                  <div className="space-y-3">
                    {project.thumbnail_descriptions.map((desc, idx) => {
                      const stored = project.generated_thumbnails[idx]
                        ? `data:image/png;base64,${project.generated_thumbnails[idx]}`
                        : undefined
                      const imgSrc = localImages[idx] ?? stored
                      return (
                        <div key={idx} className="border border-gray-800 rounded-xl p-3 bg-gray-900">
                          <p className="text-xs text-gray-500 mb-2 leading-relaxed">{desc}</p>
                          {imgSrc ? (
                            <div className="relative group rounded-lg overflow-hidden">
                              <img src={imgSrc} className="w-full rounded-lg" alt={`Miniature ${idx + 1}`} />
                              <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <a href={imgSrc} download={`miniature-${idx + 1}.png`} className="p-1.5 rounded-lg bg-black/70 text-white hover:bg-black cursor-pointer">
                                  <Download className="w-3.5 h-3.5" />
                                </a>
                                <button
                                  onClick={() => handleGenerateThumbnail(desc, idx)}
                                  disabled={generatingImages[idx]}
                                  className="p-1.5 rounded-lg bg-black/70 text-white hover:bg-black disabled:opacity-50 cursor-pointer"
                                >
                                  {generatingImages[idx] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleGenerateThumbnail(desc, idx)}
                              disabled={generatingImages[idx]}
                              className="w-full py-3 rounded-lg border border-dashed border-gray-700 text-xs text-gray-500 hover:text-gray-400 hover:border-gray-600 flex items-center justify-center gap-2 transition-all duration-150 disabled:opacity-50 cursor-pointer"
                            >
                              {generatingImages[idx]
                                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Génération...</>
                                : <><Zap className="w-3.5 h-3.5" /> Générer avec Gemini</>
                              }
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Published URL */}
              {project.status === 'publie' && (
                <div>
                  <label className="text-[10px] text-gray-600 mb-1 block">Lien de la vidéo publiée</label>
                  <div className="flex gap-2">
                    <input
                      key={project._id + '-pub'}
                      defaultValue={project.published_url ?? ''}
                      onBlur={e => patchMut.mutate({ published_url: e.target.value || null })}
                      placeholder="https://youtube.com/watch?v=..."
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-gray-600 transition-colors"
                    />
                    {project.published_url && (
                      <a
                        href={project.published_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-xl border border-gray-700 text-gray-500 hover:text-gray-200 hover:border-gray-600 transition-all cursor-pointer"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Delete */}
            <div className="border-t border-gray-800 pt-4">
              <button
                onClick={() => { if (confirm('Supprimer ce projet définitivement ?')) deleteMut.mutate() }}
                className="w-full py-2.5 rounded-xl border border-red-900/50 text-red-500 hover:bg-red-500/10 hover:border-red-500/40 text-sm transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                Supprimer ce projet
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export function ContentPage() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showCapture, setShowCapture] = useState(false)
  const [createInitialData, setCreateInitialData] = useState<CreateModalInitialData | undefined>()
  const [pendingCaptureId, setPendingCaptureId] = useState<string | null>(null)
  const [filterCategory, setFilterCategory] = useState<ContentCategory | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<ContentStatus | 'all'>('all')
  const [filterPeriod, setFilterPeriod] = useState<'all' | '7d' | '30d' | '90d'>('all')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')

  const { data: projects = [], isLoading } = useQuery<VideoProject[]>({
    queryKey: ['video-projects', filterCategory, filterStatus, filterPeriod, sortOrder],
    queryFn: () => api.get('/content/projects', {
      params: {
        ...(filterCategory !== 'all' && { category: filterCategory }),
        ...(filterStatus !== 'all' && { status: filterStatus }),
        ...(filterPeriod !== 'all' && { period: filterPeriod }),
        sort: sortOrder,
      },
    }).then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/content/projects', data).then(r => r.data),
    onSuccess: (created: VideoProject) => {
      qc.invalidateQueries({ queryKey: ['video-projects'] })
      setShowCreate(false)
      setSelectedId(created._id)
      setCreateInitialData(undefined)
      // Delete the capture that was converted, if any
      if (pendingCaptureId) {
        api.delete(`/content/projects/captures/${pendingCaptureId}`)
          .then(() => qc.invalidateQueries({ queryKey: ['content-captures'] }))
        setPendingCaptureId(null)
      }
    },
  })

  const saveCaptMut = useMutation({
    mutationFn: ({ text, source }: { text: string; source: 'text' | 'voice' }) =>
      api.post('/content/projects/captures', { text, source }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['content-captures'] })
    },
  })

  const handleCloseCreate = () => {
    setShowCreate(false)
    setCreateInitialData(undefined)
    setPendingCaptureId(null)
  }

  const handleCaptureConvert = (capture: ContentCapture, structured: CreateModalInitialData | null) => {
    setPendingCaptureId(capture._id)
    setCreateInitialData({
      brain_dump: capture.text,
      title: structured?.title,
      category: structured?.category,
      format: structured?.format,
      duration_type: structured?.duration_type,
      notes: structured?.notes,
    })
    setShowCreate(true)
  }

  const selectedProject = projects.find(p => p._id === selectedId)

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-100">Création de contenu</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {projects.length} projet{projects.length !== 1 ? 's' : ''}
              {filterPeriod !== 'all' && (
                <span className="ml-1.5 text-blue-400">
                  · {{ '7d': '7 derniers jours', '30d': '30 derniers jours', '90d': '3 derniers mois' }[filterPeriod]}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSortOrder(o => o === 'newest' ? 'oldest' : 'newest')}
              title={sortOrder === 'newest' ? 'Afficher les plus anciens en premier' : 'Afficher les plus récents en premier'}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-800 hover:border-gray-700 text-gray-500 hover:text-gray-300 text-xs transition-all duration-150 cursor-pointer"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              {sortOrder === 'newest' ? 'Plus récents' : 'Plus anciens'}
            </button>
            <button
              onClick={() => setShowCapture(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-800 hover:border-gray-700 text-gray-400 hover:text-gray-200 text-sm transition-all duration-150 cursor-pointer"
            >
              <Mic className="w-4 h-4" />
              Capturer
            </button>
            <button
              onClick={() => { setCreateInitialData(undefined); setShowCreate(true) }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-all duration-150 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Nouvelle idée
            </button>
          </div>
        </div>

        {/* Capture bank */}
        <CapturesPanel onConvert={handleCaptureConvert} />

        {/* AI Suggestions panel */}
        <SuggestionsPanel onSaved={id => setSelectedId(id)} />

        {/* Filters */}
        <div className="space-y-2 mb-6">
          {/* Category */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setFilterCategory('all')}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer',
                filterCategory === 'all' ? 'bg-gray-800 text-gray-100' : 'text-gray-500 hover:text-gray-300',
              )}
            >
              Tout
            </button>
            {(Object.entries(CATEGORY_CONFIG) as [ContentCategory, typeof CATEGORY_CONFIG[ContentCategory]][]).map(([key, cfg]) => {
              const Icon = cfg.icon
              const isActive = filterCategory === key
              return (
                <button
                  key={key}
                  onClick={() => setFilterCategory(key)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer',
                    isActive ? cn(cfg.bg, cfg.color) : 'text-gray-500 hover:text-gray-300',
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {cfg.label}
                </button>
              )
            })}
          </div>

          {/* Status + Period on same row */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => setFilterStatus('all')}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs transition-all duration-150 cursor-pointer',
                  filterStatus === 'all' ? 'bg-gray-800 text-gray-200' : 'text-gray-600 hover:text-gray-400',
                )}
              >
                Tous statuts
              </button>
              {STATUS_STEPS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilterStatus(key)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer',
                    filterStatus === key ? 'bg-gray-800 text-gray-200' : 'text-gray-600 hover:text-gray-400',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Period chips */}
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3 text-gray-600 mr-0.5" />
              {([
                ['all', 'Tout'],
                ['7d', '7j'],
                ['30d', '30j'],
                ['90d', '3 mois'],
              ] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFilterPeriod(val)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer',
                    filterPeriod === val
                      ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                      : 'text-gray-600 hover:text-gray-400 border border-transparent',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4 animate-pulse">
                <div className="flex gap-2 mb-3">
                  <div className="h-5 w-20 bg-gray-800 rounded-md" />
                  <div className="h-5 w-24 bg-gray-800 rounded-md" />
                </div>
                <div className="h-4 w-3/4 bg-gray-800 rounded mb-2" />
                <div className="h-3 w-1/2 bg-gray-800 rounded" />
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-gray-600" />
            </div>
            <p className="text-gray-500 text-sm mb-1">Aucun projet pour le moment</p>
            <p className="text-gray-600 text-xs mb-5">Créez votre première idée de contenu</p>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-all duration-150 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Nouvelle idée
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map(p => (
              <ProjectCard
                key={p._id}
                project={p}
                onClick={() => setSelectedId(p._id)}
              />
            ))}
          </div>
        )}
      </div>

      {showCapture && (
        <CaptureModal
          onClose={() => setShowCapture(false)}
          onSave={(text, source) => saveCaptMut.mutate({ text, source })}
        />
      )}

      {showCreate && (
        <CreateModal
          onClose={handleCloseCreate}
          onCreate={data => createMut.mutate(data)}
          initialData={createInitialData}
        />
      )}

      {selectedProject && (
        <ProjectDrawer
          key={selectedProject._id}
          initialProject={selectedProject}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}
