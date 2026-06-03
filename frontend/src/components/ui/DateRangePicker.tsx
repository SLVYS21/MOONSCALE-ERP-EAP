import { useState, useRef, useEffect } from 'react'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type Period, PERIODS, periodToDates } from '@/lib/periods'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PeriodOption {
  value: Period | ''
  label: string
}

export interface DateRangePickerProps {
  period: Period | ''
  customFrom: string
  customTo: string
  onChange: (period: Period | '', from: string, to: string) => void
  periods?: PeriodOption[]
  placeholder?: string
  className?: string
}

// ── Calendar helpers ──────────────────────────────────────────────────────────

const MONTH_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]
const DAY_HEADERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function isoStr(d: Date) { return d.toISOString().slice(0, 10) }
function parseIso(s: string): Date | null {
  if (!s) return null
  const d = new Date(s + 'T12:00:00')
  return isNaN(d.getTime()) ? null : d
}
function sameDay(a: Date | null, b: Date | null) {
  return !!(a && b && isoStr(a) === isoStr(b))
}
function inRange(d: Date | null, from: Date | null, to: Date | null) {
  if (!d || !from || !to) return false
  const ds = isoStr(d)
  return ds > isoStr(from) && ds < isoStr(to)
}
function monthDays(year: number, month: number): Array<Date | null> {
  const firstDay = new Date(year, month, 1).getDay()
  const offset = firstDay === 0 ? 6 : firstDay - 1
  const total = new Date(year, month + 1, 0).getDate()
  const out: Array<Date | null> = Array(offset).fill(null)
  for (let d = 1; d <= total; d++) out.push(new Date(year, month, d))
  return out
}

// ── Mini calendar ─────────────────────────────────────────────────────────────

function MonthCalendar({
  year, month, fromDate, toDate, onDayClick, onPrev, onNext,
}: {
  year: number; month: number
  fromDate: Date | null; toDate: Date | null
  onDayClick: (d: Date) => void
  onPrev: () => void; onNext: () => void
}) {
  const today = isoStr(new Date())
  const days  = monthDays(year, month)

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[13px] font-semibold text-gray-200 capitalize">
          {MONTH_FR[month]} {year}
        </span>
        <div className="flex items-center gap-0.5">
          <button onClick={onPrev} className="p-1 rounded hover:bg-gray-700/70 text-gray-500 hover:text-gray-200 transition-colors">
            <ChevronLeft size={13} />
          </button>
          <button onClick={onNext} className="p-1 rounded hover:bg-gray-700/70 text-gray-500 hover:text-gray-200 transition-colors">
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {DAY_HEADERS.map((h, i) => (
          <div key={i} className="h-6 flex items-center justify-center text-[10px] font-medium text-gray-600">{h}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((day, i) => {
          if (!day) return <div key={`e${i}`} />
          const ds        = isoStr(day)
          const isFrom    = sameDay(day, fromDate)
          const isTo      = sameDay(day, toDate)
          const isSel     = isFrom || isTo
          const isRanged  = inRange(day, fromDate, toDate)
          const isToday   = ds === today
          return (
            <button
              key={ds}
              onClick={() => onDayClick(day)}
              className={cn(
                'h-7 w-full flex items-center justify-center text-[12px] rounded-md transition-colors',
                isSel    && 'bg-indigo-600 text-white font-semibold',
                isRanged && !isSel && 'bg-indigo-900/40 text-indigo-300',
                !isSel && !isRanged && 'text-gray-400 hover:bg-gray-700/70 hover:text-gray-100',
                isToday && !isSel && 'ring-1 ring-inset ring-indigo-500/60',
              )}
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── DateRangePicker ───────────────────────────────────────────────────────────

export const ALL_PERIODS: PeriodOption[] = [
  { value: '', label: 'Toutes les dates' },
  ...PERIODS,
]

export const SHORT_PERIODS: PeriodOption[] = [
  { value: '',       label: 'Toutes les dates' },
  { value: '7d',     label: '7 derniers jours' },
  { value: '30d',    label: '30 derniers jours' },
  { value: 'month',  label: 'Ce mois' },
  { value: 'last_month', label: 'Mois dernier' },
  { value: '3m',     label: '3 derniers mois' },
  { value: 'custom', label: 'Personnalisé…' },
]

function getDisplayDates(period: Period | '', customFrom: string, customTo: string) {
  if (!period || period === 'custom') return { from: customFrom, to: customTo }
  const dates = periodToDates(period as Period)
  return { from: dates.from, to: dates.to }
}

export function DateRangePicker({
  period, customFrom, customTo, onChange,
  periods = ALL_PERIODS,
  placeholder = 'Période',
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [alignRight, setAlignRight] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { from: displayFrom, to: displayTo } = getDisplayDates(period, customFrom, customTo)
  const fromDate = parseIso(displayFrom)
  const toDate   = parseIso(displayTo)

  const [lYear,  setLYear]  = useState(() => fromDate?.getFullYear()  ?? new Date().getFullYear())
  const [lMonth, setLMonth] = useState(() => fromDate?.getMonth()     ?? new Date().getMonth())
  const [rYear,  setRYear]  = useState(() => toDate?.getFullYear()    ?? new Date().getFullYear())
  const [rMonth, setRMonth] = useState(() => toDate?.getMonth()       ?? new Date().getMonth())

  // Sync calendars when a quick period is selected
  useEffect(() => {
    if (fromDate) { setLYear(fromDate.getFullYear()); setLMonth(fromDate.getMonth()) }
    if (toDate)   { setRYear(toDate.getFullYear());   setRMonth(toDate.getMonth()) }
  }, [period]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const triggerLabel = period
    ? periods.find(p => p.value === period)?.label ?? period
    : (customFrom || customTo)
      ? `${customFrom || '…'} → ${customTo || '…'}`
      : placeholder

  const isActive = Boolean(period || customFrom || customTo)

  function selectPeriod(p: PeriodOption) {
    if (!p.value || p.value === 'custom') {
      onChange(p.value as Period | '', customFrom, customTo)
    } else {
      const dates = periodToDates(p.value as Period)
      onChange(p.value as Period, dates.from, dates.to)
    }
  }

  function handleFromClick(day: Date) {
    const ds = isoStr(day)
    const newTo = displayTo && ds <= displayTo ? displayTo : ''
    onChange('custom', ds, newTo)
    setLYear(day.getFullYear()); setLMonth(day.getMonth())
  }
  function handleToClick(day: Date) {
    const ds = isoStr(day)
    const newFrom = displayFrom && ds >= displayFrom ? displayFrom : ''
    onChange('custom', newFrom, ds)
    setRYear(day.getFullYear()); setRMonth(day.getMonth())
  }

  const prevL = () => { if (lMonth === 0) { setLMonth(11); setLYear(y => y-1) } else setLMonth(m => m-1) }
  const nextL = () => { if (lMonth === 11) { setLMonth(0); setLYear(y => y+1) } else setLMonth(m => m+1) }
  const prevR = () => { if (rMonth === 0) { setRMonth(11); setRYear(y => y-1) } else setRMonth(m => m-1) }
  const nextR = () => { if (rMonth === 11) { setRMonth(0); setRYear(y => y+1) } else setRMonth(m => m+1) }

  return (
    <div ref={ref} className={cn('relative', className)}>
      {/* Trigger */}
      <button
        onClick={() => {
          if (!open && ref.current) {
            const rect = ref.current.getBoundingClientRect()
            setAlignRight(window.innerWidth - rect.left < 660)
          }
          setOpen(o => !o)
        }}
        className={cn(
          'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors select-none',
          isActive
            ? 'border-indigo-600/50 bg-indigo-900/20 text-indigo-300 hover:border-indigo-500/70'
            : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-600 hover:text-gray-100',
        )}
      >
        <CalendarDays size={13} className={isActive ? 'text-indigo-400' : 'text-gray-500'} />
        <span>{triggerLabel}</span>
        <ChevronDown size={11} className="text-gray-500 ml-0.5" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className={cn('absolute top-full mt-2 z-[100] flex rounded-xl border border-gray-700/80 bg-gray-900 shadow-2xl shadow-black/40 overflow-hidden', alignRight ? 'right-0' : 'left-0')} style={{ minWidth: 640 }}>

          {/* Left — quick select */}
          <div className="w-52 shrink-0 border-r border-gray-800 p-4 flex flex-col gap-0.5">
            <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-500">Sélection rapide</p>
            {periods.map((p) => {
              const active = period === p.value && !(p.value === '' && (customFrom || customTo))
              return (
                <button
                  key={String(p.value)}
                  onClick={() => selectPeriod(p)}
                  className={cn(
                    'flex items-center justify-between gap-2 w-full rounded-lg px-3 py-2 text-[13px] text-left transition-colors',
                    active
                      ? 'bg-[#1a2d4a] text-white font-medium'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200',
                  )}
                >
                  <span>{p.label}</span>
                  {active && <Check size={13} className="text-indigo-400 shrink-0" />}
                </button>
              )
            })}
          </div>

          {/* Right — calendars */}
          <div className="flex-1 p-4 overflow-hidden">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-gray-500">Plage de dates personnalisée</p>

            {/* Date text inputs */}
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <p className="mb-1 text-[11px] text-gray-500">Date de début</p>
                <input
                  type="date"
                  value={displayFrom}
                  onChange={e => onChange('custom', e.target.value, displayTo)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-[13px] text-gray-200 focus:border-indigo-500 focus:outline-none [color-scheme:dark]"
                />
              </div>
              <div className="flex-1">
                <p className="mb-1 text-[11px] text-gray-500">Date de fin</p>
                <input
                  type="date"
                  value={displayTo}
                  onChange={e => onChange('custom', displayFrom, e.target.value)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-[13px] text-gray-200 focus:border-indigo-500 focus:outline-none [color-scheme:dark]"
                />
              </div>
            </div>

            {/* Dual calendar */}
            <div className="flex gap-5">
              <div className="flex-1 min-w-0">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-600">De</p>
                <MonthCalendar
                  year={lYear} month={lMonth}
                  fromDate={fromDate} toDate={toDate}
                  onDayClick={handleFromClick}
                  onPrev={prevL} onNext={nextL}
                />
              </div>
              <div className="w-px bg-gray-800 self-stretch" />
              <div className="flex-1 min-w-0">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-600">À</p>
                <MonthCalendar
                  year={rYear} month={rMonth}
                  fromDate={fromDate} toDate={toDate}
                  onDayClick={handleToClick}
                  onPrev={prevR} onNext={nextR}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
