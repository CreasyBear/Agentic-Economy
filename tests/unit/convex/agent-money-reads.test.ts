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

const SERVICE_KEY = 'agent-money-read-test-key-32-bytes'
const REGISTER_OPERATION = 'agentAccessPrincipals.registerIssuedAgentBindingForServer'
const registerBinding = makeFunctionReference<'mutation', Record<string, unknown>, Record<string, unknown>>(
  'agentAccessPrincipals:registerIssuedAgentBindingForServer',
)
const readBalance = makeFunctionReference<'mutation', Record<string, unknown>, Record<string, unknown>>(
  'agentMoneyReads:balance',
)
const listActivity = makeFunctionReference<'mutation', Record<string, unknown>, Record<string, unknown>>(
  'agentMoneyReads:activity',
)

async function issueBuyerAgent(
  backend: ConvexFixtureBackend,
  owner: ReturnType<ConvexFixtureBackend['withIdentity']>,
  subject: string,
): Promise<AgentAccessPrincipal> {
  const now = Date.now()
  const issuanceKey = `buyer-money-${subject}`
  const input = {
    issuanceKey,
    grantRef: issuedAgentGrantRef(subject, issuanceKey),
    credentialId: `credential:${subject}`,
    displayName: 'Buyer money reader',
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
    .withIndex('by_credentialId', (query) => query.eq('credentialId', input.credentialId))
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

async function agentMoneyCommand(
  backend: ConvexFixtureBackend,
  reference: typeof readBalance,
  input: Record<string, unknown>,
) {
  return await backend.mutation(reference, await withSourceWrite('billing', input as never))
}

describe('buyer-agent money reads', () => {
  const previousServiceKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN

  beforeEach(() => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = SERVICE_KEY
  })

  afterEach(() => {
    if (previousServiceKey === undefined) delete process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
    else process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = previousServiceKey
  })

  it('reads exact credit and only the current credential activity', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const fixture = await publishedBusinessOwner(backend, 'agent-money-owner')
    const principal = await issueBuyerAgent(backend, fixture.owner, 'user_agent-money-owner')
    const now = Date.now()
    await backend.run(async (ctx) => {
      await ctx.db.insert('moneyAccounts', {
        accountRef: `operator:${principal.ownerId}:USD`,
        accountKind: 'operator_credit',
        accountId: principal.ownerId,
        currency: 'USD', exponent: 2, balanceUnits: '2500', heldUnits: '0', recoveryDueUnits: '0',
        version: 3, state: 'active', createdAt: now - 1_000, updatedAt: now,
      })
      await ctx.db.insert('moneyUsageEvents', {
        usageRef: 'usage:current', principalId: principal.principalId, accountId: principal.ownerId,
        credentialId: principal.credentialId, currency: 'USD', exponent: 2,
        serviceRef: 'service:one', offeringRef: 'offering:one', businessId: String(fixture.businessId),
        invocationRef: 'invocation:one', attemptRef: 'attempt:one', operationKey: 'operation:one',
        priceDigest: `sha256:${'a'.repeat(64)}`, chargeState: 'paid', amountUnits: '125', observedAt: now,
      })
      await ctx.db.insert('moneyUsageEvents', {
        usageRef: 'usage:sibling', principalId: principal.principalId, accountId: principal.ownerId,
        credentialId: 'credential:sibling', currency: 'USD', exponent: 2,
        serviceRef: 'service:two', offeringRef: 'offering:two', businessId: String(fixture.businessId),
        invocationRef: 'invocation:sibling', attemptRef: 'attempt:sibling', operationKey: 'operation:sibling',
        priceDigest: `sha256:${'b'.repeat(64)}`, chargeState: 'paid', amountUnits: '999', observedAt: now - 1,
      })
    })

    const balanceKey = 'agent-money:balance:one'
    await expect(agentMoneyCommand(backend, readBalance, {
      currency: 'USD', agentPrincipal: principal,
      operationKey: balanceKey, correlationId: balanceKey,
    })).resolves.toMatchObject({
      kind: 'available', accountRef: principal.ownerId,
      balance: { currency: 'USD', units: '2500', exponent: 2 },
      funding: { kind: 'owner_browser_required', path: '/owner/credit', anchor: 'fund' },
    })

    const activityKey = 'agent-money:activity:one'
    await expect(agentMoneyCommand(backend, listActivity, {
      currency: 'USD', paginationOpts: { numItems: 20, cursor: null }, agentPrincipal: principal,
      operationKey: activityKey, correlationId: activityKey,
    })).resolves.toMatchObject({
      kind: 'available',
      activity: { page: [{ activityRef: 'usage:current', invocationRef: 'invocation:one' }], isDone: true },
    })
  })

  it('fails closed without billing source admission', async () => {
    const backend = convexTestWithWorkers({ pauseWorkpool: true })
    const fixture = await publishedBusinessOwner(backend, 'agent-money-unsigned')
    const principal = await issueBuyerAgent(backend, fixture.owner, 'user_agent-money-unsigned')
    await expect(backend.mutation(readBalance, {
      currency: 'USD', agentPrincipal: principal,
      operationKey: 'agent-money:unsigned', correlationId: 'agent-money:unsigned',
    })).resolves.toEqual({ kind: 'error', code: 'unauthenticated' })
  })

  it.each([
    'owner',
    'member',
    'workload',
    'missing_workload',
    'stranger',
    'wrong_account',
    'stale_generation',
  ] as const)(
    'drives the %s isolation case through the registered buyer balance mutation without cross-principal disclosure',
    async (caseKind) => {
      const backend = convexTestWithWorkers({ pauseWorkpool: true })
      const fixture = await publishedBusinessOwner(backend, `agent-money-isolation-${caseKind}`)
      const validPrincipal = await issueBuyerAgent(
        backend,
        fixture.owner,
        `user_agent-money-isolation-${caseKind}`,
      )
      let agentPrincipal = validPrincipal
      if (caseKind === 'owner' || caseKind === 'member' || caseKind === 'missing_workload') {
        agentPrincipal = {
          ...validPrincipal,
          principalId: `principal:${caseKind}:interactive-only`,
          credentialId: `credential:${caseKind}:interactive-only`,
        }
      } else if (caseKind === 'stranger') {
        agentPrincipal = { ...validPrincipal, principalId: 'principal:stranger:unbound' }
      } else if (caseKind === 'wrong_account') {
        const other = await publishedBusinessOwner(backend, 'agent-money-isolation-other-account')
        agentPrincipal = { ...validPrincipal, ownerId: String(other.canonicalAccountRef) }
      } else if (caseKind === 'stale_generation') {
        await backend.run(async (ctx) => {
          const stored = await ctx.db.query('agentAccessPrincipals')
            .withIndex('by_principalId', (query) => query.eq('principalId', validPrincipal.principalId))
            .unique()
          if (stored === null) throw new Error('agent_money_isolation_principal_missing')
          await ctx.db.patch(stored._id, { grantGeneration: stored.grantGeneration + 1 })
        })
      }

      const operationKey = `agent-money:isolation:${caseKind}`
      const result = await backend.mutation(readBalance, await withSourceWrite('billing', {
        currency: 'USD', agentPrincipal, operationKey, correlationId: operationKey,
      }))
      expect(result).toEqual(caseKind === 'workload'
        ? { kind: 'not_found' }
        : { kind: 'error', code: 'unauthenticated' })
    },
  )
})
