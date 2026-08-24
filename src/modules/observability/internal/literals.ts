export const OperationKeyStatusValues = ['in_progress', 'succeeded', 'failed_retryable', 'failed_terminal'] as const

export { ActorKindValues, AuditEventTypeValues, AuditTargetTypeValues } from '@/modules/common/audit-events'

export const InvalidationSurfaceValues = ['public_catalog', 'registry_projection', 'discovery_manifest'] as const

export const InvalidationIntentStatusValues = ['queued', 'applied'] as const
export const WAVE_1_JOURNEY_EVENT_NAMES = [
  'listing_viewed',
  'listing_trust_fact_opened',
  'direct_call_selected',
  'shortlist_started',
  'shortlist_ready',
  'shortlist_reopened',
  'export_preview_opened',
  'shortlist_exported',
  'business_opened',
  'urgent_call_route_shown',
  'journey_abandoned',
] as const

export const WAVE_2_DORMANT_JOURNEY_EVENT_NAMES = [
  'record_reopened',
  'record_exported',
  'record_shared',
  'record_cited',
  'dispute_opened',
  'replay_materially_resolved',
  'admitted_r1_send',
] as const

export const JOURNEY_EVENT_NAMES = [
  ...WAVE_1_JOURNEY_EVENT_NAMES,
  ...WAVE_2_DORMANT_JOURNEY_EVENT_NAMES,
] as const


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
  ...JOURNEY_EVENT_NAMES,
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
  'business_action_card_viewed',
  'business_action_request_started',
  'business_action_checkpoint_recorded',
  'business_action_guardrail_allowed',
  'business_action_guardrail_blocked',
  'business_action_evidence_ingested',
  'business_action_receipt_viewed',
  'business_action_proof_gap_recorded',
] as const

export const ActivationStageValues = ['visitor', 'published', 'activated', 'blocked'] as const
