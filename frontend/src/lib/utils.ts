import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date, locale = 'fr-FR') {
  return new Date(date).toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatCurrency(amount: number, currency = 'EUR', locale = 'fr-FR') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount)
}

export function getInitials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
}

export function formatAmount(amount: number | undefined, currency = 'EUR') {
  if (amount == null) return '—'
  if (currency === 'F CFA' || currency === 'FCFA') currency = 'XOF'
  if (currency === 'EURO') currency = 'EUR'
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amount)
  } catch {
    return `${new Intl.NumberFormat('fr-FR').format(amount)} ${currency}`
  }
}
