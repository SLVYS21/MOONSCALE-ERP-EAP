export type Period =
  | 'today' | 'yesterday' | '7d' | '30d'
  | 'month' | 'last_month' | '3m' | '6m' | 'year'
  | 'custom'

export const PERIODS: { value: Period; label: string }[] = [
  { value: 'today',      label: "Aujourd'hui" },
  { value: 'yesterday',  label: 'Hier' },
  { value: '7d',         label: '7 derniers jours' },
  { value: '30d',        label: '30 derniers jours' },
  { value: 'month',      label: 'Ce mois' },
  { value: 'last_month', label: 'Mois dernier' },
  { value: '3m',         label: '3 derniers mois' },
  { value: '6m',         label: '6 derniers mois' },
  { value: 'year',       label: 'Cette année' },
  { value: 'custom',     label: 'Personnalisé…' },
]

const iso = (d: Date) => d.toISOString().split('T')[0]

export function periodToDates(p: Period | ''): { from: string; to: string } {
  if (!p || p === 'custom') return { from: '', to: '' }
  const now = new Date()
  switch (p) {
    case 'today':
      return { from: iso(now), to: iso(now) }
    case 'yesterday': {
      const d = new Date(now); d.setDate(d.getDate() - 1)
      return { from: iso(d), to: iso(d) }
    }
    case '7d': {
      const d = new Date(now); d.setDate(d.getDate() - 6)
      return { from: iso(d), to: iso(now) }
    }
    case '30d': {
      const d = new Date(now); d.setDate(d.getDate() - 29)
      return { from: iso(d), to: iso(now) }
    }
    case 'month':
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) }
    case 'last_month': {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const to   = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: iso(from), to: iso(to) }
    }
    case '3m': {
      const d = new Date(now); d.setMonth(d.getMonth() - 3)
      return { from: iso(d), to: iso(now) }
    }
    case '6m': {
      const d = new Date(now); d.setMonth(d.getMonth() - 6)
      return { from: iso(d), to: iso(now) }
    }
    case 'year':
      return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) }
  }
}

export function periodLabel(period: Period | '', customFrom: string, customTo: string): string {
  if (!period) return ''
  if (period !== 'custom') return PERIODS.find((p) => p.value === period)?.label ?? ''
  if (customFrom || customTo) return `${customFrom || '…'} → ${customTo || '…'}`
  return ''
}
