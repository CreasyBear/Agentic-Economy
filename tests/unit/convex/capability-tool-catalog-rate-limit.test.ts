import { getFunctionName } from 'convex/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ list: vi.fn(), search: vi.fn() }))
vi.mock('@coinbase/cdp-sdk', async (original) => ({ ...await original<typeof import('@coinbase/cdp-sdk')>(), listX402DiscoveryResources: sdk.list, searchX402Resources: sdk.search }))
import { search } from '../../../convex/capabilityToolCatalog'

import type { ToolSearchWireResult } from '@/modules/capability-supply/public'

const searchHandler = (search as unknown as { _handler: (ctx: unknown, args: { source: 'coinbase'; query: string }) => Promise<ToolSearchWireResult> })._handler

describe('catalogue search admission and fan-out', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refuses a call the limiter rejects before any upstream request', async () => {
    const runMutation = vi.fn().mockResolvedValue({ ok: false, retryAfter: 1000 })
    const runQuery = vi.fn()
    const result = await searchHandler({ runQuery, runMutation, auth: { getUserIdentity: async () => ({ tokenIdentifier: 'tok_1' }) } }, { source: 'coinbase', query: '' })
    expect(runMutation).toHaveBeenCalledWith(expect.anything(), { name: 'public-read', key: 'catalog-search:tok_1' })
    expect(result).toMatchObject({ kind: 'unavailable' })
    expect(sdk.list).not.toHaveBeenCalled()
    expect(runQuery).not.toHaveBeenCalled()
  })

  it('refuses anonymous live fan-out without touching a shared bucket or upstream', async () => {
    const runMutation = vi.fn()
    const result = await searchHandler({ runQuery: vi.fn(), runMutation, auth: { getUserIdentity: async () => null } }, { source: 'coinbase', query: '' })
    expect(result).toMatchObject({ kind: 'unavailable' })
    expect(runMutation).not.toHaveBeenCalled()
    expect(sdk.list).not.toHaveBeenCalled()
  })

  it('bounds per-reference detail lookups to one page', async () => {
    sdk.list.mockResolvedValue({ items: [{ resource: 'https://provider.test/a' }], pagination: { offset: 0, total: 1 } })
    const toolRefs = Array.from({ length: 500 }, (_, i) => `ref-${i}`)
    const details: string[] = []
    const runQuery = vi.fn(async (reference: unknown, args: { toolRef?: string }) => {
      const name = getFunctionName(reference as never)
      if (name === 'capabilityToolCatalogData:sourceSnapshot') return { toolRefs, incomplete: false }
      if (name === 'capabilitySupplyTools:detailInternal') details.push(args.toolRef ?? '')
      return { kind: 'not_found', schemaVersion: 'registry-tools:v3', toolRef: 'x', navigation: [] }
    })
    await searchHandler({ runQuery, runMutation: vi.fn().mockResolvedValue({ ok: true }), auth: { getUserIdentity: async () => ({ tokenIdentifier: 'tok_1' }) } }, { source: 'coinbase', query: '' })
    expect(details.length).toBeLessThanOrEqual(20)
  })
})
