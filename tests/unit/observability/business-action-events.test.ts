import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  AuditEventTypeValues,
  AuditTargetTypeValues,
  BusinessActionPrivateEvidenceAccessPolicy,
  BusinessActionPrivateEvidencePublicProjectionExcludedFieldValues,
  BusinessActionPrivateEvidenceRetentionClass,
  FunnelEventTypeValues,
  projectBusinessActionPrivateEvidenceForPublic,
  validateBusinessActionPrivateEvidencePolicy,
  validateBusinessActionNoRepairReconstruction,
} from '@/modules/observability/public'
import { observabilityTables } from '@/modules/observability/internal/schema'
import type {
  BusinessActionPrivateEvidencePolicyInput,
} from '@/modules/observability/public'

describe('business action observability contracts', () => {
  it('registers Phase 6 audit targets in the shared observability schema', () => {
    expect(observabilityTables.operationKeys).toBeDefined()
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

  it('validates no-repair as terminal audited reconstruction without provider evidence rewrite', () => {
    expect(
      validateBusinessActionNoRepairReconstruction({
        noRepairMarked: true,
        auditEventType: 'business_action.no_repair_marked',
        auditTargetType: 'business_action_no_repair',
        requestHash: canonicalDigest('request'),
        receiptReconstructionStatus: 'proof_gap',
        noRepairHash: canonicalDigest('no-repair'),
        evidenceRefs: ['support:no-repair'],
        providerEvidenceBefore: [canonicalDigest('provider:evt_1')],
        providerEvidenceAfter: [canonicalDigest('provider:evt_1')],
      })
    ).toEqual({
      valid: true,
      terminal: true,
      auditable: true,
      reconstructable: true,
      providerEvidenceRewritten: false,
    })

    expect(
      validateBusinessActionNoRepairReconstruction({
        noRepairMarked: true,
        auditEventType: 'business_action.no_repair_marked',
        auditTargetType: 'business_action_no_repair',
        requestHash: canonicalDigest('request'),
        receiptReconstructionStatus: 'proof_gap',
        noRepairHash: canonicalDigest('no-repair'),
        evidenceRefs: ['support:no-repair'],
        providerEvidenceBefore: [canonicalDigest('provider:evt_1')],
        providerEvidenceAfter: [canonicalDigest('provider:evt_2')],
      })
    ).toEqual({ valid: false, reason: 'provider_evidence_rewritten' })
  })

  it('requires private evidence retention access ttl export delete and tombstone metadata', () => {
    expect(BusinessActionPrivateEvidenceRetentionClass).toBe('business_action_private_evidence')
    expect(BusinessActionPrivateEvidenceAccessPolicy).toBe('owner_admin_operator_only')

    expect(validateBusinessActionPrivateEvidencePolicy(privateEvidenceInput())).toMatchObject({
      valid: true,
      retentionClass: 'business_action_private_evidence',
      accessPolicy: 'owner_admin_operator_only',
      exportBehavior: 'redacted_hash_only',
      deleteBehavior: 'raw_ref_retained_until_ttl',
      publicProjectionAllowed: false,
    })

    expect(
      validateBusinessActionPrivateEvidencePolicy(
        privateEvidenceInput({
          privatePayloadRef: undefined,
          redactedAt: 30,
          deletedAt: 30,
          tombstoneHash: canonicalDigest('tombstone'),
        })
      )
    ).toMatchObject({
      valid: true,
      deleteBehavior: 'raw_ref_tombstoned',
    })

    expect(validateBusinessActionPrivateEvidencePolicy(privateEvidenceInput({ retentionClass: 'generic_private' }))).toEqual({
      valid: false,
      reason: 'invalid_retention_class',
    })
    expect(validateBusinessActionPrivateEvidencePolicy(privateEvidenceInput({ accessPolicy: 'public' }))).toEqual({
      valid: false,
      reason: 'invalid_access_policy',
    })
    expect(validateBusinessActionPrivateEvidencePolicy(privateEvidenceInput({ ttlExpiresAt: 20 }))).toEqual({
      valid: false,
      reason: 'ttl_not_future',
    })
  })

  it('excludes private evidence raw fields from public projection', () => {
    expect(BusinessActionPrivateEvidencePublicProjectionExcludedFieldValues).toEqual([
      'raw_prompt',
      'trace',
      'provider_payload',
      'stripe_payload',
      'customer_identifier',
      'private_endpoint_ref',
      'api_key',
      'webhook_secret',
    ])

    const projection = projectBusinessActionPrivateEvidenceForPublic(
      privateEvidenceInput({
        unsafeRawFields: {
          raw_prompt: 'call this endpoint',
          trace: 'private trace payload',
          provider_payload: '{"provider":"hermes"}',
          stripe_payload: '{"id":"evt_123"}',
          customer_identifier: 'owner@example.com',
          private_endpoint_ref: 'private-endpoint://paid-intake',
          api_key: 'sk_test_secret',
          webhook_secret: 'whsec_secret',
        },
      })
    )

    expect(projection).toEqual({
      id: 'private-evidence:paid-intake',
      requestRef: 'business-action-request:paid-intake',
      retentionClass: 'business_action_private_evidence',
      accessPolicy: 'owner_admin_operator_only',
      payloadHash: canonicalDigest('private-payload'),
      ttlExpiresAt: 100,
      redactedAt: undefined,
      tombstoned: false,
      excludedFields: BusinessActionPrivateEvidencePublicProjectionExcludedFieldValues,
    })
    expect(JSON.stringify(projection)).not.toContain('call this endpoint')
    expect(JSON.stringify(projection)).not.toContain('private trace payload')
    expect(JSON.stringify(projection)).not.toContain('evt_123')
    expect(JSON.stringify(projection)).not.toContain('owner@example.com')
    expect(JSON.stringify(projection)).not.toContain('private-endpoint://paid-intake')
    expect(JSON.stringify(projection)).not.toContain('sk_test_secret')
    expect(JSON.stringify(projection)).not.toContain('whsec_secret')
  })
})


function privateEvidenceInput(
  overrides: Partial<BusinessActionPrivateEvidencePolicyInput> = {}
): BusinessActionPrivateEvidencePolicyInput {
  return {
    id: 'private-evidence:paid-intake',
    requestRef: 'business-action-request:paid-intake',
    retentionClass: 'business_action_private_evidence',
    accessPolicy: 'owner_admin_operator_only',
    payloadHash: canonicalDigest('private-payload'),
    privatePayloadRef: 'private-endpoint://trace/paid-intake',
    ttlExpiresAt: 100,
    now: 30,
    unsafeRawFields: {},
    ...overrides,
  }
}
