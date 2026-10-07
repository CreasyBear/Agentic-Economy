import { describe, expect, it } from 'vitest'

import {
  providerOffboardingCompletion,
  providerOffboardingStatusSchema,
} from '@/modules/capability-supply/provider-offboarding'

describe('Provider offboarding completion', () => {
  it('requires every child authority to be complete before retirement', () => {
    const base = {
      routeableToolCount: 0,
      activeOrUnknownCallCount: 0,
      unresolvedObligationCount: 0,
      activeOrCleanupPendingConnectionCount: 0,
      retentionPolicyVersion: 'retention-policy:2026-09',
    }
    expect(providerOffboardingCompletion(base)).toEqual({ kind: 'complete' })
    expect(providerOffboardingCompletion({ ...base, routeableToolCount: 1 })).toEqual({
      kind: 'blocked', blocker: 'routeable_tools_remain',
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
      ownerHandoff: { actor: 'business_owner', reason: 'offboarding_action_required', destination: '/owner/operations#offboarding', caseRef: 'provider-offboarding:one', businessRef: 'business:one' },
    })).toMatchObject({ state: 'Action required', revision: 2 })
    const status = {
      schemaVersion: 'provider_offboarding:v1', caseRef: 'provider-offboarding:one', businessRef: 'business:one', providerRef: 'provider:one', revision: 2, state: 'Draining', routeabilityFrozen: true, blockerCodes: [], observedAt: 1_700_000_000_000, retentionPolicyVersion: 'retention-policy:2026-09',
    }
    expect(providerOffboardingStatusSchema.safeParse({ ...status, continuation: { action: 'supply.offboarding.status', args: { businessRef: status.businessRef } } }).success).toBe(true)
    expect(providerOffboardingStatusSchema.safeParse({ ...status, continuation: { action: 'supply.offboarding.status' } }).success).toBe(false)
    expect(providerOffboardingStatusSchema.safeParse({ ...status, continuation: { action: 'supply.offboarding.resume' } }).success).toBe(false)
  })
})
