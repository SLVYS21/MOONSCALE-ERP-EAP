import { useEffect, useRef, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface CinematicStep {
  label: string
  description?: string
  /** Estimated time this step takes, in seconds. The loader advances based on
   *  cumulative durations — when actual work outpaces the estimate the loader
   *  parks on the last step until `done` flips to true. */
  duration: number
}

interface Props {
  steps: CinematicStep[]
  /** Set to true when the underlying async operation has finished. The loader
   *  immediately resolves all steps to "done". */
  done?: boolean
  /** Optional headline shown at the top, next to the spinning orb. */
  headline?: string
  /** Optional accent color — defaults to violet. Use 'rose' for thumbnails, etc. */
  accent?: 'violet' | 'rose' | 'amber' | 'emerald'
  className?: string
}

const ACCENT_STYLES: Record<NonNullable<Props['accent']>, {
  bg: string
  orbBg: string
  orbInner: string
  orbIcon: string
  text: string
  barFrom: string
  barTo: string
  activeBorder: string
  activeIconBg: string
}> = {
  violet: {
    bg: 'from-violet-50/60 to-fuchsia-50/40',
    orbBg: 'bg-violet-200/50',
    orbInner: 'bg-violet-300/30',
    orbIcon: 'text-violet-600',
    text: 'text-violet-700',
    barFrom: 'from-violet-500',
    barTo: 'to-fuchsia-500',
    activeBorder: 'border-violet-300',
    activeIconBg: 'bg-violet-600',
  },
  rose: {
    bg: 'from-rose-50/60 to-pink-50/40',
    orbBg: 'bg-rose-200/50',
    orbInner: 'bg-rose-300/30',
    orbIcon: 'text-rose-600',
    text: 'text-rose-700',
    barFrom: 'from-rose-500',
    barTo: 'to-pink-500',
    activeBorder: 'border-rose-300',
    activeIconBg: 'bg-rose-600',
  },
  amber: {
    bg: 'from-amber-50/60 to-orange-50/40',
    orbBg: 'bg-amber-200/50',
    orbInner: 'bg-amber-300/30',
    orbIcon: 'text-amber-600',
    text: 'text-amber-700',
    barFrom: 'from-amber-500',
    barTo: 'to-orange-500',
    activeBorder: 'border-amber-300',
    activeIconBg: 'bg-amber-600',
  },
  emerald: {
    bg: 'from-emerald-50/60 to-teal-50/40',
    orbBg: 'bg-emerald-200/50',
    orbInner: 'bg-emerald-300/30',
    orbIcon: 'text-emerald-600',
    text: 'text-emerald-700',
    barFrom: 'from-emerald-500',
    barTo: 'to-teal-500',
    activeBorder: 'border-emerald-300',
    activeIconBg: 'bg-emerald-600',
  },
}

export function CinematicLoader({ steps, done, headline, accent = 'violet', className }: Props) {
  const [elapsed, setElapsed] = useState(0)
  const startedAtRef = useRef(Date.now())

  useEffect(() => {
    startedAtRef.current = Date.now()
    setElapsed(0)
  }, [])

  useEffect(() => {
    if (done) return
    const interval = setInterval(() => {
      setElapsed((Date.now() - startedAtRef.current) / 1000)
    }, 120)
    return () => clearInterval(interval)
  }, [done])

  const totalDuration = steps.reduce((sum, s) => sum + s.duration, 0) || 1

  // Determine current active step from cumulative durations
  let currentStep = steps.length - 1
  let accum = 0
  for (let i = 0; i < steps.length; i++) {
    accum += steps[i].duration
    if (elapsed < accum) {
      currentStep = i
      break
    }
  }

  const progress = done ? 100 : Math.min(96, (elapsed / totalDuration) * 100)
  const showLatencyHint = !done && elapsed > totalDuration

  const a = ACCENT_STYLES[accent]

  return (
    <div className={cn('rounded-2xl border border-gray-200 bg-gradient-to-br p-6', a.bg, className)}>
      {/* Hero: pulsing orb + current step label */}
      <div className="mb-5 flex items-center gap-4">
        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
          <div className={cn('absolute inset-0 animate-pulse rounded-full', a.orbBg)} />
          <div className={cn('absolute inset-1.5 animate-ping rounded-full', a.orbInner)} />
          <Loader2 className={cn('relative h-7 w-7 animate-spin', a.orbIcon)} />
        </div>
        <div className="min-w-0 flex-1">
          {headline && <p className="truncate text-sm font-semibold text-gray-900">{headline}</p>}
          {steps[currentStep] && (
            <p className={cn('mt-0.5 truncate text-xs', a.text)}>
              Étape {currentStep + 1}/{steps.length} — {steps[currentStep].label}
            </p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-5 h-1 overflow-hidden rounded-full bg-white/60">
        <div
          className={cn('h-full rounded-full bg-gradient-to-r transition-all duration-500 ease-out', a.barFrom, a.barTo)}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Vertical steps */}
      <ol className="space-y-2">
        {steps.map((step, i) => {
          const isDone = done || i < currentStep
          const isActive = !done && i === currentStep
          return (
            <li
              key={i}
              className={cn(
                'flex gap-3 rounded-lg border p-2.5 transition-all duration-300',
                isActive && cn('bg-white shadow-sm', a.activeBorder),
                isDone && 'border-transparent bg-transparent opacity-65',
                !isActive && !isDone && 'border-transparent bg-transparent opacity-35',
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors',
                  isDone && 'bg-emerald-100 text-emerald-700',
                  isActive && cn('text-white', a.activeIconBg),
                  !isActive && !isDone && 'bg-gray-200 text-gray-500',
                )}
              >
                {isDone ? (
                  <Check className="h-4 w-4" />
                ) : isActive ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  i + 1
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-medium', isActive ? 'text-gray-900' : 'text-gray-600')}>
                  {step.label}
                </p>
                {step.description && (isActive || isDone) && (
                  <p className="mt-0.5 text-xs text-gray-500">{step.description}</p>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {showLatencyHint && (
        <p className="mt-4 text-center text-xs italic text-gray-500">
          Encore quelques secondes — l'analyse approche de la fin…
        </p>
      )}
    </div>
  )
}
