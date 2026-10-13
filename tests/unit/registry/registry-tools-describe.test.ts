import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFunctionName } from 'convex/server'
import { setPublicSourceTransportForTests, type ConvexSourceTransport } from '@/lib/server/convex-source'
import { readCapabilityToolDetail } from '@/modules/capability-supply/tool-source'
import { registryToolsDescribeAction } from '@/modules/registry/tools.actions'
import { toolCatalogCompareInputSchema, toolChoiceDescribeOutputSchema, toolDescribeInputSchema } from '@/modules/registry/tool-choice-contracts'
import { mockSearchTool } from '../../helpers/tool-search-rerank-fixtures'

vi.mock('@/modules/capability-supply/tool-source', () => ({
  readCapabilityToolDetail: vi.fn(), readCapabilityToolSearch: vi.fn(),
}))

const listingRef = `registry:${'a'.repeat(64)}`
const publishedRef = `operation:v1:${'b'.repeat(64)}`
const listing = {
  kind: 'found' as const,
  item: {
    choice: { access: 'ae_callable' as const },
    entry: {
      title: 'Search', description: 'Search public pages', provider: 'search.test',
      resource: 'https://search.test/search', method: 'POST',
      input: { fields: [], schemaJson: '{"type":"object","properties":{"q":{"type":"string"}}}' },
      output: { fields: [], schemaJson: '{"type":"object"}' },
      prices: [{ network: 'eip155:8453', scheme: 'exact', amount: '1000', symbol: 'USDC', payTo: 'recipient' }],
      metadataJson: 'unselected raw source',
    },
  },
}
let sourceResult: unknown
const query = vi.fn(async () => sourceResult)
const mutation = vi.fn()
const action = vi.fn()
const inspect = (toolRef = listingRef, includeLatency = false) => registryToolsDescribeAction.run({
  data: toolDescribeInputSchema.parse({ toolRef, includeLatency }), context: { caller: 'mcp' },
})

beforeEach(() => {
  vi.resetAllMocks()
  sourceResult = listing
  setPublicSourceTransportForTests({ query: query as ConvexSourceTransport['query'], mutation, action })
})
afterEach(() => setPublicSourceTransportForTests(undefined))

describe('exact directory Tool inspection', () => {
  it('returns only Provider-declared metadata and remains read-only under concurrent replay', async () => {
    const results = await Promise.all([inspect(), inspect(listingRef, true)])
    expect(results[0]).toEqual(results[1])
    expect(results[0]).toMatchObject({ kind: 'external', tool: {
      id: listingRef, toolRef: listingRef, access: 'ae_callable', readiness: 'unverified',
      verification: 'not_verified', claimSource: 'provider', input: listing.item.entry.input,
    } })
    expect(toolChoiceDescribeOutputSchema.safeParse(results[0]).success).toBe(true)
    expect(JSON.stringify(results)).not.toMatch(/unselected raw source|recipient|quoteRef|callRef|latency/)
    expect(query).toHaveBeenCalledTimes(2)
    for (const [ref, args] of query.mock.calls as unknown as [Parameters<ConvexSourceTransport['query']>[0], unknown][]) {
      expect(getFunctionName(ref)).toBe('x402DirectoryIndex:detailById')
      expect(args).toEqual({ id: listingRef })
    }
    expect(mutation).not.toHaveBeenCalled()
    expect(action).not.toHaveBeenCalled()
    expect(readCapabilityToolDetail).not.toHaveBeenCalled()
  })

  it('resolves an existing published binding and preserves the canonical contract', async () => {
    sourceResult = { ...listing, item: { ...listing.item, toolRef: publishedRef } }
    vi.mocked(readCapabilityToolDetail).mockResolvedValue({ kind: 'found', schemaVersion: 'registry-tools:v3',
      tool: mockSearchTool(publishedRef, 'web.search', 'Published search', 'Search') })
    expect(await inspect()).toMatchObject({ kind: 'found', tool: { toolRef: publishedRef, inputJsonSchema: { type: 'object' } } })
    expect(readCapabilityToolDetail).toHaveBeenCalledWith({ toolRef: publishedRef }, undefined)
  })

  it.each([{ kind: 'not_found' }, { kind: 'unavailable', reason: 'index_unavailable' }])('preserves a $kind source result', async result => {
    sourceResult = result
    expect(await inspect()).toEqual({ ...result, schemaVersion: 'registry-tools:v3', toolRef: listingRef })
    expect(readCapabilityToolDetail).not.toHaveBeenCalled()
  })

  it('preserves unavailable supply and its refusal reason', async () => {
    sourceResult = { ...listing, item: { ...listing.item, choice: { access: 'unavailable', reason: 'schema_missing' } } }
    expect(await inspect()).toMatchObject({ kind: 'external', tool: { access: 'unavailable', reason: 'schema_missing', readiness: 'unverified' } })
  })

  it('rejects a malformed published binding without inventing a Tool reference', async () => {
    sourceResult = { ...listing, item: { ...listing.item, toolRef: 'operation:v1:invalid' } }
    expect(await inspect()).toMatchObject({ kind: 'unavailable', toolRef: listingRef, reason: 'source_unavailable' })
    expect(readCapabilityToolDetail).not.toHaveBeenCalled()
  })

  it.each(['registry:abc', `registry:${'A'.repeat(64)}`, `registry:${'a'.repeat(65)}`, 'https://search.test/search'])('rejects malformed or unsupported inspection reference %s', ref => {
    expect(toolDescribeInputSchema.safeParse({ toolRef: ref }).success).toBe(false)
  })

  it('keeps comparison limited to published Tool contracts', () => {
    expect(toolCatalogCompareInputSchema.safeParse({ toolRefs: [listingRef] }).success).toBe(false)
    expect(toolCatalogCompareInputSchema.safeParse({ toolRefs: [publishedRef] }).success).toBe(true)
  })
})
