import { makeFunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { createCustomerRequestServiceAssertion, toStableHashValue } from '@/modules/agent-access/service-auth-envelope'
import { issuedAgentGrantRef } from '@/modules/agent-access/issued-agent-binding'
import { defaultSandboxAgentAccessPolicy } from '@/modules/agent-access/sandbox-policy'
import {
  convexTestWithWorkers,
  publishedBusinessOwner,
  type ConvexFixtureBackend,
} from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'

const SERVICE_KEY = 'market-demand-test-key-material-32-bytes'
const REGISTER_OPERATION = 'agentAccessPrincipals.registerIssuedAgentBindingForServer'
const registerBinding = makeFunctionReference<'mutation', Record<string, unknown>, Record<string, unknown>>(
  'agentAccessPrincipals:registerIssuedAgentBindingForServer',
)
const recordDemand = makeFunctionReference<'mutation', Record<string, unknown>, Record<string, unknown>>(
  'marketDemandSignals:record',
)
const listDemand = makeFunctionReference<'mutation', Record<string, unknown>, Record<string, unknown>>(
  'marketDemandSignals:list',
)
const readDemand = makeFunctionReference<'mutation', Record<string, unknown>, Record<string, unknown>>(
  'marketDemandSignals:read',
)

async function issueBuyerAgent(
  backend: ConvexFixtureBackend,
  owner: ReturnType<ConvexFixtureBackend['withIdentity']>,
  subject: string,
): Promise<AgentAccessPrincipal> {
  const now = Date.now()
  const issuanceKey = `market-demand-${subject}`
  const input = {
    issuanceKey,
    grantRef: issuedAgentGrantRef(subject, issuanceKey),
    credentialId: `credential:${subject}`,
    displayName: 'Market demand reader',
    applicationRef: 'agentic-economy',
    environment: 'sandbox' as const,
    scopes: ['market_operations:invoke'],
    authorityMode: 'inspect_only' as const,
    policy: defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 }),
    createdAt: now,
    expiresAt: now + 600_000,
  }
  const serviceAuth = await createCustomerRequestServiceAssertion({
    key: SERVICE_KEY,
    operation: REGISTER_OPERATION,
    command: toStableHashValue({ ...input, scopes: [...input.scopes] }),
    principal: {
      principalId: 'ae:server-function', ownerId: 'ae:server-function',
      credentialId: 'ae:server-function', scopes: ['market_operations:invoke'],
    },
    issuedAt: now,
  })
  const result = await owner.mutation(registerBinding, { ...input, serviceAuth })
  if (result.kind !== 'recorded' && result.kind !== 'replayed') throw new Error('buyer_binding_failed')
  const stored = await backend.run(async (ctx) => await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_credentialId', (index) => index.eq('credentialId', input.credentialId))
    .unique())
  if (stored === null) throw new Error('buyer_principal_missing')
  return {
    principalId: stored.principalId,
    ownerId: stored.ownerId,
    credentialId: stored.credentialId,
    applicationRef: stored.applicationRef,
    environment: stored.environment,
    scopes: [...stored.scopes],
    authorityMode: stored.authorityMode,
  }
}

async function invoke(
  backend: ConvexFixtureBackend,
  reference: typeof recordDemand,
  input: Record<string, unknown>,
) {
  return await backend.mutation(reference, await withSourceWrite('protected_action', input as never))
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
    const first = await issueBuyerAgent(backend, firstFixture.owner, 'user_market-demand-first')
    const second = await issueBuyerAgent(backend, secondFixture.owner, 'user_market-demand-second')
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

    await expect(invoke(backend, listDemand, {
      paginationOpts: { numItems: 20, cursor: null },
      agentPrincipal: first,
      operationKey: 'market-demand:list:first',
      correlationId: 'market-demand:list:first',
    })).resolves.toMatchObject({
      kind: 'available',
      requests: { page: [{ requestRef: recorded.requestRef, query: base.query }], isDone: true },
    })

    await expect(invoke(backend, readDemand, {
      requestRef: recorded.requestRef,
      agentPrincipal: second,
      operationKey: 'market-demand:read:other',
      correlationId: 'market-demand:read:other',
    })).resolves.toEqual({ kind: 'not_found' })
  })

  it('fails closed without protected source admission', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const fixture = await publishedBusinessOwner(backend, 'market-demand-unsigned')
    const principal = await issueBuyerAgent(backend, fixture.owner, 'user_market-demand-unsigned')
    await expect(backend.mutation(recordDemand, {
      query: 'missing unsigned job',
      idempotencyKey: 'unsigned',
      agentPrincipal: principal,
      operationKey: 'market-demand:unsigned',
      correlationId: 'market-demand:unsigned',
    })).resolves.toEqual({ kind: 'refused', code: 'unauthenticated' })
  })
})
