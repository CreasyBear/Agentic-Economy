export const OperationKeyStatusValues = ['in_progress', 'succeeded', 'failed_retryable', 'failed_terminal'] as const

import {
  ActorKindValues,
  AuditEventTypeValues as StoredAuditEventTypeValues,
  AuditTargetTypeValues as StoredAuditTargetTypeValues,
} from '@/modules/common/audit-events'

export { ActorKindValues }

type StoredAuditEventType = (typeof StoredAuditEventTypeValues)[number]
type StoredAuditTargetType = (typeof StoredAuditTargetTypeValues)[number]
export type CurrentAuditEventType = Exclude<StoredAuditEventType, `business_action.${string}`>
export type CurrentAuditTargetType = Exclude<StoredAuditTargetType, `business_action_${string}`>

export const AuditEventTypeValues = StoredAuditEventTypeValues.filter(
  (value): value is CurrentAuditEventType => !value.startsWith('business_action.'),
) as unknown as readonly [CurrentAuditEventType, ...CurrentAuditEventType[]]

export const AuditTargetTypeValues = StoredAuditTargetTypeValues.filter(
  (value): value is CurrentAuditTargetType => !value.startsWith('business_action_'),
) as unknown as readonly [CurrentAuditTargetType, ...CurrentAuditTargetType[]]

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
