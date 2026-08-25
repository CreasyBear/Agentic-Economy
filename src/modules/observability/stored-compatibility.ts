import {
  AuditEventTypeValues as AllStoredAuditEventTypeValues,
  AuditTargetTypeValues as AllStoredAuditTargetTypeValues,
} from '@/modules/common/audit-events'

/**
 * Read-only vocabulary retained for telemetry rows written by retired journeys.
 * These values are deliberately absent from the current funnel write contract.
 */
export const StoredCompatibilityJourneyEventNameValues = [
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
  'record_reopened',
  'record_exported',
  'record_shared',
  'record_cited',
  'dispute_opened',
  'replay_materially_resolved',
  'admitted_r1_send',
] as const

export const StoredCompatibilityBusinessActionFunnelEventValues = [
  'business_action_card_viewed',
  'business_action_request_started',
  'business_action_checkpoint_recorded',
  'business_action_guardrail_allowed',
  'business_action_guardrail_blocked',
  'business_action_evidence_ingested',
  'business_action_receipt_viewed',
  'business_action_proof_gap_recorded',
] as const

export const StoredCompatibilityFunnelEventTypeValues = [
  ...StoredCompatibilityJourneyEventNameValues,
  ...StoredCompatibilityBusinessActionFunnelEventValues,
] as const

export type StoredCompatibilityFunnelEventType =
  (typeof StoredCompatibilityFunnelEventTypeValues)[number]

export function readStoredCompatibilityFunnelEventType(
  value: unknown,
): StoredCompatibilityFunnelEventType | undefined {
  return typeof value === 'string' && storedCompatibilityFunnelEventTypes.has(value)
    ? value as StoredCompatibilityFunnelEventType
    : undefined
}

const storedCompatibilityFunnelEventTypes = new Set<string>(
  StoredCompatibilityFunnelEventTypeValues,
)

/**
 * Audit rows are security evidence, not a current product model. Their exact
 * historical literals remain readable even when the current write API narrows.
 */
export const StoredAuditEventTypeValues = AllStoredAuditEventTypeValues
export const StoredAuditTargetTypeValues = AllStoredAuditTargetTypeValues

export function readStoredAuditEventType(
  value: unknown,
): (typeof StoredAuditEventTypeValues)[number] | undefined {
  return typeof value === 'string' && storedAuditEventTypes.has(value)
    ? value as (typeof StoredAuditEventTypeValues)[number]
    : undefined
}

const storedAuditEventTypes = new Set<string>(StoredAuditEventTypeValues)
