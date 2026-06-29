import { describe, expect, it } from 'vitest'

import {
  AuditEventTypeValues,
  AuditTargetTypeValues,
  FunnelEventTypeValues,
} from '@/modules/observability/public'
import { observabilityTables } from '@/modules/observability/internal/schema'

describe('business action observability contracts', () => {
  it('registers Phase 6 audit targets in the shared observability schema', () => {
    expect(observabilityTables.auditEvents).toBeDefined()
    expect(AuditTargetTypeValues).toEqual(
      expect.arrayContaining([
        'business_action_card',
        'business_action_mandate',
        'business_action_request',
        'business_action_checkpoint',
        'business_action_guardrail_evidence',
        'business_action_external_evidence',
        'business_action_result_artifact',
        'business_action_receipt',
        'business_action_support',
        'business_action_private_evidence',
        'business_action_no_repair',
      ])
    )
  })

  it('registers Phase 6 audit events for receipt reconstruction', () => {
    expect(AuditEventTypeValues).toEqual(
      expect.arrayContaining([
        'business_action.card_versioned',
        'business_action.mandate_recorded',
        'business_action.request_proposed',
        'business_action.checkpoint_recorded',
        'business_action.guardrail_allowed',
        'business_action.guardrail_blocked',
        'business_action.evidence_ingested',
        'business_action.evidence_held',
        'business_action.result_artifact_recorded',
        'business_action.receipt_recorded',
        'business_action.proof_gap_recorded',
        'business_action.no_repair_marked',
      ])
    )
  })

  it('registers Phase 6 funnel events from GTM readiness', () => {
    expect(FunnelEventTypeValues).toEqual(
      expect.arrayContaining([
        'business_action_card_viewed',
        'business_action_request_started',
        'business_action_checkpoint_recorded',
        'business_action_guardrail_allowed',
        'business_action_guardrail_blocked',
        'business_action_evidence_ingested',
        'business_action_receipt_viewed',
        'business_action_proof_gap_recorded',
      ])
    )
  })
})
