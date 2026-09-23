import { makeFunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

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
})
