import type { PublicStatus, TrustTier } from '@/modules/business/public'
import type { FirstRequestMode, ServiceCapabilityStatus } from '@/modules/catalog/public'
import type { DiscoveryStatus } from '@/modules/discovery/public'
import type { IndexStatus } from '@/modules/registry/public'

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
    description: 'This status is available from source-owned state.',
    priority: 'medium',
    audience: 'public',
    publicness: 'public',
  },
  claimed: {
    label: 'Claimed',
    compactLabel: 'Claimed',
    tone: 'success',
    description: 'An owner binding exists for this object.',
    priority: 'medium',
    audience: 'public',
    publicness: 'public',
  },
  contact_confirmed: {
    label: 'Contact confirmed',
    compactLabel: 'Confirmed',
    tone: 'success',
    description: 'Source evidence supports public contact confidence.',
    priority: 'medium',
    audience: 'public',
    publicness: 'public',
  },
  degraded: {
    label: 'Degraded',
    compactLabel: 'Degraded',
    tone: 'warning',
    description: 'The object remains visible, but a repair path is needed.',
    nextAction: 'Review the readback and repair action.',
    priority: 'high',
    audience: 'public',
    publicness: 'public',
  },
  failed: {
    label: 'Failed',
    compactLabel: 'Failed',
    tone: 'danger',
    description: 'The latest operation did not complete.',
    nextAction: 'Use the source-owned repair path.',
    priority: 'high',
    audience: 'operator',
    publicness: 'private',
  },
  guarded: {
    label: 'Guarded',
    compactLabel: 'Guarded',
    tone: 'info',
    description: 'The foundation guardrails are running before product behavior ships.',
    priority: 'medium',
    audience: 'public',
    publicness: 'public',
  },
  indexed: {
    label: 'Indexed',
    compactLabel: 'Indexed',
    tone: 'success',
    description: 'The public projection has index readback.',
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
    description: 'This capability is explicitly unavailable in the current phase.',
    priority: 'low',
    audience: 'public',
    publicness: 'public',
    disabledReason: 'Capability not yet proven from source-owned runtime evidence.',
  },
  not_queued: {
    label: 'Not queued',
    compactLabel: 'Not queued',
    tone: 'neutral',
    description: 'No projection attempt has been queued yet.',
    priority: 'low',
    audience: 'operator',
    publicness: 'private',
  },
  published: {
    label: 'Published',
    compactLabel: 'Published',
    tone: 'success',
    description: 'The source-owned page state is published.',
    priority: 'medium',
    audience: 'public',
    publicness: 'public',
  },
  queued: {
    label: 'Queued',
    compactLabel: 'Queued',
    tone: 'info',
    description: 'A source-owned operation is waiting to run.',
    priority: 'medium',
    audience: 'operator',
    publicness: 'private',
  },
  registry_verified: {
    label: 'Registry verified',
    compactLabel: 'Verified',
    tone: 'success',
    description: 'Source evidence supports registry verification.',
    priority: 'medium',
    audience: 'public',
    publicness: 'public',
  },
  stale: {
    label: 'Stale',
    compactLabel: 'Stale',
    tone: 'warning',
    description: 'Readback is older than the current source state.',
    nextAction: 'Regenerate from source state.',
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
    description: 'This capability is not available from source-owned state.',
    priority: 'low',
    audience: 'public',
    publicness: 'public',
    disabledReason: 'Source-owned availability has not been established.',
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
    description: 'A provider complaint was admitted into notification readback.',
    nextAction: 'Stop delivery to the complained recipient and investigate consent.',
    priority: 'high',
    audience: 'operator',
    publicness: 'private',
  },
  notification_delivery_delayed: {
    label: 'Notification delivery delayed',
    compactLabel: 'Delayed',
    tone: 'warning',
    description: 'The notification remains in source-owned readback, but delivery is delayed.',
    nextAction: 'Wait for provider readback or schedule a bounded retry.',
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
    nextAction: 'Show preserved readback and support instructions.',
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
    disabledReason: 'Provider configuration has not been source-readbacked.',
  },
  discovery_stale: {
    label: 'Discovery artifact stale',
    compactLabel: 'Stale',
    tone: 'warning',
    description: 'The agent-readable discovery artifact is older than source state.',
    nextAction: 'Regenerate the public projection from source-owned state.',
    priority: 'high',
    audience: 'public',
    publicness: 'public',
  },
  discovery_degraded: {
    label: 'Discovery degraded',
    compactLabel: 'Degraded',
    tone: 'warning',
    description: 'Discovery remains readable, but source-owned health is degraded.',
    nextAction: 'Review discovery health and repair before claiming full readiness.',
    priority: 'high',
    audience: 'public',
    publicness: 'public',
  },
  discovery_unavailable: {
    label: 'Discovery unavailable',
    compactLabel: 'Unavailable',
    tone: 'neutral',
    description: 'Agent-readable discovery is withheld from public projection.',
    nextAction: 'Use source-owned readback to restore or keep the unavailable state explicit.',
    priority: 'high',
    audience: 'public',
    publicness: 'public',
    disabledReason: 'Discovery projection is not currently publishable.',
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
    description: 'The action readback has insufficient proof to claim success.',
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
    nextAction: 'Show attempt readback and reject any replay.',
    priority: 'medium',
    audience: 'operator',
    publicness: 'private',
  },
  protected_action_receipt_recorded: {
    label: 'Contact follow-up receipt recorded',
    compactLabel: 'Receipt',
    tone: 'success',
    description: 'Source-owned readback recorded a contact follow-up receipt without raw provider payloads.',
    nextAction: 'Keep the proposal, policy, owner decision, gateway, attempt, and receipt reconstructable.',
    priority: 'medium',
    audience: 'owner',
    publicness: 'private',
  },
  protected_action_attempt_failed: {
    label: 'Protected action attempt failed',
    compactLabel: 'Attempt failed',
    tone: 'danger',
    description: 'The protected action attempt failed without success readback.',
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
    nextAction: 'Show reversal readback and stop success claims.',
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
    description: 'A source-owned billing operation is pending provider readback.',
    nextAction: 'Wait for hosted-flow or webhook readback.',
    priority: 'medium',
    audience: 'owner',
    publicness: 'private',
  },
  billing_started: {
    label: 'Billing started',
    compactLabel: 'Started',
    tone: 'info',
    description: 'The paid activation flow has started from source-owned state.',
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
    nextAction: 'Confirm provider readback before changing paid state.',
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
    description: 'Paid activation is backed by source-owned receipt and reconciliation readback.',
    nextAction: 'Show the approved paid-state readback, not raw provider fields.',
    priority: 'medium',
    audience: 'owner',
    publicness: 'private',
  },
  billing_past_due: {
    label: 'Billing past due',
    compactLabel: 'Past due',
    tone: 'warning',
    description: 'Billing readback shows a past-due state requiring owner action.',
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
    nextAction: 'Use the hosted action path and preserve source-owned readback.',
    priority: 'high',
    audience: 'owner',
    publicness: 'private',
  },
  billing_refund: {
    label: 'Billing refund recorded',
    compactLabel: 'Refund',
    tone: 'warning',
    description: 'A refund was recorded against the paid activation rail.',
    nextAction: 'Reconcile entitlement and receipt state from source-owned records.',
    priority: 'high',
    audience: 'operator',
    publicness: 'private',
  },
  billing_dispute: {
    label: 'Billing dispute recorded',
    compactLabel: 'Dispute',
    tone: 'danger',
    description: 'A billing dispute was recorded and needs support handling.',
    nextAction: 'Preserve receipts, evidence refs, and reconciliation readback.',
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
    description: 'A provider event was held because it could not be safely admitted.',
    nextAction: 'Bind or reject the event through reconciliation without granting entitlement.',
    priority: 'high',
    audience: 'operator',
    publicness: 'private',
  },
  billing_reconciliation_mismatch: {
    label: 'Billing reconciliation mismatch',
    compactLabel: 'Mismatch',
    tone: 'danger',
    description: 'Source-owned billing state and provider evidence do not match.',
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

export function publicStatusToAeStatus(status: PublicStatus): AeStatus {
  if (status === 'published') {
    return 'published'
  }

  if (status === 'suppressed') {
    return 'suppressed'
  }

  return 'not_queued'
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

export function indexStatusToAeStatus(status: IndexStatus): AeStatus {
  return status
}

export function discoveryStatusToAeStatus(status: DiscoveryStatus): AeStatus {
  if (status === 'stale') {
    return 'discovery_stale'
  }

  if (status === 'degraded') {
    return 'discovery_degraded'
  }

  if (status === 'unavailable') {
    return 'discovery_unavailable'
  }

  return 'available'
}

export function capabilityStatusToAeStatus(status: ServiceCapabilityStatus): AeStatus {
  return status
}

export function firstRequestModeLabel(mode: FirstRequestMode): string {
  if (mode === 'quote_request_available') {
    return 'Quote request instructions supplied'
  }

  if (mode === 'inquiry_available') {
    return 'First request instructions supplied'
  }

  return 'First request not available yet'
}
