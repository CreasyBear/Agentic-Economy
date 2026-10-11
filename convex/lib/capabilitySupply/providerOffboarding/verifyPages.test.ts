import { afterEach, describe, expect, it, vi } from 'vitest'
import { convexTestWithWorkers, publishedBusinessOwner } from '../../../../tests/helpers/convex-fixtures'
import { verifyCompletionHandler } from './verifyPages'

afterEach(() => vi.unstubAllEnvs())

async function blockedCase() {
  const backend = convexTestWithWorkers()
  const { businessId, canonicalAccountRef, canonicalPrincipalRef } = await publishedBusinessOwner(backend, 'offboard-notice')
  await backend.run((ctx) => ctx.db.insert('capabilityProviderOffboardingCases', {
    caseRef: 'provider-offboarding:notice', owningAccountRef: canonicalAccountRef, businessId, providerRef: 'provider:notice',
    requestedByPrincipalRef: canonicalPrincipalRef,
    authorityRevision: { binding: 1, credential: 1, principal: 1, account: 1, access: 1, currentOwnership: 1, currentOwnerPrincipal: 1 },
    authorityProvenance: { providerNamespace: 'clerk/user', bindingRef: 'b', credentialRef: 'c', credentialGeneration: 1, accessKind: 'ownership', accessRef: 'a', currentOwnershipRef: 'o', resolvedAt: 1 },
    toolTargetCount: 0, offeringTargetCount: 0, connectionTargetCount: 0, targetSnapshotDigest: 'd',
    currentStep: 'verify-completion', state: 'verifying_cleanup', retentionPolicyVersion: '',
    blockerCodes: [], evidenceRefs: [], revision: 1, lastCommandId: 'x', lastCommandDigest: 'x', requestedAt: 1, updatedAt: 1,
  }))
  return backend
}

describe('provider offboarding verification failure notice', () => {
  it('tells the owner once when verification blocks, under the failure sourceEventRef', async () => {
    vi.stubEnv('AE_EMAIL_PHASE3_ENABLED', 'true')
    const backend = await blockedCase()
    await backend.run((ctx) => verifyCompletionHandler(ctx, { caseRef: 'provider-offboarding:notice' }))
    await backend.run((ctx) => verifyCompletionHandler(ctx, { caseRef: 'provider-offboarding:notice' }))
    const rows = await backend.run((ctx) => ctx.db.query('notificationDeliveries').collect())
    expect(rows).toEqual([expect.objectContaining({ eventKind: 'provider_offboarding_blocked', sourceEventRef: 'provider-offboarding:notice:failed:retention_policy_unbound' })])
  })

  it('stays suppressed while the phase 3 gate is off', async () => {
    const backend = await blockedCase()
    await backend.run((ctx) => verifyCompletionHandler(ctx, { caseRef: 'provider-offboarding:notice' }))
    const rows = await backend.run((ctx) => ctx.db.query('notificationDeliveries').collect())
    expect(rows).toEqual([expect.objectContaining({ state: 'suppressed', suppressCode: 'stream_disabled' })])
  })
})
