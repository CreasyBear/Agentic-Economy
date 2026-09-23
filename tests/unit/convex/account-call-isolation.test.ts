import { describe, expect, it } from 'vitest'

import { api } from '../../../convex/_generated/api'
import { convexTestWithMarketComponents, ownerAdmin, publishedBusinessOwner } from '../../helpers/convex-fixtures'

describe('Account isolation through public Call recovery', () => {
  it('allows each owner to read and cancel only their Account Call; administrator and workload identities gain no owner access', async () => {
    const backend = convexTestWithMarketComponents()
    const first = await publishedBusinessOwner(backend, 'call-isolation-first')
    const second = await publishedBusinessOwner(backend, 'call-isolation-second')
    const administrator = await ownerAdmin(backend, 'user_call-isolation-admin')
    const workload = await publishedBusinessOwner(backend, 'call-isolation-workload')
    await backend.run(async (ctx) => {
      const principal = await ctx.db.query('principals').withIndex('by_principalRef', (q) =>
        q.eq('principalRef', workload.canonicalPrincipalRef)).unique()
      if (principal === null) throw new Error('workload_fixture_missing')
      await ctx.db.patch(principal._id, { kind: 'workload' })
      for (const [index, owner] of [first, second].entries()) {
        await ctx.db.insert('capabilityCalls', {
          callRef: `call:account-isolation:${index}`,
          principalId: `agent:account-isolation:${index}`,
          ownerId: owner.canonicalAccountRef,
          credentialId: `credential:account-isolation:${index}`,
          applicationRef: 'application:account-isolation',
          toolRef: 'tool:account-isolation',
          idempotencyKey: `call:account-isolation:${index}`,
          environment: 'sandbox',
          grantRef: `grant:account-isolation:${index}`,
          grantGeneration: 1,
          policyDigest: 'sha256:account-isolation',
          grantExpiresAt: 8_000_000_000_000,
          toolJson: '{}',
          inputJson: JSON.stringify({ privateInput: `account-${index}` }),
          inputDigest: `sha256:input-${index}`,
          requestDigest: `sha256:request-${index}`,
          state: 'pending',
          updatedAt: 1,
          createdAt: 1,
        })
      }
    })
    const readRows = () => backend.run(async (ctx) => ctx.db.query('capabilityCalls').collect())
    const before = await readRows()
    for (const [index, owner] of [first, second].entries()) {
      const callRef = `call:account-isolation:${index}`
      await expect(owner.owner.action(api.capabilityCalls.readOwnerCallStatus, { callRef }))
        .resolves.toMatchObject({ kind: 'found', callRef, previousInput: { privateInput: `account-${index}` } })
      const otherOwner = index === 0 ? second.owner : first.owner
      for (const caller of [otherOwner, administrator, workload.owner, backend]) {
        const refused = { kind: 'refused', callRef, code: 'invocation_not_found', retryable: false }
        await expect(caller.action(api.capabilityCalls.readOwnerCallStatus, { callRef })).resolves.toEqual(refused)
        await expect(caller.action(api.capabilityCalls.cancelOwnerCall, {
          callRef, idempotencyKey: `cancel:foreign:${index}`,
        })).resolves.toEqual(refused)
        await expect(caller.action(api.capabilityCalls.reconcileOwnerCall, {
          callRef,
          idempotencyKey: `reconcile:foreign:${index}`,
          evidence: {
            kind: 'action_invocation_reconciliation', version: 1,
            evidenceRef: 'evidence:account-isolation', source: 'tool:account-isolation',
            invocationRef: callRef, attemptRef: 'attempt:account-isolation', effectGeneration: 1,
            resolution: 'not_released', observedAt: '2026-09-14T00:00:00.000Z', digest: 'sha256:evidence',
          },
        })).resolves.toEqual(refused)
      }
    }
    expect(await readRows()).toEqual(before)
    for (const [index, owner] of [first, second].entries()) {
      const callRef = `call:account-isolation:${index}`
      await expect(owner.owner.action(api.capabilityCalls.cancelOwnerCall, {
        callRef, idempotencyKey: `cancel:owner:${index}`,
      })).resolves.toMatchObject({ kind: 'found', callRef, state: 'cancelled' })
    }
    expect((await readRows()).map((row) => row.state)).toEqual(['cancelled', 'cancelled'])
  })
})
