export const OperationKeyStatusValues = ['in_progress', 'succeeded', 'failed_retryable', 'failed_terminal'] as const

import {
  ActorKindValues,
  AuditEventTypeValues as AllAuditEventTypeValues,
  AuditTargetTypeValues as AllAuditTargetTypeValues,
} from '@/modules/common/audit-events'

export { ActorKindValues }

type AnyAuditEventType = (typeof AllAuditEventTypeValues)[number]
type AnyAuditTargetType = (typeof AllAuditTargetTypeValues)[number]
export type CurrentAuditEventType = Exclude<AnyAuditEventType, `business_action.${string}`>
export type CurrentAuditTargetType = Exclude<AnyAuditTargetType, `business_action_${string}`>

function requireNonEmpty<T extends string>(values: readonly T[]): readonly [T, ...T[]] {
  const [first, ...rest] = values
  if (first === undefined) {
    throw new Error('Expected at least one current audit value')
  }
  return [first, ...rest]
}

export const AuditEventTypeValues = requireNonEmpty(
  AllAuditEventTypeValues.filter(
    (value): value is CurrentAuditEventType => !value.startsWith('business_action.'),
  ),
)

export const AuditTargetTypeValues = requireNonEmpty(
  AllAuditTargetTypeValues.filter(
    (value): value is CurrentAuditTargetType => !value.startsWith('business_action_'),
  ),
)

export const InvalidationSurfaceValues = ['public_catalog', 'registry_projection', 'discovery_manifest'] as const

export const InvalidationIntentStatusValues = ['queued', 'applied'] as const
export const FunnelEventTypeValues = [
  'visitor_attributed',
  'auth_started',
  'auth_completed',
  'owner_interest_submitted',
  'publish_succeeded',
  'service_added',
  'capability_status_viewed',
  'publish_failed',
  'owner_status_viewed',
  'share_url_copied',
  'registry_search',
  'service_registry_result_clicked',
  'ucp_manifest_fetched',
  'developer_docs_viewed',
  'schema_downloaded',
  'example_fixture_downloaded',
  'discovery_health_viewed',
  'protected_action_proposed',
  'protected_action_policy_denied',
  'protected_action_approved',
  'protected_action_rejected',
  'protected_action_attempted',
  'protected_action_receipt_viewed',
  'paid_activation_started',
  'checkout_returned',
  'checkout_cancelled',
  'billing_provider_event_ingested',
  'receipt_viewed',
  'refund_or_dispute_recorded',
  'billing_reconciliation_failed',
  'billing_reconciliation_repaired',
] as const

export const ActivationStageValues = ['visitor', 'published', 'activated', 'blocked'] as const
