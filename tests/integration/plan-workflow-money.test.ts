import { Response as UndiciResponse, type fetch as UndiciFetch } from 'undici'
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import { encodePaymentRequiredHeader, encodePaymentResponseHeader, decodePaymentSignatureHeader } from '@x402/core/http'
import { eip3009ABI } from '@x402/evm'
import { encodeAbiParameters, encodeEventTopics, encodeFunctionData, erc20Abi, type Hex } from 'viem'
import { api, internal } from '../../convex/_generated/api'
import { prepareFundedProductionBuyer, prepareFundedSandboxBuyer, registerRotatingBuyer } from './capability-call-workpool-harness'
import { preloadWorkflowComponentModules } from '../helpers/convex-fixtures'
import { withSourceWrite } from '../helpers/source-write-admission'
import { readFormanceAccount } from '@/modules/money/formance'
import { grantFormancePromotionalCredit, planHoldAccountAddress, planPromotionalHoldAccountAddress, promotionalGrantAccount, readFormanceSpendingPeriod } from '@/modules/money/formance-workflows'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { seedCommercialPolicies } from '../helpers/quote-fixtures'
import { seedPaymentReadiness, seedTreasuryReadinessFacts } from '../helpers/payment-readiness-fixture'

const providerFetch = vi.hoisted(() => vi.fn<typeof UndiciFetch>())
const external = vi.hoisted(() => ({ cdpClient: vi.fn(), receipt: vi.fn() }))
vi.mock('@/modules/money/x402-payee-screening.server', () => ({
  screenX402Payee: async (request: Record<string, unknown>) => ({ ...request, provider: 'trm-wallet-screening', outcome: 'clear',
    startedAt: Date.now(), checkedAt: Date.now(), reason: 'native_plan_external_provider_fixture' }),
}))
vi.mock('@coinbase/cdp-sdk', async original => ({ ...await original<Record<string, unknown>>(), CdpClient: class { constructor() { return external.cdpClient() } } }))
vi.mock('@/modules/capability-supply/server', async original => ({ ...await original<Record<string, unknown>>(), readGuardedX402EvmReceipt: external.receipt }))
vi.mock('undici', async original => ({ ...await original<Record<string, unknown>>(), fetch: providerFetch }))
beforeAll(preloadWorkflowComponentModules)
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); providerFetch.mockReset(); external.cdpClient.mockReset(); external.receipt.mockReset() })

describe.runIf(process.env.AE_FORMANCE_INTEGRATION === 'true')('durable Plan Workflow with native money', () => {
  it('quotes under an existing production policy without the optional Plan tolerance field', async () => {
    const f = await prepareFundedProductionBuyer({ mocks: { providerFetch, external } })
    await seedCommercialPolicies(f.backend, 'legacy-plan-policy', Date.now())
    await seedTreasuryReadinessFacts(f.backend, { observation: 'preserve', availableUnits: '9990000' })
    await seedPaymentReadiness(f.backend)
    providerFetch.mockImplementation(async url => new UndiciResponse('', { status: 402, headers: {
      'Payment-Required': encodePaymentRequiredHeader({ ...f.resource.paymentRequired,
        resource: { ...f.resource.paymentRequired.resource, url: String(url) },
        accepts: f.resource.paymentRequired.accepts.map(requirement => ({ ...requirement, maxTimeoutSeconds: 60 })),
      }),
    } }))
    await f.backend.run(async ctx => {
      const policy = await ctx.db.query('moneyCommercialPolicies').filter(q => q.eq(q.field('family'), 'operations')).first()
      if (policy?.control.family !== 'operations') throw new Error('operations_policy_missing')
      const { planRateToleranceBps: _planRateToleranceBps, ...legacyControl } = policy.control
      await ctx.db.patch(policy._id, { control: legacyControl })
    })
    const quoteArgs = await withSourceWrite('protected_action', {
      operationKey: 'legacy-plan:quote', correlationId: 'legacy-plan', principal: { ...f.buyer.principal, scopes: [...f.buyer.principal.scopes] },
      planJson: JSON.stringify({ nodes: [{ id: 'first', toolRef: f.published.toolRef, input: f.input, dependsOn: [] }] }),
    })
    const result = await f.backend.action(api.capabilityPlans.quote, quoteArgs)
    expect(result, JSON.stringify(result)).toMatchObject({ kind: 'quoted', approvedTotalAudUnits: '1206', nodes: [{ rateToleranceBps: 50 }] })
    expect(await f.backend.run(ctx => ctx.db.query('capabilityCalls').collect())).toEqual([])
    expect((await f.backend.run(ctx => ctx.db.query('capabilityPlans').first()))?.holdBooking).toBeUndefined()
    providerFetch.mockImplementation(async () => {
      await f.backend.run(async ctx => {
        const publication = await ctx.db.query('capabilityPublications').withIndex('by_toolRef_and_disposition', q =>
          q.eq('toolRef', f.published.toolRef).eq('disposition', 'current')).unique()
        if (publication === null) throw new Error('publication_missing')
        await ctx.db.patch(publication._id, { disposition: 'withdrawn' })
      })
      return new UndiciResponse('', { status: 402, headers: { 'Payment-Required': encodePaymentRequiredHeader(f.resource.paymentRequired) } })
    })
    const changed = await f.backend.action(api.capabilityPlans.quote, await withSourceWrite('protected_action', {
      ...quoteArgs, operationKey: 'legacy-plan:withdrawn', correlationId: 'legacy-plan:withdrawn',
    }))
    expect(changed.kind).toBe('refused')
    expect(await f.backend.run(ctx => ctx.db.query('capabilityPlans').collect())).toHaveLength(1)
    expect(await f.backend.run(ctx => ctx.db.query('capabilityCalls').collect())).toEqual([])
  })

  it.each([
    { funding: 'purchased', outcome: 'success', authority: 'spending_policy' },
    { funding: 'promotional', outcome: 'success', authority: 'spending_policy' },
    { funding: 'promotional', outcome: 'partial', authority: 'spending_policy' },
    { funding: 'purchased', outcome: 'uncertain', authority: 'spending_policy' },
    { funding: 'purchased', outcome: 'success', authority: 'approval_required' },
  ] as const)('preserves $funding credit and capacity for $outcome Calls under $authority from one Hold', async ({ funding, outcome, authority }) => {
    let approvalBuyer: Awaited<ReturnType<typeof registerRotatingBuyer>> | undefined
    const f = await prepareFundedSandboxBuyer({ mocks: { providerFetch, external }, maximumConcurrentCalls: 2,
      ...(authority === 'approval_required' ? { buyerSetup: async backend => {
        approvalBuyer = await registerRotatingBuyer(backend, '5000000', '5000000', 2, '5000000')
        return approvalBuyer
      } } : {}),
    })
    if (authority === 'approval_required') await f.backend.run(async ctx => {
      const grant = await ctx.db.query('agentAccessGrants').withIndex('by_grantRef', q => q.eq('grantRef', f.buyer.grantRef)).unique()
      const agent = await ctx.db.query('agentAccessPrincipals').withIndex('by_principalId', q => q.eq('principalId', f.buyer.principal.principalId)).unique()
      if (grant === null || agent === null) throw new Error('approval_agent_missing')
      await ctx.db.patch(grant._id, { authorityMode: authority })
      await ctx.db.patch(agent._id, { authorityMode: authority })
    })
    const accepted = f.resource.paymentRequired.accepts[0]!
    const asset = accepted.asset as Hex
    const grantRef = 'promo:plan-workflow'
    if (funding === 'promotional') {
      const now = Date.now()
      const grant = { grantRef, accountRef: f.buyer.principal.ownerId, amountUnits: '100000', expiresAt: now + 600_000, commandDigest: canonicalDigest('plan-promotional-fixture') }
      const booked = await grantFormancePromotionalCredit(f.formance, grant)
      expect(booked).toMatchObject({ kind: 'completed' })
      if (booked.kind !== 'completed') throw new Error('grant_not_booked')
      await f.backend.run(ctx => ctx.db.insert('moneyPromotionalGrants', { ...grant, environment: 'sandbox',
        availableUnits: grant.amountUnits, createdAt: now, updatedAt: now, operationKey: grantRef,
        actorRef: 'admin:test', correlationId: grantRef, reasonCode: 'onboarding', evidenceRefs: ['evidence:promo'],
        bookingState: 'booked', transactionRef: booked.transactionRefs[0]!, expiryRevision: 0 }))
    }
    let paid = 0
    const receipts = new Map<string, unknown>()
    external.receipt.mockImplementation(async ({ transactionHash }: { transactionHash: string }) => receipts.get(transactionHash))
    providerFetch.mockImplementation(async (_url, init) => {
      const payment = new Headers(init?.headers as HeadersInit).get('payment-signature')
      if (payment === null) return new UndiciResponse('', { status: 402,
        headers: { 'Payment-Required': encodePaymentRequiredHeader(f.resource.paymentRequired) } })
      paid += 1
      if (outcome === 'uncertain' && paid === 2) throw new TypeError('provider_response_lost_after_submission')
      const transactionHash: Hex = `0x${paid.toString(16).padStart(64, '0')}`
      const { authorization } = decodePaymentSignatureHeader(payment).payload as {
        authorization: { from: Hex; to: Hex; value: string; validAfter: string; validBefore: string; nonce: Hex }
      }
      receipts.set(transactionHash, { transactionHash, status: 'success', confirmations: 12n,
        blockHash: `0x${'7'.repeat(64)}`, blockNumber: 100n,
        observedBlockTimestamp: BigInt(Math.floor(Date.now() / 1000)), authorizationState: true,
        transactionTo: asset,
        transactionInput: encodeFunctionData({ abi: eip3009ABI, functionName: 'transferWithAuthorization', args: [
          authorization.from, authorization.to, BigInt(authorization.value), BigInt(authorization.validAfter),
          BigInt(authorization.validBefore), authorization.nonce, 27, `0x${'b'.repeat(64)}`, `0x${'c'.repeat(64)}`,
        ] }),
        logs: [{ address: asset,
          data: encodeAbiParameters([{ type: 'uint256' }], [BigInt(authorization.value)]),
          topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: authorization.from, to: authorization.to } }),
        }],
      })
      return new UndiciResponse(JSON.stringify({ result: outcome === 'partial' && paid === 2 ? 42 : `answer ${paid}` }), { status: 200, headers: {
        'content-type': 'application/json', 'Payment-Response': encodePaymentResponseHeader({ success: true,
          transaction: transactionHash, network: accepted.network, payer: f.payer.address }),
      } })
    })
    const principal = { ...f.buyer.principal, authorityMode: authority, scopes: [...f.buyer.principal.scopes] }
    providerFetch.mockClear()
    const quote = await f.backend.action(api.capabilityPlans.quote, await withSourceWrite('protected_action', {
      operationKey: 'plan-native:quote', correlationId: 'plan-native', principal,
      planJson: JSON.stringify({ nodes: ['first', 'second'].map(id => ({ id, toolRef: f.published.toolRef, input: f.input, dependsOn: [] })) }),
    }))
    expect(quote, JSON.stringify(quote)).toMatchObject({ kind: 'quoted' })
    if (quote.kind !== 'quoted') throw new Error('plan_quote_failed')
    if (authority === 'approval_required') expect(providerFetch).not.toHaveBeenCalled()
    expect(quote.expiresAt - Date.now()).toBeGreaterThan(20_000)
    // Review can outlive the original unpaid probe. Node Calls still probe
    // again and cannot spend beyond the frozen maximum.
    vi.setSystemTime(Date.now() + 20_000)
    const runArgs = await withSourceWrite('protected_action', { operationKey: 'plan-native:run', correlationId: 'plan-native', principal,
      planRef: quote.planRef, approvedTotalAudUnits: quote.approvedTotalAudUnits, idempotencyKey: 'plan-native:run' })
    const planRow = () => f.backend.run(ctx => ctx.db.query('capabilityPlans').withIndex('by_planRef', q => q.eq('planRef', quote.planRef)).unique())
    if (approvalBuyer !== undefined) {
      expect(await f.backend.action(api.capabilityPlans.run, runArgs)).toMatchObject({ kind: 'awaiting_approval' })
      expect((await planRow())?.holdReservationAttempt).toBeUndefined()
      expect(await f.backend.run(ctx => ctx.db.query('capabilityCalls').collect())).toEqual([])
      const probe = { planRef: quote.planRef, nodeId: 'first', principal, toolRef: f.published.toolRef, input: f.input }
      expect(await f.backend.query(internal.capabilityPlans.readNodeProbeAdmission, probe)).toBe(false)
      const operationKey = `plan-approval:${quote.planRef}:approve`
      expect(await approvalBuyer.owner.mutation(api.capabilityPlans.decideOwner, await withSourceWrite('protected_action', {
        operationKey, correlationId: operationKey, planRef: quote.planRef, planDigest: quote.planDigest,
        approvedTotalAudUnits: quote.approvedTotalAudUnits, decision: 'approve' as const,
      }))).toMatchObject({ kind: 'running' })
      await f.backend.action(internal.capabilityPlans.continueRun, { planRef: quote.planRef })
      expect(await f.backend.query(internal.capabilityPlans.readNodeProbeAdmission, probe)).toBe(true)
      expect(await f.backend.query(internal.capabilityPlans.readNodeProbeAdmission, { ...probe, input: { request: 'changed' } })).toBe(false)
    } else expect(await f.backend.action(api.capabilityPlans.run, runArgs)).toMatchObject({ kind: 'running', state: 'running' })
    const held = await planRow()
    if (held?.holdBooking?.spendingPeriods === undefined) throw new Error('hold_booking_missing')
    const day = held.holdBooking.spendingPeriods.daily
    const readDay = () => readFormanceSpendingPeriod(f.formance, { principalRef: principal.principalId, periodKind: 'day',
      periodStartAt: day.periodStartAt, periodEndAt: day.periodEndAt })
    const expectedAvailable = (BigInt(day.limitUnits) - BigInt(quote.approvedTotalAudUnits)).toString()
    expect(await readDay()).toMatchObject({ kind: 'available', units: expectedAvailable })
    const read = () => f.backend.query(internal.capabilityPlans.readProgress, { planRef: quote.planRef })
    const expectedState = outcome === 'partial' ? 'partially_succeeded' : 'succeeded'
    for (let index = 0; index < 100; index++) {
      await vi.advanceTimersByTimeAsync(100)
      await f.backend.finishInProgressScheduledFunctions()
      if ((await read())?.state === expectedState) break
    }
    if (outcome === 'uncertain') {
      expect(await read()).toMatchObject({ state: 'reconciliation_required', hold: { status: 'uncertain', releasedAudUnits: '0' } })
      expect((await planRow())?.holdReleaseRefs).toBeUndefined()
      expect(paid).toBe(2)
      await f.backend.mutation(api.capabilityPlans.cancel, await withSourceWrite('protected_action', {
        operationKey: 'plan-native:cancel', correlationId: 'plan-native', principal, planRef: quote.planRef,
      }))
      await f.backend.action(internal.capabilityPlans.finish, { planRef: quote.planRef })
      expect(await read()).toMatchObject({ state: 'reconciliation_required', terminationIntent: 'cancelled', hold: { status: 'uncertain', releasedAudUnits: '0' } })
      expect((await planRow())?.holdReleaseRefs).toBeUndefined()
      expect(paid).toBe(2)
      return
    }
    // Delivery failure does not erase the Provider's proven payment. The
    // ordinary Call receipt and remedy path retain that separate consequence.
    const settled = '24000'
    expect(await read()).toMatchObject({ state: expectedState, hold: { status: 'released', heldAudUnits: '0', settledAudUnits: settled, releasedAudUnits: '120' } })
    const calls = await f.backend.run(ctx => ctx.db.query('capabilityCalls').withIndex('by_planRef', q => q.eq('planRef', quote.planRef)).collect())
    expect(calls).toHaveLength(2)
    expect(calls.filter(call => call.state === 'completed' && call.formanceFinancialState === 'settled')).toHaveLength(outcome === 'partial' ? 1 : 2)
    if (outcome === 'partial') expect(calls.filter(call => call.state !== 'completed' && call.formanceFinancialState === 'settled')).toHaveLength(1)
    const remainingPromo = (100000n - BigInt(settled)).toString()
    if (funding === 'promotional') {
      expect(calls.every(call => call.promotionalCreditAllocation?.purchasedUnits === '0')).toBe(true)
      expect(await f.readBalance()).toMatchObject({ kind: 'available', units: '10000000' })
      expect(await f.backend.run(ctx => ctx.db.query('moneyPromotionalGrants').first())).toMatchObject({ availableUnits: remainingPromo })
      expect(await readFormanceAccount(f.formance, promotionalGrantAccount(f.buyer.principal.ownerId, grantRef)))
        .toMatchObject({ kind: 'completed', volumes: { 'AUD/6': { balanceUnits: remainingPromo } } })
      expect(await readFormanceAccount(f.formance, planPromotionalHoldAccountAddress(held.holdBooking, grantRef)))
        .toMatchObject({ kind: 'completed', volumes: { 'AUD/6': { balanceUnits: '0' } } })
    }
    expect(await readDay()).toMatchObject({ kind: 'available', units: (BigInt(day.limitUnits) - BigInt(settled)).toString() })
    expect(paid).toBe(2)
    expect(f.signedAuthorizations).toHaveLength(2)
    const ledgerHold = await readFormanceAccount(f.formance, planHoldAccountAddress(held.holdBooking))
    expect(ledgerHold.kind === 'not_found' ? '0' : ledgerHold.kind === 'completed' ? ledgerHold.volumes['AUD/6']?.balanceUnits ?? '0' : undefined).toBe('0')
    const replay = await f.backend.action(api.capabilityPlans.run, await withSourceWrite('protected_action', {
      operationKey: 'plan-native:replay', correlationId: 'plan-native', principal,
      planRef: quote.planRef, approvedTotalAudUnits: quote.approvedTotalAudUnits, idempotencyKey: 'plan-native:run',
    }))
    expect(replay).toMatchObject({ kind: 'replayed', state: expectedState })
    expect(await f.backend.query(internal.capabilityPlans.readNodeProbeAdmission, {
      planRef: quote.planRef, nodeId: 'first', principal, toolRef: f.published.toolRef, input: f.input,
    })).toBe(false)
    expect(paid).toBe(2)
  }, 60_000)
})
