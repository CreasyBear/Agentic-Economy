import { anyApi } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import { defaultSandboxAgentAccessPolicy } from '@/modules/agent-access/sandbox-policy'
import { CUSTOMER_REQUEST_READ_ONLY_SCOPE, MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import { evaluateCommercialPolicyGate } from '@/modules/money/public'
import { convexTestWithMarketComponents, createTestAgentPrincipal, publishedBusinessOwner } from '../helpers/convex-fixtures'
import { issueBuyerAgent } from '../helpers/issued-buyer-agent'
import { withSourceWrite } from '../helpers/source-write-admission'
import { seedPaymentReadiness, seedTreasuryReadinessFacts } from '../helpers/payment-readiness-fixture'
import {
  formanceSnapshot, observeHealthyReadiness, prepareSubjects, publishCurrentTool,
  seedAgent, seedCommercialPolicies, recordTreasuryObservation, withCustodyEnvironment, validCustodyEnvironment,
} from '../helpers/quote-fixtures'

const reserve = anyApi.moneyAccountFunding?.reserve
const reserveAgentHandoff = anyApi.moneyAccountFunding?.reserveAgentHandoff
if (reserve === undefined || reserveAgentHandoff === undefined) throw new Error('funding_registrations_missing')

const serviceKey = 'production-isolation-service-test-key-32-bytes'
const sandboxGate = evaluateCommercialPolicyGate({
  environment: 'sandbox', now: 0, approvals: [], sandboxFixture: 'managed_x402_deterministic_v1',
})
if (sandboxGate.kind !== 'admitted') throw new Error('sandbox_policy_fixture_missing')

beforeEach(() => {
  vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
  vi.stubEnv('AE_FORMANCE_ENVIRONMENT', 'production')
  vi.stubEnv('AE_CONVEX_SERVER_FUNCTION_TOKEN', serviceKey)
  for (const [name, value] of Object.entries(validCustodyEnvironment)) vi.stubEnv(name, value)
  vi.stubEnv('AE_X402_CUSTODY_PAYEE_DAILY_MAX_ATOMIC', '100000')
  vi.stubEnv('AE_X402_CUSTODY_NEW_PAYEE_MAX_ATOMIC', '100000')
})
afterEach(() => { vi.unstubAllEnvs() })

describe('production financial boundary isolation', () => {
  it('refuses a canonical sandbox principal and independently a sandbox Tool before Quote material', async () => {
    const backend = convexTestWithMarketComponents()
    const suffix = 'production-isolation-quote'
    const tool = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const buyer = await seedAgent(backend, { canonicalAccountRef: tool.accountRef }, tool.toolRef, suffix, '20000000')
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    const sandboxBuyer = await createTestAgentPrincipal(backend, `${suffix}-sandbox`, {
      environment: 'sandbox', spendUnits: '20000000', resourceRefs: [tool.toolRef],
    })
    const sandboxTool = await publishCurrentTool(backend, `${suffix}-sandbox-tool`, 'sandbox')
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    const sandboxToolBuyer = await seedAgent(backend, { canonicalAccountRef: tool.accountRef },
      sandboxTool.toolRef, `${suffix}-tool-buyer`, '20000000')
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, tool, suffix)
    await observeHealthyReadiness(backend, sandboxTool, `${suffix}-sandbox-tool`)
    await seedTreasuryReadinessFacts(backend, { observation: 'create' })
    await seedPaymentReadiness(backend)
    const input = { request: 'Perth' }
    const subjects = await prepareSubjects(backend, buyer, tool.toolRef, input, suffix)
    expect(subjects.kind).toBe('prepared') // same-world authority and financial subjects are valid

    const sandboxPrepare = await backend.mutation(internal.capabilityQuotes.prepareFinancialSubjects,
      await withSourceWrite('protected_action', {
        operationKey: `${suffix}:sandbox-principal:prepare`, correlationId: `${suffix}:sandbox-principal:prepare`,
        principal: sandboxBuyer.principal, toolRef: tool.toolRef, input,
      }))
    expect(sandboxPrepare).toMatchObject({ kind: 'refused', code: 'tool_unsupported' })
    const sandboxIssue = await backend.mutation(internal.capabilityQuotes.issueQuote, {
      operationKey: `${suffix}:sandbox-principal:issue`, correlationId: `${suffix}:sandbox-principal:issue`,
      principal: sandboxBuyer.principal, toolRef: tool.toolRef, input, formance: formanceSnapshot(subjects),
    })
    expect(sandboxIssue).toMatchObject({ kind: 'refused', code: 'tool_unsupported', retryable: false })

    const toolPrepare = await backend.mutation(internal.capabilityQuotes.prepareFinancialSubjects,
      await withSourceWrite('protected_action', {
        operationKey: `${suffix}:sandbox-tool:prepare`, correlationId: `${suffix}:sandbox-tool:prepare`,
        principal: sandboxToolBuyer.principal, toolRef: sandboxTool.toolRef, input,
      }))
    expect(toolPrepare).toMatchObject({ kind: 'refused', code: 'tool_unsupported' })
    const toolIssue = await backend.mutation(internal.capabilityQuotes.issueQuote, {
      operationKey: `${suffix}:sandbox-tool:issue`, correlationId: `${suffix}:sandbox-tool:issue`,
      principal: sandboxToolBuyer.principal, toolRef: sandboxTool.toolRef, input, formance: formanceSnapshot(subjects),
    })
    expect(toolIssue).toMatchObject({ kind: 'refused', code: 'tool_unsupported', retryable: false })
    expect(await backend.run(ctx => ctx.db.query('capabilityQuotes').collect())).toEqual([])
  })

  it('withholds treasury capacity when the latest production observation is stale', async () => {
    const backend = convexTestWithMarketComponents()
    const suffix = 'production-isolation-treasury'
    const tool = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const buyer = await seedAgent(backend, { canonicalAccountRef: tool.accountRef }, tool.toolRef, suffix, '20000000')
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, tool, suffix)
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    try {
      await recordTreasuryObservation(backend, suffix, { observedAt: now - 30 * 60_000 })
      const observationBefore = await backend.run(ctx => ctx.db.query('moneyTreasuryObservations').collect())
      // The current production gate rejects this observation before Quote
      // subjects, even at the former thirty-minute capacity boundary.
      const atFormerBoundary = await withCustodyEnvironment(async () => {
        await seedTreasuryReadinessFacts(backend, { observation: 'preserve', availableUnits: '9000000' })
        await seedPaymentReadiness(backend)
        return await backend.mutation(internal.capabilityQuotes.prepareFinancialSubjects,
          await withSourceWrite('protected_action', {
            operationKey: `${suffix}:boundary:prepare`, correlationId: `${suffix}:boundary:prepare`,
            principal: buyer.principal, toolRef: tool.toolRef, input: { request: 'Perth' },
          }))
      })
      expect(atFormerBoundary).toMatchObject({ kind: 'refused', code: 'payments_not_ready' })
      clock.mockReturnValue(now + 1)
      const stale = await withCustodyEnvironment(async () => {
        await seedTreasuryReadinessFacts(backend, { observation: 'preserve', availableUnits: '9000000' })
        await seedPaymentReadiness(backend)
        return await backend.mutation(internal.capabilityQuotes.prepareFinancialSubjects,
          await withSourceWrite('protected_action', {
            operationKey: `${suffix}:stale:prepare`, correlationId: `${suffix}:stale:prepare`,
            principal: buyer.principal, toolRef: tool.toolRef, input: { request: 'Perth' },
          }))
      })
      expect(stale).toMatchObject({ kind: 'refused', code: 'payments_not_ready' })
      expect(stale).not.toHaveProperty('treasury')
      expect(await backend.run(ctx => ctx.db.query('moneyTreasuryObservations').collect())).toEqual(observationBefore)
      expect(await backend.run(ctx => ctx.db.query('capabilityQuotes').collect())).toEqual([])
      expect(await backend.run(ctx => ctx.db.query('capabilityCalls').collect())).toEqual([])
      expect(await backend.run(ctx => ctx.db.query('moneyProviderObligations').collect())).toEqual([])
      expect(await backend.run(ctx => ctx.db.query('moneyX402PaymentAttempts').collect())).toEqual([])
      expect(await backend.run(ctx => ctx.db.query('moneyX402SpendReservations').collect())).toEqual([])
    } finally {
      clock.mockRestore()
    }
  })

  it('keeps an issued Quote intact when the Call deployment no longer admits its environment', async () => {
    const backend = convexTestWithMarketComponents()
    const suffix = 'production-isolation-call'
    const tool = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const buyer = await seedAgent(backend, { canonicalAccountRef: tool.accountRef }, tool.toolRef, suffix, '20000000')
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, tool, suffix)
    const input = { request: 'Perth' }
    await seedTreasuryReadinessFacts(backend, { observation: 'create' })
    await seedPaymentReadiness(backend)
    const subjects = await prepareSubjects(backend, buyer, tool.toolRef, input, suffix)
    const quote = await backend.mutation(internal.capabilityQuotes.issueQuote, {
      operationKey: `${suffix}:issue`, correlationId: `${suffix}:issue`, principal: buyer.principal,
      toolRef: tool.toolRef, input, formance: formanceSnapshot(subjects),
    })
    expect(quote.kind).toBe('committed')
    if (quote.kind !== 'committed') throw new Error('baseline_quote_missing')
    const before = await backend.run(ctx => ctx.db.query('capabilityQuotes').collect())
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    const refused = await backend.action(api.capabilityCalls.call, await withSourceWrite('protected_action', {
      operationKey: `${suffix}:call`, correlationId: `${suffix}:call`, principal: buyer.principal,
      quoteRef: quote.quoteRef, idempotencyKey: `${suffix}:call`,
    }))
    expect(refused).toMatchObject({ kind: 'refused', code: 'environment_mismatch', retryable: false })
    expect(await backend.run(ctx => ctx.db.query('capabilityQuotes').collect())).toEqual(before)
    expect(await backend.run(ctx => ctx.db.query('capabilityCalls').collect())).toEqual([])
  })

  it('refuses sandbox owner and agent funding before commands', async () => {
    const backend = convexTestWithMarketComponents()
    const owner = await publishedBusinessOwner(backend, 'production-isolation-funding')
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    const agent = await issueBuyerAgent(backend, owner.owner, 'user_production-isolation-funding', {
      serviceKey, issuanceKey: 'production-isolation-funding', registration: {
        displayName: 'Sandbox funding buyer', applicationRef: 'agentic-economy', environment: 'sandbox',
        scopes: [MARKET_TOOLS_CALL_SCOPE, CUSTOMER_REQUEST_READ_ONLY_SCOPE], authorityMode: 'read_only',
        toolAccess: 'all_admitted', toolRefs: [],
        spendingPolicy: defaultSandboxAgentAccessPolicy({ currency: 'AUD', exponent: 6 }),
      },
    })
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    const ownerInput = {
      amountUnits: '5000000', environment: 'sandbox' as const, expectedPolicyDigest: sandboxGate.policyDigest,
      commandRef: 'account-funding:production-isolation', idempotencyKey: 'account-funding:production-isolation',
      inputDigest: `sha256:${'a'.repeat(64)}`, successReturnRef: 'owner/credit',
      operationKey: 'moneyAccountFunding:reserve', correlationId: 'account-funding:production-isolation',
    }
    expect(await owner.owner.mutation(reserve, await withSourceWrite('billing', ownerInput)))
      .toMatchObject({ kind: 'refused', code: 'environment_mismatch', retryable: false })
    expect(await backend.mutation(reserveAgentHandoff, await withSourceWrite('billing', {
      principalAmountUnits: '5000000', environment: 'sandbox', idempotencyKey: 'production-isolation-agent-funding',
      successReturnRef: 'https://ae.test/fund/{CHECKOUT_SESSION_ID}',
      cancelReturnRef: 'https://ae.test/fund/cancelled',
      checkoutExpiresAt: (Math.floor(Date.now() / 1000) + 3600) * 1000,
      agentPrincipal: agent.principal, operationKey: 'moneyAccountFunding:reserveAgentHandoff',
      correlationId: 'production-isolation-agent-funding',
    }))).toMatchObject({ kind: 'refused', code: 'environment_mismatch', retryable: false })
    expect(await backend.run(ctx => ctx.db.query('moneyFundingCommands').collect())).toEqual([])
  })
})
