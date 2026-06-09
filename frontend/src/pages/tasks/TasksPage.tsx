import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, FolderOpen, CheckCircle2, Clock, AlertCircle, Users } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/utils'
import api from '@/services/api'
import type { Project, TaskStats } from '@/types'

// ── Create project modal ──────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6',
]

function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [icon, setIcon] = useState('📁')
  const [deadline, setDeadline] = useState('')
  const [error, setError] = useState('')

  const { mutate, isPending } = useMutation({
    mutationFn: (body: object) => api.post<Project>('/projects', body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['projects'] })
      onClose()
      navigate(`/tasks/${res.data._id}`)
    },
    onError: () => setError('Impossible de créer le projet.'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-base font-semibold text-gray-900">Nouveau projet</h2>
        <div className="space-y-4">
          <Input id="proj-title" label="Titre" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nom du projet" autoFocus />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-600">Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="Description courte…"
            />
          </div>
          <div className="flex items-center gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-600">Icône</label>
              <input
                type="text"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                maxLength={2}
                className="w-16 rounded-lg border border-gray-200 bg-white px-3 py-2 text-center text-lg focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium text-gray-600">Couleur</label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className="h-6 w-6 rounded-full transition-transform hover:scale-110"
                    style={{ backgroundColor: c, outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-600">Deadline</label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button loading={isPending} disabled={!title.trim()} onClick={() => mutate({ title, description, color, icon, deadline: deadline || undefined })}>
            Créer
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Project card ──────────────────────────────────────────────────────────────

function ProjectCard({ project }: { project: Project & { taskCount?: number; completedCount?: number } }) {
  const navigate = useNavigate()
  const total = project.taskCount ?? 0
  const done = project.completedCount ?? 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  const statusBadge = {
    active: { variant: 'success' as const, label: 'Actif' },
    completed: { variant: 'info' as const, label: 'Terminé' },
    archived: { variant: 'default' as const, label: 'Archivé' },
  }[project.status]

  return (
    <div
      onClick={() => navigate(`/tasks/${project._id}`)}
      className="cursor-pointer rounded-xl border border-gray-200 bg-white p-5 transition-colors hover:border-gray-200 hover:bg-white"
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl"
            style={{ backgroundColor: project.color + '20', border: `1px solid ${project.color}40` }}
          >
            {project.icon}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{project.title}</h3>
            {project.description && (
              <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">{project.description}</p>
            )}
          </div>
        </div>
        <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
          <span>{done} / {total} tâches</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-gray-100">
          <div
            className="h-1.5 rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: project.color }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {project.memberIds.length} membre{project.memberIds.length !== 1 ? 's' : ''}
        </div>
        {project.deadline && (
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDate(project.deadline)}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Stats card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ElementType; color: string }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
        </div>
        <div className={`rounded-lg bg-gray-100/80 p-2.5 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function TasksPage() {
  const [showCreate, setShowCreate] = useState(false)

  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: () => api.get<Project[]>('/projects').then((r) => r.data),
  })

  const { data: stats } = useQuery<TaskStats>({
    queryKey: ['task-stats'],
    queryFn: () => api.get<TaskStats>('/tasks/stats').then((r) => r.data),
  })

  const activeProjects = projects.filter((p) => p.status !== 'archived')

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Tâches & Projets</h1>
          <p className="mt-0.5 text-sm text-gray-500">{activeProjects.length} projet{activeProjects.length !== 1 ? 's' : ''} actifs</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          Nouveau projet
        </Button>
      </div>

      {/* KPI stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total tâches" value={stats?.total ?? '—'} icon={CheckCircle2} color="text-indigo-600" />
        <StatCard label="En cours" value={stats?.byStatus.in_progress ?? '—'} icon={Clock} color="text-amber-400" />
        <StatCard label="Terminées" value={stats?.byStatus.done ?? '—'} icon={CheckCircle2} color="text-emerald-600" />
        <StatCard label="En retard" value={stats?.overdue ?? '—'} icon={AlertCircle} color="text-red-400" />
      </div>

      {/* Projects grid */}
      {projectsLoading ? (
        <div className="py-8 text-center text-sm text-gray-500">Chargement…</div>
      ) : activeProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 py-16 gap-3">
          <FolderOpen className="h-10 w-10 text-gray-700" />
          <p className="text-sm text-gray-500">Aucun projet. Créez-en un pour démarrer.</p>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Créer un projet
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {activeProjects.map((p) => (
            <ProjectCard key={p._id} project={p} />
          ))}
        </div>
      )}

      {/* KPI par membre */}
      {stats && stats.byMember.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-gray-600">Performance par membre</h2>
          <Card>
            <div className="divide-y divide-gray-800">
              {stats.byMember.map((m, i) => (
                <div key={i} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 text-xs font-medium text-indigo-600">
                    {m.user ? `${m.user.firstName[0]}${m.user.lastName[0]}`.toUpperCase() : '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800">
                      {m.user ? `${m.user.firstName} ${m.user.lastName}` : 'Inconnu'}
                    </p>
                    <p className="text-xs text-gray-500">{m.total} tâche{m.total !== 1 ? 's' : ''} assignée{m.total !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span className="text-emerald-600">{m.completed} ✓</span>
                    <span className="text-amber-400">{m.inProgress} ⟳</span>
                    {m.overdue > 0 && <span className="text-red-400">{m.overdue} !</span>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
