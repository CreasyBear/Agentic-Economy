import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { anyApi } from 'convex/server'
import type { Id } from '../../convex/_generated/dataModel'
import schema from '../../convex/schema'
import { convexModules as modules, type ConvexFixtureBackend, publishedBusinessOwner } from '../helpers/convex-fixtures'


const publishOwnerCapability = anyApi.capabilitySupplyOwnerFunnel?.publishOwnerCapability
const readOwnerSupplyFunnel = anyApi.capabilitySupplyOwnerFunnel?.readOwnerSupplyFunnel
if (readOwnerSupplyFunnel === undefined) throw new Error('capabilitySupplyOwnerFunnel.readOwnerSupplyFunnel missing')
if (publishOwnerCapability === undefined) throw new Error('capabilitySupplyOwnerFunnel.publishOwnerCapability missing')
function publishValue(endpointUrl = 'https://provider.example/quote') {
  return {
    step: 'publish' as const,
    endpoint: {
      sourceKind: 'openapi_http' as const,
      descriptor: 'owner endpoint',
      selector: 'POST /quote',
      endpointUrl,
      method: 'POST' as const,
      queryMapping: '{}',
      protocolVersion: 'http-json:v1',
      toolName: '',
      requestTimeoutMs: 10_000,
      authority: { kind: 'keyless' as const },
    },
    pricing: {
      version: 'pricing:v2' as const,
      unit: 'call' as const,
      paidAmount: { currency: 'AUD', units: '100', exponent: 2 },
    },
  }
}

async function seedCatalogOffering(
  backend: ConvexFixtureBackend,
  businessId: Id<'businesses'>,
  offeringRef: string,
  currentRevision: number,
  revision: number,
  sourceHash: string,
) {
  await backend.run(async (ctx) => {
    await ctx.db.insert('businessOfferings', {
      offeringRef,
      businessId,
      currentRevision,
      status: 'published',
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('businessOfferingRevisions', {
      offeringRef,
      businessId,
      revision,
      name: 'Owner quote service',
      category: 'Data',
      summary: 'A bounded owner quote service.',
      sourceHash,
      createdAt: 1,
    })
  })
}

describe('owner capability publication lifecycle', () => {
  it('keeps a first publication pending instead of claiming it is live', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(backend, 'owner-pending')
    const offeringRef = 'catalog-offering:owner-pending'
    const sourceHash = 'catalog-source:owner-pending:v1'
    await seedCatalogOffering(backend, businessId, offeringRef, 1, 1, sourceHash)

    const result = await owner.mutation(publishOwnerCapability, {
      businessId,
      offeringRef,
      revision: 1,
      sourceHash,
      operationKey: 'owner-supply:owner-pending:publish',
      value: publishValue(),
    })

    expect(result).toMatchObject({
      step: 'publish',
      state: 'pending_readiness',
      offeringRef,
      revision: 1,
    })
    expect(result).not.toMatchObject({ state: 'completed', message: 'Your service is live.' })
    const rows = await backend.run(async (ctx) => ({
      offerings: await ctx.db.query('capabilityOfferings').take(10),
      bindings: await ctx.db.query('capabilityTransportBindings').take(10),
      publications: await ctx.db.query('capabilityPublications').take(10),
    }))
    expect(rows.offerings).toHaveLength(1)
    expect(rows.offerings[0]?.status).toBe('inactive')
    expect(rows.bindings[0]?.authority).toEqual({ kind: 'keyless' })
    expect(JSON.stringify(rows)).not.toMatch(/credentialRef|access[-_]location|accessLocation|env:/iu)
    const readback = await owner.query(readOwnerSupplyFunnel, {})
    expect(readback).toMatchObject({ kind: 'available' })
    expect(JSON.stringify(readback)).not.toMatch(/credentialRef|access[-_]location|accessLocation|env:/iu)
    expect(rows.bindings[0]?.admission).toBe('not_admitted')
    expect(rows.publications[0]?.disposition).toBe('current')
  })

  it('refuses stale catalog revision and source lineage before publication', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await publishedBusinessOwner(backend, 'owner-stale')
    const offeringRef = 'catalog-offering:owner-stale'
    await seedCatalogOffering(backend, businessId, offeringRef, 2, 1, 'catalog-source:owner-stale:v1')

    const staleRevision = await owner.mutation(publishOwnerCapability, {
      businessId,
      offeringRef,
      revision: 1,
      sourceHash: 'catalog-source:owner-stale:v1',
      operationKey: 'owner-supply:owner-stale:stale-revision',
      value: publishValue(),
    })
    expect(staleRevision).toMatchObject({ step: 'publish', state: 'refused', refusal: 'revision_changed' })
    await expect(backend.run(async (ctx) => ctx.db.query('capabilityPublications').take(10))).resolves.toHaveLength(0)

    const backendForHash = convexTest(schema, modules)
    const { businessId: hashBusinessId, owner: hashOwner } = await publishedBusinessOwner(backendForHash, 'owner-stale-hash')
    const hashOfferingRef = 'catalog-offering:owner-stale-hash'
    await seedCatalogOffering(backendForHash, hashBusinessId, hashOfferingRef, 1, 1, 'catalog-source:owner-stale-hash:v2')
    const staleHash = await hashOwner.mutation(publishOwnerCapability, {
      businessId: hashBusinessId,
      offeringRef: hashOfferingRef,
      revision: 1,
      sourceHash: 'catalog-source:owner-stale-hash:v1',
      operationKey: 'owner-supply:owner-stale-hash:stale-source',
      value: publishValue(),
    })
    expect(staleHash).toMatchObject({ step: 'publish', state: 'refused', refusal: 'revision_changed' })
    await expect(backendForHash.run(async (ctx) => ctx.db.query('capabilityPublications').take(10))).resolves.toHaveLength(0)
  })
})
