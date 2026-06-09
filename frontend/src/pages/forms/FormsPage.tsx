import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, FileText, Eye, EyeOff, Copy, Trash2, BarChart2, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/services/api'
import type { Form } from '@/types'

// ── API ───────────────────────────────────────────────────────────────────────

const fetchForms = (): Promise<Form[]> => api.get('/forms').then((r) => r.data)
const createForm = (data: { title: string; description?: string }) =>
  api.post('/forms', data).then((r) => r.data)
const deleteForm = (id: string) => api.delete(`/forms/${id}`)
const publishForm = (id: string) => api.post(`/forms/${id}/publish`)
const unpublishForm = (id: string) => api.post(`/forms/${id}/unpublish`)
const duplicateForm = (id: string) => api.post(`/forms/${id}/duplicate`).then((r) => r.data)

// ── Create modal ─────────────────────────────────────────────────────────────

function CreateFormModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: createForm,
    onSuccess: (form: Form) => {
      qc.invalidateQueries({ queryKey: ['forms'] })
      onCreated(form._id)
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Nouveau formulaire</h2>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Titre *</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && title.trim() && mutation.mutate({ title: title.trim(), description })}
              placeholder="Mon formulaire"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description optionnelle"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-400 hover:text-gray-800 transition-colors">
            Annuler
          </button>
          <button
            disabled={!title.trim() || mutation.isPending}
            onClick={() => mutation.mutate({ title: title.trim(), description })}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {mutation.isPending ? 'Création...' : 'Créer et éditer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Form card ─────────────────────────────────────────────────────────────────

function FormCard({ form, onEdit }: { form: Form; onEdit: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()

  const deleteMut = useMutation({
    mutationFn: () => deleteForm(form._id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forms'] }),
  })

  const toggleMut = useMutation({
    mutationFn: () => form.isPublished ? unpublishForm(form._id) : publishForm(form._id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forms'] }),
  })

  const dupMut = useMutation({
    mutationFn: () => duplicateForm(form._id),
    onSuccess: (newForm: Form) => {
      qc.invalidateQueries({ queryKey: ['forms'] })
      navigate(`/forms/${newForm._id}`)
    },
  })

  const publicUrl = `${window.location.origin}/f/${form.slug}`

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col gap-4 hover:border-gray-200 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-gray-900">{form.title}</h3>
            <span className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
              form.isPublished
                ? 'bg-emerald-500/15 text-emerald-600'
                : 'bg-gray-200/50 text-gray-400',
            )}>
              {form.isPublished ? 'Publié' : 'Brouillon'}
            </span>
          </div>
          {form.description && (
            <p className="mt-0.5 truncate text-xs text-gray-500">{form.description}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <BarChart2 className="h-3.5 w-3.5" />
          {form.responseCount ?? 0} réponse{(form.responseCount ?? 0) !== 1 ? 's' : ''}
        </span>
        <span>{form.fields?.length ?? 0} champ{(form.fields?.length ?? 0) !== 1 ? 's' : ''}</span>
        <span>{new Date(form.createdAt).toLocaleDateString('fr-FR')}</span>
      </div>

      <div className="flex items-center gap-2 border-t border-gray-200 pt-3">
        <button
          onClick={onEdit}
          className="flex-1 rounded-lg bg-indigo-600/10 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-600/20 transition-colors"
        >
          Éditer
        </button>

        <button
          onClick={() => toggleMut.mutate()}
          disabled={toggleMut.isPending}
          title={form.isPublished ? 'Dépublier' : 'Publier'}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-800 transition-colors"
        >
          {form.isPublished ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>

        {form.isPublished && (
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Voir le formulaire"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-800 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}

        <button
          onClick={() => dupMut.mutate()}
          disabled={dupMut.isPending}
          title="Dupliquer"
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-800 transition-colors"
        >
          <Copy className="h-4 w-4" />
        </button>

        <button
          onClick={() => {
            if (confirm('Supprimer ce formulaire et toutes ses réponses ?')) {
              deleteMut.mutate()
            }
          }}
          disabled={deleteMut.isPending}
          title="Supprimer"
          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function FormsPage() {
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)

  const { data: forms = [], isLoading } = useQuery({
    queryKey: ['forms'],
    queryFn: fetchForms,
  })

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Formulaires</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {forms.length} formulaire{forms.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nouveau formulaire
        </button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-gray-500">Chargement...</div>
      ) : forms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
            <FileText className="h-8 w-8 text-gray-600" />
          </div>
          <h3 className="text-base font-medium text-gray-600">Aucun formulaire</h3>
          <p className="mt-1 text-sm text-gray-500">Créez votre premier formulaire pour commencer</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Créer un formulaire
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {forms.map((form) => (
            <FormCard
              key={form._id}
              form={form}
              onEdit={() => navigate(`/forms/${form._id}`)}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateFormModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false)
            navigate(`/forms/${id}`)
          }}
        />
      )}
    </div>
  )
}
