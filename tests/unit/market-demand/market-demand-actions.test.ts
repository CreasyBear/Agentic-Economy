import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type * as ConvexSourceModule from '@/lib/server/convex-source'

const { query, mutation } = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn() }))
vi.mock('@/lib/server/convex-source', async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexSourceModule>()), callPublicSourceQuery: query, callPublicSourceMutation: mutation,
}))
vi.mock('@/lib/server/source-write-admission', () => ({
  sourceWriteAdmissionFromRequest: vi.fn(async () => ({ kind: 'admitted' })),
  sourceWriteRequestFromAdmission: (admission: unknown) => admission,
}))
vi.mock('../../../convex/authz', () => ({
  resolveBusinessActor: vi.fn(),
}))
vi.mock('../../../convex/lib/security/sourceWrite/admission', () => ({
  requireSourceWrite: vi.fn(async () => ({ kind: 'accepted' })),
  requireSourceRead: vi.fn(async () => ({ kind: 'accepted' })),
}))

import {
  MARKET_REQUEST_ACTIVE_WINDOW_MS,
  createMarketDemandService,
  marketRequestCreateAction,
  marketRequestListAction,
  marketRequestStatusAction,
} from '@/modules/market-demand/market-demand.actions'
import { registryToolsCompareAction, registryToolsSearchAction } from '@/modules/registry/tools.actions'
import { projectToolListChoices, projectToolSearchChoices } from '@/modules/registry/tool-choice-contracts'
import { misorderedSearchResult } from '../../helpers/tool-search-rerank-fixtures'
import { resolveBusinessActor } from '../../../convex/authz'
import {
  ownerFindActiveHandler, ownerListHandler, ownerReadHandler, ownerRecordHandler,
  ownerReplayHandler, ownerWithdrawHandler,
} from '../../../convex/lib/market/demandSignals/owner'

const principal = {
  principalId: 'prn_00000000000040008000000000000072',
  ownerId: 'acc_00000000000040008000000000000072',
  credentialId: 'credential:market-demand',
  applicationRef: 'agentic-economy',
  environment: 'sandbox' as const,
  scopes: ['market_tools:call'],
  authorityMode: 'read_only' as const,
}

const source = misorderedSearchResult('convert timezones')
const matchingTools = projectToolListChoices(source)
if (matchingTools.kind !== 'ok') throw new Error('matching_tools_fixture_invalid')
const matchingSearch = projectToolSearchChoices(source, undefined, { verdict: 'matched', nearMisses: [] }, undefined, 8, { complete: true })
const emptySearch = projectToolSearchChoices({ ...source, items: [] }, undefined, { verdict: 'noMatch', nearMisses: [] }, undefined, 8, { complete: true })
const externalSearch = {
  ...matchingSearch,
  kind: 'match' as const,
  results: matchingSearch.results.slice(0, 1).map(({ toolRef: _toolRef, ...row }) => ({
    ...row, id: 'external:timezone', source: 'coinbase' as const, access: 'external_listing' as const,
    detailRef: 'external:timezone',
    next: [{ action: 'describe-external' as const, authority: 'public' as const, args: { id: 'external:timezone' } }],
  })),
}
afterEach(() => {
  vi.restoreAllMocks()
})
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(2_000)
  query.mockReset().mockResolvedValue({ kind: 'not_found' })
  mutation.mockReset().mockResolvedValue({ kind: 'recorded', requestRef: 'market-request:recorded', query: 'convert timezones', createdAt: 2_000 })
  vi.spyOn(registryToolsCompareAction, 'run').mockResolvedValue({
    kind: 'ok', schemaVersion: 'registry-tools:v3', tools: matchingTools.items,
  })
})


describe('market demand action contract', () => {
  it('refuses to store demand when a current canonical Tool already matches', async () => {
    vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(matchingSearch)
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

  it('refuses an external-only match rather than treating Bazaar supply as absence', async () => {
    vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(externalSearch)
    const service = createMarketDemandService(new Request('https://ae.example/api/v1/market-requests'), '{}')
    expect(await service.create({ input: { query: 'convert timezones', idempotencyKey: 'external' }, principal, correlationId: 'external' }))
      .toEqual({ kind: 'refused', code: 'current_match_exists' })
    expect(mutation).not.toHaveBeenCalled()
  })

  it('records only after an exhaustive no-match, not a scoped or unavailable search', async () => {
    const search = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(emptySearch)
    const service = createMarketDemandService(new Request('https://ae.example/api/v1/market-requests'), '{}')
    expect(await service.create({ input: { query: 'convert timezones', idempotencyKey: 'empty' }, principal, correlationId: 'empty' }))
      .toMatchObject({ kind: 'recorded' })
    search.mockResolvedValue({ ...emptySearch, kind: 'scoped', assessed: { ...emptySearch.assessed, scope: 'page', coverage: 'partial' }, reason: 'More supply remains.' })
    expect(await service.create({ input: { query: 'convert timezones', idempotencyKey: 'scoped' }, principal, correlationId: 'scoped' }))
      .toEqual({ kind: 'refused', code: 'source_unavailable' })
    expect(mutation).toHaveBeenCalledOnce()
  })

  it('rechecks the exact filtered scope and preserves a 200-character phrase without truncation', async () => {
    const phrase = 'x'.repeat(200)
    const filters = { provider: 'Chosen provider', access: 'ae_callable' as const }
    const search = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(emptySearch)
    mutation.mockImplementation(async (_reference, args) => ({
      kind: 'recorded', requestRef: 'market-request:filtered', query: args.query, createdAt: 2_000,
    }))
    const service = createMarketDemandService(new Request('https://ae.example/api/v1/market-requests'), '{}')
    expect(await service.create({
      input: { query: phrase, source: 'current', filters, idempotencyKey: 'filtered-intent' },
      principal, correlationId: 'filtered',
    })).toEqual({ kind: 'recorded', requestRef: 'market-request:filtered', query: phrase, createdAt: 2_000 })
    expect(search).toHaveBeenCalledWith({
      data: { query: phrase, source: 'current', filters, limit: 12 },
      context: expect.objectContaining({ caller: 'http' }),
    })
    expect(mutation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ query: phrase, source: 'current', filters }))
  })

  it('refuses a stale filtered match without changing the search scope', async () => {
    const filters = { provider: 'Chosen provider' }
    const search = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(matchingSearch)
    const service = createMarketDemandService(new Request('https://ae.example/api/v1/market-requests'), '{}')
    expect(await service.create({
      input: { query: 'convert timezones', source: 'current', filters, idempotencyKey: 'stale-intent' },
      principal, correlationId: 'stale',
    })).toEqual({ kind: 'refused', code: 'current_match_exists' })
    expect(search).toHaveBeenCalledWith({
      data: { query: 'convert timezones', source: 'current', filters, limit: 12 },
      context: expect.objectContaining({ caller: 'http' }),
    })
    expect(mutation).not.toHaveBeenCalled()
  })

  it.each(['new_supply', 'outage', 'expired'])('replays a retained request before checking %s', async (state) => {
    if (state === 'expired') vi.mocked(Date.now).mockReturnValue(31 * 24 * 60 * 60 * 1000)
    const input = { query: 'retained OCR need', idempotencyKey: 'same-request' }
    const requestRef = `market-request:v1:${canonicalDigest({
      principalId: principal.principalId, credentialId: principal.credentialId, idempotencyKey: input.idempotencyKey,
    }).replace('sha256:', '')}`
    query.mockResolvedValue({ kind: 'found', request: { requestRef, query: input.query, createdAt: 1000, updatedAt: 1000 } })
    const search = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(state === 'new_supply'
      ? matchingSearch : { kind: 'unavailable', schemaVersion: 'registry-tools:v3', reason: 'source_unavailable' } as never)
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
    const search = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(matchingSearch)
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
    const search = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(matchingSearch)
    expect(await status()).toEqual({ kind: 'not_found' })
    expect(search).not.toHaveBeenCalled()
    expect(registryToolsCompareAction.run).not.toHaveBeenCalled()
  })

  it('allows matching immediately before expiry', async () => {
    vi.mocked(Date.now).mockReturnValue(retained.createdAt + 30 * 24 * 60 * 60 * 1000 - 1)
    query.mockResolvedValue(found)
    vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(matchingSearch)
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
      return matchingSearch
    })
    expect(await status()).toEqual({ kind: 'not_found' })
  })

  it('rejects a future creation timestamp before inference', async () => {
    query.mockResolvedValue({ kind: 'found', request: { ...retained, createdAt: 3_000, updatedAt: 3_000 } })
    const search = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(matchingSearch)
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
    vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(matchingSearch)
    expect(await status()).toEqual(expected)
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('withholds a delayed match if its retained provider scope changes during assessment', async () => {
    const initial = { ...retained, source: 'current', filters: { provider: 'Original provider' } }
    query.mockResolvedValueOnce({ kind: 'found', request: initial })
      .mockResolvedValueOnce({ kind: 'found', request: { ...initial, filters: { provider: 'Another provider' } } })
    vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(matchingSearch)
    expect(await status()).toEqual({ kind: 'error', code: 'source_unavailable' })
  })

  it('returns matches only after confirming the same private request is still current', async () => {
    query.mockResolvedValue(found)
    const search = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(matchingSearch)
    expect(await status()).toMatchObject({ kind: 'matched', requestRef: retained.requestRef, query: retained.query, matchedCount: 3 })
    expect(query).toHaveBeenCalledTimes(2)
    expect(search).toHaveBeenCalledOnce()
    expect(query.mock.invocationCallOrder[1]).toBeGreaterThan(search.mock.invocationCallOrder[0]!)
  })

  it('checks saved provider filters and source rather than widening a filtered request', async () => {
    const filters = { provider: 'Chosen provider', access: 'ae_callable' as const }
    query.mockResolvedValue({ kind: 'found', request: { ...retained, source: 'current', filters } })
    const search = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(emptySearch)
    expect(await status()).toEqual({
      kind: 'open', requestRef: retained.requestRef, query: retained.query,
      createdAt: retained.createdAt, matchedCount: 0,
    })
    expect(search).toHaveBeenCalledWith({
      data: { query: retained.query, source: 'current', filters, limit: 12 },
      context: expect.objectContaining({ caller: 'http' }),
    })
  })

  it.each(['withdrawn', 'unavailable', 'changed'] as const)('withholds a delayed match when its Tool is %s', async (state) => {
    query.mockResolvedValue(found)
    vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(matchingSearch)
    vi.mocked(registryToolsCompareAction.run).mockResolvedValue(state === 'unavailable'
      ? { kind: 'unavailable', schemaVersion: 'registry-tools:v3', reason: 'tool_unavailable' }
      : { kind: 'ok', schemaVersion: 'registry-tools:v3', tools: state === 'withdrawn'
        ? matchingTools.items.slice(1)
        : matchingTools.items.map((tool, index) => index === 0 ? { ...tool, description: 'A different capability.' } : tool) })
    expect(await status()).toEqual({ kind: 'error', code: 'source_unavailable' })
  })

  it('refreshes price and health while retaining ranked identities, then rechecks the private request', async () => {
    query.mockResolvedValue(found)
    vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(matchingSearch)
    const freshTools = matchingTools.items.map(tool => ({ ...tool, priceLabel: 'AUD 2.00', healthStatus: 'degraded' as const }))
    vi.mocked(registryToolsCompareAction.run).mockResolvedValue({ kind: 'ok', schemaVersion: 'registry-tools:v3', tools: [...freshTools].reverse() })
    expect(await status()).toMatchObject({ kind: 'matched', tools: freshTools, matchedCount: freshTools.length })
    expect(registryToolsCompareAction.run).toHaveBeenCalledExactlyOnceWith({
      data: { toolRefs: matchingTools.items.map(tool => tool.toolRef) },
      context: expect.objectContaining({ caller: 'http' }),
    })
    expect(query.mock.invocationCallOrder[1]).toBeGreaterThan(vi.mocked(registryToolsCompareAction.run).mock.invocationCallOrder[0]!)
  })

  it('keeps an external-only match open without suggesting or comparing an external listing', async () => {
    query.mockResolvedValue(found)
    vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue(externalSearch)
    expect(await status()).toEqual({ kind: 'open', requestRef: retained.requestRef, query: retained.query, createdAt: retained.createdAt, matchedCount: 0 })
    expect(registryToolsCompareAction.run).not.toHaveBeenCalled()
  })

  it('does not infer a missing capability from an incomplete empty search page', async () => {
    query.mockResolvedValue(found)
    vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue({
      ...emptySearch, kind: 'scoped', query: retained.query, reason: 'More supply remains.',
      assessed: { ...emptySearch.assessed, scope: 'page', coverage: 'partial' },
      next: [{ action: 'next-page', authority: 'public', args: { query: retained.query, cursor: 'next-page' } }],
      pagination: { limit: 3, hasMore: true, nextCursor: 'next-page' },
    })
    expect(await status()).toEqual({ kind: 'error', code: 'source_unavailable' })
    const service = createMarketDemandService(new Request('https://ae.example/api/v1/market-requests'), '{}')
    expect(await service.create({ input: { query: retained.query, idempotencyKey: 'one' }, principal, correlationId: 'create:one' }))
      .toEqual({ kind: 'refused', code: 'source_unavailable' })
  })
})

describe('owner demand isolation', () => {
  const requestRef = 'market-request:private'
  const row = {
    schemaVersion: 'market-demand-owner-signal:v1', ownerId: 'account:B', requestRef,
    query: 'private need', idempotencyKey: 'save-intent', createdAt: 1_000, updatedAt: 1_000,
    queryDigest: 'digest', _id: 'demand-row',
  }

  it('does not reveal or withdraw another account’s phrase or an Agent-owned row', async () => {
    vi.mocked(resolveBusinessActor).mockResolvedValue({ kind: 'authenticated_owner', canonicalAccountRef: 'account:A', authorityProvenance: { accessKind: 'ownership' } } as never)
    const replace = vi.fn()
    const take = vi.fn(async () => [row])
    const ctx = Object.assign({} as Parameters<typeof ownerWithdrawHandler>[0], {
      db: { query: vi.fn(() => ({ withIndex: vi.fn(() => ({ take })) })), replace },
    })
    const args = { requestRef, operationKey: 'withdraw', correlationId: 'isolated' }
    expect(await ownerReadHandler(ctx, { requestRef })).toEqual({ kind: 'not_found' })
    expect(await ownerWithdrawHandler(ctx, args)).toEqual({ kind: 'not_found' })
    const agentOwned = { ...row, ownerId: 'account:A', schemaVersion: 'market-demand-signal:v1', credentialId: 'agent:key' }
    take.mockResolvedValue([agentOwned])
    expect(await ownerReadHandler(ctx, { requestRef })).toEqual({ kind: 'not_found' })
    expect(await ownerWithdrawHandler(ctx, args)).toEqual({ kind: 'not_found' })
    expect(replace).not.toHaveBeenCalled()
  })
  it('records the full 200-character filtered need under the authenticated account', async () => {
    vi.mocked(resolveBusinessActor).mockResolvedValue({ kind: 'authenticated_owner', canonicalAccountRef: 'account:B', authorityProvenance: { accessKind: 'ownership' } } as never)
    const insert = vi.fn()
    const ctx = Object.assign({} as Parameters<typeof ownerRecordHandler>[0], {
      db: { query: vi.fn(() => ({ withIndex: vi.fn(() => ({
        take: vi.fn(async () => []),
        order: vi.fn(() => ({ take: vi.fn(async () => []) })),
      })) })), insert },
    })
    const phrase = 'x'.repeat(200)
    const filters = {
      provider: 'Chosen provider',
      location: ' AU ',
      maximumPrice: { currency: 'USD', units: '100', exponent: 2 },
    }
    expect(await ownerRecordHandler(ctx, {
      query: phrase, source: 'current', filters, idempotencyKey: 'owner-intent',
      operationKey: 'record', correlationId: 'owner',
    })).toMatchObject({ kind: 'recorded', query: phrase })
    expect(insert).toHaveBeenCalledWith('marketDemandSignals', expect.objectContaining({
      schemaVersion: 'market-demand-owner-signal:v1', ownerId: 'account:B',
      query: phrase, source: 'current',
      filters: { ...filters, location: 'AU' },
      queryDigest: canonicalDigest({ query: phrase, source: 'current', filters: { ...filters, location: 'AU' } }),
    }))
  })

  it('returns only the owner’s live phrase with its original status-check scope', async () => {
    vi.mocked(resolveBusinessActor).mockResolvedValue({ kind: 'authenticated_owner', canonicalAccountRef: 'account:B', authorityProvenance: { accessKind: 'ownership' } } as never)
    const scoped = { ...row, source: 'current' as const, filters: { provider: 'Chosen provider' } }
    const ctx = Object.assign({} as Parameters<typeof ownerReadHandler>[0], {
      db: { query: vi.fn(() => ({ withIndex: vi.fn(() => ({ take: vi.fn(async () => [scoped]) })) })) },
    })
    expect(await ownerReadHandler(ctx, { requestRef })).toEqual({
      kind: 'found',
      request: {
        requestRef, query: scoped.query, source: scoped.source, filters: scoped.filters,
        createdAt: scoped.createdAt, updatedAt: scoped.updatedAt,
      },
    })
  })

  it('finds the exact active owner need but excludes another owner and the 30-day cutoff', async () => {
    vi.mocked(resolveBusinessActor).mockResolvedValue({ kind: 'authenticated_owner', canonicalAccountRef: 'account:B', authorityProvenance: { accessKind: 'ownership' } } as never)
    const filters = { provider: 'Chosen provider' }
    const scoped = {
      ...row, source: 'current' as const, filters,
      queryDigest: canonicalDigest({ query: row.query, source: 'current', filters }),
    }
    const take = vi.fn(async () => [scoped])
    const ctx = Object.assign({} as Parameters<typeof ownerFindActiveHandler>[0], {
      db: { query: vi.fn(() => ({ withIndex: vi.fn(() => ({ order: vi.fn(() => ({ take })) })) })) },
    })
    const input = { query: row.query, source: 'current' as const, filters }
    expect(await ownerFindActiveHandler(ctx, input)).toEqual({
      kind: 'found',
      request: {
        requestRef, query: row.query, source: 'current', filters,
        createdAt: row.createdAt, updatedAt: row.updatedAt,
      },
    })
    take.mockResolvedValue([{ ...scoped, ownerId: 'account:A' }])
    expect(await ownerFindActiveHandler(ctx, input)).toEqual({ kind: 'not_found' })
    take.mockResolvedValue([scoped])
    vi.mocked(Date.now).mockReturnValue(row.createdAt + MARKET_REQUEST_ACTIVE_WINDOW_MS)
    expect(await ownerFindActiveHandler(ctx, input)).toEqual({ kind: 'not_found' })
  })

  it('atomically reuses an active scoped request without allowing an alternate key to resurrect it', async () => {
    vi.mocked(resolveBusinessActor).mockResolvedValue({ kind: 'authenticated_owner', canonicalAccountRef: 'account:B', authorityProvenance: { accessKind: 'ownership' } } as never)
    const scope = { query: row.query, source: 'current' as const, filters: { provider: 'Chosen provider' } }
    const scoped = { ...row, ...scope, queryDigest: canonicalDigest({
      query: scope.query, source: scope.source, filters: scope.filters,
    }) }
    const take = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([scoped])
    const insert = vi.fn()
    const ctx = Object.assign({} as Parameters<typeof ownerRecordHandler>[0], {
      db: { query: vi.fn(() => ({ withIndex: vi.fn(() => ({ order: vi.fn(() => ({ take })), take })) })), insert },
    })
    const input = { ...scope, idempotencyKey: 'second-intent', operationKey: 'record', correlationId: 'owner' }
    expect(await ownerRecordHandler(ctx, input)).toEqual({
      kind: 'replayed', requestRef, query: row.query, createdAt: row.createdAt,
    })
    expect(insert).toHaveBeenCalledWith('marketDemandSignals', expect.objectContaining({
      schemaVersion: 'market-demand-owner-alias:v1', targetRef: requestRef,
      idempotencyKey: 'second-intent',
    }))
    expect(insert.mock.calls[0]?.[1]).not.toHaveProperty('query')
    const alias = insert.mock.calls[0]?.[1]
    const replayTake = vi.fn().mockResolvedValueOnce([alias]).mockResolvedValueOnce([{
      ...row, schemaVersion: 'market-demand-owner-withdrawn:v1',
    }])
    const replayCtx = Object.assign({} as Parameters<typeof ownerReplayHandler>[0], {
      db: { query: vi.fn(() => ({ withIndex: vi.fn(() => ({ take: replayTake })) })) },
    })
    expect(await ownerReplayHandler(replayCtx, {
      ...scope, idempotencyKey: 'second-intent',
    })).toEqual({ kind: 'refused', code: 'invalid_request' })
  })

  it('starts a new intent after the matching window instead of aliasing expired demand', async () => {
    vi.mocked(resolveBusinessActor).mockResolvedValue({ kind: 'authenticated_owner', canonicalAccountRef: 'account:B', authorityProvenance: { accessKind: 'ownership' } } as never)
    vi.mocked(Date.now).mockReturnValue(row.createdAt + MARKET_REQUEST_ACTIVE_WINDOW_MS)
    const scoped = { ...row, queryDigest: canonicalDigest({ query: row.query, source: null, filters: null }) }
    const take = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([scoped])
    const insert = vi.fn()
    const ctx = Object.assign({} as Parameters<typeof ownerRecordHandler>[0], {
      db: { query: vi.fn(() => ({ withIndex: vi.fn(() => ({ order: vi.fn(() => ({ take })), take })) })), insert },
    })
    expect(await ownerRecordHandler(ctx, {
      query: row.query, idempotencyKey: 'new-intent', operationKey: 'record', correlationId: 'owner',
    })).toMatchObject({ kind: 'recorded', query: row.query })
    expect(insert).toHaveBeenCalledWith('marketDemandSignals', expect.objectContaining({
      schemaVersion: 'market-demand-owner-signal:v1', query: row.query,
    }))
  })

  it('erases the owner’s phrase on withdrawal while retaining only the retry receipt', async () => {
    vi.mocked(resolveBusinessActor).mockResolvedValue({ kind: 'authenticated_owner', canonicalAccountRef: 'account:B', authorityProvenance: { accessKind: 'ownership' } } as never)
    const replace = vi.fn()
    const ctx = Object.assign({} as Parameters<typeof ownerWithdrawHandler>[0], {
      db: { query: vi.fn(() => ({ withIndex: vi.fn(() => ({ take: vi.fn(async () => [row]) })) })), replace },
    })
    expect(await ownerWithdrawHandler(ctx, { requestRef, operationKey: 'withdraw', correlationId: 'owner' }))
      .toEqual({ kind: 'withdrawn', requestRef })
    expect(replace).toHaveBeenCalledWith(row._id, {
      schemaVersion: 'market-demand-owner-withdrawn:v1', requestRef,
      ownerId: row.ownerId, idempotencyKey: row.idempotencyKey,
      createdAt: row.createdAt, updatedAt: 2_000,
    })
  })
  it('refuses same-account membership across every owner demand RPC without touching private rows', async () => {
    vi.mocked(resolveBusinessActor).mockResolvedValue({
      kind: 'authenticated_owner',
      canonicalAccountRef: 'account:B',
      authorityProvenance: { accessKind: 'membership' },
    } as never)
    const dbQuery = vi.fn(() => { throw new Error('member_reached_private_demand') })
    const ctx = Object.assign({} as Parameters<typeof ownerWithdrawHandler>[0], {
      db: { query: dbQuery, insert: vi.fn(), replace: vi.fn() },
    })
    const scope = { query: row.query }
    const intent = { ...scope, idempotencyKey: 'member-intent' }
    expect(await ownerRecordHandler(ctx, { ...intent, operationKey: 'record', correlationId: 'member' }))
      .toEqual({ kind: 'refused', code: 'unauthenticated' })
    expect(await ownerReplayHandler(ctx, intent)).toEqual({ kind: 'refused', code: 'unauthenticated' })
    expect(await ownerFindActiveHandler(ctx, scope)).toEqual({ kind: 'error', code: 'unauthenticated' })
    expect(await ownerListHandler(ctx, { paginationOpts: { numItems: 10, cursor: null } }))
      .toEqual({ kind: 'error', code: 'unauthenticated' })
    expect(await ownerReadHandler(ctx, { requestRef })).toEqual({ kind: 'error', code: 'unauthenticated' })
    expect(await ownerWithdrawHandler(ctx, { requestRef, operationKey: 'withdraw', correlationId: 'member' }))
      .toEqual({ kind: 'error', code: 'unauthenticated' })
    expect(dbQuery).not.toHaveBeenCalled()
    expect(ctx.db.insert).not.toHaveBeenCalled()
    expect(ctx.db.replace).not.toHaveBeenCalled()
  })
})
