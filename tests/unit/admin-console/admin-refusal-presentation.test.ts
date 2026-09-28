import { describe, expect, it } from 'vitest'

import { ADMIN_REFUSAL_PRESENTATION } from '@/lib/operator/admin-console/refusal-presentation'

describe('admin refusal presentation', () => {
  it('keeps MFA retryable with the same operation key but never retries an expired approval', () => {
    for (const code of [
      'source_write_crypto_unavailable', 'stale_source_write_admission',
      'admin_invalid_reason', 'admin_missing_evidence', 'target_changed',
      'approval_digest_mismatch', 'proof_stale', 'idempotency_conflict',
    ] as const) {
      expect(ADMIN_REFUSAL_PRESENTATION[code].retry, code).toBe('new_key')
    }
    expect(ADMIN_REFUSAL_PRESENTATION.mfa_reverification_required).toMatchObject({
      certainty: 'not_applied', retry: 'same_key',
    })
    expect(ADMIN_REFUSAL_PRESENTATION.approval_expired).toMatchObject({
      certainty: 'not_applied', retry: 'no',
    })
    expect(ADMIN_REFUSAL_PRESENTATION.approval_required.retry).toBe('no')
  })
})
