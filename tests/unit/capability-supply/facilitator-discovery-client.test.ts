import { describe, expect, it } from 'vitest'

import {
  FACILITATOR_DISCOVERY_MAX_BODY_BYTES,
  FACILITATOR_DISCOVERY_MAX_PAGES,
  fetchFacilitatorDiscoveryPages,
} from '@/modules/capability-supply/internal/facilitator-discovery-client'

function response(document: unknown): Response {
  return new Response(JSON.stringify(document), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('facilitator discovery bounded client', () => {
  it('uses the two allowlisted sources with a default page size of 20', async () => {
    const requests: string[] = []
    const result = await fetchFacilitatorDiscoveryPages({
      fetcher: async (url) => {
        requests.push(url)
        return response({ items: [] })
      },
    })
    expect(result.complete).toBe(true)
    expect(requests).toEqual([
      'https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?limit=20&offset=0',
      'https://facilitator.payai.network/discovery/resources?limit=20&offset=0',
    ])
  })

  it('stops a cursor or offset source at the global 20-page bound', async () => {
    let calls = 0
    const result = await fetchFacilitatorDiscoveryPages({
      sourceUrls: ['https://facilitator.payai.network/discovery/resources'],
      fetcher: async () => {
        calls += 1
        return response({
          items: [],
          pagination: { cursor: `cursor-${calls}` },
        })
      },
    })
    expect(calls).toBe(FACILITATOR_DISCOVERY_MAX_PAGES)
    expect(result.pages).toHaveLength(FACILITATOR_DISCOVERY_MAX_PAGES)
    expect(result.complete).toBe(false)
  })

  it('refuses an oversized body before accepting a page', async () => {
    const oversized = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(FACILITATOR_DISCOVERY_MAX_BODY_BYTES + 1)))
        controller.close()
      },
    }), { status: 200 })
    const result = await fetchFacilitatorDiscoveryPages({
      sourceUrls: ['https://facilitator.payai.network/discovery/resources'],
      fetcher: async () => oversized,
    })
    expect(result.pages).toHaveLength(0)
    expect(result.complete).toBe(false)
  })
})
