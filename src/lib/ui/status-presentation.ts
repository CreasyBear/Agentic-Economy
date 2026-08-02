import type { TrustTier } from '@/modules/business/public'
import type { FirstRequestMode } from '@/modules/catalog/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import { formatRelativeTime } from './format-time'

export const aeStatusValues = [
  'available',
  'claimed',
  'contact_confirmed',
  'degraded',
  'failed',
  'guarded',
  'indexed',
  'listed',
  'not_live',
  'not_queued',
  'published',
  'queued',
  'registry_verified',
  'stale',
  'suppressed',
  'unavailable',
  'notification_bounced',
  'notification_complained',
  'notification_delivery_delayed',
  'notification_retry_exhausted',
  'notification_no_repair',
  'notification_provider_missing',
  'discovery_stale',
  'discovery_degraded',
  'discovery_unavailable',
  'discovery_parity_failed',
  'protected_action_review_required',
  'protected_action_refused',
  'protected_action_expired',
  'protected_action_proof_gap',
  'protected_action_gateway_admitted',
  'protected_action_gateway_consumed',
  'protected_action_receipt_recorded',
  'protected_action_attempt_failed',
  'protected_action_disputed',
  'protected_action_reversed',
  'protected_action_no_repair',
  'billing_pending',
  'billing_started',
  'billing_returned',
  'billing_cancelled',
  'billing_failed',
  'billing_paid',
  'billing_past_due',
  'billing_required_action',
  'billing_refund',
  'billing_dispute',
  'billing_chargeback',
  'billing_provider_event_held',
  'billing_reconciliation_mismatch',
  'billing_no_repair',
] as const

export type AeStatus = (typeof aeStatusValues)[number]
export type AeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'
export type AeStatusAudience = 'public' | 'owner' | 'admin' | 'operator'
export type AeStatusPublicness = 'public' | 'private'

export type AeStatusPresentation = {
  label: string
  compactLabel: string
  tone: AeTone
  description: string
  nextAction?: string
  priority: 'low' | 'medium' | 'high'
  audience: AeStatusAudience
  publicness: AeStatusPublicness
  disabledReason?: string
}

export const aeStatusPresentation = {
  available: {
    label: 'Available',
    compactLabel: 'Available',
    tone: 'success',
    description: 'This is currently available.',
    priority: 'medium',
    audience: 'public',
    publicness: 'public',
  },
  claimed: {
    label: 'Claimed',
    compactLabel: 'Claimed',
    tone: 'success',
    description: 'The business owner has claimed this page.',
    priority: 'medium',
    audience: 'public',
    publicness: 'public',
  },
  contact_confirmed: {
    label: 'Contact confirmed',
    compactLabel: 'Confirmed',
    tone: 'success',
    description: 'Public contact details have supporting evidence.',
    priority: 'medium',
    audience: 'public',
    publicness: 'public',
  },
  degraded: {
    label: 'Degraded',
    compactLabel: 'Degraded',
    tone: 'warning',
    description: 'The page remains visible, but something needs review.',
    nextAction: 'Review the page details and repair action.',
    priority: 'high',
    audience: 'public',
    publicness: 'public',
  },
  failed: {
    label: 'Failed',
    compactLabel: 'Failed',
    tone: 'danger',
    description: 'The latest operation did not complete.',
    nextAction: 'Use the repair path.',
    priority: 'high',
    audience: 'operator',
    publicness: 'private',
  },
  guarded: {
    label: 'Guarded',
    compactLabel: 'Guarded',
    tone: 'info',
    description: 'Some features are guarded until they are ready for customers.',
    priority: 'medium',
    audience: 'public',
    publicness: 'public',
  },
  indexed: {
    label: 'Indexed',
    compactLabel: 'Indexed',
    tone: 'success',
    description: 'Search indexing is active for this page.',
    priority: 'medium',
    audience: 'public',
    publicness: 'public',
  },
  listed: {
    label: 'Listed',
    compactLabel: 'Listed',
    tone: 'neutral',
    description: 'The business is listed without additional registry evidence.',
    priority: 'low',
    audience: 'public',
    publicness: 'public',
  },
  not_live: {
    label: 'Not live',
    compactLabel: 'Not live',
    tone: 'neutral',
    description: 'This feature is not available yet.',
    priority: 'low',
    audience: 'public',
    publicness: 'public',
    disabledReason: 'Capability not yet proven from source-owned runtime evidence.',
  },
  not_queued: {
    label: 'Not queued',
    compactLabel: 'Not queued',
    tone: 'neutral',
    description: 'No update has been queued yet.',
    priority: 'low',
    audience: 'operator',
    publicness: 'private',
  },
  published: {
    label: 'Published',
    compactLabel: 'Published',
    tone: 'success',
    description: 'This page is published.',
    priority: 'medium',
    audience: 'public',
    publicness: 'public',
  },
  queued: {
    label: 'Queued',
    compactLabel: 'Queued',
    tone: 'info',
    description: 'An update is waiting to run.',
    priority: 'medium',
    audience: 'operator',
    publicness: 'private',
  },
  registry_verified: {
    label: 'Registry verified',
    compactLabel: 'Verified',
    tone: 'success',
    description: 'Public details have been checked.',
    priority: 'medium',
    audience: 'public',
    publicness: 'public',
  },
  stale: {
    label: 'Stale',
    compactLabel: 'Stale',
    tone: 'warning',
    description: 'This page may be out of date.',
    nextAction: 'Refresh the public details.',
    priority: 'high',
    audience: 'public',
    publicness: 'public',
  },
  suppressed: {
    label: 'Suppressed',
    compactLabel: 'Suppressed',
    tone: 'danger',
    description: 'This object is not publicly available.',
    priority: 'high',
    audience: 'admin',
    publicness: 'private',
  },
  unavailable: {
    label: 'Unavailable',
    compactLabel: 'Unavailable',
    tone: 'neutral',
    description: 'This feature is not available yet.',
    priority: 'low',
    audience: 'public',
    publicness: 'public',
    disabledReason: 'Availability has not been established.',
  },
  notification_bounced: {
    label: 'Notification bounced',
    compactLabel: 'Bounced',
    tone: 'warning',
    description: 'The delivery provider reported that the notification bounced.',
    nextAction: 'Review suppression and contact-readback before retrying.',
    priority: 'high',
    audience: 'owner',
    publicness: 'private',
  },
  notification_complained: {
    label: 'Notification complaint recorded',
    compactLabel: 'Complaint',
    tone: 'danger',
    description: 'A delivery complaint was recorded.',
    nextAction: 'Stop delivery to the complained recipient and investigate consent.',
    priority: 'high',
    audience: 'operator',
    publicness: 'private',
  },
  notification_delivery_delayed: {
    label: 'Notification delivery delayed',
    compactLabel: 'Delayed',
    tone: 'warning',
    description: 'The notification is recorded, but delivery is delayed.',
    nextAction: 'Wait for delivery confirmation or schedule a bounded retry.',
    priority: 'medium',
    audience: 'owner',
    publicness: 'private',
  },
  notification_retry_exhausted: {
    label: 'Notification retry exhausted',
    compactLabel: 'Retry done',
    tone: 'danger',
    description: 'All bounded notification retry attempts are exhausted.',
    nextAction: 'Choose manual repair or mark no-repair with evidence.',
    priority: 'high',
    audience: 'operator',
    publicness: 'private',
  },
  notification_no_repair: {
    label: 'Notification marked no-repair',
    compactLabel: 'No repair',
    tone: 'danger',
    description: 'An operator marked the notification terminal without further repair.',
    nextAction: 'Show preserved status and support instructions.',
    priority: 'high',
    audience: 'operator',
    publicness: 'private',
    disabledReason: 'New dispatch for this item is disabled by terminal operator state.',
  },
  notification_provider_missing: {
    label: 'Notification provider missing',
    compactLabel: 'Provider missing',
    tone: 'warning',
    description: 'Notification dispatch is disabled because provider configuration is absent.',
    nextAction: 'Configure and verify the provider before dispatch resumes.',
    priority: 'high',
    audience: 'operator',
    publicness: 'private',
    disabledReason: 'Provider configuration has not been verified.',
  },
  discovery_stale: {
    label: 'Details may be stale',
    compactLabel: 'Stale',
    tone: 'warning',
    description: 'Published business details may be out of date.',
    nextAction: 'Refresh the public details.',
    priority: 'high',
    audience: 'public',
    publicness: 'public',
  },
  discovery_degraded: {
    label: 'Details need review',
    compactLabel: 'Needs review',
    tone: 'warning',
    description: 'Published business details are available, but need review.',
    nextAction: 'Review the public details before making stronger claims.',
    priority: 'high',
    audience: 'public',
    publicness: 'public',
  },
  discovery_unavailable: {
    label: 'Details not published',
    compactLabel: 'Not published',
    tone: 'neutral',
    description: 'Published business details are not live yet.',
    nextAction: 'Restore the details or keep the not-published state clear.',
    priority: 'high',
    audience: 'public',
    publicness: 'public',
    disabledReason: 'Published business details are not currently live.',
  },
  discovery_parity_failed: {
    label: 'Discovery parity failed',
    compactLabel: 'Parity failed',
    tone: 'danger',
    description: 'Generated docs, schema, examples, or route readback failed parity checks.',
    nextAction: 'Withhold publication until parity is rebuilt from source.',
    priority: 'high',
    audience: 'operator',
    publicness: 'private',
    disabledReason: 'Parity failure blocks public discovery claims.',
  },
  protected_action_review_required: {
    label: 'Protected action needs review',
    compactLabel: 'Review',
    tone: 'info',
    description: 'The proposed protected action requires owner review before any attempt.',
    nextAction: 'Present consequence copy and wait for owner approval or refusal.',
    priority: 'medium',
    audience: 'owner',
    publicness: 'private',
  },
  protected_action_refused: {
    label: 'Protected action refused',
    compactLabel: 'Refused',
    tone: 'neutral',
    description: 'The owner or policy refused the protected action before execution.',
    nextAction: 'Keep the refusal reconstructable and do not attempt the action.',
    priority: 'medium',
    audience: 'owner',
    publicness: 'private',
    disabledReason: 'Owner or policy refusal blocks action attempts.',
  },
  protected_action_expired: {
    label: 'Protected action expired',
    compactLabel: 'Expired',
    tone: 'warning',
    description: 'The approval or gateway admission expired before a valid attempt.',
    nextAction: 'Require a fresh proposal and owner decision.',
    priority: 'high',
    audience: 'owner',
    publicness: 'private',
    disabledReason: 'Expired approval cannot be consumed.',
  },
  protected_action_proof_gap: {
    label: 'Protected action proof gap',
    compactLabel: 'Proof gap',
    tone: 'warning',
    description: 'The action does not have enough proof to claim success.',
    nextAction: 'Collect evidence or mark no-repair without overclaiming success.',
    priority: 'high',
    audience: 'operator',
    publicness: 'private',
  },
  protected_action_gateway_admitted: {
    label: 'Contact follow-up gateway admitted',
    compactLabel: 'Admitted',
    tone: 'info',
    description: 'The owner-approved contact follow-up has one expiring gateway admission before any attempt.',
    nextAction: 'Consume this admission once for the selected contact follow-up attempt.',
    priority: 'medium',
    audience: 'operator',
    publicness: 'private',
  },
  protected_action_gateway_consumed: {
    label: 'Protected action gateway consumed',
    compactLabel: 'Consumed',
    tone: 'info',
    description: 'The one-use gateway admission has been consumed for an attempt.',
    nextAction: 'Show attempt status and reject any replay.',
    priority: 'medium',
    audience: 'operator',
    publicness: 'private',
  },
  protected_action_receipt_recorded: {
    label: 'Contact follow-up receipt recorded',
    compactLabel: 'Receipt',
    tone: 'success',
    description: 'A contact follow-up receipt was recorded without raw provider payloads.',
    nextAction: 'Keep the proposal, policy, owner decision, gateway, attempt, and receipt reconstructable.',
    priority: 'medium',
    audience: 'owner',
    publicness: 'private',
  },
  protected_action_attempt_failed: {
    label: 'Protected action attempt failed',
    compactLabel: 'Attempt failed',
    tone: 'danger',
    description: 'The protected action attempt failed without success proof.',
    nextAction: 'Use bounded retry rules or mark no-repair.',
    priority: 'high',
    audience: 'operator',
    publicness: 'private',
  },
  protected_action_disputed: {
    label: 'Protected action disputed',
    compactLabel: 'Disputed',
    tone: 'warning',
    description: 'A dispute was recorded against the protected action outcome.',
    nextAction: 'Preserve receipts and route the dispute through support.',
    priority: 'high',
    audience: 'operator',
    publicness: 'private',
  },
  protected_action_reversed: {
    label: 'Protected action reversed',
    compactLabel: 'Reversed',
    tone: 'warning',
    description: 'The protected action outcome was reversed or unwound.',
    nextAction: 'Show reversal status and stop success claims.',
    priority: 'high',
    audience: 'operator',
    publicness: 'private',
  },
  protected_action_no_repair: {
    label: 'Protected action marked no-repair',
    compactLabel: 'No repair',
    tone: 'danger',
    description: 'An operator marked the protected action terminal without further repair.',
    nextAction: 'Preserve proof gaps, receipts, and support context.',
    priority: 'high',
    audience: 'operator',
    publicness: 'private',
    disabledReason: 'Terminal no-repair state blocks further attempts.',
  },
  billing_pending: {
    label: 'Billing pending',
    compactLabel: 'Pending',
    tone: 'info',
    description: 'A billing operation is waiting for provider confirmation.',
    nextAction: 'Wait for hosted-flow or webhook confirmation.',
    priority: 'medium',
    audience: 'owner',
    publicness: 'private',
  },
  billing_started: {
    label: 'Billing started',
    compactLabel: 'Started',
    tone: 'info',
    description: 'The paid activation flow has started.',
    nextAction: 'Continue through the hosted provider flow.',
    priority: 'medium',
    audience: 'owner',
    publicness: 'private',
  },
  billing_returned: {
    label: 'Billing returned',
    compactLabel: 'Returned',
    tone: 'info',
    description: 'The owner returned from the hosted billing flow.',
    nextAction: 'Confirm provider status before changing paid state.',
    priority: 'medium',
    audience: 'owner',
    publicness: 'private',
  },
  billing_cancelled: {
    label: 'Billing cancelled',
    compactLabel: 'Cancelled',
    tone: 'warning',
    description: 'The hosted billing flow returned through the cancel path.',
    nextAction: 'Keep paid activation unavailable unless a later receipt proves otherwise.',
    priority: 'medium',
    audience: 'owner',
    publicness: 'private',
  },
  billing_failed: {
    label: 'Billing failed',
    compactLabel: 'Failed',
    tone: 'danger',
    description: 'The paid activation attempt failed or could not be admitted.',
    nextAction: 'Review redacted provider evidence and retry only from a typed retryable state.',
    priority: 'high',
    audience: 'operator',
    publicness: 'private',
  },
  billing_paid: {
    label: 'Billing paid',
    compactLabel: 'Paid',
    tone: 'success',
    description: 'Paid activation is backed by receipt and reconciliation status.',
    nextAction: 'Show the approved paid state, not raw provider fields.',
    priority: 'medium',
    audience: 'owner',
    publicness: 'private',
  },
  billing_past_due: {
    label: 'Billing past due',
    compactLabel: 'Past due',
    tone: 'warning',
    description: 'Billing status shows a past-due state requiring owner action.',
    nextAction: 'Send the owner to the approved hosted billing recovery path.',
    priority: 'high',
    audience: 'owner',
    publicness: 'private',
  },
  billing_required_action: {
    label: 'Billing action required',
    compactLabel: 'Action',
    tone: 'warning',
    description: 'Paid activation requires an owner or provider action before completion.',
    nextAction: 'Use the hosted action path and preserve status.',
    priority: 'high',
    audience: 'owner',
    publicness: 'private',
  },
  billing_refund: {
    label: 'Billing refund recorded',
    compactLabel: 'Refund',
    tone: 'warning',
    description: 'A refund was recorded against the paid activation rail.',
    nextAction: 'Reconcile entitlement and receipt state from verified records.',
    priority: 'high',
    audience: 'operator',
    publicness: 'private',
  },
  billing_dispute: {
    label: 'Billing dispute recorded',
    compactLabel: 'Dispute',
    tone: 'danger',
    description: 'A billing dispute was recorded and needs support handling.',
    nextAction: 'Preserve receipts, evidence refs, and reconciliation status.',
    priority: 'high',
    audience: 'operator',
    publicness: 'private',
  },
  billing_chargeback: {
    label: 'Billing chargeback recorded',
    compactLabel: 'Chargeback',
    tone: 'danger',
    description: 'A chargeback was recorded against the paid activation rail.',
    nextAction: 'Disable unsupported paid claims until reconciliation is resolved.',
    priority: 'high',
    audience: 'operator',
    publicness: 'private',
  },
  billing_provider_event_held: {
    label: 'Billing provider event held',
    compactLabel: 'Held',
    tone: 'warning',
    description: 'A provider event was held because it could not be safely accepted.',
    nextAction: 'Bind or reject the event through reconciliation without granting entitlement.',
    priority: 'high',
    audience: 'operator',
    publicness: 'private',
  },
  billing_reconciliation_mismatch: {
    label: 'Billing reconciliation mismatch',
    compactLabel: 'Mismatch',
    tone: 'danger',
    description: 'Billing state and provider evidence do not match.',
    nextAction: 'Run the approved reconciliation path or mark no-repair.',
    priority: 'high',
    audience: 'operator',
    publicness: 'private',
  },
  billing_no_repair: {
    label: 'Billing marked no-repair',
    compactLabel: 'No repair',
    tone: 'danger',
    description: 'An operator marked billing reconciliation terminal without repair.',
    nextAction: 'Keep receipts and mismatch evidence visible to support.',
    priority: 'high',
    audience: 'operator',
    publicness: 'private',
    disabledReason: 'Terminal no-repair state blocks paid-activation claims.',
  },
} satisfies Record<AeStatus, AeStatusPresentation>

export const statusPresentation = aeStatusPresentation

export function getStatusPresentation(status: AeStatus): AeStatusPresentation {
  return aeStatusPresentation[status]
}

export function dispositionToAeStatus(disposition: PublicBusinessCatalogApiV2Dto['disposition']): AeStatus {
  if (disposition === 'stale') {
    return 'stale'
  }

  if (disposition === 'partial') {
    return 'degraded'
  }

  return 'available'
}

export function trustTierToAeStatus(trustTier: TrustTier): AeStatus {
  if (trustTier === 'registry_verified') {
    return 'registry_verified'
  }

  if (trustTier === 'contact_confirmed') {
    return 'contact_confirmed'
  }

  if (trustTier === 'listed') {
    return 'listed'
  }

  return 'claimed'
}

export function offeringSupportToAeStatus(
  support: PublicBusinessCatalogApiV2Dto['offerings'][number]['support'],
): AeStatus {
  if (support.aeSupportedAction) {
    return 'available'
  }

  return support.integrated ? 'guarded' : 'not_live'
}

export function offeringAccessToAeStatus(
  accessPaths: PublicBusinessCatalogApiV2Dto['offerings'][number]['accessPaths'],
): AeStatus {
  return accessPaths.length > 0 ? 'listed' : 'not_queued'
}

export function firstRequestModeLabel(mode: FirstRequestMode): string {
  if (mode === 'quote_request_available') {
    return 'Quote details supplied'
  }

  if (mode === 'inquiry_available') {
    return 'Contact instructions supplied'
  }

  return 'No contact option published yet'
}

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
    case 'inquiry_available':
      return 'Contact supplied'
    case 'quote_request_available':
      return 'Quote on request'
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
    case 'inquiry_available':
      return 'View contact instructions'
    case 'quote_request_available':
      return 'View quote details'
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
