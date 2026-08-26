import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import { convexModules as modules } from '../helpers/convex-fixtures'
import { withSourceWrite } from '../helpers/source-write-admission'
import {
  createPublishedBusinessOwner,
  seedSupplyAgentPrincipal,
} from './capability-supply-owner-funnel-harness'

describe('owner publish reservation authority', () => {
  it('requires a verified owner principal and rejects changed material before draft effects', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, canonicalAccountRef } = await createPublishedBusinessOwner(backend, 'reservation-owner')
    const principal = await seedSupplyAgentPrincipal(backend, canonicalAccountRef, 'one')
    const command = {
      businessId,
      offeringRef: 'offering:reservation',
      offeringRevision: 1,
      offeringSourceHash: 'source:reservation',
      materialDigest: 'sha256:' + '1'.repeat(64),
      operationKey: 'supply.publish:reservation:one',
      correlationId: 'supply.publish:reservation:one',
      reasonCode: 'supply.publish',
      evidenceRefs: ['evidence:reservation:one'],
      agentPrincipal: principal,
    }
    const forged = {
      ...principal,
      principalId: 'principal:supply-reservation:forged',
      ownerId: 'user_other-owner',
      credentialId: 'credential:supply-reservation:forged',
    }
    await expect(
      backend.mutation(
        api.capabilitySupplyOwnerFunnel.reserveOwnerCapabilityPublication,
        await withSourceWrite('catalog_publish', {
          ...command,
          agentPrincipal: forged,
        }),
      ),
    ).resolves.toEqual({ kind: 'refused', reason: 'authorization_denied' })

    await expect(
      backend.mutation(
        api.capabilitySupplyOwnerFunnel.reserveOwnerCapabilityPublication,
        await withSourceWrite('catalog_publish', command),
      ),
    ).resolves.toEqual({ kind: 'reserved' })
    await expect(
      backend.mutation(
        api.capabilitySupplyOwnerFunnel.reserveOwnerCapabilityPublication,
        await withSourceWrite('catalog_publish', command),
      ),
    ).resolves.toEqual({ kind: 'replayed' })
    await expect(
      backend.mutation(
        api.capabilitySupplyOwnerFunnel.reserveOwnerCapabilityPublication,
        await withSourceWrite('catalog_publish', {
          ...command,
          materialDigest: 'sha256:' + '2'.repeat(64),
          evidenceRefs: ['evidence:reservation:changed'],
        }),
      ),
    ).resolves.toEqual({ kind: 'refused', reason: 'operation_key_conflict' })

    const state = await backend.run(async (ctx) => ({
      operations: await ctx.db.query('operationKeys').collect(),
      drafts: [] as ReadonlyArray<never>,
    }))
    expect(state.operations.filter((row) => row.operationName === 'reserveOwnerCapabilityPublication')).toHaveLength(1)
    expect(state.drafts).toHaveLength(0)
  })
})
