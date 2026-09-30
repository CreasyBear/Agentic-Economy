import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify } from '@/modules/common/stable-hash'
import {
  convexModules as modules,
  type ConvexFixtureBackend,
} from '../helpers/convex-fixtures'
import { withSourceWrite } from '../helpers/source-write-admission'
import {
  createPublishedBusinessOwner,
  seedSupplyAgentPrincipal,
} from './capability-supply-owner-funnel-harness'

const source = {
  kind: 'x402' as const,
  resourceUrl: 'https://private-provider.example/lookup',
  environment: 'production' as const,
}
const selector = {
  resourceUrl: source.resourceUrl,
  method: 'POST' as const,
}
const sourceDigest = canonicalDigest({ source: 'private-provider-preparation-v1' })
const candidateRef = canonicalDigest({ sourceDigest, selector })
type SupplyPrincipal = Awaited<ReturnType<typeof seedSupplyAgentPrincipal>>

function draftCommand(
  businessId: Id<'businesses'>,
  agentPrincipal: SupplyPrincipal,
  operationKey: string,
) {
  return {
    businessId,
    title: 'Private reference lookup',
    description: 'Looks up one private provider reference.',
    category: 'Research',
    sourceKind: source.kind,
    sourceDescriptorJson: stableStringify(source),
    sourceDigest,
    sourceRevision: `x402:${sourceDigest}`,
    candidateRef,
    sourceSelectorJson: stableStringify(selector),
    operationKey,
    correlationId: operationKey,
    agentPrincipal,
  }
}

async function privateProvider(
  backend: ConvexFixtureBackend,
  slug: string,
) {
  const provider = await createPublishedBusinessOwner(backend, slug)
  await backend.run(async (ctx) => {
    await ctx.db.patch(provider.businessId, { publicStatus: 'unpublished' })
  })
  return provider
}

async function reservationCommand(
  backend: ConvexFixtureBackend,
  businessId: Id<'businesses'>,
  offeringRef: string,
  agentPrincipal: SupplyPrincipal,
  operationKey: string,
) {
  const revision = await backend.run(async (ctx) => (
    await ctx.db.query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (query) => (
        query.eq('offeringRef', offeringRef).eq('revision', 1)
      ))
      .unique()
  ))
  if (revision === null) throw new Error('private_provider_revision_missing')
  return {
    businessId,
    offeringRef,
    offeringRevision: 1,
    offeringSourceHash: revision.sourceHash,
    materialDigest: canonicalDigest({
      kind: 'private-provider-preparation-material-v1',
      offeringRef,
    }),
    operationKey,
    correlationId: operationKey,
    reasonCode: 'supply.publish',
    evidenceRefs: [`evidence:${operationKey}`],
    agentPrincipal,
  }
}

describe('private Provider preparation authority', () => {
  it('lets an admitted supply agent save, read, and reserve private preparation without publication', async () => {
    const backend = convexTest(schema, modules)
    const provider = await privateProvider(backend, 'private-provider-preparation')
    const principal = await seedSupplyAgentPrincipal(
      backend,
      provider.canonicalAccountRef,
      'private-provider-preparation',
    )
    const save = await backend.mutation(
      api.capabilitySupplyOwnerFunnel.saveAgentSupplyIntegrationDraft,
      await withSourceWrite('catalog_publish', draftCommand(
        provider.businessId,
        principal,
        'private-provider-preparation:save',
      )),
    )
    expect(save).toMatchObject({ kind: 'saved', candidateRef, sourceDigest })
    if (save.kind !== 'saved') throw new Error(`private_provider_save:${save.kind}`)

    const read = await backend.query(
      api.capabilitySupplyOwnerFunnel.readAgentOwnerSupplyFunnel,
      await withSourceWrite('catalog_publish', {
        businessId: provider.businessId,
        agentPrincipal: principal,
        operationKey: 'private-provider-preparation:read',
        correlationId: 'private-provider-preparation:read',
      }),
    )
    expect(read).toMatchObject({
      kind: 'available',
      businessId: String(provider.businessId),
      offerings: [{ offeringRef: save.offeringRef, status: 'draft' }],
    })

    await expect(provider.owner.query(
      api.capabilitySupplyOwnerFunnel.readOwnerSupplyIntegrationDraft,
      { businessId: provider.businessId, candidateRef },
    )).resolves.toMatchObject({
      kind: 'available',
      offeringRef: save.offeringRef,
      draft: { candidateRef, sourceDigest },
    })

    const reservation = await reservationCommand(
      backend,
      provider.businessId,
      save.offeringRef,
      principal,
      'private-provider-preparation:reserve',
    )
    await expect(backend.mutation(
      api.capabilitySupplyOwnerFunnel.reserveOwnerCapabilityPublication,
      await withSourceWrite('catalog_publish', reservation),
    )).resolves.toEqual({ kind: 'reserved' })
    await expect(backend.mutation(
      api.capabilitySupplyOwnerFunnel.reserveOwnerCapabilityPublication,
      await withSourceWrite('catalog_publish', reservation),
    )).resolves.toEqual({ kind: 'replayed' })
    await expect(backend.mutation(
      api.capabilitySupplyOwnerFunnel.reserveOwnerCapabilityPublication,
      await withSourceWrite('catalog_publish', {
        ...reservation,
        materialDigest: canonicalDigest({ kind: 'private-provider-preparation-changed-material-v1' }),
        evidenceRefs: ['evidence:private-provider-preparation:changed'],
      }),
    )).resolves.toEqual({ kind: 'refused', reason: 'operation_key_conflict' })

    const state = await backend.run(async (ctx) => ({
      business: await ctx.db.get(provider.businessId),
      publications: await ctx.db.query('capabilityPublications').collect(),
      reservations: (await ctx.db.query('operationKeys').collect())
        .filter((row) => row.operationName === 'reserveOwnerCapabilityPublication'),
    }))
    expect(state.business?.publicStatus).toBe('unpublished')
    expect(state.publications).toHaveLength(0)
    expect(state.reservations).toHaveLength(1)
  })

  it('scopes Agent Tool reads to the admitted Account and requires source admission', async () => {
    const backend = convexTest(schema, modules)
    const providerA = await privateProvider(backend, 'private-provider-tools-account-a')
    const providerB = await privateProvider(backend, 'private-provider-tools-account-b')
    const principalA = await seedSupplyAgentPrincipal(
      backend,
      providerA.canonicalAccountRef,
      'private-provider-tools-account-a',
    )
    const principalB = await seedSupplyAgentPrincipal(
      backend,
      providerB.canonicalAccountRef,
      'private-provider-tools-account-b',
    )

    const saveA = await backend.mutation(
      api.capabilitySupplyOwnerFunnel.saveAgentSupplyIntegrationDraft,
      await withSourceWrite('catalog_publish', draftCommand(
        providerA.businessId,
        principalA,
        'private-provider-tools:account-a:save',
      )),
    )
    const saveB = await backend.mutation(
      api.capabilitySupplyOwnerFunnel.saveAgentSupplyIntegrationDraft,
      await withSourceWrite('catalog_publish', draftCommand(
        providerB.businessId,
        principalB,
        'private-provider-tools:account-b:save',
      )),
    )
    if (saveA.kind !== 'saved' || saveB.kind !== 'saved') {
      throw new Error(`private_provider_tool_fixture_save:${saveA.kind}:${saveB.kind}`)
    }

    const ownList = await backend.query(
      api.capabilityProviderTools.listAgent,
      await withSourceWrite('catalog_publish', {
        businessId: providerA.businessId,
        agentPrincipal: principalA,
        operationKey: 'private-provider-tools:account-a:list-own',
        correlationId: 'private-provider-tools:account-a:list-own',
        paginationOpts: { numItems: 50, cursor: null },
      }),
    )
    expect(ownList).toMatchObject({ kind: 'available', isDone: true })
    if (ownList.kind !== 'available') throw new Error(`private_provider_tool_list:${ownList.kind}`)
    expect(ownList.page).toHaveLength(1)
    expect(JSON.parse(ownList.page[0]?.statusJson ?? '{}')).toMatchObject({
      businessRef: String(providerA.businessId),
      toolRef: saveA.offeringRef,
    })

    const ownRead = await backend.query(
      api.capabilityProviderTools.readAgent,
      await withSourceWrite('catalog_publish', {
        businessId: providerA.businessId,
        agentPrincipal: principalA,
        toolRef: saveA.offeringRef,
        operationKey: 'private-provider-tools:account-a:read-own',
        correlationId: 'private-provider-tools:account-a:read-own',
      }),
    )
    expect(ownRead).toMatchObject({ kind: 'available' })
    if (ownRead.kind !== 'available') throw new Error(`private_provider_tool_read:${ownRead.kind}`)
    expect(JSON.parse(ownRead.statusJson)).toMatchObject({
      businessRef: String(providerA.businessId),
      toolRef: saveA.offeringRef,
    })

    await expect(backend.query(
      api.capabilityProviderTools.listAgent,
      await withSourceWrite('catalog_publish', {
        businessId: providerB.businessId,
        agentPrincipal: principalA,
        operationKey: 'private-provider-tools:account-a:list-foreign-business',
        correlationId: 'private-provider-tools:account-a:list-foreign-business',
        paginationOpts: { numItems: 50, cursor: null },
      }),
    )).resolves.toEqual({ kind: 'not_found' })

    await expect(backend.query(
      api.capabilityProviderTools.readAgent,
      await withSourceWrite('catalog_publish', {
        businessId: providerA.businessId,
        agentPrincipal: principalA,
        toolRef: saveB.offeringRef,
        operationKey: 'private-provider-tools:account-a:read-foreign-tool',
        correlationId: 'private-provider-tools:account-a:read-foreign-tool',
      }),
    )).resolves.toEqual({ kind: 'not_found' })

    await expect(backend.query(
      api.capabilityProviderTools.readAgent,
      await withSourceWrite('catalog_publish', {
        businessId: providerA.businessId,
        agentPrincipal: principalB,
        toolRef: saveA.offeringRef,
        operationKey: 'private-provider-tools:account-b:read-foreign-tool',
        correlationId: 'private-provider-tools:account-b:read-foreign-tool',
      }),
    )).resolves.toEqual({ kind: 'not_found' })

    const beforeMissingSource = await backend.run(async (ctx) => ({
      projections: await ctx.db.query('capabilityProviderToolProjections').collect(),
      sourceWriteNonces: await ctx.db.query('sourceWriteNonces').collect(),
    }))
    await expect(backend.query(api.capabilityProviderTools.listAgent, {
      businessId: providerA.businessId,
      agentPrincipal: principalA,
      operationKey: 'private-provider-tools:account-a:list-missing-source',
      correlationId: 'private-provider-tools:account-a:list-missing-source',
      paginationOpts: { numItems: 50, cursor: null },
    })).resolves.toEqual({ kind: 'not_found' })
    await expect(backend.query(api.capabilityProviderTools.readAgent, {
      businessId: providerA.businessId,
      agentPrincipal: principalA,
      toolRef: saveA.offeringRef,
      operationKey: 'private-provider-tools:account-a:read-missing-source',
      correlationId: 'private-provider-tools:account-a:read-missing-source',
    })).resolves.toEqual({ kind: 'not_found' })
    await expect(backend.run(async (ctx) => ({
      projections: await ctx.db.query('capabilityProviderToolProjections').collect(),
      sourceWriteNonces: await ctx.db.query('sourceWriteNonces').collect(),
    }))).resolves.toEqual(beforeMissingSource)
  })

  it.each([
    'foreign_account',
    'suppressed',
    'non_programmable_private',
    'revoked_agent',
    'stale_agent',
  ] as const)('denies %s before creating private preparation effects', async (caseKind) => {
    const backend = convexTest(schema, modules)
    const provider = await privateProvider(backend, `private-provider-denied-${caseKind}`)
    let principal = await seedSupplyAgentPrincipal(
      backend,
      provider.canonicalAccountRef,
      `private-provider-denied-${caseKind}`,
    )

    if (caseKind === 'foreign_account') {
      const foreign = await privateProvider(backend, `private-provider-foreign-${caseKind}`)
      principal = await seedSupplyAgentPrincipal(
        backend,
        foreign.canonicalAccountRef,
        `private-provider-foreign-${caseKind}`,
      )
    } else if (caseKind === 'suppressed') {
      await backend.run(async (ctx) => {
        await ctx.db.patch(provider.businessId, { suppressedAt: Date.now() })
      })
    } else if (caseKind === 'non_programmable_private') {
      await backend.run(async (ctx) => {
        await ctx.db.patch(provider.businessId, {
          businessContext: { kind: 'local_human', suburb: 'Perth', stateTerritory: 'WA' },
        })
      })
    } else {
      await backend.run(async (ctx) => {
        const stored = await ctx.db.query('agentAccessPrincipals')
          .withIndex('by_principalId', (query) => query.eq('principalId', principal.principalId))
          .unique()
        if (stored === null) throw new Error('private_provider_principal_missing')
        await ctx.db.patch(stored._id, caseKind === 'revoked_agent'
          ? { lifecycle: 'revoked' }
          : { grantGeneration: 2 })
      })
    }

    const saveOperationKey = `private-provider-denied:${caseKind}:save`
    await expect(backend.mutation(
      api.capabilitySupplyOwnerFunnel.saveAgentSupplyIntegrationDraft,
      await withSourceWrite('catalog_publish', draftCommand(
        provider.businessId,
        principal,
        saveOperationKey,
      )),
    )).resolves.toEqual({ kind: 'refused', reason: 'authorization_denied' })

    const reserveOperationKey = `private-provider-denied:${caseKind}:reserve`
    await expect(backend.mutation(
      api.capabilitySupplyOwnerFunnel.reserveOwnerCapabilityPublication,
      await withSourceWrite('catalog_publish', {
        businessId: provider.businessId,
        offeringRef: `offering:private-provider-denied:${caseKind}`,
        offeringRevision: 1,
        offeringSourceHash: `source:private-provider-denied:${caseKind}`,
        materialDigest: canonicalDigest({ kind: reserveOperationKey }),
        operationKey: reserveOperationKey,
        correlationId: reserveOperationKey,
        reasonCode: 'supply.publish',
        evidenceRefs: [`evidence:${reserveOperationKey}`],
        agentPrincipal: principal,
      }),
    )).resolves.toEqual({ kind: 'refused', reason: 'authorization_denied' })

    const effects = await backend.run(async (ctx) => ({
      publications: await ctx.db.query('capabilityPublications').collect(),
      drafts: (await ctx.db.query('offeringAccessPaths').collect())
        .filter((row) => row.integrationDraft !== undefined),
      reservations: (await ctx.db.query('operationKeys').collect())
        .filter((row) => row.operationName === 'reserveOwnerCapabilityPublication'),
    }))
    expect(effects.publications).toHaveLength(0)
    expect(effects.drafts).toHaveLength(0)
    expect(effects.reservations).toHaveLength(0)
  })
})
