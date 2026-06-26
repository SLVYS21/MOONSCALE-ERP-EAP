import { Link } from 'react-router-dom'
import { Video, CheckCircle2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { STATUS_CONFIG, STATUS_ORDER, type VideoProject } from '../types'

export function ProjectGrid({ projects }: { projects: VideoProject[] }) {
  if (projects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
        <Video className="mx-auto mb-2 h-7 w-7 text-gray-300" />
        <p className="text-sm text-gray-700">Aucun projet en cours</p>
        <p className="mt-1 text-xs text-gray-400">Capture une idée pour démarrer ton premier projet.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => (
        <ProjectCard key={p._id} project={p} />
      ))}
    </div>
  )
}

function ProjectCard({ project }: { project: VideoProject }) {
  const status = STATUS_CONFIG[project.status]
  const stepIdx = STATUS_ORDER.indexOf(project.status)
  const checklistDone = project.checklist.filter((c) => c.done).length
  const checklistTotal = project.checklist.length
  const selectedHook = project.hooks.find((h) => h.selected)?.text

  return (
    <Link
      to={`/content/projects/${project._id}`}
      className="group block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-violet-300"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className={cn('rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', status.bg, status.color)}>
          {status.label}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-gray-400">{project.duration_type}</span>
      </div>

      <h3 className="line-clamp-2 text-sm font-semibold text-gray-900">{project.title || 'Sans titre'}</h3>

      {selectedHook && (
        <p className="mt-1 line-clamp-2 text-xs text-gray-500">"{selectedHook}"</p>
      )}

      {/* Progress steps */}
      <div className="mt-3 flex gap-0.5">
        {STATUS_ORDER.map((s, i) => (
          <div
            key={s}
            className={cn(
              'h-1 flex-1 rounded-full',
              i <= stepIdx ? 'bg-violet-500' : 'bg-gray-200',
            )}
          />
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          {checklistDone}/{checklistTotal}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {new Date(project.createdAt).toLocaleDateString('fr-FR')}
        </span>
      </div>
    </Link>
  )
}
