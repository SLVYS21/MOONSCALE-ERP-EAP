import { useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Star, AlertCircle, CheckCircle, Upload, X, Loader2 } from 'lucide-react'
import api from '@/services/api'
import type { Form, FormField, FieldCondition } from '@/types'

// ── API ───────────────────────────────────────────────────────────────────────

interface SubmitResult { message: string; redirectUrl?: string | null }

const fetchPublicForm = (slug: string): Promise<Form> =>
  api.get(`/public/forms/${slug}`).then((r: { data: Form }) => r.data)

const submitForm = (slug: string, answers: { fieldId: string; value: unknown }[]): Promise<SubmitResult> =>
  api.post(`/public/forms/${slug}/submit`, { answers }).then((r: { data: SubmitResult }) => r.data)

const uploadFile = (file: File): Promise<{ url: string }> => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post('/public/forms/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r: { data: { url: string } }) => r.data)
}

// ── Condition evaluation ──────────────────────────────────────────────────────

function isFieldVisible(field: FormField, answers: Record<string, unknown>): boolean {
  if (!field.condition) return true
  const { fieldId, operator, value } = field.condition as FieldCondition
  const val = answers[fieldId]

  switch (operator) {
    case 'is_empty':
      return val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)
    case 'is_not_empty':
      return val !== undefined && val !== null && val !== '' && (!Array.isArray(val) || val.length > 0)
    case 'equals':
      return Array.isArray(val)
        ? (val as string[]).includes(value ?? '')
        : String(val ?? '') === (value ?? '')
    case 'not_equals':
      return Array.isArray(val)
        ? !(val as string[]).includes(value ?? '')
        : String(val ?? '') !== (value ?? '')
    case 'contains':
      return String(val ?? '').toLowerCase().includes((value ?? '').toLowerCase())
    case 'not_contains':
      return !String(val ?? '').toLowerCase().includes((value ?? '').toLowerCase())
    default:
      return true
  }
}

// ── File upload input ─────────────────────────────────────────────────────────

function FileUploadInput({
  field,
  value,
  onChange,
  error,
}: {
  field: FormField
  value: string[]
  onChange: (urls: string[]) => void
  error?: string
}) {
  const [uploading, setUploading] = useState<string[]>([]) // names of files currently uploading
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const maxFiles = field.maxFiles ?? 1
  const isImage = !field.accept || field.accept === 'image/*' || field.accept.includes('image/')

  const handleFiles = async (files: FileList) => {
    const remaining = maxFiles - value.length
    const toUpload = Array.from(files).slice(0, remaining)
    if (toUpload.length === 0) return

    const names = toUpload.map((f) => f.name)
    setUploading((prev) => [...prev, ...names])

    const results = await Promise.allSettled(toUpload.map((f) => uploadFile(f)))

    const newUrls: string[] = []
    const newErrors: Record<string, string> = {}
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        newUrls.push(r.value.url)
      } else {
        newErrors[toUpload[i].name] = 'Échec du téléversement'
      }
    })

    setUploading((prev) => prev.filter((n) => !names.includes(n)))
    setUploadErrors((prev) => ({ ...prev, ...newErrors }))
    onChange([...value, ...newUrls])
  }

  const removeUrl = (url: string) => onChange(value.filter((u) => u !== url))

  return (
    <div>
      {/* Previews */}
      {value.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {value.map((url, i) => (
            <div key={i} className="group relative">
              {isImage ? (
                <img src={url} alt="" className="h-20 w-20 rounded-lg object-cover border border-gray-200" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-2xl">
                  📄
                </div>
              )}
              <button
                type="button"
                onClick={() => removeUrl(url)}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity shadow"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {uploading.map((name) => (
            <div key={name} className="flex h-20 w-20 items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      {value.length < maxFiles && (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-8 transition-colors ${
            error ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-indigo-400 hover:bg-indigo-50/30'
          }`}
        >
          {uploading.length > 0 ? (
            <Loader2 className="mb-2 h-7 w-7 animate-spin text-indigo-400" />
          ) : (
            <Upload className="mb-2 h-7 w-7 text-gray-400" />
          )}
          <p className="text-sm font-medium text-gray-600">
            {uploading.length > 0 ? 'Envoi en cours...' : 'Cliquez ou glissez-déposez'}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {field.accept === 'image/*'
              ? 'JPG, PNG, GIF, WebP'
              : field.accept === 'application/pdf'
              ? 'PDF uniquement'
              : 'Tous fichiers'}
            {maxFiles > 1 && ` · ${value.length}/${maxFiles} fichiers`}
            {' · max 10 Mo'}
          </p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={field.accept ?? 'image/*'}
        multiple={maxFiles > 1}
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />

      {Object.entries(uploadErrors).map(([name, msg]) => (
        <p key={name} className="mt-1.5 flex items-center gap-1 text-xs text-red-500">
          <AlertCircle className="h-3.5 w-3.5" />{name}: {msg}
        </p>
      ))}

      {error && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-red-500">
          <AlertCircle className="h-3.5 w-3.5" />{error}
        </p>
      )}
    </div>
  )
}

// ── Generic field input ───────────────────────────────────────────────────────

function FieldInput({
  field,
  value,
  onChange,
  error,
}: {
  field: FormField
  value: unknown
  onChange: (v: unknown) => void
  error?: string
}) {
  const inputClass = `w-full rounded-xl border px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors ${
    error ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white focus:border-indigo-400'
  }`

  if (field.type === 'heading') {
    return <h3 className="text-xl font-bold text-gray-900">{field.content || field.label}</h3>
  }
  if (field.type === 'paragraph') {
    return <p className="text-gray-600 leading-relaxed">{field.content || field.label}</p>
  }

  if (field.type === 'file') {
    return (
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-800">
          {field.label}
          {field.required && <span className="ml-1 text-red-500">*</span>}
        </label>
        <FileUploadInput
          field={field}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
          error={error}
        />
      </div>
    )
  }

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-800">
        {field.label}
        {field.required && <span className="ml-1 text-red-500">*</span>}
      </label>

      {field.type === 'short_text' && (
        <input value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} className={inputClass} />
      )}
      {field.type === 'long_text' && (
        <textarea value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} rows={4} className={`${inputClass} resize-none`} />
      )}
      {field.type === 'email' && (
        <input type="email" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder || 'email@exemple.com'} className={inputClass} />
      )}
      {field.type === 'phone' && (
        <input type="tel" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder || '+33 6 00 00 00 00'} className={inputClass} />
      )}
      {field.type === 'number' && (
        <input type="number" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}
          placeholder={field.placeholder} min={field.validation?.min} max={field.validation?.max} className={inputClass} />
      )}
      {field.type === 'date' && (
        <input type="date" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className={inputClass} />
      )}
      {field.type === 'select' && (
        <select value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="">Sélectionner...</option>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {field.type === 'radio' && (
        <div className="space-y-2.5">
          {(field.options ?? []).map((o) => (
            <label key={o} className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors">
              <input type="radio" checked={value === o} onChange={() => onChange(o)} className="accent-indigo-600" />
              <span className="text-sm text-gray-800">{o}</span>
            </label>
          ))}
        </div>
      )}
      {field.type === 'checkbox' && (
        <div className="space-y-2.5">
          {(field.options ?? []).map((o) => {
            const checked = Array.isArray(value) && (value as string[]).includes(o)
            return (
              <label key={o} className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors">
                <input type="checkbox" checked={checked} onChange={() => {
                  const cur = Array.isArray(value) ? (value as string[]) : []
                  onChange(checked ? cur.filter((v) => v !== o) : [...cur, o])
                }} className="accent-indigo-600" />
                <span className="text-sm text-gray-800">{o}</span>
              </label>
            )
          })}
        </div>
      )}
      {field.type === 'rating' && (
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} type="button" onClick={() => onChange(value === s ? null : s)} className="transition-transform hover:scale-110">
              <Star className={`h-9 w-9 transition-colors ${Number(value) >= s ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-red-500">
          <AlertCircle className="h-3.5 w-3.5" />{error}
        </p>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function PublicFormPage() {
  const { slug } = useParams<{ slug: string }>()

  const { data: form, isLoading, isError } = useQuery({
    queryKey: ['public-form', slug],
    queryFn: () => fetchPublicForm(slug!),
    enabled: !!slug,
    retry: false,
  })

  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  const submitMut = useMutation({
    mutationFn: (payload: { fieldId: string; value: unknown }[]) => submitForm(slug!, payload),
    onSuccess: (result: SubmitResult) => {
      if (result.redirectUrl) {
        window.location.href = result.redirectUrl
      } else {
        setSuccessMessage(result.message)
        setSubmitted(true)
      }
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setErrors({ _form: err?.response?.data?.message ?? 'Une erreur est survenue' })
    },
  })

  const handleSubmit = () => {
    if (!form) return
    const newErrors: Record<string, string> = {}

    for (const field of form.fields) {
      if (['heading', 'paragraph'].includes(field.type)) continue
      if (!isFieldVisible(field, answers)) continue
      if (!field.required) continue

      const val = answers[field.id]
      const isEmpty = val === undefined || val === null || val === '' ||
        (Array.isArray(val) && val.length === 0)
      if (isEmpty) newErrors[field.id] = 'Ce champ est requis'
    }

    setErrors(newErrors)
    if (Object.keys(newErrors).length > 0) return

    // Only send visible fields
    const payload = form.fields
      .filter((f) => !['heading', 'paragraph'].includes(f.type) && isFieldVisible(f, answers))
      .map((f) => ({ fieldId: f.id, value: answers[f.id] ?? null }))

    submitMut.mutate(payload)
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-400">Chargement...</div>
      </div>
    )
  }

  if (isError || !form) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-800">Formulaire introuvable</h2>
          <p className="mt-1 text-sm text-gray-500">Ce formulaire n'existe pas ou n'est plus disponible.</p>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
          <div className="mb-4 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle className="h-7 w-7 text-emerald-600" />
            </div>
          </div>
          <h2 className="text-xl font-bold text-gray-900">Merci !</h2>
          <p className="mt-2 text-gray-600">{successMessage}</p>
        </div>
      </div>
    )
  }

  const visibleFields = form.fields.filter((f) => isFieldVisible(f, answers))
  const hasInputFields = visibleFields.some((f) => !['heading', 'paragraph'].includes(f.type))

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-12 px-4">
      <div className="mx-auto w-full max-w-xl">
        <div className="rounded-2xl bg-white p-8 shadow-lg">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">{form.title}</h1>
            {form.description && <p className="mt-2 text-gray-500">{form.description}</p>}
          </div>

          {errors._form && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errors._form}
            </div>
          )}

          <div className="space-y-6">
            {visibleFields.map((field) => (
              <div
                key={field.id}
                className={field.condition ? 'transition-all duration-300' : undefined}
              >
                <FieldInput
                  field={field}
                  value={answers[field.id]}
                  onChange={(v) => setAnswers((prev) => ({ ...prev, [field.id]: v }))}
                  error={errors[field.id]}
                />
              </div>
            ))}
          </div>

          {hasInputFields && (
            <button
              onClick={handleSubmit}
              disabled={submitMut.isPending}
              className="mt-8 w-full rounded-xl bg-indigo-600 px-6 py-3.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60 transition-colors shadow-sm"
            >
              {submitMut.isPending ? 'Envoi en cours...' : 'Envoyer'}
            </button>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">Propulsé par Moonscale ERP</p>
      </div>
    </div>
  )
}
