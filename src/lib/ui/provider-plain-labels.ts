import type { TrustTier } from '@/modules/business/public'
import type { FirstRequestMode } from '@/modules/catalog/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import { formatRelativeTime } from './format-time'

/**
 * Plain, human-surface availability pill label for a provider. Derived ONLY from
 * real catalog fields. Never invents freshness, "available today", or a response
 * time. Google-Maps-clean: one short label, one meaning.
 */
export type PlainAvailabilityInput = {
  disposition: PublicBusinessCatalogApiV2Dto['disposition']
  firstRequestMode: FirstRequestMode
}

export function plainAvailabilityLabel(input: PlainAvailabilityInput): string {
  const { disposition, firstRequestMode } = input

  if (disposition === 'partial' || disposition === 'stale') {
    return 'Needs confirmation'
  }

  switch (firstRequestMode) {
    case 'quote_request_available':
      return 'Contact supplied'
    case 'not_available_yet':
      return 'No contact option yet'
    default: {
      const _exhaustive: never = firstRequestMode
      void _exhaustive
      return 'Listed'
    }
  }
}


const HOURS_META_LABELS = new Set([
  'unknown',
  'hours unknown',
  'hours supplied by owner',
  'owner supplied hours',
  'owner confirmed hours are not listed yet',
  'after-hours availability supplied by owner',
])

/**
 * Plain hours line. Echoes the real hours string when present; otherwise a plain
 * "Check hours" — never `null`, `N/A`, or invented certainty.
 */
export function plainHoursLabel(hoursOrUnknown: string | undefined): string {
  const trimmed = (hoursOrUnknown ?? '').trim()
  if (trimmed.length === 0 || HOURS_META_LABELS.has(trimmed.toLowerCase())) {
    return 'Check hours'
  }

  return trimmed
}

/**
 * Plain trust label. Only names a trust standard when one was actually met.
 * Empty string means "no trust label to show" — the caller renders nothing.
 */
export function plainTrustLabel(trustTier: TrustTier): string {
  switch (trustTier) {
    case 'registry_verified':
      return 'Checked'
    case 'contact_confirmed':
      return 'Contact confirmed'
    case 'listed':
    case 'claimed':
      return ''
    default: {
      const _exhaustive: never = trustTier
      void _exhaustive
      return ''
    }
  }
}

/**
 * Plain next-step action label for a provider card / answer next step. Maps the
 * published first-request mode to one safe action. Never implies booking,
 * payment, or dispatch.
 */
export function plainNextStepLabel(firstRequestMode: FirstRequestMode): string {
  switch (firstRequestMode) {
    case 'quote_request_available':
      return 'View contact details'
    case 'not_available_yet':
      return 'View details'
    default: {
      const _exhaustive: never = firstRequestMode
      void _exhaustive
      return 'View details'
    }
  }
}

/** Plain response-time label for cards and listings. Empty when unknown. */
export function plainResponseTimeLabel(minutes: number | undefined): string {
  if (minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) {
    return ''
  }

  if (minutes < 60) {
    return `Responds ~${Math.round(minutes)}m`
  }

  const hours = Math.round(minutes / 60)
  return `Responds ~${hours}h`
}

/**
 * Plain freshness label from a record `updatedAt` timestamp. Honest wording:
 * "Updated {relative}" — never "Verified"/"Checked" (updatedAt is a record
 * update, not a passed check). Empty when unknown.
 */
export function plainFreshnessLabel(updatedAtMs: number | undefined): string {
  if (updatedAtMs === undefined || !Number.isFinite(updatedAtMs) || updatedAtMs <= 0) {
    return ''
  }
  return `Updated ${formatRelativeTime(updatedAtMs)}`
}

/** Combines response time and trust into one card cue (DESIGN §9.2). */
export function formatProviderTrustCue(input: {
  responseTimeMinutes?: number
  trustLabel: string
}): string {
  return [plainResponseTimeLabel(input.responseTimeMinutes), input.trustLabel].filter((part) => part.length > 0).join(' · ')
}

/** Category illustration fallback when no business photo is published. */
export function categoryIllustrationPath(category: string): string {
  const normalized = category.trim().toLowerCase()

  const rules: readonly [RegExp, string][] = [
    [/plumb/, '/images/illustration/cat-plumbing.png'],
    [/electr/, '/images/illustration/cat-electrical.png'],
    [/account|bookkeep|payroll|\btax\b/, '/images/illustration/cat-accounting.png'],
    [/aged.?care|elder|senior/, '/images/illustration/cat-aged-care.png'],
    [/dental|dentist|orthodont/, '/images/illustration/cat-dental.png'],
    [/\blaw\b|legal|solicit|lawyer|conveyanc/, '/images/illustration/cat-family-law.png'],
  ]

  for (const [pattern, path] of rules) {
    if (pattern.test(normalized)) {
      return path
    }
  }

  return '/images/illustration/cat-default.png'
}
