import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeft, Eye, EyeOff, ExternalLink, Plus, Trash2, GripVertical,
  ChevronUp, ChevronDown, Star,
  Type, AlignLeft, Mail, Phone, Hash, List, Circle, CheckSquare,
  Calendar, Paperclip, AlignJustify,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/services/api'
import type { Form, FormField, FormFieldType, FormResponse, PaginatedResponse } from '@/types'

// ── API ───────────────────────────────────────────────────────────────────────

const fetchForm = (id: string): Promise<Form> => api.get(`/forms/${id}`).then((r) => r.data)
const updateForm = (id: string, data: Partial<Form>) => api.patch(`/forms/${id}`, data).then((r) => r.data)
const publishForm = (id: string) => api.post(`/forms/${id}/publish`)
const unpublishForm = (id: string) => api.post(`/forms/${id}/unpublish`)
const fetchResponses = (id: string, page: number): Promise<PaginatedResponse<FormResponse>> =>
  api.get(`/forms/${id}/responses`, { params: { page, limit: 25 } }).then((r) => r.data)
const deleteResponse = (formId: string, responseId: string) =>
  api.delete(`/forms/${formId}/responses/${responseId}`)

// ── Field type config ─────────────────────────────────────────────────────────

const FIELD_TYPES: { type: FormFieldType; label: string; Icon: LucideIcon; group: string }[] = [
  { type: 'short_text', label: 'Texte court', Icon: Type,         group: 'Texte' },
  { type: 'long_text',  label: 'Texte long',  Icon: AlignLeft,    group: 'Texte' },
  { type: 'email',      label: 'Email',        Icon: Mail,         group: 'Texte' },
  { type: 'phone',      label: 'Téléphone',    Icon: Phone,        group: 'Texte' },
  { type: 'number',     label: 'Nombre',       Icon: Hash,         group: 'Texte' },
  { type: 'select',     label: 'Liste déroulante', Icon: List,     group: 'Choix' },
  { type: 'radio',      label: 'Choix unique', Icon: Circle,       group: 'Choix' },
  { type: 'checkbox',   label: 'Choix multiple', Icon: CheckSquare, group: 'Choix' },
  { type: 'date',       label: 'Date',         Icon: Calendar,     group: 'Autre' },
  { type: 'rating',     label: 'Note (étoiles)', Icon: Star,       group: 'Autre' },
  { type: 'file',       label: 'Fichier / Image', Icon: Paperclip, group: 'Autre' },
  { type: 'heading',    label: 'Titre',        Icon: Type,         group: 'Contenu' },
  { type: 'paragraph',  label: 'Paragraphe',   Icon: AlignJustify, group: 'Contenu' },
]

function makeField(type: FormFieldType, order: number): FormField {
  const meta = FIELD_TYPES.find((f) => f.type === type)
  return {
    id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    label: meta?.label ?? type,
    placeholder: '',
    required: false,
    options: ['select', 'radio', 'checkbox'].includes(type) ? ['Option 1', 'Option 2'] : undefined,
    content: ['heading', 'paragraph'].includes(type) ? '' : undefined,
    accept: type === 'file' ? 'image/*' : undefined,
    maxFiles: type === 'file' ? 1 : undefined,
    order,
  }
}

// ── Field palette dropdown ────────────────────────────────────────────────────

function FieldPalette({ onAdd, onClose }: { onAdd: (type: FormFieldType) => void; onClose: () => void }) {
  const groups = [...new Set(FIELD_TYPES.map((f) => f.group))]
  return (
    <div className="absolute top-full left-0 z-20 mt-1 w-56 rounded-xl border border-gray-700 bg-gray-900 shadow-xl">
      {groups.map((group) => (
        <div key={group} className="p-1.5">
          <p className="mb-1 px-2 text-xs font-medium text-gray-500">{group}</p>
          {FIELD_TYPES.filter((f) => f.group === group).map((f) => (
            <button
              key={f.type}
              onClick={() => { onAdd(f.type); onClose() }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
            >
              <f.Icon className="h-4 w-4 shrink-0 text-gray-400" />
              {f.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Condition operators ───────────────────────────────────────────────────────

const OPERATORS = [
  { value: 'equals', label: 'est égal à' },
  { value: 'not_equals', label: "n'est pas égal à" },
  { value: 'contains', label: 'contient' },
  { value: 'not_contains', label: 'ne contient pas' },
  { value: 'is_empty', label: 'est vide' },
  { value: 'is_not_empty', label: "n'est pas vide" },
] as const

const INTERACTIVE_TYPES: FormFieldType[] = [
  'short_text', 'long_text', 'email', 'phone', 'number',
  'select', 'radio', 'checkbox', 'date', 'rating', 'file',
]

// ── Field config editor ───────────────────────────────────────────────────────

function FieldEditor({
  field,
  onChange,
  allFields,
}: {
  field: FormField
  onChange: (updated: FormField) => void
  allFields: FormField[]
}) {
  const update = (patch: Partial<FormField>) => onChange({ ...field, ...patch })
  const isStatic = field.type === 'heading' || field.type === 'paragraph'
  const hasOptions = ['select', 'radio', 'checkbox'].includes(field.type)

  // Previous interactive fields (before this one) that can be watched
  const currentIdx = allFields.findIndex((f) => f.id === field.id)
  const prevFields = allFields
    .slice(0, currentIdx)
    .filter((f) => INTERACTIVE_TYPES.includes(f.type))

  // Watched field (for condition value suggestions)
  const watchedField = field.condition
    ? allFields.find((f) => f.id === field.condition!.fieldId)
    : null

  const operatorNeedsValue = field.condition &&
    !['is_empty', 'is_not_empty'].includes(field.condition.operator)

  const inputCls = 'w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'

  return (
    <div className="space-y-4">
      {isStatic ? (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-400">
            {field.type === 'heading' ? 'Texte du titre' : 'Texte du paragraphe'}
          </label>
          <textarea
            value={field.content ?? ''}
            onChange={(e) => update({ content: e.target.value })}
            rows={field.type === 'paragraph' ? 4 : 2}
            className={`${inputCls} resize-none`}
          />
        </div>
      ) : (
        <>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Label *</label>
            <input
              value={field.label}
              onChange={(e) => update({ label: e.target.value })}
              className={inputCls}
            />
          </div>

          {!hasOptions && field.type !== 'date' && field.type !== 'rating' && field.type !== 'file' && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-400">Placeholder</label>
              <input
                value={field.placeholder ?? ''}
                onChange={(e) => update({ placeholder: e.target.value })}
                className={inputCls}
              />
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800/30 px-3 py-2.5">
            <span className="text-sm text-gray-300">Champ requis</span>
            <button
              onClick={() => update({ required: !field.required })}
              className={cn('relative h-5 w-9 rounded-full transition-colors', field.required ? 'bg-indigo-600' : 'bg-gray-700')}
            >
              <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', field.required ? 'translate-x-4' : 'translate-x-0.5')} />
            </button>
          </div>
        </>
      )}

      {hasOptions && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium text-gray-400">Options</label>
            <button
              onClick={() => update({ options: [...(field.options ?? []), `Option ${(field.options?.length ?? 0) + 1}`] })}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              + Ajouter
            </button>
          </div>
          <div className="space-y-1.5">
            {(field.options ?? []).map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={opt}
                  onChange={(e) => {
                    const opts = [...(field.options ?? [])]
                    opts[i] = e.target.value
                    update({ options: opts })
                  }}
                  className="flex-1 rounded-lg border border-gray-700 bg-gray-800/50 px-2.5 py-1.5 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none"
                />
                <button
                  onClick={() => update({ options: (field.options ?? []).filter((_, j) => j !== i) })}
                  className="rounded p-1 text-gray-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {field.type === 'number' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Min</label>
            <input type="number" value={field.validation?.min ?? ''}
              onChange={(e) => update({ validation: { ...field.validation, min: e.target.value ? Number(e.target.value) : undefined } })}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Max</label>
            <input type="number" value={field.validation?.max ?? ''}
              onChange={(e) => update({ validation: { ...field.validation, max: e.target.value ? Number(e.target.value) : undefined } })}
              className={inputCls}
            />
          </div>
        </div>
      )}

      {/* File config */}
      {field.type === 'file' && (
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Types acceptés</label>
            <select
              value={field.accept ?? 'image/*'}
              onChange={(e) => update({ accept: e.target.value })}
              className={inputCls}
            >
              <option value="image/*">Images uniquement (JPG, PNG, GIF…)</option>
              <option value="application/pdf">PDF uniquement</option>
              <option value="image/*,application/pdf">Images + PDF</option>
              <option value="*">Tous les types de fichiers</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Nombre max de fichiers</label>
            <input
              type="number"
              min={1}
              max={10}
              value={field.maxFiles ?? 1}
              onChange={(e) => update({ maxFiles: Math.max(1, Number(e.target.value)) })}
              className={inputCls}
            />
          </div>
        </div>
      )}

      {/* Conditional logic — only for interactive fields that have previous fields */}
      {!isStatic && (
        <div className="border-t border-gray-800 pt-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Logique conditionnelle
            </span>
            <button
              onClick={() => {
                if (field.condition) {
                  update({ condition: null })
                } else if (prevFields.length > 0) {
                  update({ condition: { fieldId: prevFields[0].id, operator: 'equals', value: '' } })
                }
              }}
              disabled={!field.condition && prevFields.length === 0}
              className={cn(
                'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                field.condition
                  ? 'bg-indigo-600/20 text-indigo-400 hover:bg-red-500/20 hover:text-red-400'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200 disabled:opacity-40',
              )}
            >
              {field.condition ? '✕ Retirer' : '+ Ajouter une condition'}
            </button>
          </div>

          {!field.condition && prevFields.length === 0 && (
            <p className="text-xs text-gray-600">Ajoutez d'abord des champs avant celui-ci pour créer une condition.</p>
          )}

          {field.condition && (
            <div className="space-y-2.5 rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3">
              <p className="text-xs font-medium text-gray-400">Afficher ce champ si…</p>

              {/* Watch field */}
              <select
                value={field.condition.fieldId}
                onChange={(e) => update({ condition: { ...field.condition!, fieldId: e.target.value, value: '' } })}
                className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none"
              >
                {prevFields.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>

              {/* Operator */}
              <select
                value={field.condition.operator}
                onChange={(e) => update({ condition: { ...field.condition!, operator: e.target.value as typeof field.condition.operator } })}
                className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none"
              >
                {OPERATORS.map((op) => (
                  <option key={op.value} value={op.value}>{op.label}</option>
                ))}
              </select>

              {/* Value */}
              {operatorNeedsValue && (
                watchedField?.options?.length ? (
                  <select
                    value={field.condition.value ?? ''}
                    onChange={(e) => update({ condition: { ...field.condition!, value: e.target.value } })}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="">Choisir…</option>
                    {watchedField.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    value={field.condition.value ?? ''}
                    onChange={(e) => update({ condition: { ...field.condition!, value: e.target.value } })}
                    placeholder="Valeur…"
                    className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                  />
                )
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Form preview ──────────────────────────────────────────────────────────────

function FormPreview({ form }: { form: Form }) {
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-gray-700 bg-gray-900 p-8">
      <h2 className="mb-1 text-xl font-bold text-gray-100">{form.title}</h2>
      {form.description && <p className="mb-6 text-sm text-gray-400">{form.description}</p>}

      <div className="space-y-5">
        {form.fields.map((field) => (
          <PreviewField key={field.id} field={field} />
        ))}
      </div>

      {form.fields.length > 0 && (
        <button className="mt-8 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
          Envoyer
        </button>
      )}
    </div>
  )
}

function PreviewField({ field }: { field: FormField }) {
  if (field.type === 'heading') {
    return (
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold text-gray-100">{field.content || field.label}</h3>
        {field.condition && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400">conditionnel</span>}
      </div>
    )
  }
  if (field.type === 'paragraph') {
    return (
      <div className="flex items-start gap-2">
        <p className="flex-1 text-sm text-gray-400">{field.content || field.label}</p>
        {field.condition && <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400">conditionnel</span>}
      </div>
    )
  }

  const inputClass = 'w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none'

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <label className="text-sm font-medium text-gray-300">
          {field.label}
          {field.required && <span className="ml-1 text-red-400">*</span>}
        </label>
        {field.condition && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400">conditionnel</span>}
      </div>

      {field.type === 'short_text' && <input placeholder={field.placeholder} className={inputClass} readOnly />}
      {field.type === 'email' && <input type="email" placeholder={field.placeholder || 'email@exemple.com'} className={inputClass} readOnly />}
      {field.type === 'phone' && <input type="tel" placeholder={field.placeholder || '+33 6 00 00 00 00'} className={inputClass} readOnly />}
      {field.type === 'number' && <input type="number" placeholder={field.placeholder} className={inputClass} readOnly />}
      {field.type === 'date' && <input type="date" className={inputClass} readOnly />}
      {field.type === 'long_text' && (
        <textarea placeholder={field.placeholder} rows={4} className={`${inputClass} resize-none`} readOnly />
      )}
      {field.type === 'select' && (
        <select className={inputClass} disabled>
          <option value="">Sélectionner...</option>
          {(field.options ?? []).map((o) => <option key={o}>{o}</option>)}
        </select>
      )}
      {field.type === 'radio' && (
        <div className="space-y-2">
          {(field.options ?? []).map((o) => (
            <label key={o} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" className="accent-indigo-500" disabled />
              <span className="text-sm text-gray-300">{o}</span>
            </label>
          ))}
        </div>
      )}
      {field.type === 'checkbox' && (
        <div className="space-y-2">
          {(field.options ?? []).map((o) => (
            <label key={o} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="accent-indigo-500" disabled />
              <span className="text-sm text-gray-300">{o}</span>
            </label>
          ))}
        </div>
      )}
      {field.type === 'rating' && (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((s) => (
            <Star key={s} className="h-7 w-7 text-gray-600" />
          ))}
        </div>
      )}
      {field.type === 'file' && (
        <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-gray-700 py-6 text-center">
          <div>
            <Paperclip className="h-8 w-8 text-gray-500" />
            <p className="mt-1 text-xs text-gray-500">
              {field.accept === 'image/*' ? 'Images' : field.accept === 'application/pdf' ? 'PDF' : 'Fichiers'}
              {(field.maxFiles ?? 1) > 1 ? ` (max ${field.maxFiles})` : ''}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Responses tab ─────────────────────────────────────────────────────────────

function ResponsesTab({ form }: { form: Form }) {
  const [page, setPage] = useState(1)
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['form-responses', form._id, page],
    queryFn: () => fetchResponses(form._id, page),
  })

  const delMut = useMutation({
    mutationFn: (responseId: string) => deleteResponse(form._id, responseId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['form-responses', form._id] }),
  })

  const answerableFields = form.fields.filter((f) => f.type !== 'heading' && f.type !== 'paragraph')

  if (isLoading) return <div className="py-8 text-center text-sm text-gray-500">Chargement...</div>
  if (!data || data.total === 0) return (
    <div className="py-12 text-center text-sm text-gray-500">Aucune réponse pour l'instant</div>
  )

  return (
    <div>
      <p className="mb-4 text-sm text-gray-400">{data.total} réponse{data.total !== 1 ? 's' : ''}</p>
      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900/50">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Date</th>
              {answerableFields.map((f) => (
                <th key={f.id} className="px-4 py-3 text-left text-xs font-medium text-gray-400 max-w-xs truncate">
                  {f.label}
                </th>
              ))}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {data.data.map((resp) => (
              <tr key={resp._id} className="hover:bg-gray-800/30 transition-colors">
                <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                  {new Date(resp.createdAt).toLocaleString('fr-FR')}
                </td>
                {answerableFields.map((f) => {
                  const ans = resp.answers.find((a) => a.fieldId === f.id)
                  const val = ans?.value
                  return (
                    <td key={f.id} className="px-4 py-3 text-xs text-gray-300 max-w-xs">
                      <span className="line-clamp-2">
                        {Array.isArray(val) ? val.join(', ') : String(val ?? '—')}
                      </span>
                    </td>
                  )
                })}
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => {
                      if (confirm('Supprimer cette réponse ?')) delMut.mutate(resp._id)
                    }}
                    className="rounded p-1 text-gray-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-800 disabled:opacity-40 transition-colors"
          >
            Précédent
          </button>
          <span className="text-xs text-gray-500">{page} / {data.totalPages}</span>
          <button
            disabled={page === data.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-800 disabled:opacity-40 transition-colors"
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  )
}

// ── Settings tab ──────────────────────────────────────────────────────────────

function SettingsTab({ form, onChange }: { form: Form; onChange: (settings: Form['settings']) => void }) {
  const s = form.settings
  return (
    <div className="max-w-lg space-y-5">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-300">Message de confirmation</label>
        <textarea
          value={s.submitMessage}
          onChange={(e) => onChange({ ...s, submitMessage: e.target.value })}
          rows={3}
          className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none resize-none"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-300">URL de redirection après envoi</label>
        <input
          value={s.redirectUrl ?? ''}
          onChange={(e) => onChange({ ...s, redirectUrl: e.target.value || undefined })}
          placeholder="https://..."
          className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
        <p className="mt-1 text-xs text-gray-500">Laissez vide pour afficher le message de confirmation</p>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-300">Email de notification</label>
        <input
          type="email"
          value={s.notifyEmail ?? ''}
          onChange={(e) => onChange({ ...s, notifyEmail: e.target.value || undefined })}
          placeholder="vous@exemple.com"
          className="w-full rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800/30 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-gray-300">Réponses multiples</p>
          <p className="text-xs text-gray-500">Autoriser un même utilisateur à répondre plusieurs fois</p>
        </div>
        <button
          onClick={() => onChange({ ...s, allowMultipleSubmissions: !s.allowMultipleSubmissions })}
          className={cn(
            'relative h-5 w-9 rounded-full transition-colors',
            s.allowMultipleSubmissions ? 'bg-indigo-600' : 'bg-gray-700',
          )}
        >
          <span className={cn(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
            s.allowMultipleSubmissions ? 'translate-x-4' : 'translate-x-0.5',
          )} />
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'builder' | 'preview' | 'settings' | 'responses'

export function FormBuilderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: form, isLoading } = useQuery({
    queryKey: ['form', id],
    queryFn: () => fetchForm(id!),
    enabled: !!id,
  })

  const [localForm, setLocalForm] = useState<Form | null>(null)
  const [tab, setTab] = useState<Tab>('builder')
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [showPalette, setShowPalette] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync server → local on first load
  useEffect(() => {
    if (form && !localForm) setLocalForm(form)
  }, [form])

  const saveMut = useMutation({
    mutationFn: (data: Partial<Form>) => updateForm(id!, data),
    onSuccess: () => {
      setSaveStatus('saved')
      qc.invalidateQueries({ queryKey: ['forms'] })
    },
  })

  const scheduleAutoSave = useCallback((updated: Form) => {
    setSaveStatus('unsaved')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setSaveStatus('saving')
      saveMut.mutate({
        title: updated.title,
        description: updated.description,
        fields: updated.fields,
        settings: updated.settings,
      })
    }, 1500)
  }, [saveMut])

  const updateLocal = useCallback((patch: Partial<Form>) => {
    setLocalForm((prev) => {
      if (!prev) return prev
      const updated = { ...prev, ...patch }
      scheduleAutoSave(updated)
      return updated
    })
  }, [scheduleAutoSave])

  const togglePublish = useMutation({
    mutationFn: () => localForm?.isPublished ? unpublishForm(id!) : publishForm(id!),
    onSuccess: () => {
      setLocalForm((prev) => prev ? { ...prev, isPublished: !prev.isPublished } : prev)
      qc.invalidateQueries({ queryKey: ['form', id] })
    },
  })

  // ── Field operations ───────────────────────────────────────────────────────

  const addField = (type: FormFieldType) => {
    const fields = localForm?.fields ?? []
    const newField = makeField(type, fields.length)
    const updated = [...fields, newField]
    updateLocal({ fields: updated })
    setSelectedFieldId(newField.id)
  }

  const updateField = (updated: FormField) => {
    const fields = (localForm?.fields ?? []).map((f) => f.id === updated.id ? updated : f)
    updateLocal({ fields })
  }

  const deleteField = (fieldId: string) => {
    const fields = (localForm?.fields ?? []).filter((f) => f.id !== fieldId)
    updateLocal({ fields })
    if (selectedFieldId === fieldId) setSelectedFieldId(null)
  }

  const moveField = (fieldId: string, dir: 'up' | 'down') => {
    const fields = [...(localForm?.fields ?? [])]
    const idx = fields.findIndex((f) => f.id === fieldId)
    const target = dir === 'up' ? idx - 1 : idx + 1
    if (target < 0 || target >= fields.length) return
    ;[fields[idx], fields[target]] = [fields[target], fields[idx]]
    updateLocal({ fields: fields.map((f, i) => ({ ...f, order: i })) })
  }

  if (isLoading || !localForm) {
    return <div className="py-20 text-center text-sm text-gray-500">Chargement...</div>
  }

  const selectedField = localForm.fields.find((f) => f.id === selectedFieldId) ?? null
  const publicUrl = `${window.location.origin}/f/${localForm.slug}`

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex h-14 shrink-0 items-center gap-4 border-b border-gray-800 bg-gray-950 px-4">
        <button
          onClick={() => navigate('/forms')}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Formulaires
        </button>

        <div className="h-4 w-px bg-gray-800" />

        <input
          value={localForm.title}
          onChange={(e) => updateLocal({ title: e.target.value })}
          className="flex-1 bg-transparent text-sm font-semibold text-gray-100 focus:outline-none"
        />

        <span className={cn(
          'text-xs transition-colors',
          saveStatus === 'saved' ? 'text-gray-600' : saveStatus === 'saving' ? 'text-yellow-500' : 'text-orange-400',
        )}>
          {saveStatus === 'saved' ? 'Enregistré' : saveStatus === 'saving' ? 'Enregistrement...' : 'Non enregistré'}
        </span>

        <div className="flex items-center gap-2">
          {localForm.isPublished && (
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Voir
            </a>
          )}

          <button
            onClick={() => togglePublish.mutate()}
            disabled={togglePublish.isPending}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              localForm.isPublished
                ? 'border border-gray-700 text-gray-300 hover:bg-gray-800'
                : 'bg-indigo-600 text-white hover:bg-indigo-500',
            )}
          >
            {localForm.isPublished ? (
              <><EyeOff className="h-3.5 w-3.5" /> Dépublier</>
            ) : (
              <><Eye className="h-3.5 w-3.5" /> Publier</>
            )}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex shrink-0 gap-1 border-b border-gray-800 bg-gray-950 px-4">
        {([
          { id: 'builder', label: 'Constructeur' },
          { id: 'preview', label: 'Aperçu' },
          { id: 'settings', label: 'Paramètres' },
          { id: 'responses', label: `Réponses${localForm.responseCount ? ` (${localForm.responseCount})` : ''}` },
        ] as const).map(({ id: tid, label }) => (
          <button
            key={tid}
            onClick={() => setTab(tid as Tab)}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors',
              tab === tid
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-300',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'preview' && (
          <div className="p-8">
            <FormPreview form={localForm} />
          </div>
        )}

        {tab === 'settings' && (
          <div className="p-6">
            <SettingsTab
              form={localForm}
              onChange={(settings) => updateLocal({ settings })}
            />
          </div>
        )}

        {tab === 'responses' && (
          <div className="p-6">
            <ResponsesTab form={localForm} />
          </div>
        )}

        {tab === 'builder' && (
          <div className="flex h-full">
            {/* Left panel — field list */}
            <div className="flex w-72 shrink-0 flex-col border-r border-gray-800 bg-gray-950">
              <div className="p-3">
                <div className="relative">
                  <button
                    onClick={() => setShowPalette((v) => !v)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-700 py-2 text-sm text-gray-400 hover:border-indigo-500 hover:text-indigo-400 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Ajouter un champ
                  </button>
                  {showPalette && (
                    <FieldPalette
                      onAdd={addField}
                      onClose={() => setShowPalette(false)}
                    />
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {localForm.fields.length === 0 && (
                  <p className="py-8 text-center text-xs text-gray-600">
                    Aucun champ — cliquez sur "Ajouter un champ"
                  </p>
                )}
                {localForm.fields.map((field, idx) => {
                  const meta = FIELD_TYPES.find((f) => f.type === field.type)
                  return (
                    <div
                      key={field.id}
                      onClick={() => setSelectedFieldId(field.id === selectedFieldId ? null : field.id)}
                      className={cn(
                        'group flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors',
                        selectedFieldId === field.id
                          ? 'bg-indigo-600/15 ring-1 ring-indigo-500/40'
                          : 'hover:bg-gray-800/60',
                      )}
                    >
                      <GripVertical className="h-4 w-4 shrink-0 text-gray-700" />
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                        {meta ? <meta.Icon className="h-3.5 w-3.5 text-gray-500" /> : <span className="text-xs text-gray-600">?</span>}
                      </div>
                      <span className="min-w-0 flex-1 truncate text-xs text-gray-300">
                        {field.type === 'heading' || field.type === 'paragraph'
                          ? (field.content || field.label)
                          : field.label}
                      </span>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); moveField(field.id, 'up') }}
                          disabled={idx === 0}
                          className="rounded p-0.5 text-gray-500 hover:text-gray-300 disabled:opacity-30"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); moveField(field.id, 'down') }}
                          disabled={idx === localForm.fields.length - 1}
                          className="rounded p-0.5 text-gray-500 hover:text-gray-300 disabled:opacity-30"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteField(field.id) }}
                          className="rounded p-0.5 text-gray-500 hover:text-red-400"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Right panel — field config */}
            <div className="flex-1 overflow-y-auto p-6">
              {selectedField ? (
                <div className="max-w-md">
                  <div className="mb-4 flex items-center gap-2">
                    {(() => { const FT = FIELD_TYPES.find((f) => f.type === selectedField.type); return FT ? <FT.Icon className="h-4 w-4 text-gray-400" /> : null })()}
                    <h3 className="text-sm font-semibold text-gray-200">
                      {FIELD_TYPES.find((f) => f.type === selectedField.type)?.label}
                    </h3>
                  </div>
                  <FieldEditor field={selectedField} onChange={updateField} allFields={localForm.fields} />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <p className="text-sm text-gray-500">Sélectionnez un champ pour le configurer</p>
                    <p className="mt-1 text-xs text-gray-600">ou ajoutez un nouveau champ depuis le panneau gauche</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
