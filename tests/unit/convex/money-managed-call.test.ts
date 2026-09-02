/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from '../../../convex/schema'
import { internal } from '../../../convex/_generated/api'
import { reserveManagedCallInTransaction } from '../../../convex/moneyManagedCall'
import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import { projectionChecksum } from '../../../src/modules/money/public'

const convexModules = Object.fromEntries(
  Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
    .map(([path, load]) => [path.replace('../../../convex/', './'), load]),
)

const now = Date.UTC(2026, 8, 2, 2, 0, 0)
const accountRef = 'account:managed-call'
const principalRef = 'principal:managed-call'
const customerLedgerRef = `ledger:aud:customer-prepayment:${accountRef}`
const policyDigest = canonicalDigest({
  format: 'ae.commercial-policy-gate:v1',
  environment: 'sandbox',
  fixture: 'managed_x402_deterministic_v1',
})

function commitment(index: number) {
  const commitmentRef = `operation-commitment:v1:${index}`
  return {
    commitmentRef,
    principalId: principalRef,
    accountRef,
    credentialId: `credential:${index}`,
    applicationRef: 'application:shared-agent',
    environment: 'sandbox' as const,
    grantRef: `grant:${index}`,
    grantGeneration: 1,
    grantPolicyDigest: `sha256:grant:${index}`,
    grantExpiresAt: now + 60_000,
    operationRef: 'operation:managed-x402',
    operationRevision: 1,
    operationMaterialDigest: 'sha256:operation-material',
    currentOperationDigest: 'sha256:current-operation',
    operationJson: '{}',
    normalizedInputJson: '{}',
    inputDigest: `sha256:input:${index}`,
    pricingJson: '{}',
    pricingDigest: 'sha256:pricing',
    decisionAudUnits: '6000000',
    sourceUsdcUnits: '6000000',
    rateEvidenceJson: '{}',
    rateEvidenceDigest: 'sha256:rate',
    budgetPolicyRef: 'budget:shared-agent',
    budgetGeneration: 1,
    maximumSpendPerInvocationUnits: '6000000',
    balanceLedgerAccountRef: customerLedgerRef,
    balanceVersion: 1,
    balanceChecksum: 'sha256:inspection-balance',
    balanceUnits: '10000000',
    treasuryCustodyRef: 'custody:sandbox:managed-x402',
    treasuryCustodyGeneration: 1,
    treasuryVersion: 1,
    treasuryEvidenceRef: 'treasury-observation:managed-call',
    treasurySpendableUnits: '10000000',
    commercialPolicyRefs: ['commercial-policy-fixture:managed_x402_deterministic_v1'],
    commercialPolicyDigest: policyDigest,
    evidenceDigest: `sha256:commitment:${index}`,
    state: 'issued' as const,
    expiresAt: now + 30_000,
    createdAt: now - 1,
    updatedAt: now - 1,
  }
}

describe('managed Call atomic reservation', () => {
  it('lets simultaneous credentials share one Principal budget without overspending Account or treasury', async () => {
    const backend = convexTest(schema, convexModules)
    const [firstCommitmentId, secondCommitmentId] = await backend.run(async (ctx) => {
      await ctx.db.insert('moneyLedgerAccounts', {
        ledgerAccountRef: customerLedgerRef,
        accountRef,
        asset: 'AUD',
        exponent: 6,
        accountKind: 'customer_prepayment_liability',
        normalBalance: 'credit',
        state: 'active',
        version: 1,
        createdAt: now - 1,
        updatedAt: now - 1,
      })
      const balance = {
        ledgerAccountRef: customerLedgerRef,
        accountRef,
        asset: 'AUD' as const,
        exponent: 6 as const,
        balanceUnits: 10_000_000n,
        version: 1,
      }
      await ctx.db.insert('moneyBalanceProjections', {
        ...balance,
        balanceUnits: balance.balanceUnits.toString(),
        checksum: projectionChecksum([balance]),
        state: 'active',
        updatedAt: now - 1,
      })
      await ctx.db.insert('moneyTreasuryProjections', {
        environment: 'sandbox',
        custodyRef: 'custody:sandbox:managed-x402',
        custodyGeneration: 1,
        network: 'eip155:84532',
        asset: 'USDC',
        exponent: 6,
        observedTotalUnits: '10000000',
        committedUnits: '0',
        pendingOutflowUnits: '0',
        settledOutflowUnits: '0',
        bufferUnits: '0',
        spendableUnits: '10000000',
        version: 1,
        lastObservationRef: 'treasury-observation:managed-call',
        observedAt: now - 1,
        updatedAt: now - 1,
      })
      return await Promise.all([
        ctx.db.insert('capabilityOperationCommitments', commitment(1)),
        ctx.db.insert('capabilityOperationCommitments', commitment(2)),
      ])
    })

    const reserve = async (commitmentId: typeof firstCommitmentId, index: number) =>
      await backend.run(async (ctx) => {
        const row = await ctx.db.get(commitmentId)
        if (row === null) throw new Error('commitment_fixture_missing')
        return await reserveManagedCallInTransaction(ctx as never, {
          commitment: row,
          invocationRef: `invocation:${index}`,
          providerRef: 'provider:managed-x402',
          maximumDailySpend: { currency: 'AUD', exponent: 6, units: '10000000' },
          maximumMonthlySpend: { currency: 'AUD', exponent: 6, units: '10000000' },
          now,
        })
      })

    const outcomes = await Promise.all([
      reserve(firstCommitmentId, 1),
      reserve(secondCommitmentId, 2),
    ])
    expect(outcomes.filter((outcome) => outcome.kind === 'reserved')).toHaveLength(1)
    expect(outcomes.filter((outcome) => outcome.kind === 'refused')).toHaveLength(1)

    await expect(backend.run(async (ctx) => ({
      calls: await ctx.db.query('moneyCallReservations').collect(),
      obligations: await ctx.db.query('moneyProviderObligations').collect(),
      account: await ctx.db.query('moneyBalanceProjections')
        .withIndex('by_ledgerAccountRef', (query) => query.eq('ledgerAccountRef', customerLedgerRef))
        .unique(),
      budgets: await ctx.db.query('moneyAgentBudgetProjections').collect(),
      treasury: await ctx.db.query('moneyTreasuryProjections').collect(),
    }))).resolves.toMatchObject({
      calls: [expect.objectContaining({ principalRef, decisionAudUnits: '6000000', state: 'reserved' })],
      obligations: [expect.objectContaining({ payoutEligibility: 'ineligible_x402', state: 'accrued' })],
      account: { balanceUnits: '4000000' },
      budgets: [
        expect.objectContaining({ principalRef, windowKind: 'day', reservedUnits: '6000000' }),
        expect.objectContaining({ principalRef, windowKind: 'month', reservedUnits: '6000000' }),
      ],
      treasury: [expect.objectContaining({ committedUnits: '6000000', spendableUnits: '4000000' })],
    })

    const reservedCall = await backend.run(async (ctx) =>
      (await ctx.db.query('moneyCallReservations').collect())[0],
    )
    if (reservedCall === undefined) throw new Error('managed_call_fixture_missing')
    await expect(backend.mutation(internal.moneyManagedCallLifecycle.markPossiblySubmitted, {
      invocationRef: reservedCall.invocationRef,
      evidenceDigest: 'sha256:submission-fence',
      now: now + 1,
    })).resolves.toEqual({ kind: 'accepted', state: 'possibly_submitted', replayed: false })
    await expect(backend.mutation(internal.moneyManagedCallLifecycle.markOutcomeUnknown, {
      invocationRef: reservedCall.invocationRef,
      evidenceDigest: 'sha256:transport-timeout',
      now: now + 2,
    })).resolves.toEqual({ kind: 'accepted', state: 'outcome_unknown', replayed: false })
    await expect(backend.mutation(internal.moneyManagedCallLifecycle.releaseBeforeSubmission, {
      invocationRef: reservedCall.invocationRef,
      now: now + 3,
    })).rejects.toThrow('managed_call_release_after_submission_refused')
    await expect(backend.mutation(internal.moneyManagedCallLifecycle.settle, {
      invocationRef: reservedCall.invocationRef,
      evidenceDigest: 'sha256:official-x402-settlement',
      now: now + 4,
    })).resolves.toEqual({ kind: 'accepted', state: 'settled', replayed: false })

    await expect(backend.run(async (ctx) => ({
      call: await ctx.db.query('moneyCallReservations')
        .withIndex('by_invocationRef', (query) => query.eq('invocationRef', reservedCall.invocationRef))
        .unique(),
      obligation: await ctx.db.query('moneyProviderObligations')
        .withIndex('by_invocationRef', (query) => query.eq('invocationRef', reservedCall.invocationRef))
        .unique(),
      budgets: await ctx.db.query('moneyAgentBudgetProjections').collect(),
      exposure: await ctx.db.query('moneyRegulatoryExposureProjections').collect(),
      treasury: await ctx.db.query('moneyTreasuryProjections').collect(),
      balances: await ctx.db.query('moneyBalanceProjections').collect(),
      legacyProviderAccounts: await ctx.db.query('moneyAccounts').collect(),
      payoutAllocations: await ctx.db.query('moneyPayoutAllocations').collect(),
      payouts: await ctx.db.query('moneyPayouts').collect(),
    }))).resolves.toMatchObject({
      call: { state: 'settled' },
      obligation: { state: 'settled', payoutEligibility: 'ineligible_x402' },
      budgets: [
        expect.objectContaining({ windowKind: 'day', reservedUnits: '0', settledUnits: '6000000' }),
        expect.objectContaining({ windowKind: 'month', reservedUnits: '0', settledUnits: '6000000' }),
      ],
      exposure: [expect.objectContaining({ reservedUnits: '0', pendingUnits: '0', settledUnits: '6000000' })],
      treasury: [expect.objectContaining({ committedUnits: '0', pendingOutflowUnits: '0', settledOutflowUnits: '6000000' })],
      balances: expect.arrayContaining([
        expect.objectContaining({ ledgerAccountRef: customerLedgerRef, balanceUnits: '4000000' }),
        expect.objectContaining({ ledgerAccountRef: `ledger:aud:call-reservation:${reservedCall.invocationRef}`, balanceUnits: '0' }),
        expect.objectContaining({ ledgerAccountRef: 'ledger:aud:provider-obligation:provider:managed-x402', balanceUnits: '6000000' }),
      ]),
      legacyProviderAccounts: [],
      payoutAllocations: [],
      payouts: [],
    })

    const obligationRef = `provider-obligation:${reservedCall.invocationRef}`
    await expect(backend.mutation(internal.moneyProviderObligations.markDisputed, {
      obligationRef,
      evidenceRef: 'evidence:provider-dispute-opened',
      observedAt: now + 5,
    })).resolves.toEqual({ kind: 'disputed', obligationRef })
    await expect(backend.mutation(internal.moneyProviderObligations.resolveDispute, {
      obligationRef,
      evidenceRef: 'evidence:provider-dispute-resolved',
      observedAt: now + 6,
    })).resolves.toEqual({ kind: 'settled', obligationRef })
    await expect(backend.run(async (ctx) => ({
      obligation: await ctx.db.query('moneyProviderObligations')
        .withIndex('by_obligationRef', (query) => query.eq('obligationRef', obligationRef))
        .unique(),
      payoutAllocations: await ctx.db.query('moneyPayoutAllocations').collect(),
      payouts: await ctx.db.query('moneyPayouts').collect(),
    }))).resolves.toMatchObject({
      obligation: {
        state: 'settled',
        payoutEligibility: 'ineligible_x402',
        evidenceRefs: expect.arrayContaining([
          'evidence:provider-dispute-opened',
          'evidence:provider-dispute-resolved',
        ]),
      },
      payoutAllocations: [],
      payouts: [],
    })
  })

  it('atomically closes a proven pre-submission x402 attempt and releases every managed hold', async () => {
    const backend = convexTest(schema, convexModules)
    const commitmentId = await backend.run(async (ctx) => {
      await ctx.db.insert('moneyLedgerAccounts', {
        ledgerAccountRef: customerLedgerRef,
        accountRef,
        asset: 'AUD',
        exponent: 6,
        accountKind: 'customer_prepayment_liability',
        normalBalance: 'credit',
        state: 'active',
        version: 1,
        createdAt: now - 1,
        updatedAt: now - 1,
      })
      const balance = {
        ledgerAccountRef: customerLedgerRef,
        accountRef,
        asset: 'AUD' as const,
        exponent: 6 as const,
        balanceUnits: 10_000_000n,
        version: 1,
      }
      await ctx.db.insert('moneyBalanceProjections', {
        ...balance,
        balanceUnits: balance.balanceUnits.toString(),
        checksum: projectionChecksum([balance]),
        state: 'active',
        updatedAt: now - 1,
      })
      await ctx.db.insert('moneyTreasuryProjections', {
        environment: 'sandbox',
        custodyRef: 'custody:sandbox:managed-x402',
        custodyGeneration: 1,
        network: 'eip155:84532',
        asset: 'USDC',
        exponent: 6,
        observedTotalUnits: '10000000',
        committedUnits: '0',
        pendingOutflowUnits: '0',
        settledOutflowUnits: '0',
        bufferUnits: '0',
        spendableUnits: '10000000',
        version: 1,
        lastObservationRef: 'treasury-observation:managed-call',
        observedAt: now - 1,
        updatedAt: now - 1,
      })
      return await ctx.db.insert('capabilityOperationCommitments', commitment(3))
    })
    const invocationRef = 'invocation:pre-submit-proof'
    const attemptRef = 'attempt:pre-submit-proof'
    const reserved = await backend.run(async (ctx) => {
      const row = await ctx.db.get(commitmentId)
      if (row === null) throw new Error('commitment_fixture_missing')
      const result = await reserveManagedCallInTransaction(ctx as never, {
        commitment: row,
        invocationRef,
        providerRef: 'provider:managed-x402',
        maximumDailySpend: { currency: 'AUD', exponent: 6, units: '10000000' },
        maximumMonthlySpend: { currency: 'AUD', exponent: 6, units: '10000000' },
        now,
      })
      if (result.kind !== 'reserved') throw new Error('managed_call_reservation_fixture_failed')
      const reservation = await ctx.db.query('moneyCallReservations')
        .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
        .unique()
      if (reservation === null) throw new Error('managed_call_reservation_fixture_missing')
      if (reservation.sourceUsdcUnits === undefined) throw new Error('managed_call_source_amount_fixture_missing')
      const paymentReservationRef = reservation.treasuryReservationRef ?? reservation.reservationRef
      await ctx.db.insert('moneyX402PaymentAttempts', {
        dispatchRef: invocationRef,
        attemptRef,
        effectGeneration: 1,
        operationRef: reservation.operationRef,
        inputDigest: commitment(3).inputDigest,
        paymentIdentifier: 'payment:pre-submit-proof',
        operationKeyDigest: 'sha256:operation-key',
        challengeDigest: 'sha256:challenge',
        challengeJson: '{}',
        selectedRequirementJson: '{}',
        providerEndpoint: 'https://provider.example.test/operation',
        credentialRef: 'env:AE_X402_CDP_ACCOUNT_NAME',
        scheme: 'exact',
        network: 'eip155:84532',
        asset: 'USDC',
        payTo: '0x0000000000000000000000000000000000000001',
        amountUnits: reservation.sourceUsdcUnits,
        currency: 'USDC',
        exponent: 6,
        custodyRef: 'custody-attempt:pre-submit-proof',
        authorizationDigest: 'sha256:authorization',
        reservationRef: paymentReservationRef,
        state: 'reconciliation_required',
        preparedAt: now,
        settlementStatus: 'unknown',
        evidenceRefs: [],
      })
      return { reservation, paymentReservationRef }
    })
    const proof = {
      invocationRef,
      attemptRef,
      effectGeneration: 1,
      operationRef: reserved.reservation.operationRef,
      inputDigest: commitment(3).inputDigest,
      reservationRef: reserved.paymentReservationRef,
      paymentIdentifier: 'payment:pre-submit-proof',
      challengeDigest: 'sha256:challenge',
      evidenceRef: 'evidence:pre-submit-proof',
      evidenceDigest: 'sha256:pre-submit-proof',
      paymentResponseDigest: 'sha256:no-payment-response',
      transportObservationDigest: 'sha256:no-transport',
      transportRequestDigest: 'sha256:no-request',
      paymentObservationDigest: 'sha256:no-payment',
      observedAt: now + 1,
    }
    await expect(backend.mutation(
      internal.moneyManagedCallLifecycle.releaseBeforeSubmissionWithX402Proof,
      proof,
    )).resolves.toEqual({ kind: 'accepted', state: 'released', replayed: false })
    await expect(backend.mutation(
      internal.moneyManagedCallLifecycle.releaseBeforeSubmissionWithX402Proof,
      proof,
    )).resolves.toEqual({ kind: 'accepted', state: 'released', replayed: true })

    await expect(backend.run(async (ctx) => ({
      reservation: await ctx.db.query('moneyCallReservations')
        .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef)).unique(),
      payment: await ctx.db.query('moneyX402PaymentAttempts')
        .withIndex('by_attemptRef_and_effectGeneration', (query) => query.eq('attemptRef', attemptRef).eq('effectGeneration', 1)).unique(),
      obligation: await ctx.db.query('moneyProviderObligations')
        .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef)).unique(),
      account: await ctx.db.query('moneyBalanceProjections')
        .withIndex('by_ledgerAccountRef', (query) => query.eq('ledgerAccountRef', customerLedgerRef)).unique(),
      treasury: await ctx.db.query('moneyTreasuryProjections').collect(),
    }))).resolves.toMatchObject({
      reservation: { state: 'released' },
      payment: {
        state: 'observed',
        settlementStatus: 'not_settled',
        reconciliationEvidenceDigest: proof.evidenceDigest,
      },
      obligation: { state: 'reversed' },
      account: { balanceUnits: '10000000' },
      treasury: [expect.objectContaining({ committedUnits: '0', spendableUnits: '10000000' })],
    })
  })
})
