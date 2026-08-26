import { describe, expect, it } from 'vitest'

import {
  successionAuthorizationParticipantValue,
  successionAuthorizationValue,
  verifiedRecoveryParticipantApprovalValue,
} from '@/modules/principal-account/account/public'

describe('Phase 1 repair acceptance — succession creation attribution', () => {
  it('requires immutable creation action context on all recovery authority records', () => {
    const validators = [
      verifiedRecoveryParticipantApprovalValue,
      successionAuthorizationValue,
      successionAuthorizationParticipantValue,
    ]

    for (const validator of validators) {
      const fields = Object.keys(validator.fields)
      expect(fields).toContain('createdBy')
      expect(Object.keys(validator.fields.createdBy.fields)).toEqual([
        'actorPrincipalRef',
        'activeAccountRef',
        'correlationRef',
        'idempotencyRef',
      ])
    }

    expect(Object.keys(successionAuthorizationValue.fields)).toContain('consumedBy')
  })
})
