import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Plus, X, Check, LayoutList, Kanban,
  Calendar, MessageSquare,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { cn, formatDate } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import api from '@/services/api'
import type { Task, TaskStatus, TaskPriority, ProjectWithColumns, User as UserType } from '@/types'

// ── Constants ─────────────────────────────────────────────────────────────────

const COLUMNS: { key: TaskStatus; label: string; color: string; bg: string }[] = [
  { key: 'backlog',     label: 'Backlog',    color: 'text-gray-400',   bg: 'bg-gray-50' },
  { key: 'todo',       label: 'À faire',    color: 'text-indigo-600',  bg: 'bg-indigo-50' },
  { key: 'in_progress',label: 'En cours',   color: 'text-amber-400',   bg: 'bg-amber-500/10' },
  { key: 'review',     label: 'Révision',   color: 'text-violet-400',  bg: 'bg-violet-500/10' },
  { key: 'done',       label: 'Terminé',    color: 'text-emerald-600', bg: 'bg-emerald-50' },
]

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; variant: 'default' | 'info' | 'warning' | 'danger'; dot: string }> = {
  low:    { label: 'Faible',  variant: 'default',  dot: 'bg-gray-500' },
  medium: { label: 'Moyen',   variant: 'info',     dot: 'bg-blue-500' },
  high:   { label: 'Élevé',   variant: 'warning',  dot: 'bg-amber-500' },
  urgent: { label: 'Urgent',  variant: 'danger',   dot: 'bg-red-500' },
}

// ── Task modal (detail / edit) ────────────────────────────────────────────────

function TaskModal({
  task,
  projectId,
  members,
  onClose,
}: {
  task: Task
  projectId: string
  members: UserType[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)

  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [priority, setPriority] = useState<TaskPriority>(task.priority)
  const [assignedTo, setAssignedTo] = useState(task.assignedTo?._id ?? '')
  const [dueDate, setDueDate] = useState(task.dueDate ? task.dueDate.slice(0, 10) : '')
  const [newComment, setNewComment] = useState('')
  const [newCheckItem, setNewCheckItem] = useState('')

  const invalidate = () => qc.invalidateQueries({ queryKey: ['project', projectId] })

  const updateMutation = useMutation({
    mutationFn: (body: object) => api.patch(`/tasks/${task._id}`, body),
    onSuccess: invalidate,
  })

  const commentMutation = useMutation({
    mutationFn: (text: string) => api.post(`/tasks/${task._id}/comments`, { text }),
    onSuccess: () => { invalidate(); setNewComment('') },
  })

  const checklistAddMutation = useMutation({
    mutationFn: (text: string) => api.post(`/tasks/${task._id}/checklist`, { text }),
    onSuccess: () => { invalidate(); setNewCheckItem('') },
  })

  const checklistToggleMutation = useMutation({
    mutationFn: (index: number) => api.patch(`/tasks/${task._id}/checklist/${index}/toggle`, {}),
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/tasks/${task._id}`),
    onSuccess: () => { invalidate(); onClose() },
  })

  const selectCls = 'rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none'

  const doneChecklist = task.checklist.filter((i) => i.done).length
  const totalChecklist = task.checklist.length

  const isCreator = task.createdBy._id === currentUser?._id

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-gray-200 bg-[#f5f6fa] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <Badge variant={PRIORITY_CONFIG[priority].variant}>{PRIORITY_CONFIG[priority].label}</Badge>
          <div className="flex items-center gap-2">
            {(isCreator || currentUser?.role !== 'member') && (
              <button
                onClick={() => window.confirm('Supprimer cette tâche ?') && deleteMutation.mutate()}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Supprimer
              </button>
            )}
            <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-600 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-5 p-5">
          {/* Title */}
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== task.title && updateMutation.mutate({ title })}
            className="w-full resize-none bg-transparent text-lg font-semibold text-gray-900 placeholder-gray-400 focus:outline-none"
            rows={2}
          />

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Statut</label>
              <select
                value={status}
                onChange={(e) => { setStatus(e.target.value as TaskStatus); updateMutation.mutate({ status: e.target.value }) }}
                className={selectCls + ' w-full'}
              >
                {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Priorité</label>
              <select
                value={priority}
                onChange={(e) => { setPriority(e.target.value as TaskPriority); updateMutation.mutate({ priority: e.target.value }) }}
                className={selectCls + ' w-full'}
              >
                {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Assigné à</label>
              <select
                value={assignedTo}
                onChange={(e) => { setAssignedTo(e.target.value); updateMutation.mutate({ assignedTo: e.target.value || null }) }}
                className={selectCls + ' w-full'}
              >
                <option value="">— Personne</option>
                {members.map((m) => <option key={m._id} value={m._id}>{m.firstName} {m.lastName}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Échéance</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                onBlur={() => updateMutation.mutate({ dueDate: dueDate || null })}
                className={selectCls + ' w-full'}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-xs text-gray-500">Description</label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => description !== task.description && updateMutation.mutate({ description })}
              placeholder="Ajouter une description…"
              className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 placeholder-gray-400 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Checklist */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs text-gray-500">
                Checklist {totalChecklist > 0 && <span className="ml-1 text-gray-600">({doneChecklist}/{totalChecklist})</span>}
              </label>
            </div>
            {totalChecklist > 0 && (
              <div className="mb-2 h-1 w-full rounded-full bg-gray-100">
                <div
                  className="h-1 rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.round((doneChecklist / totalChecklist) * 100)}%` }}
                />
              </div>
            )}
            <ul className="mb-2 space-y-1">
              {task.checklist.map((item, i) => (
                <li key={i} className="flex items-center gap-2">
                  <button
                    onClick={() => checklistToggleMutation.mutate(i)}
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                      item.done
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-gray-600 hover:border-gray-400',
                    )}
                  >
                    {item.done && <Check className="h-2.5 w-2.5" />}
                  </button>
                  <span className={cn('text-sm', item.done && 'line-through text-gray-500')}>{item.text}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input
                type="text"
                value={newCheckItem}
                onChange={(e) => setNewCheckItem(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && newCheckItem.trim() && checklistAddMutation.mutate(newCheckItem.trim())}
                placeholder="Ajouter un item…"
                className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none"
              />
              <button
                onClick={() => newCheckItem.trim() && checklistAddMutation.mutate(newCheckItem.trim())}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-800 transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Comments */}
          <div>
            <label className="mb-2 block text-xs text-gray-500">
              <MessageSquare className="mr-1 inline h-3 w-3" />
              Commentaires ({task.comments.length})
            </label>
            <ul className="mb-3 space-y-2">
              {task.comments.map((c, i) => (
                <li key={i} className="rounded-lg bg-white px-3 py-2">
                  <p className="text-xs font-medium text-gray-400">{formatDate(c.createdAt)}</p>
                  <p className="mt-0.5 text-sm text-gray-600">{c.text}</p>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && newComment.trim() && commentMutation.mutate(newComment.trim())}
                placeholder="Ajouter un commentaire…"
                className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none"
              />
              <button
                onClick={() => newComment.trim() && commentMutation.mutate(newComment.trim())}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-800 transition-colors"
              >
                Envoyer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Kanban task card ──────────────────────────────────────────────────────────

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const p = PRIORITY_CONFIG[task.priority]
  const doneItems = task.checklist.filter((i) => i.done).length
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'done'

  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:border-gray-200"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-gray-800 leading-snug">{task.title}</p>
        <span className={cn('mt-0.5 h-2 w-2 shrink-0 rounded-full', p.dot)} />
      </div>

      {task.tags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {task.tags.map((tag) => (
            <span key={tag} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-400">{tag}</span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-2">
          {task.checklist.length > 0 && (
            <span className="flex items-center gap-0.5">
              <Check className="h-3 w-3" /> {doneItems}/{task.checklist.length}
            </span>
          )}
          {task.comments.length > 0 && (
            <span className="flex items-center gap-0.5">
              <MessageSquare className="h-3 w-3" /> {task.comments.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {task.dueDate && (
            <span className={cn('flex items-center gap-0.5', isOverdue && 'text-red-400')}>
              <Calendar className="h-3 w-3" />
              {formatDate(task.dueDate)}
            </span>
          )}
          {task.assignedTo && (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600/30 text-xs font-medium text-indigo-600">
              {task.assignedTo.firstName[0]}{task.assignedTo.lastName[0]}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Kanban column ─────────────────────────────────────────────────────────────

function KanbanColumn({
  col,
  tasks,
  projectId,
  onOpenTask,
}: {
  col: typeof COLUMNS[0]
  tasks: Task[]
  projectId: string
  onOpenTask: (t: Task) => void
}) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (adding) inputRef.current?.focus() }, [adding])

  const createMutation = useMutation({
    mutationFn: (title: string) =>
      api.post('/tasks', { title, projectId, status: col.key }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] })
      setNewTitle('')
      setAdding(false)
    },
  })

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl bg-white p-3">
      <div className={cn('mb-3 flex items-center justify-between rounded-lg px-2 py-1.5', col.bg)}>
        <span className={cn('text-xs font-semibold', col.color)}>{col.label}</span>
        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{tasks.length}</span>
      </div>

      <div className="flex-1 space-y-2">
        {tasks.map((t) => (
          <TaskCard key={t._id} task={t} onClick={() => onOpenTask(t)} />
        ))}
      </div>

      {adding ? (
        <div className="mt-2">
          <input
            ref={inputRef}
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newTitle.trim()) createMutation.mutate(newTitle.trim())
              if (e.key === 'Escape') { setAdding(false); setNewTitle('') }
            }}
            placeholder="Titre de la tâche…"
            className="w-full rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none"
          />
          <div className="mt-1.5 flex gap-2">
            <button
              onClick={() => newTitle.trim() && createMutation.mutate(newTitle.trim())}
              className="rounded-lg bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700 transition-colors"
            >
              Ajouter
            </button>
            <button
              onClick={() => { setAdding(false); setNewTitle('') }}
              className="rounded-lg px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-400 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Ajouter
        </button>
      )}
    </div>
  )
}

// ── List view ─────────────────────────────────────────────────────────────────

function ListView({ tasks, onOpenTask }: { tasks: Task[]; onOpenTask: (t: Task) => void }) {
  const allTasks = Object.values(tasks).flat()
  return (
    <Card>
      {allTasks.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-500">Aucune tâche.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="pb-3 font-medium">Tâche</th>
              <th className="pb-3 font-medium">Statut</th>
              <th className="pb-3 font-medium">Priorité</th>
              <th className="pb-3 font-medium">Assigné</th>
              <th className="pb-3 font-medium">Échéance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60">
            {allTasks.map((t) => {
              const col = COLUMNS.find((c) => c.key === t.status)!
              const p = PRIORITY_CONFIG[t.priority]
              const isOverdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'done'
              return (
                <tr key={t._id} onClick={() => onOpenTask(t)} className="cursor-pointer hover:bg-gray-50 transition-colors">
                  <td className="py-3 pr-4">
                    <p className="font-medium text-gray-800">{t.title}</p>
                    {t.description && <p className="text-xs text-gray-500 line-clamp-1">{t.description}</p>}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={cn('text-xs font-medium', col.color)}>{col.label}</span>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge variant={p.variant}>{p.label}</Badge>
                  </td>
                  <td className="py-3 pr-4 text-gray-400 text-xs">
                    {t.assignedTo ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}` : '—'}
                  </td>
                  <td className={cn('py-3 text-xs', isOverdue ? 'text-red-400' : 'text-gray-400')}>
                    {t.dueDate ? formatDate(t.dueDate) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  const { data, isLoading } = useQuery<ProjectWithColumns>({
    queryKey: ['project', projectId],
    queryFn: () => api.get<ProjectWithColumns>(`/projects/${projectId}/tasks`).then((r) => r.data),
    enabled: !!projectId,
  })

  if (isLoading) {
    return <div className="p-6 py-8 text-center text-sm text-gray-500">Chargement…</div>
  }

  if (!data) {
    return <div className="p-6 py-8 text-center text-sm text-gray-500">Projet introuvable.</div>
  }

  const { project, columns } = data
  const members = project.memberIds ?? []
  const allTasks = Object.values(columns).flat()
  const totalTasks = allTasks.length
  const doneTasks = columns.done?.length ?? 0

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4">
        <button
          onClick={() => navigate('/tasks')}
          className="mb-2 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-600 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg text-xl"
              style={{ backgroundColor: project.color + '20', border: `1px solid ${project.color}40` }}
            >
              {project.icon}
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{project.title}</h1>
              <p className="text-xs text-gray-500">{doneTasks}/{totalTasks} tâches terminées</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 p-0.5">
              <button
                onClick={() => setView('kanban')}
                className={cn('rounded-md px-3 py-1.5 text-sm transition-colors', view === 'kanban' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-600')}
              >
                <Kanban className="h-4 w-4" />
              </button>
              <button
                onClick={() => setView('list')}
                className={cn('rounded-md px-3 py-1.5 text-sm transition-colors', view === 'list' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-600')}
              >
                <LayoutList className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1 w-full rounded-full bg-gray-100">
          <div
            className="h-1 rounded-full transition-all"
            style={{
              width: totalTasks > 0 ? `${Math.round((doneTasks / totalTasks) * 100)}%` : '0%',
              backgroundColor: project.color,
            }}
          />
        </div>
      </div>

      {/* Board */}
      <div className={cn('flex-1 overflow-auto p-6', view === 'kanban' && 'flex gap-4')}>
        {view === 'kanban' ? (
          COLUMNS.map((col) => (
            <KanbanColumn
              key={col.key}
              col={col}
              tasks={columns[col.key] ?? []}
              projectId={projectId!}
              onOpenTask={setSelectedTask}
            />
          ))
        ) : (
          <ListView tasks={allTasks} onOpenTask={setSelectedTask} />
        )}
      </div>

      {/* Task detail modal */}
      {selectedTask && (
        <TaskModal
          task={selectedTask}
          projectId={projectId!}
          members={members}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  )
}
