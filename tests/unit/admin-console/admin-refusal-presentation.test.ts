import { describe, expect, it } from 'vitest'

import type { AnyAdminRefusalCode } from '@/lib/operator/admin-console/contracts'
import { ADMIN_REFUSAL_PRESENTATION } from '@/lib/operator/admin-console/refusal-presentation'

const expectedCodes = [
  'missing_membership', 'inactive_membership', 'action_not_allowed',
  'missing_source_write_admission', 'missing_source_write_secret',
  'source_write_crypto_unavailable', 'source_write_scope_mismatch',
  'source_write_key_family_mismatch', 'unknown_source_write_key_id',
  'invalid_source_write_key_id', 'source_write_operation_mismatch',
  'source_write_correlation_mismatch', 'source_write_command_mismatch',
  'missing_source_write_request', 'invalid_source_write_request',
  'source_write_method_mismatch', 'source_write_origin_mismatch',
  'source_write_target_origin_mismatch', 'source_write_path_mismatch',
  'source_write_query_mismatch', 'source_write_body_mismatch',
  'invalid_source_write_body_digest', 'stale_source_write_admission',
  'invalid_source_write_signature', 'mfa_reverification_required',
  'idempotency_conflict', 'target_changed', 'admin_invalid_reason',
  'admin_missing_evidence', 'business_not_found', 'suppression_unchanged',
  'dispute_not_found', 'dispute_already_closed', 'principal_not_found',
  'membership_already_active', 'membership_not_found', 'last_owner_admin',
  'publication_not_found', 'source_authority_not_reviewable',
  'policy_not_found', 'proof_stale', 'proof_replayed', 'authority_mismatch',
  'approval_required', 'approval_not_found', 'approval_same_actor',
  'approval_digest_mismatch', 'approval_expired', 'approval_already_resolved',
  'approval_actor_not_owner_admin',
] satisfies readonly AnyAdminRefusalCode[]

describe('admin refusal presentation', () => {
  it('covers the closed refusal union with a useful next step and no uncertain refused effect', () => {
    expect(Object.keys(ADMIN_REFUSAL_PRESENTATION).sort()).toEqual([...expectedCodes].sort())
    for (const code of expectedCodes) {
      const presentation = ADMIN_REFUSAL_PRESENTATION[code]
      expect(presentation.certainty, code).toBe('not_applied')
      expect(['same_key', 'new_key', 'no'], code).toContain(presentation.retry)
      expect(presentation.copy.trim().length, code).toBeGreaterThan(0)
      expect(presentation.nextStep.trim().length, code).toBeGreaterThan(0)
    }
    expect(expectedCodes.filter((code) => ADMIN_REFUSAL_PRESENTATION[code].certainty === 'unknown')).toEqual([])
  })

  it('states fixed authority and MFA copy without implying an effect', () => {
    for (const code of ['missing_membership', 'inactive_membership', 'action_not_allowed'] as const) {
      expect(ADMIN_REFUSAL_PRESENTATION[code]).toEqual({
        certainty: 'not_applied',
        retry: 'no',
        copy: 'Your account does not have the Admin role for this action.',
        nextStep: 'Ask an Admin owner for access.',
      })
    }
    expect(ADMIN_REFUSAL_PRESENTATION.mfa_reverification_required).toEqual({
      certainty: 'not_applied',
      retry: 'same_key',
      copy: 'Reverify before making this change.',
      nextStep: 'Complete Clerk reverification, then resubmit.',
    })
  })

  it('requires a new key after stale authorization or corrected command material', () => {
    for (const code of [
      'source_write_crypto_unavailable', 'stale_source_write_admission',
      'admin_invalid_reason', 'admin_missing_evidence', 'target_changed',
      'approval_digest_mismatch', 'approval_expired', 'proof_stale', 'idempotency_conflict',
    ] as const) {
      expect(ADMIN_REFUSAL_PRESENTATION[code].retry, code).toBe('new_key')
    }
    expect(ADMIN_REFUSAL_PRESENTATION.mfa_reverification_required.retry).toBe('same_key')
    expect(ADMIN_REFUSAL_PRESENTATION.approval_required.retry).toBe('no')
  })
})
