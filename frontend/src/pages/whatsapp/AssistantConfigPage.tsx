import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, Save, Power, Clock, Sparkles, BookOpen, Upload, FileText, Image as ImageIcon, FileType, Trash2, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { assistantApi, type AssistantConfig, type LlmProviderName, MODELS_BY_PROVIDER, type KnowledgeDoc } from '@/services/assistant'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-700">{label}</label>
      {hint && <p className="mt-0.5 text-[11px] text-gray-400">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <header className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-indigo-600" />
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Toggle({
  checked,
  onChange,
  busy = false,
  color = 'indigo',
  size = 'md',
}: {
  checked: boolean
  onChange: (v: boolean) => void
  busy?: boolean
  color?: 'indigo' | 'emerald'
  size?: 'md' | 'lg'
}) {
  const dim = size === 'lg'
    ? { track: 'h-7 w-13', knob: 'h-6 w-6', translate: 'translate-x-6' }
    : { track: 'h-6 w-11', knob: 'h-5 w-5', translate: 'translate-x-5' }
  const onColor = color === 'emerald' ? 'bg-emerald-500' : 'bg-indigo-500'
  return (
    <button
      type="button"
      onClick={() => !busy && onChange(!checked)}
      disabled={busy}
      aria-pressed={checked}
      className={cn(
        'relative shrink-0 rounded-full transition-colors',
        dim.track,
        checked ? onColor : 'bg-gray-300',
        busy ? 'cursor-wait opacity-70' : 'cursor-pointer',
      )}
      style={{ width: size === 'lg' ? 52 : 44, height: size === 'lg' ? 28 : 24 }}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 rounded-full bg-white shadow transition-transform',
          dim.knob,
        )}
        style={{
          transform: checked
            ? `translateX(${size === 'lg' ? 24 : 20}px)`
            : 'translateX(0)',
        }}
      >
        {busy && <Loader2 className="h-full w-full animate-spin p-0.5 text-gray-400" />}
      </span>
    </button>
  )
}

function ProviderPicker({ value, onChange }: { value: { provider: LlmProviderName; model: string }; onChange: (v: { provider: LlmProviderName; model: string }) => void }) {
  const models = MODELS_BY_PROVIDER[value.provider]
  return (
    <div className="grid grid-cols-2 gap-2">
      <select
        value={value.provider}
        onChange={(e) => {
          const p = e.target.value as LlmProviderName
          onChange({ provider: p, model: MODELS_BY_PROVIDER[p][0].value })
        }}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
      >
        <option value="groq">Groq</option>
        <option value="gemini">Gemini</option>
        <option value="anthropic">Anthropic</option>
      </select>
      <select
        value={value.model}
        onChange={(e) => onChange({ ...value, model: e.target.value })}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
      >
        {models.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
      </select>
    </div>
  )
}

function extractError(e: unknown): string {
  const err = e as { response?: { data?: { message?: string | string[] } }; message?: string }
  const m = err?.response?.data?.message
  if (Array.isArray(m)) return m.join(', ')
  return m ?? err?.message ?? 'Erreur inconnue'
}

export function AssistantConfigPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['assistant.config'], queryFn: assistantApi.getConfig })
  const [draft, setDraft] = useState<AssistantConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [autoSaving, setAutoSaving] = useState<string | null>(null)
  const [useFallback, setUseFallback] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successAt, setSuccessAt] = useState<number | null>(null)

  useEffect(() => {
    if (data) {
      setDraft(data)
      setUseFallback(!!data.fallback)
    }
  }, [data])

  useEffect(() => {
    if (!successAt) return
    const t = setTimeout(() => setSuccessAt(null), 3500)
    return () => clearTimeout(t)
  }, [successAt])

  if (isLoading || !draft) return <div className="p-8 text-sm text-gray-500">Chargement…</div>

  async function autoSave(patch: Partial<AssistantConfig>, label: string) {
    if (!draft) return
    setAutoSaving(label)
    setErrorMsg(null)
    const optimistic = { ...draft, ...patch }
    setDraft(optimistic)
    try {
      const updated = await assistantApi.updateConfig(patch)
      qc.setQueryData(['assistant.config'], updated)
      setDraft(updated)
      setSuccessAt(Date.now())
    } catch (e) {
      setDraft(draft)
      setErrorMsg(`Échec ${label}: ${extractError(e)}`)
    } finally {
      setAutoSaving(null)
    }
  }

  async function save() {
    if (!draft) return
    setSaving(true)
    setErrorMsg(null)
    try {
      const patch: Partial<AssistantConfig> = {
        systemPrompt: draft.systemPrompt,
        primary: draft.primary,
        fallback: useFallback ? draft.fallback : null,
        temperature: draft.temperature,
        maxTokens: draft.maxTokens,
        contextWindow: draft.contextWindow,
      }
      const updated = await assistantApi.updateConfig(patch)
      qc.setQueryData(['assistant.config'], updated)
      setDraft(updated)
      setSuccessAt(Date.now())
    } catch (e) {
      setErrorMsg(`Échec sauvegarde: ${extractError(e)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      {/* Master switch banner */}
      <div className={cn(
        'flex items-center justify-between rounded-xl border p-4 shadow-sm',
        draft.aiMasterEnabled ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-white',
      )}>
        <div className="flex items-center gap-3">
          <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', draft.aiMasterEnabled ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500')}>
            <Power className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {draft.aiMasterEnabled ? 'IA active globalement' : 'IA désactivée globalement'}
            </p>
            <p className="text-xs text-gray-500">
              {draft.aiMasterEnabled
                ? 'L\'assistant répond automatiquement aux nouveaux messages WhatsApp.'
                : 'Tous les messages vont directement à l\'inbox closer.'}
            </p>
          </div>
        </div>
        <Toggle
          checked={draft.aiMasterEnabled}
          onChange={(v) => autoSave({ aiMasterEnabled: v }, 'activation')}
          busy={autoSaving === 'activation'}
          color="emerald"
          size="lg"
        />
      </div>

      {/* Error / success banners */}
      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
          {errorMsg}
        </div>
      )}
      {successAt && Date.now() - successAt < 4000 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-700">
          Configuration sauvegardée
        </div>
      )}

      {/* Persona */}
      <Section title="Persona & instructions" icon={Sparkles}>
        <Field label="Prompt système" hint="Identité de l'assistant, ton, règles. C'est le fondement de toutes les réponses.">
          <textarea
            value={draft.systemPrompt}
            onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })}
            rows={12}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-xs"
          />
          <p className="mt-1 text-[11px] text-gray-400">{draft.systemPrompt.length} caractères</p>
        </Field>
      </Section>

      {/* Providers */}
      <Section title="Modèle LLM" icon={Bot}>
        <Field label="Provider principal" hint="Utilisé en premier pour chaque message">
          <ProviderPicker value={draft.primary} onChange={(v) => setDraft({ ...draft, primary: v })} />
        </Field>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-700">Fallback</p>
            <p className="text-[11px] text-gray-400">Utilisé si le principal est en erreur</p>
          </div>
          <Toggle
            checked={useFallback}
            onChange={async (v) => {
              setUseFallback(v)
              if (!v) await autoSave({ fallback: null }, 'fallback désactivé')
            }}
          />
        </div>
        {useFallback && (
          <ProviderPicker
            value={draft.fallback ?? { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' }}
            onChange={(v) => setDraft({ ...draft, fallback: v })}
          />
        )}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Température">
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={draft.temperature}
              onChange={(e) => setDraft({ ...draft, temperature: Number(e.target.value) })}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Max tokens output">
            <input
              type="number"
              min={50}
              max={4000}
              step={50}
              value={draft.maxTokens}
              onChange={(e) => setDraft({ ...draft, maxTokens: Number(e.target.value) })}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Contexte (msgs récents)">
            <input
              type="number"
              min={2}
              max={50}
              value={draft.contextWindow}
              onChange={(e) => setDraft({ ...draft, contextWindow: Number(e.target.value) })}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
            />
          </Field>
        </div>
      </Section>

      {/* Business hours */}
      <Section title="Heures bureau" icon={Clock}>
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-600">Définir des heures bureau pour pouvoir couper l'IA pendant ces créneaux</p>
          <Toggle
            checked={draft.businessHours.enabled}
            onChange={(v) => autoSave({ businessHours: { ...draft.businessHours, enabled: v } }, 'heures bureau')}
            busy={autoSaving === 'heures bureau'}
          />
        </div>
        {draft.businessHours.enabled && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="De">
                <input
                  type="time"
                  value={draft.businessHours.startTime}
                  onChange={(e) => setDraft({ ...draft, businessHours: { ...draft.businessHours, startTime: e.target.value } })}
                  onBlur={(e) => autoSave({ businessHours: { ...draft.businessHours, startTime: e.target.value } }, 'horaire')}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                />
              </Field>
              <Field label="À">
                <input
                  type="time"
                  value={draft.businessHours.endTime}
                  onChange={(e) => setDraft({ ...draft, businessHours: { ...draft.businessHours, endTime: e.target.value } })}
                  onBlur={(e) => autoSave({ businessHours: { ...draft.businessHours, endTime: e.target.value } }, 'horaire')}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                />
              </Field>
            </div>
            <Field label="Jours actifs">
              <div className="flex gap-1">
                {DAYS.map((d, idx) => {
                  const active = draft.businessHours.days.includes(idx)
                  return (
                    <button
                      key={d}
                      onClick={() => {
                        const days = active
                          ? draft.businessHours.days.filter((x) => x !== idx)
                          : [...draft.businessHours.days, idx].sort()
                        autoSave({ businessHours: { ...draft.businessHours, days } }, 'jours actifs')
                      }}
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-md text-xs font-semibold cursor-pointer transition-colors',
                        active ? 'bg-indigo-500 text-white hover:bg-indigo-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                      )}
                    >
                      {d}
                    </button>
                  )
                })}
              </div>
            </Field>
            <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.businessHours.aiOffDuringHours}
                onChange={(e) => autoSave({ businessHours: { ...draft.businessHours, aiOffDuringHours: e.target.checked } }, 'IA pendant heures')}
              />
              Désactiver l'IA pendant les heures bureau (laisser les closers répondre)
            </label>
          </>
        )}
      </Section>

      {/* KB */}
      <KbSection />

      {/* Save */}
      <div className="flex justify-end gap-2">
        <Button onClick={save} loading={saving}>
          <Save className="h-4 w-4" /> Enregistrer
        </Button>
      </div>
    </div>
  )
}

// ── KB section ───────────────────────────────────────────────────────────────

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function docIcon(type: KnowledgeDoc['type']) {
  if (type === 'pdf') return FileText
  if (type === 'image') return ImageIcon
  return FileType
}

function KbSection() {
  const qc = useQueryClient()
  const { data: docs } = useQuery({
    queryKey: ['kb.docs'],
    queryFn: assistantApi.listKb,
    refetchInterval: (q) => {
      const data = q.state.data as KnowledgeDoc[] | undefined
      return data?.some((d) => d.status === 'processing' || d.status === 'pending') ? 3000 : false
    },
  })
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [alwaysIncluded, setAlwaysIncluded] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function upload(files: FileList | File[]) {
    setUploading(true)
    try {
      for (const f of Array.from(files)) {
        try {
          await assistantApi.uploadKb(f, alwaysIncluded)
        } catch (err: any) {
          alert(`${f.name} — ${err?.response?.data?.message ?? err?.message ?? 'erreur'}`)
        }
      }
      qc.invalidateQueries({ queryKey: ['kb.docs'] })
    } finally {
      setUploading(false)
    }
  }

  return (
    <Section title="Base de connaissance" icon={BookOpen}>
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false)
          if (e.dataTransfer.files?.length) upload(e.dataTransfer.files)
        }}
        className={cn(
          'rounded-xl border-2 border-dashed p-6 text-center transition-colors',
          dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-gray-50',
        )}
      >
        <Upload className="mx-auto h-7 w-7 text-gray-400" />
        <p className="mt-2 text-sm font-medium text-gray-700">
          Glisse-dépose tes fichiers ici ou
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="ml-1 text-indigo-600 underline cursor-pointer"
          >clique pour parcourir</button>
        </p>
        <p className="mt-1 text-[11px] text-gray-400">PDF, image (jpg/png), txt, md — plusieurs fichiers OK</p>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,.markdown,image/*"
          className="hidden"
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
        <label className="mt-3 inline-flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={alwaysIncluded} onChange={(e) => setAlwaysIncluded(e.target.checked)} />
          Toujours inclure ces documents dans le contexte (pour des docs très importants)
        </label>
        {uploading && (
          <p className="mt-2 flex items-center justify-center gap-1 text-xs text-indigo-600">
            <Loader2 className="h-3 w-3 animate-spin" /> Upload en cours…
          </p>
        )}
      </div>

      {/* List */}
      <div className="mt-4">
        {(!docs || docs.length === 0) ? (
          <p className="text-center text-xs text-gray-400">Aucun document.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {docs.map((d) => {
              const Icon = docIcon(d.type)
              return (
                <li key={d._id} className="flex items-center gap-3 px-3 py-2.5">
                  <Icon className="h-4 w-4 shrink-0 text-gray-500" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-gray-900">{d.name}</p>
                      {d.status === 'ready' && <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />}
                      {(d.status === 'processing' || d.status === 'pending') && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-indigo-500" />}
                      {d.status === 'failed' && (
                        <span title={d.errorMessage ?? ''}><AlertTriangle className="h-3 w-3 shrink-0 text-red-500" /></span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400">
                      {d.type.toUpperCase()} · {formatBytes(d.bytes)} · {d.chunkCount} chunks · {d.status}
                      {d.errorMessage && ` · ${d.errorMessage}`}
                    </p>
                  </div>
                  <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={d.isAlwaysIncluded}
                      onChange={async (e) => {
                        await assistantApi.updateKb(d._id, { isAlwaysIncluded: e.target.checked })
                        qc.invalidateQueries({ queryKey: ['kb.docs'] })
                      }}
                    />
                    Toujours inclus
                  </label>
                  <button
                    onClick={async () => {
                      if (!confirm(`Supprimer "${d.name}" ?`)) return
                      await assistantApi.deleteKb(d._id)
                      qc.invalidateQueries({ queryKey: ['kb.docs'] })
                    }}
                    className="text-gray-400 hover:text-red-500 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Section>
  )
}
