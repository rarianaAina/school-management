import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const date = typeof value === 'string' ? parseISO(value) : value
  return isValid(date) ? date : null
}

export function formatDate(value: string | Date | null | undefined, pattern = 'dd/MM/yyyy'): string {
  const date = toDate(value)
  return date ? format(date, pattern, { locale: fr }) : '—'
}

export function formatDateLong(value: string | Date | null | undefined): string {
  return formatDate(value, 'd MMMM yyyy')
}

export function formatDateTime(value: string | Date | null | undefined): string {
  return formatDate(value, "dd/MM/yyyy 'à' HH:mm")
}

export function formatRelative(value: string | Date | null | undefined): string {
  const date = toDate(value)
  return date ? formatDistanceToNow(date, { locale: fr, addSuffix: true }) : '—'
}

/** '08:30:00' -> '08:30' */
export function formatTime(value: string | null | undefined): string {
  if (!value) return '—'
  return value.slice(0, 5)
}

export function formatCurrency(
  amount: number | null | undefined,
  currency = 'EUR',
  locale = 'fr-FR',
): string {
  if (amount === null || amount === undefined) return '—'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return '—'
  return `${formatNumber(value, digits)} %`
}

/** Note affichee sur le bareme de l'etablissement : '14,50 / 20'. */
export function formatGrade(
  score: number | null | undefined,
  scale = 20,
  { withScale = true } = {},
): string {
  if (score === null || score === undefined) return '—'
  const value = formatNumber(score, 2)
  return withScale ? `${value} / ${scale}` : value
}

export function initials(...parts: Array<string | null | undefined>): string {
  return parts
    .filter(Boolean)
    .map((part) => part!.trim().charAt(0).toUpperCase())
    .join('')
    .slice(0, 2)
}

export function fullName(
  first: string | null | undefined,
  last: string | null | undefined,
): string {
  return [first, last].filter(Boolean).join(' ').trim() || '—'
}

/** 'Lycée Victor Hugo' -> 'lycee-victor-hugo' (respecte la contrainte SQL du slug). */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
  7: 'Dimanche',
}
