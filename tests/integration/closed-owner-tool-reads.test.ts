import { expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import { readCurrentPublishedTool } from '../../convex/lib/capabilitySupply/currentTool/reads'
import { convexTestWithMarketComponents, publishedBusinessOwner } from '../helpers/convex-fixtures'
import {
  admitPublication,
  capabilityPublicationInput,
  preparedPublicationArgs,
  seedCatalogOffering,
} from './capability-publication-harness'

async function publishReadyTool(suffix: string) {
  const backend = convexTestWithMarketComponents()
  const { businessId, owner } = await publishedBusinessOwner(backend, suffix)
  await seedCatalogOffering(backend, businessId, suffix, '/lookup', 'POST')
  const input = capabilityPublicationInput(businessId, suffix)
  const published = await owner.mutation(
    api.capabilitySupply.publishPreparedCapability,
    await preparedPublicationArgs(backend, { ...input, binding: { ...input.binding, authority: { kind: 'public_upstream' } } }),
  )
  if ('reason' in published) throw new Error(`publication_refused:${published.reason}`)
  await admitPublication(backend, published, suffix)
  const observed = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
    publicationRef: published.publicationRef,
    expectedRevision: published.publicationRevision,
    credentialState: 'ready',
    healthState: 'healthy',
    validUntil: Date.now() + 3_600_000,
    operationKey: `test:t3:${suffix}`,
    correlationId: `test:t3:${suffix}`,
    reasonCode: 'source_test_readiness',
    evidenceRefs: [`test:t3:${suffix}`],
  })
  if (observed.kind !== 'observed') throw new Error(`readiness_refused:${observed.reason}`)
  return { backend, businessId, toolRef: published.toolRef }
}

const resolves = (b: Awaited<ReturnType<typeof publishReadyTool>>) =>
  b.backend.run(async (ctx) => (await readCurrentPublishedTool(ctx, b.toolRef)) !== undefined)

it('stops resolving a Tool once its owning account is closed', async () => {
  const t = await publishReadyTool('closed-account')
  expect(await resolves(t)).toBe(true)
  await t.backend.run(async (ctx) => {
    const business = await ctx.db.get(t.businessId)
    const account = await ctx.db.query('accounts')
      .withIndex('by_accountRef', (q) => q.eq('accountRef', business!.owningAccountRef)).unique()
    await ctx.db.patch(account!._id, { lifecycle: 'closed' })
  })
  expect(await resolves(t)).toBe(false)
})

it('stops resolving a Tool once its owner principal is retired', async () => {
  const t = await publishReadyTool('retired-owner')
  expect(await resolves(t)).toBe(true)
  await t.backend.run(async (ctx) => {
    const business = await ctx.db.get(t.businessId)
    const ownerships = await ctx.db.query('accountOwnerships')
      .withIndex('by_accountRef_and_lifecycle', (q) => q.eq('accountRef', business!.owningAccountRef).eq('lifecycle', 'active')).take(8)
    expect(ownerships.length).toBeGreaterThan(0)
    for (const o of ownerships) {
      const p = await ctx.db.query('principals').withIndex('by_principalRef', (q) => q.eq('principalRef', o.ownerPrincipalRef)).unique()
      await ctx.db.patch(p!._id, { lifecycle: 'retired' } as never)
    }
  })
  expect(await resolves(t)).toBe(false)
})
