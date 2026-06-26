import { useState } from 'react'
import { ChevronDown, ChevronUp, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PipelineStageProps {
  index: number
  title: string
  subtitle?: string
  completed?: boolean
  defaultOpen?: boolean
  action?: React.ReactNode
  children: React.ReactNode
}

export function PipelineStage({ index, title, subtitle, completed, defaultOpen = false, action, children }: PipelineStageProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <header className="flex items-center gap-3 px-5 py-3">
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
            completed ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700',
          )}
        >
          {completed ? <Check className="h-4 w-4" /> : index}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-start text-left cursor-pointer"
        >
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          </div>
          {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </button>
        {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
      </header>
      {open && <div className="border-t border-gray-100 px-5 py-4">{children}</div>}
    </section>
  )
}
