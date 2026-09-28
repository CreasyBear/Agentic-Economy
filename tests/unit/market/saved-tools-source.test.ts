import { makeFunctionReference } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { convexTestWithMarketComponents, publishedBusinessOwner, type ConvexFixtureBackend } from '../../helpers/convex-fixtures'

const listOwner = makeFunctionReference<'query', Record<string, never>, { kind: string; items?: { identity: { kind: string; identityRef: string }; createdAt: number }[] }>('marketSavedTools:listOwner')
const saveOwner = makeFunctionReference<'mutation', { identity: { kind: 'ae_callable' | 'external_listing'; identityRef: string } }, { kind: string; createdAt?: number; code?: string }>('marketSavedTools:saveOwner')
const removeOwner = makeFunctionReference<'mutation', { identity: { kind: 'ae_callable' | 'external_listing'; identityRef: string } }, { kind: string }>('marketSavedTools:removeOwner')

const ref = (i: number) => `operation:v1:${i.toString(16).padStart(64, '0')}`
async function seedIndexedExternal(backend: ConvexFixtureBackend, count: number): Promise<void> {
  await backend.run(async ctx => {
    const generation = 'saved-live'
    await ctx.db.insert('marketExternalRegistryState', {
      key: 'coinbase', activeGeneration: generation, lastAttemptAt: 1, lastAttemptStatus: 'complete',
    })
    await ctx.db.insert('marketExternalRegistryGenerations', {
      generation, source: 'coinbase', status: 'complete', startedAt: 1, completedAt: 1,
      ingestedCount: count, terminalObserved: true,
    })
    for (let i = 0; i < count; i++) {
      const resource = `https://example.com/tool/${i}`
      const entryId = await ctx.db.insert('marketExternalRegistryEntries', {
        generation, documentId: `registry:${canonicalDigest({ source: 'coinbase', resource }).slice(7)}`,
        source: 'coinbase', upstreamServiceId: 'example', upstreamEndpointId: String(i),
        sourceUrl: resource, name: `Tool ${i}`, summary: 'Indexed external Tool',
        provider: 'example.com', category: 'other', tags: [], networks: [],
        access: 'x402', authority: 'source_metadata_only', sourceDigest: `source-${i}`,
        searchText: `tool ${i}`, updatedAt: 1,
      })
      await ctx.db.insert('marketDirectorySearchEntries', {
        generation, resource, entryId, network: '*', category: 'other', provider: 'example.com',
        searchText: `tool ${i}`, popularOrder: 0, updatedOrder: 0, minimumUsdPriceOrder: 0,
      })
    }
  })
}


describe('account Saved Tools source', () => {
  it('shares the same owner across sessions but never another account, and removes absent identities', async () => {
    const backend = convexTestWithMarketComponents()
    await seedIndexedExternal(backend, 1)
    const alice = await publishedBusinessOwner(backend, 'saved-alice')
    const bob = await publishedBusinessOwner(backend, 'saved-bob')
    const identity = { kind: 'external_listing' as const, identityRef: 'https://example.com/tool/0' }
    expect((await alice.owner.mutation(saveOwner, { identity })).kind).toBe('saved')
    expect((await alice.owner.mutation(saveOwner, { identity })).kind).toBe('already_saved')
    expect((await alice.owner.query(listOwner, {})).items?.map(item => item.identity)).toEqual([identity])
    expect((await bob.owner.query(listOwner, {})).items).toEqual([])
    expect((await bob.owner.mutation(removeOwner, { identity })).kind).toBe('not_found')
    await backend.run(async ctx => {
      const row = await ctx.db.query('marketDirectorySearchEntries')
        .withIndex('by_generation_and_network_and_resource', q =>
          q.eq('generation', 'saved-live').eq('network', '*').eq('resource', identity.identityRef)).unique()
      if (row === null) throw new Error('indexed_resource_fixture_missing')
      await ctx.db.delete(row._id)
    })
    expect((await alice.owner.mutation(saveOwner, { identity })).kind).toBe('already_saved')
    expect((await alice.owner.mutation(removeOwner, { identity })).kind).toBe('removed')
    expect((await alice.owner.mutation(removeOwner, { identity })).kind).toBe('not_found')
    expect((await alice.owner.query(listOwner, {})).items).toEqual([])
  })
  it('refuses an unlisted resource and an absent callable despite valid syntax without occupying slots', async () => {
    const backend = convexTestWithMarketComponents()
    await seedIndexedExternal(backend, 1)
    const alice = await publishedBusinessOwner(backend, 'saved-unlisted')
    expect(await alice.owner.mutation(saveOwner, { identity: { kind: 'external_listing', identityRef: 'https://example.com/missing' } }))
      .toEqual({ kind: 'refused', code: 'not_found' })
    expect(await alice.owner.mutation(saveOwner, { identity: { kind: 'ae_callable', identityRef: ref(77) } }))
      .toEqual({ kind: 'refused', code: 'not_found' })
    expect((await alice.owner.query(listOwner, {})).items).toEqual([])
  })


  it('limits an owner to 100 identities without evicting or snapshotting and rejects anonymous writes', async () => {
    const backend = convexTestWithMarketComponents()
    await seedIndexedExternal(backend, 101)
    const alice = await publishedBusinessOwner(backend, 'saved-limit')
    const external = { kind: 'external_listing' as const, identityRef: 'https://example.com/tool/0' }
    expect((await backend.mutation(saveOwner, { identity: external })).kind).toBe('refused')
    expect((await alice.owner.mutation(saveOwner, { identity: external })).kind).toBe('saved')
    for (let i = 1; i < 100; i++) {
      expect((await alice.owner.mutation(saveOwner, { identity: { kind: 'external_listing', identityRef: `https://example.com/tool/${i}` } })).kind).toBe('saved')
    }
    expect((await alice.owner.mutation(saveOwner, { identity: { kind: 'external_listing', identityRef: 'https://example.com/tool/100' } })).code).toBe('limit_reached')
    expect((await alice.owner.mutation(saveOwner, { identity: external })).kind).toBe('already_saved')
    expect((await alice.owner.query(listOwner, {})).items).toHaveLength(100)
  })
})
