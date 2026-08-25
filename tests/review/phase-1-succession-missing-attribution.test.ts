import { describe, expect, it } from 'vitest'

import {
  successionAuthorizationParticipantValue,
  successionAuthorizationValue,
  verifiedRecoveryParticipantApprovalValue,
} from '@/modules/principal-account/account/public'

describe('Phase 1 repair acceptance — succession creation attribution', () => {
  it('reproduces the missing creation action context on all new recovery authority records', () => {
    const validators = [
      verifiedRecoveryParticipantApprovalValue,
      successionAuthorizationValue,
      successionAuthorizationParticipantValue,
    ]

    for (const validator of validators) {
      const fields = Object.keys(validator.fields)
      expect(fields).not.toContain('createdBy')
      expect(fields).not.toContain('creationContext')
      expect(fields).not.toContain('actorPrincipalRef')
      expect(fields).not.toContain('activeAccountRef')
      expect(fields).not.toContain('correlationRef')
      expect(fields).not.toContain('idempotencyRef')
    }

    expect(Object.keys(successionAuthorizationValue.fields)).toContain('consumedBy')
  })
})
