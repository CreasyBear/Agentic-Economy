/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from '../../../convex/schema'
import { internal } from '../../../convex/_generated/api'
import { buildDevelopmentPublishedToolEvidence } from '../../../tools/dev/fixtures/capability-supply/development-published-tool-evidence'
import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import { PACKAGE4_FORMANCE_REQUIREMENTS, quoteManagedX402BuyerAud } from '../../../src/modules/money/public'
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
    formanceSchemaVersion: PACKAGE4_FORMANCE_REQUIREMENTS.schemaVersion,
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

  it('binds a Provider settlement reversal to owner proof, exact evidence, and one append-only reference', async () => {
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
    )).resolves.toEqual({ kind: 'prepared' })
    await expect(fixture.owner.mutation(
      internal.moneyProviderObligations.prepareOwnerReversal,
      prepareArgs,
    )).resolves.toEqual({ kind: 'prepared' })

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
        state: 'disputed',
        payoutEligibility: 'ineligible_x402',
        reversalTransactionRef: reversalRef,
      })
  })
})
