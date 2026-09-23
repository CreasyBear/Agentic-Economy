import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type * as ConvexSourceModule from '@/lib/server/convex-source'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('@/lib/server/convex-source', async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexSourceModule>()), callPublicSourceQuery: query,
}))
vi.mock('@/lib/server/source-write-admission', () => ({
  sourceWriteAdmissionFromRequest: vi.fn(async () => ({ kind: 'admitted' })),
  sourceWriteRequestFromAdmission: (admission: unknown) => admission,
}))

import {
  createMarketDemandService,
  marketRequestCreateAction,
  marketRequestListAction,
  marketRequestStatusAction,
} from '@/modules/market-demand/market-demand.actions'
import { registryToolsCompareAction, registryToolsSearchAction } from '@/modules/registry/tools.actions'
import { projectToolSearchChoices } from '@/modules/registry/tool-choice-contracts'
import { misorderedSearchResult } from '../../helpers/tool-search-rerank-fixtures'

const principal = {
  principalId: 'prn_00000000000040008000000000000072',
  ownerId: 'acc_00000000000040008000000000000072',
  credentialId: 'credential:market-demand',
  applicationRef: 'agentic-economy',
  environment: 'sandbox' as const,
  scopes: ['market_tools:call'],
  authorityMode: 'read_only' as const,
}

afterEach(() => {
  vi.restoreAllMocks()
})
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(2_000)
  query.mockReset().mockResolvedValue({ kind: 'not_found' })
  vi.spyOn(registryToolsCompareAction, 'run').mockResolvedValue({
    kind: 'ok', schemaVersion: 'registry-tools:v3', tools: matchingTools.items,
  })
})

const fixture = projectToolSearchChoices(misorderedSearchResult('convert timezones'))
if (fixture.kind !== 'ok') throw new Error('matching_tools_fixture_invalid')
const matchingTools = { ...fixture, items: fixture.items.map((tool, index) => ({
  ...tool, toolRef: `operation:v1:${String(index + 1).repeat(64)}`,
})) }

describe('market demand action contract', () => {
  it('refuses to store demand when a current canonical Tool already matches', async () => {
    vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue({ kind: 'ok' } as never)
    const service = createMarketDemandService(
      new Request('https://ae.example/api/v1/market-requests', { method: 'POST', body: '{}' }),
      '{}',
    )

    await expect(service.create({
      input: { query: 'current job', idempotencyKey: 'one' },
      principal,
      correlationId: 'correlation:one',
    })).resolves.toEqual({ kind: 'refused', code: 'current_match_exists' })
  })

  it.each(['new_supply', 'outage', 'expired'])('replays a retained request before checking %s', async (state) => {
    if (state === 'expired') vi.mocked(Date.now).mockReturnValue(31 * 24 * 60 * 60 * 1000)
    const input = { query: 'retained OCR need', idempotencyKey: 'same-request' }
    const requestRef = `market-request:v1:${canonicalDigest({
      principalId: principal.principalId, credentialId: principal.credentialId, idempotencyKey: input.idempotencyKey,
    }).replace('sha256:', '')}`
    query.mockResolvedValue({ kind: 'found', request: { requestRef, query: input.query, createdAt: 1000, updatedAt: 1000 } })
    const search = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(state === 'new_supply'
      ? matchingTools : { kind: 'unavailable', schemaVersion: 'registry-tools:v3', reason: 'source_unavailable' } as never)
    const service = createMarketDemandService(new Request('https://ae.example/api/v1/market-requests'), '{}')
    expect(await service.create({ input, principal, correlationId: 'replay' }))
      .toEqual({ kind: 'replayed', requestRef, query: input.query, createdAt: 1000 })
    expect(search).not.toHaveBeenCalled()
  })

  it('refuses changed replay input before discovery can hide the conflict', async () => {
    const input = { query: 'changed request', idempotencyKey: 'same-request' }
    const requestRef = `market-request:v1:${canonicalDigest({
      principalId: principal.principalId, credentialId: principal.credentialId, idempotencyKey: input.idempotencyKey,
    }).replace('sha256:', '')}`
    query.mockResolvedValue({ kind: 'found', request: { requestRef, query: 'original need', createdAt: 1000, updatedAt: 1000 } })
    const search = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(matchingTools)
    const service = createMarketDemandService(new Request('https://ae.example/api/v1/market-requests'), '{}')
    expect(await service.create({ input, principal, correlationId: 'conflict' }))
      .toEqual({ kind: 'refused', code: 'idempotency_conflict' })
    expect(search).not.toHaveBeenCalled()
  })

  it.each([
    [{ kind: 'error', code: 'unauthenticated' }, 'unauthenticated'],
    [{ kind: 'found', request: { requestRef: 'wrong-request', query: 'private need', createdAt: 1, updatedAt: 1 } }, 'source_unavailable'],
    [{ kind: 'found', request: null }, 'source_unavailable'],
    [undefined, 'source_unavailable'],
  ])('does not run discovery after an invalid private replay read (%#)', async (existing, code) => {
    query.mockResolvedValue(existing)
    const search = vi.spyOn(registryToolsSearchAction, 'run')
    const service = createMarketDemandService(new Request('https://ae.example/api/v1/market-requests'), '{}')
    expect(await service.create({ input: { query: 'private need', idempotencyKey: 'one' }, principal, correlationId: 'refused-read' }))
      .toEqual({ kind: 'refused', code })
    expect(search).not.toHaveBeenCalled()
  })

  it('keeps create, list, and status on the same private credential-owned surface contract', () => {
    for (const action of [marketRequestCreateAction, marketRequestListAction, marketRequestStatusAction]) {
      expect(action.surfaces).toEqual(['http', 'mcp', 'cli'])
      expect(action.credentialAdmission?.scope).toBe('market_tools:call')
      expect(action.boundaries.join(' ')).toMatch(/exact|private|credential/iu)
    }
    expect(marketRequestCreateAction.readOnly).toBe(false)
    expect(marketRequestListAction.readOnly).toBe(true)
    expect(marketRequestStatusAction.readOnly).toBe(true)
  })

  const retained = { requestRef: 'market-request:one', query: 'convert timezones', createdAt: 1_000, updatedAt: 1_000 }
  const found = { kind: 'found', request: retained }
  function status() {
    return createMarketDemandService(new Request('https://ae.example/api/v1/market-requests/status'), '{}').status({
      input: { requestRef: retained.requestRef }, principal, correlationId: 'status:one',
    })
  }

  it.each([0, 1])('withholds an expired request at the 30-day cutoff plus %i milliseconds without inference', async (offset) => {
    vi.mocked(Date.now).mockReturnValue(retained.createdAt + 30 * 24 * 60 * 60 * 1000 + offset)
    query.mockResolvedValue(found)
    const search = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(matchingTools)
    expect(await status()).toEqual({ kind: 'not_found' })
    expect(search).not.toHaveBeenCalled()
    expect(registryToolsCompareAction.run).not.toHaveBeenCalled()
  })

  it('allows matching immediately before expiry', async () => {
    vi.mocked(Date.now).mockReturnValue(retained.createdAt + 30 * 24 * 60 * 60 * 1000 - 1)
    query.mockResolvedValue(found)
    vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(matchingTools)
    expect(await status()).toMatchObject({ kind: 'matched', matchedCount: 3 })
  })

  it.each(['matching', 'final_owner_check'])('withholds a match when the request expires during %s', async (stage) => {
    const cutoff = retained.createdAt + 30 * 24 * 60 * 60 * 1000
    vi.mocked(Date.now).mockReturnValue(cutoff - 1)
    query.mockResolvedValueOnce(found).mockImplementationOnce(async () => {
      if (stage === 'final_owner_check') vi.mocked(Date.now).mockReturnValue(cutoff)
      return found
    })
    vi.spyOn(registryToolsSearchAction, 'run').mockImplementation(async () => {
      if (stage === 'matching') vi.mocked(Date.now).mockReturnValue(cutoff)
      return matchingTools
    })
    expect(await status()).toEqual({ kind: 'not_found' })
  })

  it('rejects a future creation timestamp before inference', async () => {
    query.mockResolvedValue({ kind: 'found', request: { ...retained, createdAt: 3_000, updatedAt: 3_000 } })
    const search = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(matchingTools)
    expect(await status()).toEqual({ kind: 'error', code: 'source_unavailable' })
    expect(search).not.toHaveBeenCalled()
  })

  it.each([
    [{ kind: 'not_found' }, { kind: 'not_found' }],
    [{ kind: 'withdrawn' }, { kind: 'not_found' }],
    [{ kind: 'error', code: 'unauthenticated' }, { kind: 'error', code: 'unauthenticated' }],
    [{ kind: 'found', request: { ...retained, query: 'a changed private need', updatedAt: 2_000 } }, { kind: 'error', code: 'source_unavailable' }],
  ])('does not expose a delayed match after the retained request changes: %j', async (refreshed, expected) => {
    query.mockResolvedValueOnce(found).mockResolvedValueOnce(refreshed)
    vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(matchingTools)
    expect(await status()).toEqual(expected)
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('returns matches only after confirming the same private request is still current', async () => {
    query.mockResolvedValue(found)
    const search = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(matchingTools)
    expect(await status()).toMatchObject({ kind: 'matched', requestRef: retained.requestRef, query: retained.query, matchedCount: 3 })
    expect(query).toHaveBeenCalledTimes(2)
    expect(search).toHaveBeenCalledOnce()
    expect(query.mock.invocationCallOrder[1]).toBeGreaterThan(search.mock.invocationCallOrder[0]!)
  })

  it.each(['withdrawn', 'unavailable', 'changed'] as const)('withholds a delayed match when its Tool is %s', async (state) => {
    query.mockResolvedValue(found)
    vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(matchingTools)
    vi.mocked(registryToolsCompareAction.run).mockResolvedValue(state === 'unavailable'
      ? { kind: 'unavailable', schemaVersion: 'registry-tools:v3', reason: 'tool_unavailable' }
      : { kind: 'ok', schemaVersion: 'registry-tools:v3', tools: state === 'withdrawn'
        ? matchingTools.items.slice(1)
        : matchingTools.items.map((tool, index) => index === 0 ? { ...tool, description: 'A different capability.' } : tool) })
    expect(await status()).toEqual({ kind: 'error', code: 'source_unavailable' })
  })

  it('refreshes price and health while retaining ranked identities, then rechecks the private request', async () => {
    query.mockResolvedValue(found)
    vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(matchingTools)
    const freshTools = matchingTools.items.map(tool => ({ ...tool, priceLabel: 'AUD 2.00', healthStatus: 'degraded' as const }))
    vi.mocked(registryToolsCompareAction.run).mockResolvedValue({ kind: 'ok', schemaVersion: 'registry-tools:v3', tools: [...freshTools].reverse() })
    expect(await status()).toMatchObject({ kind: 'matched', tools: freshTools, matchedCount: freshTools.length })
    expect(registryToolsCompareAction.run).toHaveBeenCalledExactlyOnceWith({
      data: { toolRefs: matchingTools.items.map(tool => tool.toolRef) },
      context: expect.objectContaining({ caller: 'http' }),
    })
    expect(query.mock.invocationCallOrder[1]).toBeGreaterThan(vi.mocked(registryToolsCompareAction.run).mock.invocationCallOrder[0]!)
  })

  it('does not infer a missing capability from an incomplete empty search page', async () => {
    query.mockResolvedValue(found)
    vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue({
      kind: 'no_candidates', schemaVersion: 'registry-tools:v3', query: retained.query, count: 0, items: [],
      note: 'No Tools match this search on this page.', pagination: { limit: 3, hasMore: true, nextCursor: 'next-page' },
    })
    expect(await status()).toEqual({ kind: 'error', code: 'source_unavailable' })
    const service = createMarketDemandService(new Request('https://ae.example/api/v1/market-requests'), '{}')
    expect(await service.create({ input: { query: retained.query, idempotencyKey: 'one' }, principal, correlationId: 'create:one' }))
      .toEqual({ kind: 'refused', code: 'source_unavailable' })
  })
})
