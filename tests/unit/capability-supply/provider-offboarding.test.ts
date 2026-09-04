import { describe, expect, it } from 'vitest'

import {
  providerOffboardingCompletion,
  providerOffboardingStatusSchema,
} from '@/modules/capability-supply/provider-offboarding'

describe('Provider offboarding completion', () => {
  it('requires every child authority to be complete before retirement', () => {
    const base = {
      routeableOperationCount: 0,
      activeOrUnknownCallCount: 0,
      unresolvedObligationCount: 0,
      activeOrCleanupPendingConnectionCount: 0,
      retentionPolicyVersion: 'retention-policy:2026-09',
    }
    expect(providerOffboardingCompletion(base)).toEqual({ kind: 'complete' })
    expect(providerOffboardingCompletion({ ...base, routeableOperationCount: 1 })).toEqual({
      kind: 'blocked', blocker: 'routeable_operations_remain',
    })
    expect(providerOffboardingCompletion({ ...base, activeOrUnknownCallCount: 1 })).toEqual({
      kind: 'blocked', blocker: 'calls_remain',
    })
    expect(providerOffboardingCompletion({ ...base, unresolvedObligationCount: 1 })).toEqual({
      kind: 'blocked', blocker: 'obligations_remain',
    })
    expect(providerOffboardingCompletion({ ...base, activeOrCleanupPendingConnectionCount: 1 })).toEqual({
      kind: 'blocked', blocker: 'connections_remain',
    })
    expect(providerOffboardingCompletion({ ...base, retentionPolicyVersion: undefined })).toEqual({
      kind: 'blocked', blocker: 'retention_policy_unbound',
    })
  })

  it('validates one durable status with a single continuation', () => {
    expect(providerOffboardingStatusSchema.parse({
      schemaVersion: 'provider_offboarding:v1',
      caseRef: 'provider-offboarding:one',
      businessRef: 'business:one',
      providerRef: 'provider:one',
      revision: 2,
      state: 'Action required',
      routeabilityFrozen: true,
      blockerCodes: ['payout_resolution_required'],
      observedAt: 1_700_000_000_000,
      retentionPolicyVersion: 'retention-policy:2026-09',
      continuation: { action: 'supply.offboarding.resume' },
    })).toMatchObject({ state: 'Action required', revision: 2 })
  })
})
