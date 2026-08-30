import { expect, it } from 'vitest'

import { createCurrentOperationCommitment } from '@/modules/capability-supply/current-operation'

import { api, internal } from '../../convex/_generated/api'
import { readCurrentPublishedOperation } from '../../convex/capabilitySupplyCurrentOperation'
import {
  convexTestWithMarketComponents,
  publishedBusinessOwner,
} from '../helpers/convex-fixtures'
import {
  admitPublication,
  capabilityPublicationInput,
  preparedPublicationArgs,
  seedCatalogOffering,
} from './capability-publication-harness'

it('keeps strict currentDigest stable before expiry and refuses expired or changed authority', async () => {
  const backend = convexTestWithMarketComponents()
  const suffix = 'stable-current-digest'
  const { businessId, owner } = await publishedBusinessOwner(backend, suffix)
  await seedCatalogOffering(backend, businessId, suffix, '/lookup', 'POST')
  const input = capabilityPublicationInput(businessId, suffix)
  const published = await owner.mutation(
    api.capabilitySupply.publishPreparedCapability,
    await preparedPublicationArgs(backend, {
      ...input,
      binding: { ...input.binding, authority: { kind: 'public_upstream' } },
    }),
  )
  if ('reason' in published) throw new Error(`snapshot_publication_refused:${published.reason}`)
  await admitPublication(backend, published, suffix)
  const observed = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
    publicationRef: published.publicationRef,
    expectedRevision: published.publicationRevision,
    credentialState: 'ready',
    healthState: 'healthy',
    validUntil: Date.now() + 3_600_000,
    operationKey: 'test:t4:snapshot-readiness',
    correlationId: 'test:t4:snapshot',
    reasonCode: 'source_test_readiness',
    evidenceRefs: ['test:t4:snapshot'],
  })
  if (observed.kind !== 'observed') throw new Error(`snapshot_readiness_refused:${observed.reason}`)
  const readiness = await backend.run(async (ctx) => {
    const publication = await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (query) => (
        query.eq('publicationRef', published.publicationRef)
          .eq('revision', published.publicationRevision)
      ))
      .unique()
    if (publication?.readinessObservedAt === undefined
      || publication.readinessValidUntil === undefined) {
      throw new Error('snapshot_readiness_window_missing')
    }
    return {
      observedAt: publication.readinessObservedAt,
      validUntil: publication.readinessValidUntil,
    }
  })
  const [firstDigest, secondDigest] = await backend.run(async (ctx) => {
    const [first, second] = await Promise.all([
      readCurrentPublishedOperation(ctx, published.operationRef, readiness.observedAt + 1),
      readCurrentPublishedOperation(ctx, published.operationRef, readiness.observedAt + 1_000),
    ])
    return [first, second].map((operation) => operation === undefined
      ? null
      : createCurrentOperationCommitment({
          operationRef: published.operationRef,
          operation,
        }).currentDigest)
  })
  expect(firstDigest).toMatch(/^sha256:/u)
  expect(secondDigest).toBe(firstDigest)
  await expect(backend.run(async (ctx) => (
    (await readCurrentPublishedOperation(ctx, published.operationRef, readiness.validUntil + 1)) === undefined
  ))).resolves.toBe(true)
  await backend.run(async (ctx) => {
    const publication = await ctx.db.query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (query) => (
        query.eq('publicationRef', published.publicationRef)
          .eq('revision', published.publicationRevision)
      ))
      .unique()
    if (publication === null) throw new Error('snapshot_publication_missing')
    const binding = await ctx.db.query('capabilityTransportBindings')
      .withIndex('by_bindingId', (query) => query.eq('bindingId', publication.bindingId))
      .unique()
    if (binding === null) throw new Error('snapshot_binding_missing')
    await ctx.db.patch(binding._id, { admission: 'not_admitted' })
  })
  await expect(backend.run(async (ctx) => (
    (await readCurrentPublishedOperation(ctx, published.operationRef, readiness.observedAt + 2_000)) === undefined
  ))).resolves.toBe(true)
})
