import { makeFunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as ConvexSourceModule from '@/lib/server/convex-source'
const boundary = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn() }))
vi.mock('@/lib/server/convex-source', async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexSourceModule>()),
  callPublicSourceQuery: boundary.query,
  callPublicSourceMutation: boundary.mutation,
}))
import { createMarketDemandService } from '@/modules/market-demand/market-demand.actions'
import { registryToolsSearchAction } from '@/modules/registry/tools.actions'

import { defaultSandboxAgentAccessPolicy } from '@/modules/agent-access/sandbox-policy'
import { convexTestWithWorkers, publishedBusinessOwner, type ConvexFixtureBackend } from '../../helpers/convex-fixtures'
import { issueBuyerAgent } from '../../helpers/issued-buyer-agent'
import { withSourceWrite } from '../../helpers/source-write-admission'

const SERVICE_KEY = 'market-demand-test-key-material-32-bytes'
const REGISTER_OPERATION = 'agentAccessPrincipals.registerIssuedAgentBindingForServer'
const recordDemand = makeFunctionReference<'mutation', Record<string, unknown>, Record<string, unknown>>(
  'marketDemandSignals:record',
)
const listDemand = makeFunctionReference<'query', Record<string, unknown>, Record<string, unknown>>(
  'marketDemandSignals:list',
)
const readDemand = makeFunctionReference<'query', Record<string, unknown>, Record<string, unknown>>(
  'marketDemandSignals:read',
)
const withdrawDemand = makeFunctionReference<'mutation', Record<string, unknown>, Record<string, unknown>>(
  'marketDemandSignals:withdraw',
)

async function marketDemandBuyerAgent(
  backend: ConvexFixtureBackend,
  owner: ReturnType<ConvexFixtureBackend['withIdentity']>,
  subject: string,
) {
  return (await issueBuyerAgent(backend, owner, subject, {
    serviceKey: SERVICE_KEY,
    registerOperation: REGISTER_OPERATION,
    issuanceKey: `market-demand-${subject}`,
    registration: {
      displayName: 'Market demand reader',
      applicationRef: 'agentic-economy',
      environment: 'sandbox',
      scopes: ['market_tools:call'],
      authorityMode: 'read_only',
      toolAccess: 'all_admitted',
      toolRefs: [],
      spendingPolicy: defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 }),
    },
  })).principal
}

async function invoke(
  backend: ConvexFixtureBackend,
  reference: typeof recordDemand,
  input: Record<string, unknown>,
) {
  return await backend.mutation(reference, await withSourceWrite('protected_action', input as never))
}

async function invokeQuery(
  backend: ConvexFixtureBackend,
  reference: typeof listDemand,
  input: Record<string, unknown>,
) {
  return await backend.query(reference, await withSourceWrite('protected_action', input as never))
}

describe('private market demand signals', () => {
  const previousServiceKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN

  beforeEach(() => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = SERVICE_KEY
  })

  afterEach(() => {
    vi.restoreAllMocks()
    boundary.query.mockReset()
    boundary.mutation.mockReset()
    if (previousServiceKey === undefined) delete process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
    else process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = previousServiceKey
  })

  it('records idempotently, rejects changed replay material, and isolates request ownership', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const firstFixture = await publishedBusinessOwner(backend, 'market-demand-first')
    const secondFixture = await publishedBusinessOwner(backend, 'market-demand-second')
    const first = await marketDemandBuyerAgent(backend, firstFixture.owner, 'user_market-demand-first')
    const second = await marketDemandBuyerAgent(backend, secondFixture.owner, 'user_market-demand-second')
    const base = {
      query: 'translate a handwritten invoice',
      idempotencyKey: 'missing-job:one',
      agentPrincipal: first,
    }

    const recorded = await invoke(backend, recordDemand, {
      ...base,
      operationKey: 'market-demand:record:one',
      correlationId: 'market-demand:record:one',
    })
    expect(recorded).toMatchObject({
      kind: 'recorded',
      query: base.query,
      requestRef: expect.stringMatching(/^market-request:v1:/u),
    })
    if (typeof recorded.requestRef !== 'string') throw new Error('request_ref_missing')

    await expect(invoke(backend, recordDemand, {
      ...base,
      operationKey: 'market-demand:record:replay',
      correlationId: 'market-demand:record:replay',
    })).resolves.toMatchObject({ kind: 'replayed', requestRef: recorded.requestRef })

    await expect(invoke(backend, recordDemand, {
      ...base,
      query: 'a different missing job',
      operationKey: 'market-demand:record:conflict',
      correlationId: 'market-demand:record:conflict',
    })).resolves.toEqual({ kind: 'refused', code: 'idempotency_conflict' })

    await expect(invokeQuery(backend, listDemand, {
      paginationOpts: { numItems: 20, cursor: null },
      agentPrincipal: first,
      operationKey: 'market-demand:list:first',
      correlationId: 'market-demand:list:first',
    })).resolves.toMatchObject({
      kind: 'available',
      requests: { page: [{ requestRef: recorded.requestRef, query: base.query }], isDone: true },
    })

    await expect(invokeQuery(backend, readDemand, {
      requestRef: recorded.requestRef,
      agentPrincipal: second,
      operationKey: 'market-demand:read:other',
      correlationId: 'market-demand:read:other',
    })).resolves.toEqual({ kind: 'not_found' })
  })

  it('recovers a lost create response after supply appears through the signed service adapter', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const fixture = await publishedBusinessOwner(backend, 'market-demand-lost-response')
    const principal = await marketDemandBuyerAgent(backend, fixture.owner, 'user_market-demand-lost-response')
    boundary.query.mockImplementation((reference, args) => backend.query(reference, JSON.parse(JSON.stringify(args))))
    let loseResponse = true
    boundary.mutation.mockImplementation(async (reference, args) => {
      const result = await backend.mutation(reference, JSON.parse(JSON.stringify(args)))
      if (loseResponse) { loseResponse = false; throw new Error('response_lost') }
      return result
    })
    const input = { query: 'retained missing OCR need', idempotencyKey: 'lost-response' }
    const search = vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue({
      kind: 'no_candidates', schemaVersion: 'registry-tools:v3', query: input.query, count: 0, items: [],
      note: 'No match.', pagination: { limit: 1, hasMore: false },
    })
    const service = createMarketDemandService(new Request('https://ae.example/api/v1/market-requests', {
      method: 'POST', body: JSON.stringify(input),
    }), JSON.stringify(input))
    await expect(service.create({ input, principal, correlationId: 'attempt-one' })).rejects.toThrow('response_lost')
    const stored = await backend.run(ctx => ctx.db.query('marketDemandSignals').collect())
    expect(stored).toHaveLength(1)
    search.mockResolvedValue({ kind: 'ok' } as never)
    expect(await service.create({ input, principal, correlationId: 'attempt-two' }))
      .toEqual({ kind: 'replayed', requestRef: stored[0]!.requestRef, query: input.query, createdAt: stored[0]!.createdAt })
    expect(search).toHaveBeenCalledTimes(1)
    expect(boundary.mutation).toHaveBeenCalledTimes(1)
    const changed = { ...input, query: 'a different request' }
    const changedService = createMarketDemandService(new Request('https://ae.example/api/v1/market-requests', {
      method: 'POST', body: JSON.stringify(changed),
    }), JSON.stringify(changed))
    expect(await changedService.create({ input: changed, principal, correlationId: 'attempt-changed' }))
      .toEqual({ kind: 'refused', code: 'idempotency_conflict' })
    expect(await backend.run(ctx => ctx.db.query('marketDemandSignals').collect())).toEqual(stored)
  })

  it('records concurrent creates once through the same service adapter', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const fixture = await publishedBusinessOwner(backend, 'market-demand-concurrent')
    const principal = await marketDemandBuyerAgent(backend, fixture.owner, 'user_market-demand-concurrent')
    boundary.query.mockImplementation((reference, args) => backend.query(reference, JSON.parse(JSON.stringify(args))))
    boundary.mutation.mockImplementation((reference, args) => backend.mutation(reference, JSON.parse(JSON.stringify(args))))
    const input = { query: 'missing concurrent need', idempotencyKey: 'concurrent-request' }
    vi.spyOn(registryToolsSearchAction, 'run').mockResolvedValue({
      kind: 'no_candidates', schemaVersion: 'registry-tools:v3', query: input.query, count: 0, items: [],
      note: 'No match.', pagination: { limit: 1, hasMore: false },
    })
    const service = createMarketDemandService(new Request('https://ae.example/api/v1/market-requests', {
      method: 'POST', body: JSON.stringify(input),
    }), JSON.stringify(input))
    const replies = await Promise.all(['one', 'two'].map(correlationId => service.create({ input, principal, correlationId })))
    expect(replies.map(reply => reply.kind).sort()).toEqual(['recorded', 'replayed'])
    expect(await backend.run(ctx => ctx.db.query('marketDemandSignals').collect())).toHaveLength(1)
  })

  it('stops matching an expired retained row while preserving retry identity through the signed adapter', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const fixture = await publishedBusinessOwner(backend, 'market-demand-expired')
    const principal = await marketDemandBuyerAgent(backend, fixture.owner, 'user_market-demand-expired')
    boundary.query.mockImplementation((reference, args) => backend.query(reference, JSON.parse(JSON.stringify(args))))
    boundary.mutation.mockImplementation((reference, args) => backend.mutation(reference, JSON.parse(JSON.stringify(args))))
    const input = { query: 'expired missing need', idempotencyKey: 'expired-request' }
    const recorded = await invoke(backend, recordDemand, {
      ...input, agentPrincipal: principal, operationKey: 'expiry-record', correlationId: 'expiry-record',
    })
    if (typeof recorded.requestRef !== 'string') throw new Error('request_ref_missing')
    const createdAt = Date.now() - 30 * 24 * 60 * 60 * 1000
    await backend.run(async ctx => {
      const row = await ctx.db.query('marketDemandSignals').unique()
      if (!row) throw new Error('retained_request_missing')
      await ctx.db.patch(row._id, { createdAt, updatedAt: createdAt })
    })
    const stored = await backend.run(ctx => ctx.db.query('marketDemandSignals').collect())
    const search = vi.spyOn(registryToolsSearchAction, 'run').mockRejectedValue(new Error('expired_request_must_not_infer'))
    const service = createMarketDemandService(new Request('https://ae.example/api/v1/market-requests', {
      method: 'POST', body: JSON.stringify(input),
    }), JSON.stringify(input))
    expect(await service.status({ input: { requestRef: recorded.requestRef }, principal, correlationId: 'expired-status' }))
      .toEqual({ kind: 'not_found' })
    expect(await service.create({ input, principal, correlationId: 'expired-retry' }))
      .toEqual({ kind: 'replayed', requestRef: recorded.requestRef, query: input.query, createdAt })
    expect(search).not.toHaveBeenCalled()
    expect(boundary.mutation).not.toHaveBeenCalled()
    expect(await backend.run(ctx => ctx.db.query('marketDemandSignals').collect())).toEqual(stored)
  })

  it('fails closed without protected source admission', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const fixture = await publishedBusinessOwner(backend, 'market-demand-unsigned')
    const principal = await marketDemandBuyerAgent(backend, fixture.owner, 'user_market-demand-unsigned')
    await expect(backend.mutation(recordDemand, {
      query: 'missing unsigned job',
      idempotencyKey: 'unsigned',
      agentPrincipal: principal,
      operationKey: 'market-demand:unsigned',
      correlationId: 'market-demand:unsigned',
    })).resolves.toEqual({ kind: 'refused', code: 'unauthenticated' })
  })

  it('withdraws atomically, erases need text, isolates owners and prevents delayed-create resurrection', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const fixture = await publishedBusinessOwner(backend, 'withdraw-owner')
    const otherFixture = await publishedBusinessOwner(backend, 'withdraw-other')
    const principal = await marketDemandBuyerAgent(backend, fixture.owner, 'user_withdraw-owner')
    const other = await marketDemandBuyerAgent(backend, otherFixture.owner, 'user_withdraw-other')
    boundary.query.mockImplementation((reference, args) => backend.query(reference, JSON.parse(JSON.stringify(args))))
    boundary.mutation.mockImplementation((reference, args) => backend.mutation(reference, JSON.parse(JSON.stringify(args))))
    const input = { query: 'erase this private missing need', idempotencyKey: 'withdraw-request' }
    const args = { ...input, agentPrincipal: principal, operationKey: 'withdraw-record', correlationId: 'withdraw-record' }
    const recorded = await invoke(backend, recordDemand, args)
    if (typeof recorded.requestRef !== 'string') throw new Error('request_ref_missing')
    const withdrawArgs = { requestRef: recorded.requestRef, agentPrincipal: principal, operationKey: 'withdraw', correlationId: 'withdraw' }
    expect(await invoke(backend, withdrawDemand, { ...withdrawArgs, agentPrincipal: other })).toEqual({ kind: 'not_found' })
    expect(await backend.mutation(withdrawDemand, withdrawArgs)).toEqual({ kind: 'error', code: 'unauthenticated' })
    const outcomes = await Promise.all([
      invoke(backend, withdrawDemand, withdrawArgs),
      invoke(backend, recordDemand, { ...args, correlationId: 'concurrent-create' }),
      invoke(backend, withdrawDemand, { ...withdrawArgs, correlationId: 'concurrent-withdraw' }),
    ])
    expect(outcomes[0]).toEqual({ kind: 'withdrawn', requestRef: recorded.requestRef })
    expect(outcomes[2]).toEqual(outcomes[0])
    const rows = await backend.run(ctx => ctx.db.query('marketDemandSignals').collect())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ schemaVersion: 'market-demand-withdrawn:v1', requestRef: recorded.requestRef })
    expect(rows[0]).not.toHaveProperty('query')
    expect(rows[0]).not.toHaveProperty('queryDigest')
    expect(await invoke(backend, recordDemand, { ...args, correlationId: 'late-create' }))
      .toEqual({ kind: 'refused', code: 'invalid_request' })
    const search = vi.spyOn(registryToolsSearchAction, 'run').mockRejectedValue(new Error('withdrawn_request_must_not_infer'))
    const service = createMarketDemandService(new Request('https://ae.example/api/v1/market-requests'), '{}')
    expect(await service.withdraw({ input: { requestRef: recorded.requestRef }, principal, correlationId: 'lost-response-retry' }))
      .toEqual(outcomes[0])
    expect(await service.status({ input: { requestRef: recorded.requestRef }, principal, correlationId: 'withdrawn-status' }))
      .toEqual({ kind: 'not_found' })
    expect(await service.create({ input, principal, correlationId: 'withdrawn-create' }))
      .toEqual({ kind: 'refused', code: 'invalid_request' })
    expect(await service.list({ input: { limit: 20 }, principal, correlationId: 'withdrawn-list' }))
      .toMatchObject({ kind: 'available', items: [], hasMore: false })
    expect(search).not.toHaveBeenCalled()
    expect(await backend.run(ctx => ctx.db.query('marketDemandSignals').collect())).toEqual(rows)
  })
})
