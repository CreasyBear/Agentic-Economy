import { describe, expect, it } from 'vitest'

import { listFeeds, resolveFeedAsync } from '../../../tools/ae/lib/feeds'
import { seedKeylessExecutableSource } from '@/modules/capability-execution'
import { executeKeylessOperation } from '@/modules/capability-execution/operation-execute.server'
import { isPublicOperationRef } from '@/modules/capability-supply/public'

describe('market-terminal feed catalog (canonical executable source)', () => {
  it('derives only canonical keyless http-json GET feeds from the onboard seed', async () => {
    const feeds = await listFeeds(seedKeylessExecutableSource)
    expect(feeds.length).toBeGreaterThan(0)
    const feedIds = feeds.map((feed) => feed.capabilityId)
    expect(feedIds).toEqual(expect.arrayContaining([
      'coingecko.simple-price',
      'open-meteo.forecast',
      'open-meteo.geocoding',
    ]))
    const frankfurter = feeds.filter((feed) => feed.capabilityId === 'frankfurter.single-rate')
    expect(frankfurter).toHaveLength(1)
    expect(frankfurter[0]).toMatchObject({
      id: expect.stringMatching(/^operation:v1:[0-9a-f]{64}$/),
      capabilityId: 'frankfurter.single-rate',
    })
    for (const excludedCapabilityId of [
      'exa.search',
      'exa.contents',
      'openweathermap.current-weather',
      'tavily.search',
      'serpapi.google-search',
      'coingecko.simple-price-demo',
      'wikipedia-rest.page-summary',
      'exa-search-x402',
      'timezone-convert-x402',
      'wolframalpha-query-x402',
      'coinmarketcap-quotes-x402',
      'flightaware-nearby-x402',
      'bizintel-forex-rate-x402',
      'tavily-search-x402',
    ]) {
      expect(feedIds).not.toContain(excludedCapabilityId)
    }

    for (const feed of feeds) {
      expect(isPublicOperationRef(feed.id)).toBe(true)
      expect(feed.executable).toBe(true)
      expect(feed.inputSchema).toMatchObject({ additionalProperties: false })
      expect(feed.endpointHost).not.toBe('unknown')
    }
  })

  it('keeps capability IDs as metadata and does not expose readable aliases', async () => {
    const feeds = await listFeeds(seedKeylessExecutableSource)
    const first = feeds[0]!
    expect(feeds.some((feed) => feed.id === feed.capabilityId)).toBe(false)
    await expect(resolveFeedAsync(first.id, seedKeylessExecutableSource)).resolves.toBeDefined()
    await expect(resolveFeedAsync(first.capabilityId, seedKeylessExecutableSource)).resolves.toBeUndefined()
    await expect(resolveFeedAsync(`operation:v1:${first.capabilityId}`, seedKeylessExecutableSource)).resolves.toBeUndefined()
  })

  it('executes through the guarded adapter with an explicit test transport seam', async () => {
    const feeds = await listFeeds(seedKeylessExecutableSource)
    const feed = feeds[0]!
    const result = await executeKeylessOperation(
      { operationRef: feed.id, input: {} },
      seedKeylessExecutableSource,
      {
        isPublicTarget: async () => true,
        fetchImpl: async () => new Response('{"ok":true}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      },
    )
    expect(['ok', 'refused', 'error']).toContain(result.kind)
  })
})
