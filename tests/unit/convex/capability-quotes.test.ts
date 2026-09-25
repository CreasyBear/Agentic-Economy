import { describe, expect, it, vi } from 'vitest'
import { encodePaymentRequiredHeader } from '@x402/core/http'
import * as networkServer from '@/modules/network-guard/server'
import * as networkPublic from '@/modules/network-guard/public'

import { admitDiscoveredToolFixture } from '../../helpers/discovered-tool-fixture'
import { inspectLiveX402Requirement } from '@/modules/capability-execution/live-x402-requirement'
import { readManagedX402InspectionTarget } from '../../../convex/lib/capabilitySupply/currentTool/inspection'
import { quote } from '../../../convex/capabilityQuotes'
import { projectToolQuoteRefusal } from '@/modules/capability-execution/quote'
import { api, internal } from '../../../convex/_generated/api'
import { ACTIVE_CHAT_GENERATION_MS } from '../../../convex/chatThreads'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { splitInclusiveAudTax, PACKAGE4_FORMANCE_REQUIREMENTS } from '@/modules/money/public'
import {
  convexTestWithMarketComponents,
  publishedBusinessOwner,
} from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'
import { PRODUCTION_COMMERCIAL_POLICY_CONTROLS } from '../../helpers/commercial-policy-fixtures'

import {
  activeCustodyRef,
  activeCustodyGeneration,
  activeCustodyNetwork,
  withCustodyEnvironment,
  recordTreasuryObservation,
  insertMalformedTreasuryObservation,
  testRef,
  publishCurrentTool,
  observeHealthyReadiness,
  seedCommercialPolicies,
  seedAgent,
  prepareSubjects,
  type QuotePrincipal,
  formanceSnapshot,
} from '../../helpers/quote-fixtures'

describe('legal customer binding refusals', () => {
  it('forwards legal_customer_required when the legal customer cannot be bound', async () => {
    const backend = convexTestWithMarketComponents()
    const suffix = 'quote-legal-customer'
    const fixture = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const owner = { canonicalAccountRef: fixture.accountRef }
    const input = { request: 'Perth' }
    const agent = await seedAgent(backend, owner, fixture.toolRef, suffix, '20000000')
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, fixture, suffix)
    await prepareSubjects(backend, agent, fixture.toolRef, input, suffix)

    // Rebinding is blocked, so `resolveAndBindLegalCustomer` refuses.
    await backend.run(async (ctx) => {
      const binding = await ctx.db.query('moneyLegalCustomerBindings')
        .withIndex('by_accountRef', (query) => query.eq('accountRef', fixture.accountRef))
        .unique()
      if (binding === null) throw new Error('quote_legal_customer_binding_missing')
      await ctx.db.patch(binding._id, { legalCustomerRef: 'principal:someone-else' })
    })

    const refused = await backend.mutation(
      internal.capabilityQuotes.prepareFinancialSubjects,
      await withSourceWrite('protected_action', {
        operationKey: `test:quote:prepare:${suffix}:blocked`,
        correlationId: `test:quote:prepare:${suffix}:blocked`,
        principal: agent.principal,
        toolRef: fixture.toolRef,
        input,
      }),
    )

    expect(refused).toMatchObject({
      kind: 'refused',
      code: 'commercial_policy_unavailable',
      reason: 'legal_customer_required',
    })

    const projected = projectToolQuoteRefusal({
      toolRef: fixture.toolRef,
      input,
      code: 'commercial_policy_unavailable',
      retryable: true,
      correlationRef: `test:quote:prepare:${suffix}:blocked`,
      ...(refused.kind === 'refused' && refused.reason !== undefined
        ? { reason: refused.reason }
        : {}),
    })
    expect(projected.continuation?.action).toBe('funding.handoff.config')
  })
})

describe('trusted chat Quote cancellation fence', () => {
  it.each(['cancel-first', 'issue-first'] as const)('%s serializes Quote issuance and cancellation', async (order) => {
    const backend = convexTestWithMarketComponents()
    const suffix = `quote-turn-${order}`
    const fixture = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const agent = await seedAgent(backend, { canonicalAccountRef: fixture.accountRef }, fixture.toolRef, suffix, '20000000')
    await backend.run(async ctx => {
      const grant = await ctx.db.query('authorityDelegationGrants')
        .withIndex('by_grantRef', q => q.eq('grantRef', agent.grant.grantRef)).unique()
      if (grant === null) throw new Error('quote_turn_delegation_missing')
      await ctx.db.patch(grant._id, { resourceRefs: ['*', fixture.toolRef] })
    })
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, fixture, suffix)
    const input = { request: 'Perth' }
    const subjects = await prepareSubjects(backend, agent, fixture.toolRef, input, suffix)
    const principal = { kind: 'agent_key' as const, ...agent.principal }
    const turn = await backend.mutation(api.chatTurns.startTurn, await withSourceWrite('protected_action', {
      principal, clientTurnId: suffix, prompt: 'Quote a Tool',
      operationKey: `turn:start:${suffix}`, correlationId: `turn:start:${suffix}`,
    }))
    expect(await backend.mutation(internal.chatTurns.finishTurn, {
      turnRef: turn.turnRef, promptMessageId: turn.promptMessageId, state: 'working',
    })).toBe(true)
    const issueArgs = {
      operationKey: `quote:issue:${suffix}`, correlationId: `quote:issue:${suffix}`,
      principal: agent.principal, toolRef: fixture.toolRef, input,
      formance: formanceSnapshot(subjects), turnRef: turn.turnRef,
    }
    const cancelArgs = {
      principal, turnRef: turn.turnRef, operationKey: `turn:cancel:${suffix}`,
      correlationId: `turn:cancel:${suffix}`,
    }
    if (order === 'cancel-first') {
      expect(await backend.mutation(api.chatTurns.cancelTurn,
        await withSourceWrite('protected_action', cancelArgs)))
        .toEqual({ kind: 'stopped', turnRef: turn.turnRef, inFlightEffects: [] })
      expect(await backend.mutation(internal.capabilityQuotes.issueQuote, issueArgs))
        .toMatchObject({ kind: 'refused', code: 'grant_not_found', retryable: false })
      expect(await backend.run(ctx => ctx.db.query('capabilityQuotes').take(1))).toEqual([])
    } else {
      const result = await backend.mutation(internal.capabilityQuotes.issueQuote, issueArgs)
      expect(result.kind).toBe('committed')
      if (result.kind !== 'committed') throw new Error(`quote_issue_refused:${result.code}`)
      expect(await backend.mutation(api.chatTurns.cancelTurn,
        await withSourceWrite('protected_action', cancelArgs)))
        .toEqual({ kind: 'stopped', turnRef: turn.turnRef, inFlightEffects: [] })
      expect(await backend.run(ctx => ctx.db.query('capabilityQuotes')
        .withIndex('by_quoteRef', q => q.eq('quoteRef', result.quoteRef)).unique()))
        .toMatchObject({ quoteRef: result.quoteRef, state: 'issued' })
    }
    expect(await backend.run(ctx => ctx.db.query('chatTurns')
      .withIndex('by_turnRef', q => q.eq('turnRef', turn.turnRef)).unique()))
      .toMatchObject({ state: 'canceled' })
  })

  it.each(['supersede-first', 'issue-first'] as const)(
    'a superseded Turn cannot issue a Quote (%s)',
    async order => {
      const backend = convexTestWithMarketComponents()
      const suffix = `quote-stale-${order}`
      const fixture = await publishCurrentTool(backend, suffix)
      await seedCommercialPolicies(backend, suffix, Date.now())
      const agent = await seedAgent(backend, { canonicalAccountRef: fixture.accountRef },
        fixture.toolRef, suffix, '20000000')
      await backend.run(async ctx => {
        const grant = await ctx.db.query('authorityDelegationGrants')
          .withIndex('by_grantRef', q => q.eq('grantRef', agent.grant.grantRef)).unique()
        if (grant === null) throw new Error('quote_turn_delegation_missing')
        await ctx.db.patch(grant._id, { resourceRefs: ['*', fixture.toolRef] })
      })
      await backend.finishAllScheduledFunctions(() => undefined)
      await observeHealthyReadiness(backend, fixture, suffix)
      const input = { request: 'Perth' }
      const subjects = await prepareSubjects(backend, agent, fixture.toolRef, input, suffix)
      const principal = { kind: 'agent_key' as const, ...agent.principal }
      const turn = await backend.mutation(api.chatTurns.startTurn, await withSourceWrite('protected_action', {
        principal, clientTurnId: suffix, prompt: 'Quote a Tool',
        operationKey: `turn:start:${suffix}`, correlationId: `turn:start:${suffix}`,
      }))
      expect(await backend.mutation(internal.chatTurns.finishTurn, {
        turnRef: turn.turnRef, promptMessageId: turn.promptMessageId, state: 'working',
      })).toBe(true)
      const issueArgs = {
        operationKey: `quote:issue:${suffix}`, correlationId: `quote:issue:${suffix}`,
        principal: agent.principal, toolRef: fixture.toolRef, input,
        formance: formanceSnapshot(subjects), turnRef: turn.turnRef,
      }
      const issued = order === 'issue-first'
        ? await backend.mutation(internal.capabilityQuotes.issueQuote, issueArgs) : null
      if (issued !== null) expect(issued.kind).toBe('committed')
      await backend.run(async ctx => {
        const thread = await ctx.db.query('chatThreads')
          .withIndex('by_threadId', q => q.eq('threadId', turn.threadId)).unique()
        if (thread === null) throw new Error('thread_missing')
        await ctx.db.patch(thread._id, { activeStartedAt: Date.now() - ACTIVE_CHAT_GENERATION_MS - 1 })
      })
      const next = await backend.mutation(api.chatTurns.startTurn, await withSourceWrite('protected_action', {
        principal, threadId: turn.threadId, clientTurnId: `next-${suffix}`, prompt: 'New Quote intent',
        operationKey: `turn:next:${suffix}`, correlationId: `turn:next:${suffix}`,
      }))
      expect(next.promptMessageId).not.toBe(turn.promptMessageId)
      expect(await backend.run(ctx => ctx.db.query('chatTurns')
        .withIndex('by_turnRef', q => q.eq('turnRef', turn.turnRef)).unique()))
        .toMatchObject({ state: 'canceled', cancelRequestedAt: expect.any(Number) })
      expect(await backend.mutation(internal.capabilityQuotes.issueQuote, issueArgs))
        .toMatchObject({ kind: 'refused', code: 'grant_not_found', retryable: false })
      await backend.run(async ctx => {
        const old = await ctx.db.query('chatTurns')
          .withIndex('by_turnRef', q => q.eq('turnRef', turn.turnRef)).unique()
        if (old === null) throw new Error('turn_missing')
        await ctx.db.patch(old._id, { state: 'working', cancelRequestedAt: undefined })
      })
      expect(await backend.mutation(internal.capabilityQuotes.issueQuote, issueArgs))
        .toMatchObject({ kind: 'refused', code: 'grant_not_found', retryable: false })
      const quotes = await backend.run(ctx => ctx.db.query('capabilityQuotes').collect())
      expect(quotes).toHaveLength(order === 'issue-first' ? 1 : 0)
      if (issued?.kind === 'committed') expect(quotes[0]?.quoteRef).toBe(issued.quoteRef)
    },
  )

  it('refuses mismatched and terminal Turns without writing Quote material', async () => {
    const backend = convexTestWithMarketComponents()
    const suffix = 'quote-turn-invalid'
    const fixture = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const agent = await seedAgent(backend, { canonicalAccountRef: fixture.accountRef }, fixture.toolRef, suffix, '20000000')
    await backend.run(async ctx => {
      const grant = await ctx.db.query('authorityDelegationGrants')
        .withIndex('by_grantRef', q => q.eq('grantRef', agent.grant.grantRef)).unique()
      if (grant === null) throw new Error('quote_turn_delegation_missing')
      await ctx.db.patch(grant._id, { resourceRefs: ['*', fixture.toolRef] })
    })
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, fixture, suffix)
    const input = { request: 'Perth' }
    const subjects = await prepareSubjects(backend, agent, fixture.toolRef, input, suffix)
    const principal: QuotePrincipal & { kind: 'agent_key' } = { kind: 'agent_key', ...agent.principal }
    const turn = await backend.mutation(api.chatTurns.startTurn, await withSourceWrite('protected_action', {
      principal, clientTurnId: suffix, prompt: 'Quote a Tool',
      operationKey: `turn:start:${suffix}`, correlationId: `turn:start:${suffix}`,
    }))
    expect(await backend.mutation(internal.chatTurns.finishTurn, {
      turnRef: turn.turnRef, promptMessageId: turn.promptMessageId, state: 'working',
    })).toBe(true)
    const stored = await backend.run(ctx => ctx.db.query('chatTurns')
      .withIndex('by_turnRef', q => q.eq('turnRef', turn.turnRef)).unique())
    if (stored === null) throw new Error('quote_turn_missing')
    for (const patch of [
      { principalRef: 'wrong-principal' }, { accountRef: 'wrong-account' },
      { credentialLocator: 'wrong-credential' }, { grantRef: 'wrong-grant' },
      { state: 'submitted' as const }, { state: 'input-required' as const },
      { state: 'auth-required' as const }, { state: 'completed' as const },
      { state: 'failed' as const }, { state: 'rejected' as const },
    ]) {
      await backend.run(ctx => ctx.db.patch(stored._id, patch))
      expect(await backend.mutation(internal.capabilityQuotes.issueQuote, {
        operationKey: `quote:issue:${suffix}`, correlationId: `quote:issue:${suffix}`,
        principal: agent.principal, toolRef: fixture.toolRef, input,
        formance: formanceSnapshot(subjects), turnRef: turn.turnRef,
      })).toMatchObject({ kind: 'refused', code: 'grant_not_found', retryable: false })
      expect(await backend.run(ctx => ctx.db.query('capabilityQuotes').take(1))).toEqual([])
      await backend.run(ctx => ctx.db.patch(stored._id, {
        principalRef: stored.principalRef, accountRef: stored.accountRef,
        credentialLocator: stored.credentialLocator, grantRef: stored.grantRef,
        state: stored.state,
      }))
    }
  })
})

describe('direct Quote handlers', () => {
  it.each(['missing', 'changed', 'interactive_identity'] as const)('does not retry %s admission or contact a Provider', async (admission) => {
    const backend = convexTestWithMarketComponents()
    const command = {
      operationKey: 'chat-quote-admission', correlationId: 'chat-quote-admission',
      principal: {
        principalId: `prn_${'1'.repeat(32)}`, ownerId: `acc_${'2'.repeat(32)}`,
        credentialId: 'interactive-chat', applicationRef: 'interactive-chat',
        environment: 'sandbox' as const, scopes: ['market_tools:call'],
        authorityMode: 'approval_required' as const,
      },
      toolRef: `operation:v1:${'a'.repeat(64)}`, input: { request: 'Perth' },
    }
    const args = admission === 'missing' ? command : {
      ...await withSourceWrite('protected_action', command),
      ...(admission === 'changed' ? { input: { request: 'changed' } } : {}),
    }
    const upstream = vi.fn(async () => { throw new Error('unadmitted_quote_reached_provider') })
    const handler = (quote as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler
    const result = await handler({ runMutation: backend.mutation, runAction: upstream }, args)
    expect(result).toMatchObject({
      kind: 'refused', retryable: false,
      ...(admission === 'interactive_identity'
        ? { code: 'grant_not_found', requiredActions: [{ cta: '/agent-access' }] }
        : {
            code: 'inspection_unavailable',
            reason: admission === 'missing' ? 'missing_source_write_admission' : 'source_write_command_mismatch',
            requiredActions: [{ cta: '/support' }],
          }),
    })
    expect(result).not.toHaveProperty('continuation')
    expect(upstream).not.toHaveBeenCalled()
    expect(await backend.run(ctx => ctx.db.query('capabilityQuotes').take(1))).toEqual([])
    expect(await backend.run(ctx => ctx.db.query('capabilityCalls').take(1))).toEqual([])
  })

  it('refuses shared legal-account exposure without issuing a Quote or advising a top-up', async () => {
    const backend = convexTestWithMarketComponents()
    const suffix = 'quote-account-exposure'
    const fixture = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const agent = await seedAgent(backend, { canonicalAccountRef: fixture.accountRef }, fixture.toolRef, suffix, '20000000')
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, fixture, suffix)
    const input = { request: 'Perth' }
    const subjects = await prepareSubjects(backend, agent, fixture.toolRef, input, suffix)
    const result = await backend.mutation(internal.capabilityQuotes.issueQuote, {
      operationKey: `${suffix}:issue`, correlationId: `${suffix}:issue`,
      principal: agent.principal, toolRef: fixture.toolRef, input,
      formance: { ...formanceSnapshot(subjects), legalExposureAvailableUnits: '0' },
    })
    expect(result).toMatchObject({ kind: 'refused', code: 'budget_exceeded', reason: 'account_limit' })
    expect(await backend.run(ctx => ctx.db.query('capabilityQuotes').take(1))).toEqual([])
    expect(await backend.run(ctx => ctx.db.query('capabilityCalls').take(1))).toEqual([])
    const projected = projectToolQuoteRefusal({ toolRef: fixture.toolRef, input,
      code: 'budget_exceeded', retryable: false, reason: 'account_limit', correlationRef: suffix })
    expect(projected.continuation?.action).not.toBe('funding.handoff.config')
    expect(projected.requiredActions).toMatchObject([{ action: 'review_account_exposure', cta: '/support' }])
  })

  it('refuses issueQuote when organization monthly spend ceiling would be exceeded', async () => {
    const backend = convexTestWithMarketComponents()
    const suffix = 'quote-org-monthly-ceiling'
    const fixture = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const agent = await seedAgent(backend, { canonicalAccountRef: fixture.accountRef }, fixture.toolRef, suffix, '20000000')
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, fixture, suffix)
    const input = { request: 'Perth' }
    const subjects = await prepareSubjects(backend, agent, fixture.toolRef, input, suffix)
    const result = await backend.mutation(internal.capabilityQuotes.issueQuote, {
      operationKey: `${suffix}:issue`, correlationId: `${suffix}:issue`,
      principal: agent.principal, toolRef: fixture.toolRef, input,
      formance: {
        ...formanceSnapshot(subjects),
        organizationMonthlySpend: {
          enabled: true,
          ceilingUnits: '1',
          monthSpendUnits: '0',
        },
      },
    })
    expect(result).toMatchObject({
      kind: 'refused',
      code: 'budget_exceeded',
      reason: 'organization_monthly_ceiling',
    })
    expect(await backend.run(ctx => ctx.db.query('capabilityQuotes').take(1))).toEqual([])
  })

  it('refuses production Quote preparation and issuance in hosted alpha before upstream actions', async () => {
    const backend = convexTestWithMarketComponents()
    const suffix = 'quote-hosted-alpha'
    const fixture = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const agent = await seedAgent(backend, { canonicalAccountRef: fixture.accountRef }, fixture.toolRef, suffix, '20000000')
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, fixture, suffix)
    const input = { request: 'Perth' }
    const subjects = await prepareSubjects(backend, agent, fixture.toolRef, input, suffix)
    const upstream = vi.fn(async () => { throw new Error('production_quote_upstream_released') })
    const handler = (quote as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler
    vi.stubEnv('AE_SERVICE_MODE', 'hosted_alpha')
    try {
      const args = { principal: agent.principal, toolRef: fixture.toolRef, input,
        operationKey: `${suffix}:blocked`, correlationId: `${suffix}:blocked` }
      await expect(handler({ runMutation: backend.mutation, runAction: upstream },
        await withSourceWrite('protected_action', args))).resolves.toMatchObject({
        kind: 'refused', code: 'tool_unsupported',
      })
      await expect(backend.mutation(internal.capabilityQuotes.issueQuote, {
        ...args, formance: formanceSnapshot(subjects),
      })).resolves.toMatchObject({ kind: 'refused', code: 'tool_unsupported', retryable: false })
      expect(upstream).not.toHaveBeenCalled()
    } finally { vi.unstubAllEnvs() }
  })

  it('refuses issuance when the current Tool environment changes after Quote preparation', async () => {
    const backend = convexTestWithMarketComponents()
    const suffix = 'quote-environment-drift'
    const fixture = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const agent = await seedAgent(backend, { canonicalAccountRef: fixture.accountRef }, fixture.toolRef, suffix, '20000000')
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, fixture, suffix)
    const input = { request: 'Perth' }
    const subjects = await prepareSubjects(backend, agent, fixture.toolRef, input, suffix)

    await backend.run(async ctx => {
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_toolRef_and_disposition', q => q.eq('toolRef', fixture.toolRef).eq('disposition', 'current'))
        .unique()
      if (publication === null) throw new Error('quote_drift_publication_missing')
      expect(publication.runtimeEnvironment).toBe('production')
      await ctx.db.patch(publication._id, { runtimeEnvironment: 'sandbox' })
    })

    await expect(backend.mutation(internal.capabilityQuotes.issueQuote, {
      operationKey: `${suffix}:issue`, correlationId: `${suffix}:issue`,
      principal: agent.principal, toolRef: fixture.toolRef, input,
      formance: formanceSnapshot(subjects),
    })).resolves.toMatchObject({
      kind: 'refused', code: 'tool_unsupported', retryable: false,
      reason: 'The current Tool environment is not permitted for this purchase.',
    })
    expect(await backend.run(ctx => ctx.db.query('capabilityQuotes').take(1))).toEqual([])
  })

  it('issues current Quote material, projects policy, refuses stale budgets and per-Call limits, and preserves identities', async () => {
    const backend = convexTestWithMarketComponents()
    const suffix = 'quote-handler'
    const fixture = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const owner = { canonicalAccountRef: fixture.accountRef }

    const input = { request: 'Perth' }
    const agent = await seedAgent(backend, owner, fixture.toolRef, suffix, '20000000')
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, fixture, suffix)
    const subjects = await prepareSubjects(backend, agent, fixture.toolRef, input, suffix)
    expect(subjects.budgetGeneration).toBe(agent.grant.generation)
    expect(subjects.budgetUnits).toBe(agent.policy.budget.maximumMonthlySpend.units)
    expect(subjects.policyGeneration).toBe(1)

    const issueCorrelationId = `test:quote:issue:${suffix}`
    const issued = await backend.mutation(internal.capabilityQuotes.issueQuote, {
      operationKey: `test:quote:issue:${suffix}`,
      correlationId: issueCorrelationId,
      principal: agent.principal,
      toolRef: fixture.toolRef,
      input,
      formance: formanceSnapshot(subjects),
    })
    expect(issued.kind).toBe('committed')
    if (issued.kind !== 'committed') throw new Error(`quote_issue_refused:${issued.code}`)
    expect(issued.parties).toEqual({
      seller: 'Agentic Economy',
      provider: expect.any(String),
      paymentRecipient: expect.any(String),
    })

    const stored = await backend.run(async (ctx) => await ctx.db.query('capabilityQuotes')
      .withIndex('by_quoteRef', (query) => query.eq('quoteRef', issued.quoteRef))
      .unique())
    expect(stored).not.toBeNull()
    if (stored === null) throw new Error('quote_persistence_missing')
    expect(stored).toMatchObject({
      quoteRef: issued.quoteRef,
      principalId: agent.principal.principalId,
      accountRef: agent.principal.ownerId,
      credentialId: agent.principal.credentialId,
      toolRef: fixture.toolRef,
      toolVersion: issued.toolVersion,
      toolMaterialDigest: expect.any(String),
      currentToolDigest: expect.any(String),
      budgetPolicyRef: agent.policy.budget.budgetPolicyRef,
      budgetGeneration: agent.policy.budget.generation,
      maximumSpendPerCallUnits: agent.policy.budget.maximumSpendPerCall.units,
      state: 'issued',
    })
    expect(stored.commercialPolicyDigest).toBe(subjects.policyDigest)

    const sale = splitInclusiveAudTax(stored.decisionAudUnits, subjects.buyerTaxBps)
    if (sale === undefined) throw new Error('quote_tax_split_missing')
    const evidenceMaterial = {
      format: 'ae.operation-commitment:v1',
      principalId: agent.principal.principalId,
      accountRef: agent.principal.ownerId,
      credentialId: agent.principal.credentialId,
      grantRef: agent.grant.grantRef,
      grantGeneration: agent.grant.generation,
      grantPolicyDigest: agent.grant.spendingPolicyDigest,
      operationRef: fixture.toolRef,
      operationRevision: stored.toolVersion,
      operationMaterialDigest: stored.toolMaterialDigest,
      currentOperationDigest: stored.currentToolDigest,
      inputDigest: canonicalDigest(input),
      pricingDigest: stored.pricingDigest,
      decisionAudUnits: stored.decisionAudUnits,
      budgetPolicyRef: agent.policy.budget.budgetPolicyRef,
      budgetGeneration: agent.policy.budget.generation,
      maximumSpendPerInvocationUnits: agent.policy.budget.maximumSpendPerCall.units,
      formanceSchemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
      legalCustomerRef: subjects.legalCustomerRef,
      legalCustomerGeneration: subjects.legalCustomerGeneration,
      buyerRevenueUnits: sale.revenueUnits,
      buyerTaxUnits: sale.taxUnits,
      accountAvailableUnits: '20000000',
      budgetAvailableUnits: subjects.budgetUnits,
      legalExposureAvailableUnits: subjects.legalExposureUnits,
      spendingPeriods: subjects.spendingPeriods,
      dailyPeriodAvailableUnits: '20000000',
      monthlyPeriodAvailableUnits: '20000000',
      commercialPolicyDigest: subjects.policyDigest,
      expiresAt: stored.expiresAt,
    }
    const expectedEvidenceDigest = canonicalDigest(evidenceMaterial)
    const expectedQuoteRef = `operation-commitment:v1:${canonicalDigest({
      ...evidenceMaterial,
      createdAt: stored.createdAt,
      correlationId: issueCorrelationId,
    }).slice(7)}`
    expect(stored.evidenceDigest).toBe(expectedEvidenceDigest)
    expect(issued.evidenceDigest).toBe(expectedEvidenceDigest)
    expect(stored.quoteRef).toBe(expectedQuoteRef)

    const liveRead = await backend.query(internal.capabilityQuotes.readForCall, {
      principal: agent.principal,
      quoteRef: issued.quoteRef,
      idempotencyKey: `invoke:${issued.quoteRef}`,
      now: stored.expiresAt - 1,
    })
    expect(liveRead).toEqual({
      toolRef: fixture.toolRef,
      input,
      decisionPrice: issued.price,
      quoteRef: issued.quoteRef,
      evidenceDigest: expectedEvidenceDigest,
    })
    const expiredRead = await backend.query(internal.capabilityQuotes.readForCall, {
      principal: agent.principal,
      quoteRef: issued.quoteRef,
      idempotencyKey: `invoke:${issued.quoteRef}`,
      now: stored.expiresAt,
    })
    expect(expiredRead).toBeNull()

    const replayCallRef = `call:replay:${suffix}`
    const replayResult = { kind: 'refused' as const, toolRef: fixture.toolRef, code: 'operation_not_ready' as const, retryable: false }
    await backend.run(async ctx => {
      await ctx.db.insert('capabilityCalls', {
        callRef: replayCallRef, quoteRef: stored.quoteRef,
        principalId: stored.principalId, ownerId: stored.accountRef, credentialId: stored.credentialId,
        applicationRef: stored.applicationRef, environment: stored.environment, toolRef: stored.toolRef,
        idempotencyKey: `invoke:${issued.quoteRef}`, grantRef: stored.grantRef,
        grantGeneration: stored.grantGeneration, policyDigest: stored.grantPolicyDigest,
        grantExpiresAt: agent.grant.expiresAt, inputDigest: stored.inputDigest,
        requestDigest: canonicalDigest({ replay: suffix }), state: 'refused', result: replayResult,
        createdAt: Date.now(), updatedAt: Date.now(),
      })
      await ctx.db.patch(stored._id, { state: 'consumed', consumedCallRef: replayCallRef,
        expiresAt: Date.now() - 1, x402RequirementDigest: canonicalDigest('old-provider-requirement') })
    })
    expect(await backend.query(internal.capabilityQuotes.readForCall, {
      principal: agent.principal, quoteRef: issued.quoteRef,
      idempotencyKey: `invoke:${issued.quoteRef}`, now: Date.now(),
    })).toMatchObject({ consumedCallRef: replayCallRef })
    expect(await backend.query(internal.capabilityQuotes.readForCall, {
      principal: agent.principal, quoteRef: issued.quoteRef,
      idempotencyKey: 'another-key', now: Date.now(),
    })).toBeNull()
    const send = vi.spyOn(networkServer, 'sendGuardedHttpRequest').mockRejectedValue(new Error('provider_unavailable'))
    try {
      expect(await backend.action(api.capabilityCalls.call, await withSourceWrite('protected_action', {
        operationKey: `replay:${suffix}`, correlationId: `replay:${suffix}`,
        principal: agent.principal, quoteRef: issued.quoteRef, idempotencyKey: `invoke:${issued.quoteRef}`,
      }))).toEqual(replayResult)
      await backend.run(async ctx => {
        const call = await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', replayCallRef)).unique()
        if (call === null) throw new Error('replay_call_missing')
        await ctx.db.patch(call._id, { state: 'pending', result: undefined })
      })
      expect(await backend.action(api.capabilityCalls.call, await withSourceWrite('protected_action', {
        operationKey: `replay:pending:${suffix}`, correlationId: `replay:pending:${suffix}`,
        principal: agent.principal, quoteRef: issued.quoteRef, idempotencyKey: `invoke:${issued.quoteRef}`,
      }))).toEqual({ kind: 'pending', callRef: replayCallRef, toolRef: fixture.toolRef, retryAfterMs: 1000 })
      expect(send).not.toHaveBeenCalled()
    } finally { send.mockRestore() }

    const budgetGenerationMismatch = await backend.mutation(internal.capabilityQuotes.issueQuote, {
      operationKey: `test:quote:budget-generation:${suffix}`,
      correlationId: `test:quote:budget-generation:${suffix}`,
      principal: agent.principal,
      toolRef: fixture.toolRef,
      input,
      formance: formanceSnapshot(subjects, { budgetGeneration: subjects.budgetGeneration + 1 }),
    })
    expect(budgetGenerationMismatch).toMatchObject({
      kind: 'refused',
      code: 'inspection_unavailable',
      retryable: true,
    })

    const fundingRefusal = await backend.mutation(internal.capabilityQuotes.issueQuote, {
      operationKey: `test:quote:funding:${suffix}`,
      correlationId: `test:quote:funding:${suffix}`,
      principal: agent.principal,
      toolRef: fixture.toolRef,
      input,
      formance: formanceSnapshot(subjects, { accountAvailableUnits: '0' }),
    })
    expect(fundingRefusal).toMatchObject({ kind: 'refused', code: 'insufficient_balance' })
    if (fundingRefusal.kind !== 'refused') throw new Error('quote_funding_refusal_missing')
    if (fundingRefusal.continuation?.action !== 'funding.handoff.create') {
      throw new Error('quote_funding_continuation_missing')
    }
    const expectedFundingIdempotencyKey = `funding:${canonicalDigest({
      format: 'ae.operation-inspect-funding:v1',
      principalRef: agent.principal.principalId,
      operationRef: fixture.toolRef,
      inputDigest: canonicalDigest(input),
      exactPriceUnits: issued.price.units,
      currentBalanceUnits: '0',
      budgetGeneration: agent.grant.generation,
    }).slice(7)}`
    expect(fundingRefusal.continuation.input.idempotencyKey).toBe(expectedFundingIdempotencyKey)

    const lowBudgetAgent = await seedAgent(
      backend,
      owner,
      fixture.toolRef,
      `${suffix}-low-call-limit`,
      '100',
    )
    const lowBudgetSubjects = await prepareSubjects(
      backend,
      lowBudgetAgent,
      fixture.toolRef,
      input,
      `${suffix}-low-call-limit`,
    )
    const perCallRefusal = await backend.mutation(internal.capabilityQuotes.issueQuote, {
      operationKey: `test:quote:per-call:${suffix}`,
      correlationId: `test:quote:per-call:${suffix}`,
      principal: lowBudgetAgent.principal,
      toolRef: fixture.toolRef,
      input,
      formance: formanceSnapshot(lowBudgetSubjects),
    })
    expect(perCallRefusal).toMatchObject({
      kind: 'refused',
      code: 'budget_exceeded',
      reason: 'per_call_limit',
    })
    await backend.run(async ctx => {
      const tax = await ctx.db.query('moneyCommercialPolicies')
        .withIndex('by_policyRef', q => q.eq('policyRef', `commercial-policy:quote:${suffix}:tax:1`)).unique()
      if (tax === null) throw new Error('tax_policy_missing')
      await ctx.db.patch(tax._id, { control: { ...PRODUCTION_COMMERCIAL_POLICY_CONTROLS.tax, callTaxBps: 1000 } })
    })
    expect(await backend.mutation(internal.capabilityQuotes.issueQuote, {
      operationKey: `test:quote:policy-drift:${suffix}`, correlationId: `test:quote:policy-drift:${suffix}`,
      principal: agent.principal, toolRef: fixture.toolRef, input, formance: formanceSnapshot(subjects),
    })).toMatchObject({ kind: 'refused', code: 'inspection_unavailable', retryable: true })
  })

  it('authorizes an unprobed discovered request, prices its live requirement and pins the challenge and rate', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await admitDiscoveredToolFixture(backend, { withoutExample: true })
    const owner = await publishedBusinessOwner(backend, 'managed-quote-buyer')
    await seedCommercialPolicies(backend, 'managed-quote', Date.now())
    const agent = await seedAgent(backend, owner, fixture.toolRef, 'managed-quote', '20000000')
    const input = { from: 'UTC', to: 'America/New_York', time: '12:00' }
    const preparationArgs = await withSourceWrite('protected_action', {
      operationKey: 'managed-quote:invalid', correlationId: 'managed-quote:invalid',
      principal: agent.principal, toolRef: fixture.toolRef, input: { invalid: 'input' },
    })
    const upstream = vi.fn(async () => { throw new Error('invalid_request_released') })
    const handler = (quote as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler
    const refused = await handler({ runMutation: backend.mutation, runAction: upstream }, preparationArgs)
    expect(refused).toMatchObject({ kind: 'refused', code: 'input_invalid' })
    expect(upstream).not.toHaveBeenCalled()
    const unauthorized = await handler({ runMutation: backend.mutation, runAction: upstream }, await withSourceWrite('protected_action', {
      ...preparationArgs, operationKey: 'managed-quote:unauthorized', correlationId: 'managed-quote:unauthorized',
      principal: { ...agent.principal, credentialId: 'unknown-credential' }, input,
    }))
    expect(unauthorized).toMatchObject({ kind: 'refused', code: 'grant_not_found' })
    expect(upstream).not.toHaveBeenCalled()

    const subjects = await prepareSubjects(backend, agent, fixture.toolRef, input, 'managed-quote')
    expect(subjects.buyerTaxBps).toBe(0)
    const targetJson = await backend.run(async (ctx) => JSON.stringify(await readManagedX402InspectionTarget(ctx, fixture.toolRef)))
    const target = targetJson === undefined ? undefined : JSON.parse(targetJson) as NonNullable<Awaited<ReturnType<typeof readManagedX402InspectionTarget>>>
    expect(target).toBeDefined()
    if (target === undefined) throw new Error('inspection_target_missing')
    const challenge = {
      ...structuredClone(fixture.paymentRequired),
      accepts: fixture.paymentRequired.accepts.map(requirement => {
        if (requirement.network !== activeCustodyNetwork) throw new Error('managed_quote_fixture_network_mismatch')
        return { ...requirement, network: activeCustodyNetwork, amount: '250' }
      }),
    }
    const live = await inspectLiveX402Requirement(target, input, {
      validatePublicTarget: async () => true,
      send: async () => new Response(null, { status: 402, headers: { 'payment-required': encodePaymentRequiredHeader(challenge) } }),
    })
    expect(live.kind).toBe('observed')
    if (live.kind !== 'observed') throw new Error('live_requirement_missing')
    expect(await backend.mutation(internal.capabilitySupplyCurrentTool.recordManagedX402Inspection, {
      toolRef: fixture.toolRef, targetDigest: target.targetDigest,
      requirementDigest: live.requirement.requirementDigest, observedAt: live.requirement.observedAt,
    })).toBe(true)
    const referenceRate = { source: 'coinbase' as const, base: 'USDC' as const, quote: 'AUD' as const, rate: '1.3854', fetchedAt: Date.now() }
    const issued = await backend.mutation(internal.capabilityQuotes.issueQuote, {
      operationKey: 'managed-quote:issue', correlationId: 'managed-quote:issue',
      principal: agent.principal, toolRef: fixture.toolRef, input, liveX402Requirement: live.requirement, referenceRate,
      formance: { ...formanceSnapshot(subjects), treasury: {
        custodyRef: activeCustodyRef, custodyGeneration: activeCustodyGeneration,
        network: activeCustodyNetwork, availableUnits: '10000000',
        evidenceRef: 'treasury:managed-quote', evidenceDigest: canonicalDigest({ treasury: 'managed-quote' }),
      } },
    })
    expect(issued).toMatchObject({ kind: 'committed', price: { units: '347' }, sourceRequirement: { units: '250' } })
    if (issued.kind !== 'committed') throw new Error(`managed_quote_refused:${issued.code}`)
    expect(issued.parties).toEqual({
      seller: 'Agentic Economy',
      provider: expect.any(String),
      paymentRecipient: expect.any(String),
    })
    const stored = await backend.run((ctx) => ctx.db.query('capabilityQuotes').withIndex('by_quoteRef', q => q.eq('quoteRef', issued.quoteRef)).unique())
    expect(stored).toMatchObject({ sourceUsdcUnits: '250', decisionAudUnits: '347', buyerRevenueUnits: '347', buyerTaxUnits: '0', x402PaymentRequiredJson: live.requirement.paymentRequiredJson })
    expect(JSON.parse(stored!.rateEvidenceJson!).referenceRate).toEqual(referenceRate)
  })

  it.each([
    { label: 'revocation', change: 'revocation' },
    { label: 'withdrawal', change: 'withdrawal' },
  ] as const)('rechecks $label after inspection preparation and before releasing input', async ({ change }) => {
    const backend = convexTestWithMarketComponents()
    const fixture = await admitDiscoveredToolFixture(backend, { withoutExample: true })
    const owner = await publishedBusinessOwner(backend, `inspection-${change}`)
    await seedCommercialPolicies(backend, `inspection-${change}`, Date.now())
    const agent = await seedAgent(backend, owner, fixture.toolRef, `inspection-${change}`, '20000000')
    const input = { from: 'UTC', to: 'America/New_York', time: '12:00' }
    await prepareSubjects(backend, agent, fixture.toolRef, input, `inspection-${change}`)
    const send = vi.spyOn(networkServer, 'sendGuardedHttpRequest').mockRejectedValue(new Error('unauthorized_input_released'))
    const targetCheck = vi.spyOn(networkPublic, 'isPublicHttpTarget').mockImplementation(async () => {
      await backend.run(async ctx => {
        if (change === 'revocation') {
          const credential = await ctx.db.query('credentials').withIndex('by_credentialRef', q => q.eq('credentialRef', testRef('crd', `inspection-${change}`))).unique()
          if (credential === null) throw new Error('inspection_credential_missing')
          await ctx.db.patch(credential._id, { lifecycle: 'revoked' })
        } else {
          const publication = await ctx.db.query('capabilityPublications').withIndex('by_toolRef_and_disposition', q => q.eq('toolRef', fixture.toolRef).eq('disposition', 'current')).unique()
          if (publication === null) throw new Error('inspection_publication_missing')
          await ctx.db.patch(publication._id, { disposition: 'withdrawn' })
        }
      })
      return true
    })
    try {
      expect(await backend.action(internal.capabilityCallLiveX402.inspect, {
        principal: agent.principal, toolRef: fixture.toolRef, input,
      })).toEqual({ kind: 'refused' })
      expect(targetCheck).toHaveBeenCalledOnce()
      expect(send).not.toHaveBeenCalled()
    } finally { targetCheck.mockRestore(); send.mockRestore() }
  })

  it('selects the newest observation for the configured active custody', async () => {
    const backend = convexTestWithMarketComponents()
    const suffix = 'treasury-same-custody'
    const fixture = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const agent = await seedAgent(backend, { canonicalAccountRef: fixture.accountRef }, fixture.toolRef, suffix, '20000000')
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, fixture, suffix)
    await recordTreasuryObservation(backend, `${suffix}-old`, {
      totalUnits: '10000000',
      bufferUnits: '1000000',
      observedAt: 1_800_000_000_000,
    })
    await recordTreasuryObservation(backend, `${suffix}-new`, {
      totalUnits: '20000000',
      bufferUnits: '3000000',
      observedAt: 1_800_000_000_001,
    })

    const subjects = await withCustodyEnvironment(() => prepareSubjects(
      backend,
      agent,
      fixture.toolRef,
      { request: 'Perth' },
      suffix,
    ))
    expect(subjects.treasury).toMatchObject({
      custodyRef: activeCustodyRef,
      custodyGeneration: activeCustodyGeneration,
      network: activeCustodyNetwork,
      targetUnits: '17000000',
      evidenceRef: `cdp-balance:quote:${suffix}-new`,
    })
  })

  it('ignores old generations and other custody rows without an environment fallback', async () => {
    const backend = convexTestWithMarketComponents()
    const suffix = 'treasury-identity-filter'
    const fixture = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const agent = await seedAgent(backend, { canonicalAccountRef: fixture.accountRef }, fixture.toolRef, suffix, '20000000')
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, fixture, suffix)
    await recordTreasuryObservation(backend, `${suffix}-active`, {
      totalUnits: '10000000',
      bufferUnits: '1000000',
      observedAt: 1_800_000_000_000,
    })
    await recordTreasuryObservation(backend, `${suffix}-old-generation`, {
      custodyGeneration: activeCustodyGeneration - 1,
      totalUnits: '90000000',
      bufferUnits: '1000000',
      observedAt: 1_800_000_000_002,
    })
    await recordTreasuryObservation(backend, `${suffix}-other-custody`, {
      custodyRef: 'custody:quote:other',
      totalUnits: '80000000',
      bufferUnits: '1000000',
      observedAt: 1_800_000_000_003,
    })

    const subjects = await withCustodyEnvironment(() => prepareSubjects(
      backend,
      agent,
      fixture.toolRef,
      { request: 'Perth' },
      suffix,
    ))
    expect(subjects.treasury).toMatchObject({
      targetUnits: '9000000',
      evidenceRef: `cdp-balance:quote:${suffix}-active`,
    })
  })

  it('fails closed when no observation matches the active custody tuple', async () => {
    const backend = convexTestWithMarketComponents()
    const suffix = 'treasury-no-active-match'
    const fixture = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const agent = await seedAgent(backend, { canonicalAccountRef: fixture.accountRef }, fixture.toolRef, suffix, '20000000')
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, fixture, suffix)
    await recordTreasuryObservation(backend, `${suffix}-old-generation`, {
      custodyGeneration: activeCustodyGeneration - 1,
      observedAt: 1_800_000_000_000,
    })
    await recordTreasuryObservation(backend, `${suffix}-other-custody`, {
      custodyRef: 'custody:quote:other',
      observedAt: 1_800_000_000_001,
    })

    const subjects = await withCustodyEnvironment(() => prepareSubjects(
      backend,
      agent,
      fixture.toolRef,
      { request: 'Perth' },
      suffix,
    ))
    expect(subjects.treasury).toBeUndefined()
  })

  it.each([
    { label: 'missing custody configuration', overrides: { AE_X402_CUSTODY_ENABLED: undefined } },
    { label: 'invalid custody generation', overrides: { AE_X402_CDP_CREDENTIAL_GENERATION: 'not-a-number' } },
  ] as const)('fails closed with $label', async ({ overrides }) => {
    const backend = convexTestWithMarketComponents()
    const suffix = 'treasury-invalid-config'
    const fixture = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const agent = await seedAgent(backend, { canonicalAccountRef: fixture.accountRef }, fixture.toolRef, suffix, '20000000')
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, fixture, suffix)
    await recordTreasuryObservation(backend, suffix)

    const subjects = await withCustodyEnvironment(
      () => prepareSubjects(backend, agent, fixture.toolRef, { request: 'Perth' }, suffix),
      overrides,
    )
    expect(subjects.treasury).toBeUndefined()
  })

  it.each([
    { label: 'malformed newest evidence', kind: 'malformed' },
    { label: 'negative newest capacity', kind: 'negative' },
  ] as const)('does not fall back from $label to older evidence', async ({ kind }) => {
    const backend = convexTestWithMarketComponents()
    const suffix = `treasury-no-fallback-${kind}`
    const fixture = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const agent = await seedAgent(backend, { canonicalAccountRef: fixture.accountRef }, fixture.toolRef, suffix, '20000000')
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, fixture, suffix)
    await recordTreasuryObservation(backend, `${suffix}-old`, {
      totalUnits: '10000000',
      bufferUnits: '1000000',
      observedAt: 1_800_000_000_000,
    })
    if (kind === 'malformed') {
      await insertMalformedTreasuryObservation(backend, `${suffix}-new`, 1_800_000_000_001)
    } else {
      await recordTreasuryObservation(backend, `${suffix}-new`, {
        totalUnits: '100',
        bufferUnits: '200',
        observedAt: 1_800_000_000_001,
      })
    }

    const subjects = await withCustodyEnvironment(() => prepareSubjects(
      backend,
      agent,
      fixture.toolRef,
      { request: 'Perth' },
      suffix,
    ))
    expect(subjects.treasury).toBeUndefined()
  })

  it('rejects an active observation with an unexpected payment network', async () => {
    const backend = convexTestWithMarketComponents()
    const suffix = 'treasury-network-mismatch'
    const fixture = await publishCurrentTool(backend, suffix)
    await seedCommercialPolicies(backend, suffix, Date.now())
    const agent = await seedAgent(backend, { canonicalAccountRef: fixture.accountRef }, fixture.toolRef, suffix, '20000000')
    await backend.finishAllScheduledFunctions(() => undefined)
    await observeHealthyReadiness(backend, fixture, suffix)
    await recordTreasuryObservation(backend, suffix, {
      network: 'eip155:1',
    })

    const subjects = await withCustodyEnvironment(() => prepareSubjects(
      backend,
      agent,
      fixture.toolRef,
      { request: 'Perth' },
      suffix,
    ))
    expect(subjects.treasury).toBeUndefined()
  })
})
