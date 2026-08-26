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
  it.each([
    'owner',
    'member',
    'workload',
    'missing_workload',
    'stranger',
    'wrong_account',
    'stale_generation',
  ] as const)(
    'drives the %s isolation case through the registered reservation mutation without a denied publication effect',
    async (caseKind) => {
      const backend = convexTest(schema, modules)
      const { businessId, canonicalAccountRef } = await createPublishedBusinessOwner(
        backend,
        `reservation-isolation-${caseKind}`,
      )
      const validPrincipal = await seedSupplyAgentPrincipal(backend, canonicalAccountRef, `isolation-${caseKind}`)
      let agentPrincipal = validPrincipal

      if (caseKind === 'owner' || caseKind === 'member' || caseKind === 'missing_workload') {
        agentPrincipal = {
          ...validPrincipal,
          principalId: `principal:${caseKind}:interactive-only`,
          credentialId: `credential:${caseKind}:interactive-only`,
        }
      } else if (caseKind === 'stranger') {
        agentPrincipal = {
          ...validPrincipal,
          principalId: 'principal:stranger:unbound',
        }
      } else if (caseKind === 'wrong_account') {
        const other = await createPublishedBusinessOwner(backend, 'reservation-isolation-other-account')
        agentPrincipal = await seedSupplyAgentPrincipal(backend, other.canonicalAccountRef, 'isolation-wrong-account-other')
      } else if (caseKind === 'stale_generation') {
        await backend.run(async (ctx) => {
          const stored = await ctx.db.query('agentAccessPrincipals')
            .withIndex('by_principalId', (query) => query.eq('principalId', validPrincipal.principalId))
            .unique()
          if (stored === null) throw new Error('isolation_principal_missing')
          await ctx.db.patch(stored._id, { grantGeneration: 2 })
        })
      }

      const command = {
        businessId,
        offeringRef: `offering:reservation:isolation:${caseKind}`,
        offeringRevision: 1,
        offeringSourceHash: `source:reservation:isolation:${caseKind}`,
        materialDigest: `sha256:${'3'.repeat(64)}`,
        operationKey: `supply.publish:reservation:isolation:${caseKind}`,
        correlationId: `supply.publish:reservation:isolation:${caseKind}`,
        reasonCode: 'supply.publish',
        evidenceRefs: [`evidence:reservation:isolation:${caseKind}`],
        agentPrincipal,
      }
      const result = await backend.mutation(
        api.capabilitySupplyOwnerFunnel.reserveOwnerCapabilityPublication,
        await withSourceWrite('catalog_publish', command),
      )

      expect(result).toEqual(caseKind === 'workload'
        ? { kind: 'reserved' }
        : { kind: 'refused', reason: 'authorization_denied' })
      const effects = await backend.run(async (ctx) => ({
        operations: (await ctx.db.query('operationKeys').collect())
          .filter((row) => row.operationName === 'reserveOwnerCapabilityPublication'),
        sourceNonces: await ctx.db.query('sourceWriteNonces').collect(),
      }))
      expect(effects.operations).toHaveLength(caseKind === 'workload' ? 1 : 0)
      expect(effects.sourceNonces).toHaveLength(1)
    },
  )

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
