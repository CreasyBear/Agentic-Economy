/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it, vi } from 'vitest'
import { getFunctionName } from 'convex/server'
import type { ActionCtx } from '../../../convex/_generated/server'
import type { Doc } from '../../../convex/_generated/dataModel'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import type { FormanceMoneyResult, FormanceSettlementReadResult } from '@/modules/money/public'
import { reserveFormanceBackedInvocation } from '../../../convex/lib/capabilityExecution/callLifecycle/callFinancialReservation'
import { reconcileSettlementHandler } from '../../../convex/lib/money/managedCall/lifecycleActions'

import schema from '../../../convex/schema'
import { api, internal } from '../../../convex/_generated/api'
import { buildDevelopmentPublishedToolEvidence } from '../capability-supply/fixtures/development-published-tool-evidence'
import { callResultSchema } from '../../../src/modules/capability-execution/call-contracts'
import { currentUtcDayBounds, currentUtcMonthBounds } from '../../../src/modules/common/freshness'
import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import { createPublicToolRef } from '../../../src/modules/capability-supply/public'
import { quoteManagedX402BuyerAud } from '../../../src/modules/money/public'
import { convexTestWithMarketComponents, publishedBusinessOwner } from '../../helpers/convex-fixtures'
import { withSourceWrite } from '../../helpers/source-write-admission'

const convexModules = Object.fromEntries(
  Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
    .map(([path, load]) => [path.replace('../../../convex/', './'), load]),
)

const now = Date.UTC(2026, 8, 2, 2, 0, 0)
const accountRef = 'account:managed-call'
const principalRef = 'principal:managed-call'
const operation = buildDevelopmentPublishedToolEvidence().tool
const quoteRef = 'operation-commitment:v1:managed-call'
const callRef = 'invocation:managed-call'
const toolRef = `operation:v1:${'d'.repeat(64)}`
const reservationRefs = ['formance:reserve-aud', 'formance:reserve-usdc', 'formance:obligation']
const releaseRefs = ['formance:release-aud', 'formance:release-usdc']
const settlementRefs = ['formance:settle-buyer', 'formance:settle-provider']

function settlementReadContext(
  backend: ReturnType<typeof convexTest>,
  read: () => Promise<FormanceSettlementReadResult>,
) {
  const nativeRead = vi.fn(async (reference: Parameters<ActionCtx['runAction']>[0], args: unknown) => {
    expect(getFunctionName(reference)).toBe('moneyFormance:readManagedCallSettlement')
    expect(args).toMatchObject({ callRef, quoteRef, accountRef, idempotencyKey: call().idempotencyKey })
    return await read()
  })
  return {
    nativeRead,
    ctx: {
      runQuery: (reference: Parameters<typeof backend.query>[0], args: never) => backend.query(reference, args),
      runMutation: (reference: Parameters<typeof backend.mutation>[0], args: never) => backend.mutation(reference, args),
      runAction: nativeRead,
    } as unknown as ActionCtx,
  }
}

async function settlementState(backend: ReturnType<typeof convexTest>) {
  return await backend.run(async ctx => ({
    call: await ctx.db.query('capabilityCalls').first(),
    quote: await ctx.db.query('capabilityQuotes').first(),
    obligations: await ctx.db.query('moneyProviderObligations').collect(),
    paymentAttempts: await ctx.db.query('moneyX402PaymentAttempts').collect(),
  }))
}

function commitment() {
  const priced = quoteManagedX402BuyerAud({ environment: 'sandbox', requiredUsdcAtomicUnits: '5000000', observedAt: now, referenceRate: { source: 'coinbase', base: 'USDC', quote: 'AUD', rate: '1.2', fetchedAt: now } })
  if (priced.kind !== 'quoted') throw new Error('fixture_rate_invalid')
  return {
    quoteRef,
    principalId: principalRef,
    accountRef,
    credentialId: 'credential:managed-call',
    applicationRef: 'application:managed-call',
    environment: 'sandbox' as const,
    grantRef: 'grant:managed-call',
    grantGeneration: 1,
    grantPolicyDigest: 'sha256:grant',
    grantExpiresAt: now + 60_000,
    toolRef,
    toolVersion: operation.identity.publicationRevision,
    toolMaterialDigest: 'sha256:operation-material',
    currentToolDigest: 'sha256:current-operation',
    toolJson: JSON.stringify(operation),
    normalizedInputJson: '{}',
    inputDigest: 'sha256:input',
    pricingJson: '{}',
    pricingDigest: 'sha256:pricing',
    decisionAudUnits: '6000000',
    sourceUsdcUnits: '5000000',
    x402RequirementDigest: 'sha256:live-requirement',
    x402RequirementJson: '{}',
    x402RequirementObservedAt: now - 1,
    rateEvidenceJson: JSON.stringify(priced.evidence),
    rateEvidenceDigest: priced.evidence.evidenceDigest,
    budgetPolicyRef: 'budget:managed-call',
    budgetGeneration: 1,
    maximumSpendPerCallUnits: '6000000',
    // This fixture represents a historical accepted periodless Call. New
    // paid bookings select v1.4.0 and carry both immutable periods.
    formanceSchemaVersion: 'v1.3.0',
    policyGeneration: 1,
    legalCustomerRef: 'principal:legal-customer',
    legalCustomerGeneration: 1,
    buyerRevenueUnits: '5454545',
    buyerTaxUnits: '545455',
    accountAvailableUnits: '10000000',
    budgetAvailableUnits: '10000000',
    legalExposureAvailableUnits: '10000000',
    balanceUnits: '10000000',
    treasuryCustodyRef: 'custody:sandbox:managed-call',
    treasuryCustodyGeneration: 1,
    treasuryVersion: 1,
    treasuryEvidenceRef: 'treasury-observation:managed-call',
    treasuryEvidenceDigest: 'sha256:treasury',
    treasurySpendableUnits: '10000000',
    commercialPolicyRefs: ['commercial-policy:sandbox'],
    commercialPolicyDigest: 'sha256:policy',
    evidenceDigest: 'sha256:commitment',
    state: 'consumed' as const,
    consumedCallRef: callRef,
    expiresAt: now + 30_000,
    createdAt: now - 1,
    updatedAt: now - 1,
  }
}

function call() {
  return {
    quoteRef,
    callRef,
    principalId: principalRef,
    ownerId: accountRef,
    credentialId: 'credential:managed-call',
    applicationRef: 'application:managed-call',
    toolRef,
    idempotencyKey: 'idempotency:managed-call',
    environment: 'sandbox' as const,
    grantRef: 'grant:managed-call',
    grantGeneration: 1,
    policyDigest: 'sha256:grant',
    grantExpiresAt: now + 60_000,
    toolJson: JSON.stringify(operation),
    inputJson: '{}',
    inputDigest: 'sha256:input',
    requestDigest: canonicalDigest({ format: 'test:managed-call:v1', invocationRef: callRef }),
    formanceFinancialState: 'reservation_pending' as const,
    state: 'pending' as const,
    dispatchState: 'enqueued' as const,
    createdAt: now,
    updatedAt: now,
  }
}

async function seedReservationFixture(backend: ReturnType<typeof convexTest>) {
  await backend.run(async (ctx) => {
    await ctx.db.insert('capabilityQuotes', commitment())
    await ctx.db.insert('capabilityCalls', call())
  })
  return await backend.mutation(internal.moneyManagedCall.attachReservation, {
    callRef,
    transactionRefs: reservationRefs,
  })
}

async function seedLostResult(backend: ReturnType<typeof convexTest>) {
  await seedReservationFixture(backend)
  await backend.run(async ctx => {
    const row = await ctx.db.query('capabilityCalls').first()
    if (row === null) throw new Error('fixture_missing')
    const amount = { currency: 'AUD', units: '6000000', exponent: 6 }
    const usdc = { currency: 'USDC', units: '5000000', exponent: 6 }
    await ctx.db.patch(row._id, {
      state: 'reconciliation_required', formanceFinancialState: 'outcome_unknown',
      result: { kind: 'reconciliation_required', callRef, toolRef,
        evidence: { attemptRef: 'attempt:lost', effectGeneration: 1,
          evidenceSource: 'provider:lost', requiredAt: new Date(now).toISOString(), retry: 'reconcile_before_retry' },
        receipt: { commercialModel: 'account_aud', receiptRef: 'receipt:lost', state: 'reconciliation_required',
          buyerCharge: amount, serviceFee: { ...amount, units: '0' }, totalBuyerCharge: amount,
          providerObligation: { amount: usdc, settlementMethod: 'managed_x402', payoutEligible: false },
          providerSettlement: { amount: usdc, network: 'eip155:84532', asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' },
          priceDigest: `sha256:${'a'.repeat(64)}`, evidenceHash: `sha256:${'b'.repeat(64)}`,
          issuedAt: new Date(now).toISOString(), refundState: 'unknown', lossState: 'unknown' },
      },
    })
    await ctx.db.insert('moneyX402PaymentAttempts', {
      dispatchRef: callRef, attemptRef: 'attempt:lost', effectGeneration: 1, toolRef, inputDigest: row.inputDigest,
      paymentIdentifier: 'payment:lost', operationKeyDigest: 'sha256:key', challengeDigest: 'sha256:challenge',
      challengeJson: '{}', selectedRequirementJson: '{}', providerEndpoint: 'https://example.com/weather',
      credentialRef: 'credential:lost', scheme: 'exact', network: 'eip155:84532',
      asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', payTo: '0x2222222222222222222222222222222222222222',
      amountUnits: '5000000', currency: 'USDC', exponent: 6, custodyRef: 'custody:lost',
      authorizationDigest: 'sha256:authorization', state: 'reconciliation_required', preparedAt: now,
      submissionStartedAt: now, reservationRef: reservationRefs[1]!, paymentPayer: '0x1111111111111111111111111111111111111111',
      paymentNonce: `0x${'c'.repeat(64)}`, evidenceRefs: [],
    })
  })
}

describe('read-only original settlement reconciliation', () => {
  async function heldFixture() {
    const backend = convexTest(schema, convexModules)
    await seedLostResult(backend)
    await backend.run(async ctx => {
      const row = await ctx.db.query('capabilityCalls').first()
      if (row === null) throw new Error('fixture_missing')
      await ctx.db.patch(row._id, {
        attemptRef: 'attempt:lost',
        reconciliation: { disposition: 'manual_review', reason: 'unknown_settlement', attemptCount: 0, nextAttemptAt: now },
      })
    })
    return backend
  }

  // Observable contract: the native boundary alone is mocked. Real registered
  // booking reads and transactional finalization preserve the held attempt and
  // delivery evidence; neither failure nor replay grants absence/retry authority.
  it.each(['accrued', 'held'] as const)('repairs %s accounting concurrently, preserves the manual hold and rereads on settled replay without timestamp inflation', async state => {
    const backend = await heldFixture()
    await backend.run(async dbCtx => {
      const obligation = await dbCtx.db.query('moneyProviderObligations').first()
      if (obligation === null) throw new Error('fixture_missing')
      await dbCtx.db.patch(obligation._id, { state })
    })
    const before = await settlementState(backend)
    const { ctx, nativeRead } = settlementReadContext(backend, async () => ({ kind: 'confirmed', transactionRefs: settlementRefs }))
    const results = await Promise.all([0, 1].map(offset => reconcileSettlementHandler(ctx, { callRef, now: now + 10 + offset })))
    expect(results).toContainEqual({ kind: 'accepted', state: 'settled', replayed: false })
    expect(results).toContainEqual({ kind: 'accepted', state: 'settled', replayed: true })
    const repaired = await settlementState(backend)
    expect(repaired.call).toEqual({ ...before.call,
      formanceFinancialState: 'settled', formanceSettlementRefs: settlementRefs,
      buyerSaleTransactionRef: settlementRefs[0], updatedAt: repaired.call?.updatedAt })
    expect(repaired.call?.updatedAt).toBeGreaterThanOrEqual(now + 10)
    expect(repaired.call?.updatedAt).toBeLessThanOrEqual(now + 11)
    expect(repaired.obligations).toHaveLength(1)
    expect(repaired.obligations[0]).toEqual({ ...before.obligations[0], state: 'settled',
      settlementTransactionRef: settlementRefs[1], evidenceRefs: [quoteRef, ...reservationRefs, ...settlementRefs],
      settledAt: repaired.call?.updatedAt, updatedAt: repaired.call?.updatedAt })
    expect(repaired.quote).toEqual(before.quote)
    expect(repaired.paymentAttempts).toEqual(before.paymentAttempts)
    expect(await reconcileSettlementHandler(ctx, { callRef, now: now + 100 })).toEqual({ kind: 'accepted', state: 'settled', replayed: true })
    expect(await settlementState(backend)).toEqual(repaired)
    expect(nativeRead).toHaveBeenCalledTimes(3)
  })

  it.each([
    { kind: 'refused', code: 'formance_settlement_not_found' },
    { kind: 'refused', code: 'formance_settlement_incomplete' },
    { kind: 'refused', code: 'formance_reference_conflict' },
    { kind: 'unavailable', code: 'formance_read_unavailable' },
  ] as const)('preserves every original fact on $kind/$code', async evidence => {
    const backend = await heldFixture()
    const before = await settlementState(backend)
    const { ctx, nativeRead } = settlementReadContext(backend, async () => evidence)
    expect(await reconcileSettlementHandler(ctx, { callRef, now: now + 10 })).toEqual({ kind: 'refused', code: evidence.code })
    expect(nativeRead).toHaveBeenCalledTimes(1)
    expect(await settlementState(backend)).toEqual(before)
  })

  it.each(['reserved', 'released', 'reservation_pending'] as const)('refuses ineligible %s without a native request or writes', async financialState => {
    const backend = await heldFixture()
    await backend.run(async ctx => {
      const row = await ctx.db.query('capabilityCalls').first()
      if (row === null) throw new Error('fixture_missing')
      await ctx.db.patch(row._id, { formanceFinancialState: financialState })
    })
    const before = await settlementState(backend)
    const { ctx, nativeRead } = settlementReadContext(backend, async () => ({ kind: 'confirmed', transactionRefs: settlementRefs }))
    expect(await reconcileSettlementHandler(ctx, { callRef, now: now + 10 })).toEqual({ kind: 'refused', code: 'managed_call_state_conflict' })
    expect(nativeRead).not.toHaveBeenCalled()
    expect(await settlementState(backend)).toEqual(before)
  })

  it.each(['expired-unused:', 'paid-result-loss:'])('refuses an active %s remedy before reading native evidence', async leaseOwner => {
    const backend = await heldFixture()
    await backend.run(async ctx => {
      const row = await ctx.db.query('capabilityCalls').first()
      if (row === null || row.reconciliation === undefined) throw new Error('fixture_missing')
      await ctx.db.patch(row._id, { reconciliation: { ...row.reconciliation, leaseOwner: `${leaseOwner}original` } })
    })
    const before = await settlementState(backend)
    const { ctx, nativeRead } = settlementReadContext(backend, async () => ({ kind: 'confirmed', transactionRefs: settlementRefs }))
    expect(await reconcileSettlementHandler(ctx, { callRef, now: now + 10 })).toEqual({ kind: 'refused', code: 'managed_call_remedy_in_progress' })
    expect(nativeRead).not.toHaveBeenCalled()
    expect(await settlementState(backend)).toEqual(before)
  })

  it('refuses missing booking material without reading native evidence', async () => {
    const backend = await heldFixture()
    await backend.run(async ctx => {
      const quote = await ctx.db.query('capabilityQuotes').first()
      if (quote === null) throw new Error('fixture_missing')
      await ctx.db.delete(quote._id)
    })
    const before = await settlementState(backend)
    const { ctx, nativeRead } = settlementReadContext(backend, async () => ({ kind: 'confirmed', transactionRefs: settlementRefs }))
    expect(await reconcileSettlementHandler(ctx, { callRef, now: now + 10 })).toEqual({ kind: 'refused', code: 'managed_call_reservation_not_found' })
    expect(nativeRead).not.toHaveBeenCalled()
    expect(await settlementState(backend)).toEqual(before)
  })

  it('rejects a booking changed during the external read before repairing any local evidence', async () => {
    const backend = await heldFixture()
    const { ctx } = settlementReadContext(backend, async () => {
      await backend.run(async dbCtx => {
        const quote = await dbCtx.db.query('capabilityQuotes').first()
        if (quote === null) throw new Error('fixture_missing')
        await dbCtx.db.patch(quote._id, { policyGeneration: quote.policyGeneration + 1 })
      })
      return { kind: 'confirmed', transactionRefs: settlementRefs }
    })
    const before = await settlementState(backend)
    expect(await reconcileSettlementHandler(ctx, { callRef, now: now + 10 })).toEqual({ kind: 'refused', code: 'managed_call_booking_changed' })
    const after = await settlementState(backend)
    expect(after.call).toEqual(before.call)
    expect(after.obligations).toEqual(before.obligations)
    expect(after.paymentAttempts).toEqual(before.paymentAttempts)
    expect(after.quote?.policyGeneration).toBe((before.quote?.policyGeneration ?? 0) + 1)
  })

  it('rechecks booking binding before an already-settled finalizer replay', async () => {
    const backend = await heldFixture()
    const material = await backend.query(internal.moneyManagedCall.readBooking, { callRef })
    if (material.kind !== 'available') throw new Error('fixture_missing')
    const args = { callRef, transactionRefs: settlementRefs, now: now + 10, expectedBookingDigest: canonicalDigest(material.booking) }
    expect(await backend.mutation(internal.moneyManagedCallLifecycle.finalizeSettlement, args)).toEqual({ kind: 'accepted', state: 'settled', replayed: false })
    await backend.run(async ctx => {
      const quote = await ctx.db.query('capabilityQuotes').first()
      if (quote === null) throw new Error('fixture_missing')
      await ctx.db.patch(quote._id, { policyGeneration: quote.policyGeneration + 1 })
    })
    const before = await settlementState(backend)
    expect(await backend.mutation(internal.moneyManagedCallLifecycle.finalizeSettlement, { ...args, now: now + 100 }))
      .toEqual({ kind: 'refused', code: 'managed_call_booking_changed' })
    expect(await settlementState(backend)).toEqual(before)
  })

  it('refuses a genuine pre-attachment reservation uncertainty without reconstructing local accounting', async () => {
    const backend = convexTest(schema, convexModules)
    await backend.run(async ctx => {
      await ctx.db.insert('capabilityQuotes', commitment())
      await ctx.db.insert('capabilityCalls', call())
    })
    expect(await backend.mutation(internal.moneyManagedCall.markReservationUnknown, {
      callRef, reference: 'formance:reserve-unknown', statusRef: 'formance:status-unknown',
    })).toBe(true)
    const before = await settlementState(backend)
    const { ctx } = settlementReadContext(backend, async () => ({ kind: 'confirmed', transactionRefs: settlementRefs }))
    expect(await reconcileSettlementHandler(ctx, { callRef, now: now + 10 }))
      .toEqual({ kind: 'refused', code: 'managed_call_reservation_evidence_invalid' })
    expect(await settlementState(backend)).toEqual(before)
  })

  it.each(['missing digest', 'wrong cardinality', 'digest conflict'] as const)(
    'refuses %s on the surviving reservation before any repair', async label => {
      const backend = await heldFixture()
      await backend.run(async ctx => {
        const row = await ctx.db.query('capabilityCalls').first()
        if (row === null) throw new Error('fixture_missing')
        if (label === 'missing digest') await ctx.db.patch(row._id, { formanceReservationDigest: undefined })
        else if (label === 'wrong cardinality') await ctx.db.patch(row._id, { formanceReservationRefs: reservationRefs.slice(0, 2) })
        else await ctx.db.patch(row._id, { formanceReservationDigest: canonicalDigest('other-attachment') })
      })
      const before = await settlementState(backend)
      const { ctx } = settlementReadContext(backend, async () => ({ kind: 'confirmed', transactionRefs: settlementRefs }))
      expect(await reconcileSettlementHandler(ctx, { callRef, now: now + 10 }))
        .toEqual({ kind: 'refused', code: 'managed_call_reservation_evidence_invalid' })
      expect(await settlementState(backend)).toEqual(before)
    },
  )

  it('refuses a missing original obligation without recreating it', async () => {
    const backend = await heldFixture()
    await backend.run(async ctx => {
      const obligation = await ctx.db.query('moneyProviderObligations').first()
      if (obligation === null) throw new Error('fixture_missing')
      await ctx.db.delete(obligation._id)
    })
    const before = await settlementState(backend)
    const { ctx } = settlementReadContext(backend, async () => ({ kind: 'confirmed', transactionRefs: settlementRefs }))
    expect(await reconcileSettlementHandler(ctx, { callRef, now: now + 10 }))
      .toEqual({ kind: 'refused', code: 'managed_call_obligation_missing' })
    expect(await settlementState(backend)).toEqual(before)
  })

  it.each([
    ['Call', { callRef: 'call:other' }], ['Tool', { toolRef: 'tool:other' }],
    ['Provider', { providerRef: 'provider:other' }], ['buyer', { buyerAccountRef: 'account:other' }],
    ['buyer amount', { buyerAmountUnits: '6000001' }], ['Provider amount', { providerAmountUnits: '5000001' }],
  ] satisfies readonly (readonly [string, Partial<Doc<'moneyProviderObligations'>>])[])(
    'refuses mismatched obligation %s without overwriting evidence', async (_label, patch) => {
      const backend = await heldFixture()
      await backend.run(async ctx => {
        const obligation = await ctx.db.query('moneyProviderObligations').first()
        if (obligation === null) throw new Error('fixture_missing')
        await ctx.db.patch(obligation._id, patch)
      })
      const before = await settlementState(backend)
      const { ctx } = settlementReadContext(backend, async () => ({ kind: 'confirmed', transactionRefs: settlementRefs }))
      expect(await reconcileSettlementHandler(ctx, { callRef, now: now + 10 }))
        .toEqual({ kind: 'refused', code: 'managed_call_obligation_evidence_invalid' })
      expect(await settlementState(backend)).toEqual(before)
    },
  )

  it.each([
    ['payable', { state: 'payable' }], ['reversed', { state: 'reversed' }], ['disputed', { state: 'disputed' }],
    ['reversal pending', { reversalState: 'pending' }], ['reversal succeeded', { reversalState: 'succeeded' }],
    ['reversal unknown', { reversalState: 'outcome_unknown' }],
  ] satisfies readonly (readonly [string, Partial<Doc<'moneyProviderObligations'>>])[])(
    'preserves later obligation disposition %s on recovery refusal', async (_label, patch) => {
      const backend = await heldFixture()
      await backend.run(async ctx => {
        const obligation = await ctx.db.query('moneyProviderObligations').first()
        if (obligation === null) throw new Error('fixture_missing')
        await ctx.db.patch(obligation._id, patch)
      })
      const before = await settlementState(backend)
      const { ctx } = settlementReadContext(backend, async () => ({ kind: 'confirmed', transactionRefs: settlementRefs }))
      expect(await reconcileSettlementHandler(ctx, { callRef, now: now + 10 }))
        .toEqual({ kind: 'refused', code: 'managed_call_obligation_state_conflict' })
      expect(await settlementState(backend)).toEqual(before)
    },
  )

  it('refuses an already-settled obligation with a different original settlement reference', async () => {
    const backend = await heldFixture()
    await backend.run(async ctx => {
      const obligation = await ctx.db.query('moneyProviderObligations').first()
      if (obligation === null) throw new Error('fixture_missing')
      await ctx.db.patch(obligation._id, { state: 'settled', settlementTransactionRef: 'formance:other-settlement' })
    })
    const before = await settlementState(backend)
    const { ctx } = settlementReadContext(backend, async () => ({ kind: 'confirmed', transactionRefs: settlementRefs }))
    expect(await reconcileSettlementHandler(ctx, { callRef, now: now + 10 }))
      .toEqual({ kind: 'refused', code: 'managed_call_obligation_settlement_conflict' })
    expect(await settlementState(backend)).toEqual(before)
  })

  it('refuses settled Call replay with an incomplete held obligation', async () => {
    const backend = await heldFixture()
    await backend.mutation(internal.moneyManagedCallLifecycle.finalizeSettlement, { callRef, transactionRefs: settlementRefs, now: now + 5 })
    await backend.run(async ctx => {
      const obligation = await ctx.db.query('moneyProviderObligations').first()
      if (obligation === null) throw new Error('fixture_missing')
      await ctx.db.patch(obligation._id, { state: 'held' })
    })
    const before = await settlementState(backend)
    const { ctx } = settlementReadContext(backend, async () => ({ kind: 'confirmed', transactionRefs: settlementRefs }))
    expect(await reconcileSettlementHandler(ctx, { callRef, now: now + 10 }))
      .toEqual({ kind: 'refused', code: 'managed_call_obligation_state_conflict' })
    expect(await settlementState(backend)).toEqual(before)
  })

  it('repairs the Call from an exact settled obligation without changing that later obligation fact', async () => {
    const backend = await heldFixture()
    await backend.run(async ctx => {
      const obligation = await ctx.db.query('moneyProviderObligations').first()
      if (obligation === null) throw new Error('fixture_missing')
      await ctx.db.patch(obligation._id, { state: 'settled', settlementTransactionRef: settlementRefs[1], settledAt: now + 2, updatedAt: now + 2 })
    })
    const before = await settlementState(backend)
    const { ctx } = settlementReadContext(backend, async () => ({ kind: 'confirmed', transactionRefs: settlementRefs }))
    expect(await reconcileSettlementHandler(ctx, { callRef, now: now + 10 })).toEqual({ kind: 'accepted', state: 'settled', replayed: false })
    const after = await settlementState(backend)
    expect(after.obligations).toEqual(before.obligations)
    expect(after.call).toEqual({ ...before.call, formanceFinancialState: 'settled',
      formanceSettlementRefs: settlementRefs, buyerSaleTransactionRef: settlementRefs[0], updatedAt: now + 10 })
    expect(after.paymentAttempts).toEqual(before.paymentAttempts)
    expect(after.quote).toEqual(before.quote)
  })
})

describe('paid Call with a lost response', () => {
  const transactionHash = `0x${'d'.repeat(64)}`
  const evidenceDigest = `sha256:${'e'.repeat(64)}`
  it('completes delivery only from the retained response after settlement and replays once', async () => {
    const backend = convexTestWithMarketComponents()
    await seedLostResult(backend)
    const output = { weather: 'fog', temperatureC: 13.8 }
    const result = await backend.run(async ctx => {
      const row = await ctx.db.query('capabilityCalls').first()
      const attempt = await ctx.db.query('moneyX402PaymentAttempts').first()
      if (row?.result?.kind !== 'reconciliation_required' || !row.result.receipt || !attempt) throw new Error('fixture_missing')
      await ctx.db.patch(row._id, { attemptRef: attempt.attemptRef,
        formanceSettlementRefs: ['formance:settle-buyer', 'formance:settle-provider'] })
      await ctx.db.patch(attempt._id, { settlementStatus: 'settled', responseStatus: 200,
        reconciliationEvidenceDigest: evidenceDigest,
        quarantinedOutputJson: JSON.stringify(output), quarantinedResponseDigest: evidenceDigest })
      return { kind: 'completed' as const, callRef, toolRef, output, evidenceHash: evidenceDigest,
        receipt: { ...row.result.receipt, state: 'settled' as const, refundState: 'not_applicable' as const } }
    })
    const args = { callRef, principalId: principalRef, state: 'completed' as const, result,
      attemptRef: 'attempt:lost', dispatchState: 'completed' as const, now: now + 5,
      clearResult: false, clearWorkId: false, clearAttemptRef: false,
      clearEvidenceHash: false, clearDispatchState: false }
    await backend.mutation(internal.capabilityCalls.projectRecovery, args)
    await expect(backend.run(async ctx => (await ctx.db.query('capabilityCalls').first())?.state))
      .resolves.toBe('reconciliation_required')
    await backend.run(async ctx => {
      const row = await ctx.db.query('capabilityCalls').first()
      if (row) await ctx.db.patch(row._id, { formanceFinancialState: 'settled' })
    })
    await backend.mutation(internal.capabilityCalls.projectRecovery, {
      ...args, result: { ...result, output: { weather: 'invented' } },
    })
    await expect(backend.run(async ctx => (await ctx.db.query('capabilityCalls').first())?.state))
      .resolves.toBe('reconciliation_required')
    await backend.mutation(internal.capabilityCalls.projectRecovery, args)
    await backend.mutation(internal.capabilityCalls.projectRecovery, { ...args, now: now + 1_000 })
    await expect(backend.query(internal.capabilityCalls.readOwnerRecovery, { callRef }))
      .resolves.toMatchObject({ state: 'completed', result: { output, usage: { chargeState: 'paid' },
        receipt: { transactionRef: 'formance:settle-buyer',
          accountingTransactionRefs: ['formance:settle-buyer', 'formance:settle-provider'] } } })
    await backend.run(async ctx => {
      const row = await ctx.db.query('capabilityCalls').first()
      if (row?.result?.kind !== 'completed') throw new Error('fixture_missing')
      const { usage: _usage, ...withoutUsage } = row.result
      await ctx.db.patch(row._id, { result: { ...withoutUsage, receipt: { ...withoutUsage.receipt!,
        transactionRef: 'formance:old-reservation', accountingTransactionRefs: ['formance:old-reservation'] } }, usage: undefined })
    })
    await backend.mutation(internal.capabilityCalls.projectRecovery, args)
    await expect(backend.query(internal.capabilityCalls.readOwnerRecovery, { callRef }))
      .resolves.toMatchObject({ state: 'completed', result: { output,
        usage: { chargeState: 'paid', transactionRef: 'formance:settle-buyer' },
        receipt: { transactionRef: 'formance:settle-buyer',
          accountingTransactionRefs: ['formance:settle-buyer', 'formance:settle-provider'] } } })
    await expect(backend.run(async ctx => await ctx.db.query('purchaseResolutionRecords').collect()))
      .resolves.toHaveLength(1)
    await expect(backend.run(async ctx => await ctx.db.query('capabilityCallProjections').collect()))
      .resolves.toMatchObject([{ state: 'completed', deliveryState: 'delivered', paymentState: 'settled' }])
    await expect(backend.query(api.marketListingEvidence.read, { toolRefs: [toolRef], since: now }))
      .resolves.toMatchObject([{ completedCalls: 1, latencySamplesMs: [5] }])
    await expect(backend.run(async ctx => await ctx.db.query('marketEvidenceFacts').collect()))
      .resolves.toMatchObject([{ sourceRef: callRef, occurredAt: now + 5, durationMs: 5 }])
  })

  it.each([undefined, '{"unexpected":true}'])('records paid invalid 2xx delivery once from retained body %s', async outputJson => {
    const backend = convexTestWithMarketComponents()
    await seedLostResult(backend)
    const result = await backend.run(async ctx => {
      const row = await ctx.db.query('capabilityCalls').first()
      const attempt = await ctx.db.query('moneyX402PaymentAttempts').first()
      if (row?.result?.kind !== 'reconciliation_required' || !row.result.receipt || !attempt) throw new Error('fixture_missing')
      await ctx.db.patch(row._id, { attemptRef: attempt.attemptRef, formanceFinancialState: 'settled',
        formanceSettlementRefs: settlementRefs })
      await ctx.db.patch(attempt._id, { settlementStatus: 'settled', responseStatus: 200,
        reconciliationEvidenceDigest: evidenceDigest, transportObservationDigest: evidenceDigest,
        ...(outputJson === undefined ? {} : { quarantinedOutputJson: outputJson, quarantinedResponseDigest: evidenceDigest }) })
      return { kind: 'refused' as const, toolRef, code: 'provider_output_invalid', retryable: false,
        receipt: { ...row.result.receipt, state: 'settled' as const,
          evidenceHash: evidenceDigest, refundState: 'not_applicable' as const, lossState: 'provider_output_invalid' as const } }
    })
    const args = { callRef, principalId: principalRef, state: 'refused' as const, result,
      attemptRef: 'attempt:lost', dispatchState: 'failed' as const, now: now + 5,
      clearResult: false, clearWorkId: false, clearAttemptRef: false,
      clearEvidenceHash: false, clearDispatchState: false }
    await backend.mutation(internal.capabilityCalls.projectRecovery, {
      ...args, result: { ...result, receipt: { ...result.receipt, evidenceHash: canonicalDigest('unrelated') } },
    })
    await expect(backend.run(async ctx => (await ctx.db.query('capabilityCalls').first())?.state))
      .resolves.toBe('reconciliation_required')
    await backend.mutation(internal.capabilityCalls.projectRecovery, args)
    await backend.mutation(internal.capabilityCalls.projectRecovery, { ...args, now: now + 1_000 })
    await expect(backend.query(internal.capabilityCalls.readOwnerRecovery, { callRef }))
      .resolves.toMatchObject({ state: 'refused', usage: { chargeState: 'paid', transactionRef: settlementRefs[0] },
        result: { code: 'provider_output_invalid', receipt: { state: 'settled', lossState: 'provider_output_invalid',
          refundState: 'not_applicable', accountingTransactionRefs: settlementRefs } } })
    await expect(backend.run(async ctx => await ctx.db.query('purchaseResolutionRecords').collect()))
      .resolves.toHaveLength(1)
    await expect(backend.run(async ctx => await ctx.db.query('capabilityCallProjections').collect()))
      .resolves.toMatchObject([{ state: 'refused', deliveryState: 'not_delivered', paymentState: 'settled' }])
    await expect(backend.run(async ctx => await ctx.db.query('marketEvidenceFacts').collect()))
      .resolves.toHaveLength(0)
  })

  it('closes buyer credit and Provider settlement once without inventing delivery evidence', async () => {
    const backend = convexTest(schema, convexModules)
    await seedLostResult(backend)
    const claim = { callRef, transactionHash }
    const claims = await Promise.all([
      backend.mutation(internal.moneyManagedCallRemedy.claim, claim),
      backend.mutation(internal.moneyManagedCallRemedy.claim, claim),
    ])
    expect(claims.map(value => value?.kind)).toEqual(['claimed', 'claimed'])
    expect(await backend.mutation(internal.moneyManagedCallRemedy.claim, {
      callRef, transactionHash: `0x${'f'.repeat(64)}`,
    })).toBeNull()
    const finish = { ...claim, evidenceDigest, transactionRefs: ['formance:buyer-restored', 'formance:provider-paid'] }
    expect(await backend.mutation(internal.moneyManagedCallRemedy.finish, finish)).toEqual({ kind: 'completed' })
    expect(await backend.mutation(internal.moneyManagedCallRemedy.finish, finish)).toEqual({ kind: 'completed' })
    const records = await backend.run(async ctx => ({
      call: await ctx.db.query('capabilityCalls').first(),
      payment: await ctx.db.query('moneyX402PaymentAttempts').first(),
      obligation: await ctx.db.query('moneyProviderObligations').first(),
    }))
    expect(records.call).toMatchObject({ state: 'refused', formanceFinancialState: 'released',
      result: { code: 'result_invalid', retryable: false, receipt: { state: 'refunded', refundState: 'released',
        externalSettlementRef: transactionHash } } })
    expect(records.payment).toMatchObject({ settlementStatus: 'settled', reconciliationEvidenceDigest: evidenceDigest })
    expect(records.payment).not.toHaveProperty('transportObservationDigest')
    expect(records.payment).not.toHaveProperty('quarantinedOutputJson')
    expect(records.obligation).toMatchObject({ state: 'settled', settlementTransactionRef: 'formance:provider-paid' })
    expect(await backend.mutation(internal.moneyManagedCallRemedy.claim, claim)).toEqual({ kind: 'completed' })
  })

  it('does not discard a recoverable response or finalize before recovery is claimed', async () => {
    const backend = convexTest(schema, convexModules)
    await seedLostResult(backend)
    expect(await backend.mutation(internal.moneyManagedCallRemedy.finish, {
      callRef, transactionHash, evidenceDigest, transactionRefs: ['a', 'b'],
    })).toEqual({ kind: 'refused' })
    await backend.run(async ctx => {
      const payment = await ctx.db.query('moneyX402PaymentAttempts').first()
      if (payment !== null) await ctx.db.patch(payment._id, {
        quarantinedOutputJson: '{"weather":"sunny"}', quarantinedResponseDigest: 'sha256:response',
      })
    })
    expect(await backend.mutation(internal.moneyManagedCallRemedy.claim, { callRef, transactionHash })).toBeNull()
  })
})

describe('promotional Call allocation recovery', () => {
  async function fixture() {
    const backend = convexTest(schema, convexModules)
    const allocation = {
      version: 'ae.promotional-credit-allocation:v1' as const,
      purchasedUnits: '2000000',
      grants: [{ grantRef: 'promo:managed', amountUnits: '4000000', expiresAt: now + 10 }],
    }
    await backend.run(async ctx => {
      await ctx.db.insert('capabilityQuotes', {
        ...commitment(), formanceSchemaVersion: 'v1.5.0', spendingPeriods: {
          version: 'ae.spending-periods:v1',
          daily: { ...currentUtcDayBounds(now), revision: 1, limitUnits: '10000000' },
          monthly: { ...currentUtcMonthBounds(now), revision: 1, limitUnits: '10000000' },
        },
      })
      await ctx.db.insert('capabilityCalls', { ...call(), promotionalCreditAllocation: allocation })
      await ctx.db.insert('moneyPromotionalGrants', {
        grantRef: 'promo:managed', accountRef, environment: 'sandbox',
        amountUnits: '4000000', availableUnits: '0', expiresAt: now + 10,
        createdAt: now - 10, updatedAt: now, operationKey: 'promo:managed',
        actorRef: 'admin:test', correlationId: 'promo:managed', commandDigest: canonicalDigest('promo'),
        reasonCode: 'onboarding', evidenceRefs: ['evidence:promo'], bookingState: 'booked', transactionRef: 'formance:promo', expiryRevision: 0,
      })
    })
    return { backend, allocation }
  }

  it('serializes concurrent reservation attempts while preserving its frozen claim', async () => {
    const { backend, allocation } = await fixture()
    let complete: ((result: FormanceMoneyResult) => void) | undefined
    const firstPosting = new Promise<FormanceMoneyResult>(resolve => { complete = resolve })
    const post = vi.fn().mockReturnValueOnce(firstPosting)
      .mockResolvedValueOnce({ kind: 'unavailable', code: 'formance_write_unavailable' })
    const ctx = {
      runQuery: (reference: Parameters<typeof backend.query>[0], args: never) => backend.query(reference, args),
      runMutation: (reference: Parameters<typeof backend.mutation>[0], args: never) => backend.mutation(reference, args),
      runAction: (reference: Parameters<ActionCtx['runAction']>[0], args: unknown) => {
        expect(getFunctionName(reference)).toBe('moneyFormance:reserveManagedCall')
        return post(args)
      },
    } as unknown as ActionCtx
    const row = call()
    const reservation = {
      quoteRef, callRef, principalId: principalRef, credentialId: row.credentialId,
      applicationRef: row.applicationRef, grantRef: row.grantRef, grantGeneration: row.grantGeneration,
      policyDigest: row.policyDigest, grantExpiresAt: row.grantExpiresAt, environment: row.environment,
      toolRef, idempotencyKey: row.idempotencyKey, inputDigest: row.inputDigest, requestDigest: row.requestDigest,
    }
    const principal = { ownerId: accountRef } as AgentAccessPrincipal
    const first = reserveFormanceBackedInvocation(ctx, principal, reservation, row.toolJson, {})
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(await reserveFormanceBackedInvocation(ctx, principal, reservation, row.toolJson, {}))
      .toMatchObject({ kind: 'refused', retryable: true })
    expect(await backend.run(ctx => ctx.db.query('moneyPromotionalGrants').first()))
      .toMatchObject({ availableUnits: '0' })
    expect(await backend.query(internal.moneyManagedCall.readBooking, { callRef }))
      .toMatchObject({ financialState: 'reservation_pending', booking: { promotionalCreditAllocation: allocation } })
    complete!({ kind: 'completed', transactionRefs: [...reservationRefs, 'formance:reserve-promo'], replayed: true })
    expect(await first).toMatchObject({ kind: 'replayed' })
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0]?.[0]).toMatchObject({ promotionalCreditAllocation: allocation })
    expect(await backend.query(internal.moneyManagedCall.readBooking, { callRef })).toMatchObject({ financialState: 'reserved' })
    expect(await backend.run(ctx => ctx.db.query('moneyProviderObligations').collect())).toHaveLength(1)
  })

  it('never restores a taken-over attempt, and permits exact booking after the lease expires', async () => {
    const { backend } = await fixture()
    const claim = await backend.mutation(internal.moneyManagedCall.claimReservationAttempt, { callRef, initialAdmission: true })
    expect(claim).toEqual({ kind: 'claimed', generation: 1 })
    expect(await backend.mutation(internal.moneyManagedCall.claimReservationAttempt, { callRef, initialAdmission: false }))
      .toEqual({ kind: 'busy' })
    await backend.run(async ctx => {
      const row = await ctx.db.query('capabilityCalls').first()
      if (row?.formanceReservationAttempt === undefined) throw new Error('attempt_missing')
      await ctx.db.patch(row._id, { formanceReservationAttempt: { ...row.formanceReservationAttempt, leaseUntil: Date.now() - 1 }, dispatchState: undefined })
    })
    expect(await backend.mutation(internal.moneyManagedCall.claimReservationAttempt, { callRef, initialAdmission: false }))
      .toEqual({ kind: 'claimed', generation: 2 })
    const row = call()
    const abandon = {
      quoteRef, callRef, principalId: principalRef, ownerId: accountRef, credentialId: row.credentialId,
      applicationRef: row.applicationRef, grantRef: row.grantRef, grantGeneration: row.grantGeneration,
      policyDigest: row.policyDigest, grantExpiresAt: row.grantExpiresAt, environment: row.environment,
      toolRef, idempotencyKey: row.idempotencyKey, inputDigest: row.inputDigest, requestDigest: row.requestDigest,
    }
    for (const generation of [1, 2]) expect(await backend.mutation(internal.capabilityCalls.abandon, {
      ...abandon, reservationAttemptGeneration: generation,
    })).toEqual({ kind: 'dispatch_started' })
    expect(await backend.run(ctx => ctx.db.query('moneyPromotionalGrants').first())).toMatchObject({ availableUnits: '0' })
    expect(await backend.mutation(internal.moneyManagedCall.attachReservation, {
      callRef, transactionRefs: [...reservationRefs, 'formance:reserve-promo'],
    })).toEqual({ kind: 'attached', replayed: false })
  })

  it('recovers only initial reservation uncertainty and rejects a late unknown result after attachment', async () => {
    const { backend } = await fixture()
    expect(await backend.mutation(internal.moneyManagedCall.markReservationUnknown, {
      callRef, reference: 'formance:reserve', statusRef: 'status:reserve',
    })).toBe(true)
    expect(await backend.mutation(internal.moneyManagedCall.attachReservation, {
      callRef, transactionRefs: [...reservationRefs, 'formance:reserve-promo'],
    })).toEqual({ kind: 'attached', replayed: false })
    expect(await backend.run(ctx => ctx.db.query('capabilityCalls').first()))
      .toMatchObject({ state: 'pending', formanceFinancialState: 'reserved' })
    expect(await backend.mutation(internal.moneyManagedCall.markReservationUnknown, {
      callRef, reference: 'formance:reserve', statusRef: 'status:reserve',
    })).toBe(false)
    expect(await backend.query(internal.moneyManagedCall.readBooking, { callRef })).toMatchObject({ financialState: 'reserved' })
  })

  it('freezes all grant references and restores a late release once under concurrent replay', async () => {
    const { backend, allocation } = await fixture()
    expect(await backend.mutation(internal.moneyManagedCall.attachReservation, {
      callRef, transactionRefs: reservationRefs,
    })).toEqual({ kind: 'refused', code: 'formance_reservation_invalid' })
    expect(await backend.mutation(internal.moneyManagedCall.attachReservation, {
      callRef, transactionRefs: [...reservationRefs, 'formance:reserve-promo'],
    })).toEqual({ kind: 'attached', replayed: false })
    expect(await backend.query(internal.moneyManagedCall.readBooking, { callRef }))
      .toMatchObject({ kind: 'available', booking: { promotionalCreditAllocation: allocation } })
    const refs = [...releaseRefs, 'formance:release-promo']
    const results = await Promise.all([0, 1].map(offset => backend.mutation(internal.moneyManagedCallLifecycle.finalizeRelease, {
      callRef, transactionRefs: refs, now: now + 20 + offset,
    })))
    expect(results).toContainEqual({ kind: 'accepted', state: 'released', replayed: false })
    expect(results).toContainEqual({ kind: 'accepted', state: 'released', replayed: true })
    const promo = await backend.run(ctx => ctx.db.query('moneyPromotionalGrants').first())
    expect(promo).toMatchObject({ availableUnits: '4000000', expiresAt: now + 10 })
    expect(promo?.nextWorkAt).toBeGreaterThanOrEqual(now + 20)
    expect(await backend.query(internal.moneyManagedCall.readBooking, { callRef }))
      .toMatchObject({ financialState: 'released', releaseRefs: refs, booking: { promotionalCreditAllocation: allocation } })
  })

  it('keeps an uncertain grant held and allows the original Call to settle after grant expiry', async () => {
    const { backend } = await fixture()
    await backend.mutation(internal.moneyManagedCall.attachReservation, {
      callRef, transactionRefs: [...reservationRefs, 'formance:reserve-promo'],
    })
    await backend.mutation(internal.moneyManagedCallLifecycle.markOutcomeUnknown, { callRef, evidenceDigest: canonicalDigest('unknown'), now: now + 1 })
    expect(await backend.mutation(internal.moneyManagedCallLifecycle.finalizeRelease, {
      callRef, transactionRefs: [...releaseRefs, 'formance:release-promo'], now: now + 20,
    })).toEqual({ kind: 'refused', code: 'managed_call_state_conflict' })
    expect(await backend.mutation(internal.moneyManagedCallLifecycle.finalizeSettlement, {
      callRef, transactionRefs: [...settlementRefs, 'formance:spend-promo'], now: now + 20,
    })).toEqual({ kind: 'accepted', state: 'settled', replayed: false })
    expect(await backend.run(ctx => ctx.db.query('moneyPromotionalGrants').first()))
      .toMatchObject({ availableUnits: '0' })
  })
})

describe('Formance managed Call evidence', () => {
  it('attaches one exact reservation from expired reference evidence and one payout-ineligible Provider obligation', async () => {
    const backend = convexTest(schema, convexModules)
    await expect(seedReservationFixture(backend)).resolves.toEqual({ kind: 'attached', replayed: false })
    await expect(backend.mutation(internal.moneyManagedCall.attachReservation, {
      callRef,
      transactionRefs: reservationRefs,
    })).resolves.toEqual({ kind: 'attached', replayed: true })
    await expect(backend.mutation(internal.moneyManagedCall.attachReservation, {
      callRef,
      transactionRefs: [...reservationRefs.slice(0, 2), 'formance:changed'],
    })).resolves.toEqual({ kind: 'refused', code: 'formance_reservation_conflict' })

    const reservationBooking = await backend.query(internal.moneyManagedCall.readBooking, { callRef })
    expect(reservationBooking).toMatchObject({ kind: 'available', financialState: 'reserved' })
    expect(reservationBooking).toHaveProperty('reservationRefs', reservationRefs)
    expect(reservationBooking).not.toHaveProperty('releaseRefs')
    expect(reservationBooking).not.toHaveProperty('settlementRefs')

    await expect(backend.run(async (ctx) => ({
      invocation: await ctx.db.query('capabilityCalls')
        .withIndex('by_callRef', (query) => query.eq('callRef', callRef)).unique(),
      obligations: await ctx.db.query('moneyProviderObligations').collect(),
    }))).resolves.toMatchObject({
      invocation: { formanceFinancialState: 'reserved', formanceReservationRefs: reservationRefs },
      obligations: [expect.objectContaining({
        obligationRef: `provider-obligation:${callRef}`,
        buyerAmountUnits: '6000000',
        providerAmountUnits: '5000000',
        state: 'accrued',
        payoutEligibility: 'ineligible_x402',
        evidenceRefs: [quoteRef, ...reservationRefs],
      })],
    })
  })

  it('refuses recovery evidence whose stored conversion or upstream amount was changed', async () => {
    const backend = convexTest(schema, convexModules)
    await seedReservationFixture(backend)
    await backend.run(async (ctx) => {
      const stored = await ctx.db.query('capabilityQuotes').withIndex('by_quoteRef', q => q.eq('quoteRef', quoteRef)).unique()
      if (stored === null) throw new Error('quote_missing')
      await ctx.db.patch(stored._id, { sourceUsdcUnits: '5000001' })
    })
    expect(await backend.query(internal.moneyManagedCall.readBooking, { callRef })).toEqual({ kind: 'not_found' })
  })

  it('retains possible submission and settles only from exact Formance references', async () => {
    const backend = convexTest(schema, convexModules)
    await seedReservationFixture(backend)
    await expect(backend.mutation(internal.moneyManagedCallLifecycle.markPossiblySubmitted, {
      callRef,
      evidenceDigest: 'sha256:submission-fence',
      now: now + 1,
    })).resolves.toEqual({ kind: 'accepted', state: 'possibly_submitted', replayed: false })
    await expect(backend.mutation(internal.moneyManagedCallLifecycle.markOutcomeUnknown, {
      callRef,
      evidenceDigest: 'sha256:transport-timeout',
      now: now + 2,
    })).resolves.toEqual({ kind: 'accepted', state: 'outcome_unknown', replayed: false })
    await expect(backend.mutation(internal.moneyManagedCallLifecycle.finalizeRelease, {
      callRef,
      transactionRefs: ['formance:release-aud', 'formance:release-usdc'],
      now: now + 3,
    })).resolves.toEqual({ kind: 'refused', code: 'managed_call_state_conflict' })
    await expect(backend.mutation(internal.moneyManagedCallLifecycle.finalizeSettlement, {
      callRef,
      transactionRefs: settlementRefs,
      now: now + 4,
    })).resolves.toEqual({ kind: 'accepted', state: 'settled', replayed: false })
    await expect(backend.mutation(internal.moneyManagedCallLifecycle.finalizeSettlement, {
      callRef,
      transactionRefs: settlementRefs,
      now: now + 5,
    })).resolves.toEqual({ kind: 'accepted', state: 'settled', replayed: true })
    // A settled historical Call can be replayed without issuing another Formance sale.
    await backend.run(async (ctx) => {
      const legacy = await ctx.db.query('capabilityCalls').withIndex('by_callRef', (query) => query.eq('callRef', callRef)).unique()
      if (legacy === null) throw new Error('managed_call_fixture_missing')
      await ctx.db.patch(legacy._id, { buyerSaleTransactionRef: undefined })
    })
    await expect(backend.action(internal.moneyManagedCallLifecycle.settle, {
      callRef, evidenceDigest: 'sha256:historical-replay', now: now + 6,
    })).resolves.toEqual({ kind: 'accepted', state: 'settled', replayed: true })
    const replayed = await backend.run(async (ctx) => ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', (query) => query.eq('callRef', callRef)).unique())
    expect(replayed?.buyerSaleTransactionRef).toBe(settlementRefs[0])

    const settlementBooking = await backend.query(internal.moneyManagedCall.readBooking, { callRef })
    expect(settlementBooking).toMatchObject({ kind: 'available', financialState: 'settled' })
    expect(settlementBooking).toHaveProperty('reservationRefs', reservationRefs)
    expect(settlementBooking).toHaveProperty('settlementRefs', settlementRefs)
    expect(settlementBooking).not.toHaveProperty('releaseRefs')

    await expect(backend.run(async (ctx) => ({
      invocation: await ctx.db.query('capabilityCalls')
        .withIndex('by_callRef', (query) => query.eq('callRef', callRef)).unique(),
      obligation: await ctx.db.query('moneyProviderObligations')
        .withIndex('by_callRef', (query) => query.eq('callRef', callRef)).unique(),
    }))).resolves.toMatchObject({
      invocation: { formanceFinancialState: 'settled', formanceSettlementRefs: settlementRefs },
      obligation: {
        state: 'settled',
        settlementTransactionRef: settlementRefs[1],
        settledAt: now + 4,
      },
    })
  })

  it('records a proven pre-submission release without claiming settlement', async () => {
    const backend = convexTest(schema, convexModules)
    await seedReservationFixture(backend)
    await expect(backend.mutation(internal.moneyManagedCallLifecycle.finalizeRelease, {
      callRef,
      transactionRefs: releaseRefs,
      now: now + 1,
    })).resolves.toEqual({ kind: 'accepted', state: 'released', replayed: false })
    const releaseBooking = await backend.query(internal.moneyManagedCall.readBooking, { callRef })
    expect(releaseBooking).toMatchObject({ kind: 'available', financialState: 'released' })
    expect(releaseBooking).toHaveProperty('reservationRefs', reservationRefs)
    expect(releaseBooking).toHaveProperty('releaseRefs', releaseRefs)
    expect(releaseBooking).not.toHaveProperty('settlementRefs')
    await expect(backend.run(async (ctx) => ({
      invocation: await ctx.db.query('capabilityCalls')
        .withIndex('by_callRef', (query) => query.eq('callRef', callRef)).unique(),
      obligation: await ctx.db.query('moneyProviderObligations')
        .withIndex('by_callRef', (query) => query.eq('callRef', callRef)).unique(),
    }))).resolves.toMatchObject({
      invocation: { formanceFinancialState: 'released', formanceReleaseRefs: releaseRefs },
      obligation: { state: 'reversed' },
    })
  })

  it('replays pre-submission release idempotently and rejects conflicting release references', async () => {
    const backend = convexTest(schema, convexModules)
    await seedReservationFixture(backend)
    await expect(backend.mutation(internal.moneyManagedCallLifecycle.finalizeRelease, {
      callRef,
      transactionRefs: releaseRefs,
      now: now + 1,
    })).resolves.toEqual({ kind: 'accepted', state: 'released', replayed: false })
    await expect(backend.mutation(internal.moneyManagedCallLifecycle.finalizeRelease, {
      callRef,
      transactionRefs: releaseRefs,
      now: now + 2,
    })).resolves.toEqual({ kind: 'accepted', state: 'released', replayed: true })
    await expect(backend.mutation(internal.moneyManagedCallLifecycle.finalizeRelease, {
      callRef,
      transactionRefs: ['formance:other-1', 'formance:other-2'],
      now: now + 3,
    })).resolves.toEqual({ kind: 'refused', code: 'managed_call_release_conflict' })

    const releaseBooking = await backend.query(internal.moneyManagedCall.readBooking, { callRef })
    expect(releaseBooking).toMatchObject({
      kind: 'available',
      financialState: 'released',
      reservationRefs,
      releaseRefs,
    })
    expect(releaseBooking).not.toHaveProperty('settlementRefs')

    await expect(backend.run(async (ctx) => ({
      invocation: await ctx.db.query('capabilityCalls')
        .withIndex('by_callRef', (query) => query.eq('callRef', callRef)).unique(),
      obligation: await ctx.db.query('moneyProviderObligations')
        .withIndex('by_callRef', (query) => query.eq('callRef', callRef)).unique(),
      obligationCount: (await ctx.db.query('moneyProviderObligations').collect()).length,
    }))).resolves.toEqual({
      invocation: expect.objectContaining({
        state: 'pending',
        formanceFinancialState: 'released',
        formanceReservationRefs: reservationRefs,
        formanceReleaseRefs: releaseRefs,
        updatedAt: now + 1,
      }),
      obligation: {
        _id: expect.any(String),
        _creationTime: expect.any(Number),
        obligationRef: `provider-obligation:${callRef}`,
        callRef,
        toolRef,
        providerRef: operation.identity.businessId,
        buyerAccountRef: accountRef,
        buyerAsset: 'AUD',
        buyerExponent: 6,
        buyerAmountUnits: '6000000',
        providerAsset: 'USDC',
        providerExponent: 6,
        providerAmountUnits: '5000000',
        settlementMethod: 'managed_x402',
        payoutEligibility: 'ineligible_x402',
        state: 'reversed',
        evidenceRefs: [quoteRef, ...reservationRefs],
        createdAt: expect.any(Number),
        updatedAt: now + 1,
      },
      obligationCount: 1,
    })
  })

  it('blocks only a managed Call whose bound financial scope has an open case', async () => {
    const backend = convexTest(schema, convexModules)
    await backend.run(async (ctx) => {
      await ctx.db.insert('capabilityQuotes', commitment())
      await ctx.db.insert('capabilityCalls', call())
      await ctx.db.insert('moneyReconciliationCases', {
        caseRef: 'money-case:managed-call-operation',
        accountRef,
        kind: 'settlement_difference',
        status: 'open',
        scopeType: 'tool',
        scopeRef: toolRef,
        reasonCode: 'settlement_reference_mismatch',
        evidenceRefs: ['evidence:managed-call-operation'],
        createdAt: now,
        updatedAt: now,
      })
    })
    await expect(backend.query(internal.moneyManagedCall.readBooking, { callRef }))
      .resolves.toMatchObject({ kind: 'available', entryRefusalCode: 'financial_scope_locked' })
  })

  it('refuses new buyer-directed treasury reversal and preserves exact historical reversal evidence', async () => {
    const backend = convexTestWithMarketComponents()
    const fixture = await publishedBusinessOwner(backend, 'provider-settlement-reversal')
    const settledAt = now + 4
    await backend.run(async (ctx) => {
      await ctx.db.insert('capabilityQuotes', {
        ...commitment(),
        accountRef: fixture.canonicalAccountRef,
        principalId: fixture.canonicalPrincipalRef,
      })
      await ctx.db.insert('capabilityCalls', {
        ...call(),
        ownerId: fixture.canonicalAccountRef,
        principalId: fixture.canonicalPrincipalRef,
      })
    })
    await backend.mutation(internal.moneyManagedCall.attachReservation, {
      callRef,
      transactionRefs: reservationRefs,
    })
    await backend.mutation(internal.moneyManagedCallLifecycle.markPossiblySubmitted, {
      callRef,
      evidenceDigest: 'sha256:submission-fence',
      now: now + 1,
    })
    const settlementRefs = ['formance:settle-buyer', 'formance:settle-provider']
    await backend.mutation(internal.moneyManagedCallLifecycle.finalizeSettlement, {
      callRef,
      transactionRefs: settlementRefs,
      now: settledAt,
    })
    const obligationRef = `provider-obligation:${callRef}`
    const evidenceDigest = `sha256:${'a'.repeat(64)}`
    const commandRef = 'provider-reversal:managed-call'
    const prepareArgs = await withSourceWrite('billing', {
      obligationRef,
      callRef,
      settlementTransactionRef: settlementRefs[1]!,
      evidenceRef: 'provider-reversal-evidence:managed-call',
      evidenceDigest,
      expectedUpdatedAt: settledAt,
      confirmation: obligationRef,
      commandRef,
      idempotencyKey: commandRef,
      proof: {
        reverificationId: 'reverification:provider-reversal',
        firstFactorAgeMinutes: 0,
        secondFactorAgeMinutes: -1,
      },
      operationKey: 'moneyProviderObligations:reverseOwnerSettlement',
      correlationId: commandRef,
    })

    await expect(fixture.owner.mutation(
      internal.moneyProviderObligations.prepareOwnerReversal,
      await withSourceWrite('billing', {
        obligationRef: prepareArgs.obligationRef,
        callRef: prepareArgs.callRef,
        settlementTransactionRef: prepareArgs.settlementTransactionRef,
        evidenceRef: prepareArgs.evidenceRef,
        evidenceDigest: prepareArgs.evidenceDigest,
        expectedUpdatedAt: prepareArgs.expectedUpdatedAt,
        confirmation: prepareArgs.confirmation,
        commandRef: prepareArgs.commandRef,
        idempotencyKey: prepareArgs.idempotencyKey,
        proof: prepareArgs.proof,
        operationKey: prepareArgs.operationKey,
        correlationId: prepareArgs.correlationId,
      }),
    )).resolves.toEqual({ kind: 'refused', code: 'provider_settlement_evidence_invalid', retryable: false })
    await expect(fixture.owner.mutation(
      internal.moneyProviderObligations.prepareOwnerReversal,
      prepareArgs,
    )).resolves.toEqual({ kind: 'refused', code: 'provider_settlement_evidence_invalid', retryable: false })

    // Historical native posting recovery can still finalize exact evidence;
    // the buyer-facing preparation path no longer creates this pending state.
    await backend.run(async ctx => {
      const row = await ctx.db.query('moneyProviderObligations')
        .withIndex('by_obligationRef', q => q.eq('obligationRef', obligationRef)).unique()
      if (row === null) throw new Error('missing historical obligation fixture')
      expect(row.reversalState).toBeUndefined()
      await ctx.db.patch(row._id, { reversalState: 'pending', reversalCommandRef: commandRef,
        reversalIdempotencyKey: commandRef, reversalEvidenceDigest: evidenceDigest })
    })

    const reversalRef = 'formance:provider-reversal'
    const finalizeArgs = {
      obligationRef,
      callRef,
      commandRef,
      idempotencyKey: commandRef,
      evidenceRef: prepareArgs.evidenceRef,
      evidenceDigest,
      settlementTransactionRef: settlementRefs[1]!,
      reversalTransactionRef: reversalRef,
    }
    await expect(backend.mutation(
      internal.moneyProviderObligations.finalizeOwnerReversal,
      finalizeArgs,
    )).resolves.toEqual({ kind: 'completed', obligationRef, transactionRef: reversalRef })
    await expect(backend.mutation(
      internal.moneyProviderObligations.finalizeOwnerReversal,
      finalizeArgs,
    )).resolves.toEqual({ kind: 'replayed', obligationRef, transactionRef: reversalRef })
    await expect(backend.run(async (ctx) => await ctx.db.query('moneyProviderObligations')
      .withIndex('by_obligationRef', (query) => query.eq('obligationRef', obligationRef)).unique()))
      .resolves.toMatchObject({
        state: 'reversed',
        payoutEligibility: 'ineligible_x402',
        reversalState: 'succeeded',
        reversalTransactionRef: reversalRef,
      })

    const conflictingEvidenceDigest = `sha256:${'b'.repeat(64)}`
    await expect(fixture.owner.mutation(
      internal.moneyProviderObligations.prepareOwnerReversal,
      await withSourceWrite('billing', {
        obligationRef,
        callRef,
        settlementTransactionRef: settlementRefs[1]!,
        evidenceRef: 'provider-reversal-evidence:conflict',
        evidenceDigest: conflictingEvidenceDigest,
        expectedUpdatedAt: settledAt,
        confirmation: obligationRef,
        commandRef,
        idempotencyKey: commandRef,
        proof: prepareArgs.proof,
        operationKey: prepareArgs.operationKey,
        correlationId: prepareArgs.correlationId,
      }),
    )).resolves.toEqual({
      kind: 'refused',
      code: 'provider_reversal_conflict',
      retryable: false,
    })
    await expect(backend.run(async (ctx) => await ctx.db.query('moneyProviderObligations')
      .withIndex('by_obligationRef', (query) => query.eq('obligationRef', obligationRef)).unique()))
      .resolves.toMatchObject({
        state: 'reversed',
        payoutEligibility: 'ineligible_x402',
        reversalTransactionRef: reversalRef,
      })
  })
})


describe('verified-paid HTTP error remedy', () => {
  const publicRef = createPublicToolRef({ operationId: operation.operationId,
    publicationRef: operation.identity.publicationRef, publicationRevision: operation.identity.publicationRevision,
    contractRef: operation.contract.ref })
  const transactionHash = `0x${'d'.repeat(64)}`
  const identity = { callRef, transactionHash, failureKind: 'http_error' as const }
  const finish = { ...identity, evidenceDigest: canonicalDigest('http-error-evidence'),
    transactionRefs: ['formance:buyer-restored', 'formance:provider-paid'] }
  async function seedHttpError(backend: ReturnType<typeof convexTest>, responseStatus = 500) {
    await seedLostResult(backend)
    await backend.run(async ctx => {
      const row = await ctx.db.query('capabilityCalls').first()
      const payment = await ctx.db.query('moneyX402PaymentAttempts').first()
      if (!row?.result || !payment) throw new Error('fixture_missing')
      await ctx.db.patch(row._id, { toolRef: publicRef, attemptRef: 'attempt:lost',
        result: { ...row.result, toolRef: publicRef } })
      await ctx.db.patch(payment._id, { toolRef: publicRef, settlementStatus: 'settled',
        responseStatus, transportRequestDigest: canonicalDigest('paid-request'),
        paymentObservationDigest: canonicalDigest('paid-observation'),
        transportObservationDigest: canonicalDigest('observed-http-error') })
      const quote = await ctx.db.query('capabilityQuotes').first()
      const obligation = await ctx.db.query('moneyProviderObligations').first()
      if (!quote || !obligation) throw new Error('fixture_missing')
      await ctx.db.patch(quote._id, { toolRef: publicRef })
      await ctx.db.patch(obligation._id, { toolRef: publicRef })
    })
  }
  it('restores held buyer credit while recording the original paid Provider once from a status-only response', async () => {
    const backend = convexTest(schema, convexModules)
    await seedHttpError(backend)
    expect(await backend.mutation(internal.moneyManagedCallRemedy.claim, { callRef, transactionHash })).toBeNull()
    const claims = await Promise.all([backend.mutation(internal.moneyManagedCallRemedy.claim, identity),
      backend.mutation(internal.moneyManagedCallRemedy.claim, identity)])
    expect(claims.map(value => value?.kind)).toEqual(['claimed', 'claimed'])
    expect(await backend.mutation(internal.moneyManagedCallRemedy.claim,
      { ...identity, transactionHash: `0x${'f'.repeat(64)}` })).toBeNull()
    expect(await backend.mutation(internal.moneyManagedCallRemedy.finish, finish)).toEqual({ kind: 'completed' })
    expect(await backend.mutation(internal.moneyManagedCallRemedy.finish, finish)).toEqual({ kind: 'completed' })
    const records = await backend.run(async ctx => ({
      call: await ctx.db.query('capabilityCalls').first(), payment: await ctx.db.query('moneyX402PaymentAttempts').first(),
      obligation: await ctx.db.query('moneyProviderObligations').first(),
      activity: await ctx.db.query('capabilityCallProjections').collect(),
    }))
    expect(callResultSchema.safeParse(records.call?.result).success).toBe(true)
    expect(publicRef).not.toBe(operation.operationId)
    expect(records.call).toMatchObject({ toolRef: publicRef, state: 'refused', formanceFinancialState: 'released',
      result: { code: 'provider_refused', receipt: { state: 'refunded', refundState: 'released', lossState: 'provider_http_error',
        externalSettlementRef: transactionHash, accountingTransactionRefs: finish.transactionRefs } } })
    expect(records.payment).toMatchObject({ settlementStatus: 'settled',
      responseStatus: 500 })
    expect(records.obligation).toMatchObject({ state: 'settled', settlementTransactionRef: 'formance:provider-paid' })
    expect(records.activity).toMatchObject([{ state: 'refused', deliveryState: 'not_delivered' }])
    await expect(backend.query(internal.marketListingEvidence.selectionEvidenceInternal, { toolRefs: [publicRef] }))
      .resolves.toMatchObject([{ toolRef: publicRef, aeCompleted: 0, aeFailed: 1 }])
    expect(await backend.mutation(internal.moneyManagedCallRemedy.claim, identity)).toEqual({ kind: 'completed' })
  })
  it('rejects a forged public reference even when Call and payment share it', async () => {
    const backend = convexTest(schema, convexModules)
    await seedHttpError(backend)
    await backend.run(async ctx => {
      const row = await ctx.db.query('capabilityCalls').first()
      const payment = await ctx.db.query('moneyX402PaymentAttempts').first()
      if (!row?.result || !payment) throw new Error('fixture_missing')
      await ctx.db.patch(row._id, { toolRef, result: { ...row.result, toolRef } })
      await ctx.db.patch(payment._id, { toolRef })
    })
    expect(await backend.mutation(internal.moneyManagedCallRemedy.claim, identity)).toBeNull()
  })
  it('rejects a successful HTTP status and does not release a previously captured buyer Charge', async () => {
    const valid = convexTest(schema, convexModules)
    await seedHttpError(valid, 200)
    expect(await valid.mutation(internal.moneyManagedCallRemedy.claim, identity)).toBeNull()
    const captured = convexTest(schema, convexModules)
    await seedHttpError(captured)
    await captured.run(async ctx => {
      const row = await ctx.db.query('capabilityCalls').first()
      if (row) await ctx.db.patch(row._id, { formanceFinancialState: 'settled', formanceSettlementRefs: settlementRefs })
    })
    expect(await captured.mutation(internal.moneyManagedCallRemedy.claim, identity)).toBeNull()
    expect(await captured.mutation(internal.moneyManagedCallRemedy.finish, finish)).toEqual({ kind: 'refused' })
    expect(await captured.run(async ctx => await ctx.db.query('capabilityCalls').first()))
      .toMatchObject({ formanceFinancialState: 'settled', formanceSettlementRefs: settlementRefs })
  })
  it('pins the remedy across interrupted work and revalidates the response status before finalizing', async () => {
    const backend = convexTest(schema, convexModules)
    await seedHttpError(backend)
    await backend.run(async ctx => {
      const row = await ctx.db.query('capabilityCalls').first()
      if (row) await ctx.db.patch(row._id, { reconciliation: { disposition: 'automatic',
        reason: 'recovery_failed', attemptCount: 1, nextAttemptAt: now,
        leaseOwner: 'paid-response:1', leaseExpiresAt: Number.MAX_SAFE_INTEGER } })
    })
    expect(await backend.mutation(internal.moneyManagedCallRemedy.claim, identity)).toMatchObject({ kind: 'claimed' })
    expect(await backend.mutation(internal.moneyManagedCallRemedy.claim, identity)).toMatchObject({ kind: 'claimed' })
    await backend.run(async ctx => {
      const payment = await ctx.db.query('moneyX402PaymentAttempts').first()
      if (payment) await ctx.db.patch(payment._id, { responseStatus: 200 })
    })
    expect(await backend.mutation(internal.moneyManagedCallRemedy.finish, finish)).toEqual({ kind: 'refused' })
  })
})
