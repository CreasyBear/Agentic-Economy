/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from '../../../convex/schema'
import { internal } from '../../../convex/_generated/api'
import { buildDevelopmentPublishedOperationEvidence } from '../../../tools/dev/fixtures/capability-supply/development-published-operation-evidence'
import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import { PACKAGE4_FORMANCE_REQUIREMENTS } from '../../../src/modules/money/public'

const convexModules = Object.fromEntries(
  Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
    .map(([path, load]) => [path.replace('../../../convex/', './'), load]),
)

const now = Date.UTC(2026, 8, 2, 2, 0, 0)
const accountRef = 'account:managed-call'
const principalRef = 'principal:managed-call'
const operation = buildDevelopmentPublishedOperationEvidence().operation
const commitmentRef = 'operation-commitment:v1:managed-call'
const invocationRef = 'invocation:managed-call'
const reservationRefs = ['formance:reserve-aud', 'formance:reserve-usdc', 'formance:obligation']

function commitment() {
  return {
    commitmentRef,
    principalId: principalRef,
    accountRef,
    credentialId: 'credential:managed-call',
    applicationRef: 'application:managed-call',
    environment: 'sandbox' as const,
    grantRef: 'grant:managed-call',
    grantGeneration: 1,
    grantPolicyDigest: 'sha256:grant',
    grantExpiresAt: now + 60_000,
    operationRef: operation.operationId,
    operationRevision: operation.identity.publicationRevision,
    operationMaterialDigest: 'sha256:operation-material',
    currentOperationDigest: 'sha256:current-operation',
    operationJson: JSON.stringify(operation),
    normalizedInputJson: '{}',
    inputDigest: 'sha256:input',
    pricingJson: '{}',
    pricingDigest: 'sha256:pricing',
    decisionAudUnits: '6000000',
    sourceUsdcUnits: '5000000',
    x402RequirementDigest: 'sha256:live-requirement',
    x402RequirementJson: '{}',
    x402RequirementObservedAt: now - 1,
    rateEvidenceJson: '{}',
    rateEvidenceDigest: 'sha256:rate',
    budgetPolicyRef: 'budget:managed-call',
    budgetGeneration: 1,
    maximumSpendPerInvocationUnits: '6000000',
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
    consumedInvocationRef: invocationRef,
    expiresAt: now + 30_000,
    createdAt: now - 1,
    updatedAt: now - 1,
  }
}

function invocation() {
  return {
    commitmentRef,
    invocationRef,
    principalId: principalRef,
    ownerId: accountRef,
    credentialId: 'credential:managed-call',
    applicationRef: 'application:managed-call',
    operationRef: operation.operationId,
    idempotencyKey: 'idempotency:managed-call',
    environment: 'sandbox' as const,
    grantRef: 'grant:managed-call',
    grantGeneration: 1,
    policyDigest: 'sha256:grant',
    grantExpiresAt: now + 60_000,
    operationJson: JSON.stringify(operation),
    inputJson: '{}',
    inputDigest: 'sha256:input',
    requestDigest: canonicalDigest({ format: 'test:managed-call:v1', invocationRef }),
    formanceFinancialState: 'reservation_pending' as const,
    state: 'pending' as const,
    dispatchState: 'enqueued' as const,
    createdAt: now,
    updatedAt: now,
  }
}

async function seedReservationFixture(backend: ReturnType<typeof convexTest>) {
  await backend.run(async (ctx) => {
    await ctx.db.insert('capabilityOperationCommitments', commitment())
    await ctx.db.insert('capabilityOperationInvocations', invocation())
  })
  return await backend.mutation(internal.moneyManagedCall.attachReservation, {
    invocationRef,
    transactionRefs: reservationRefs,
  })
}

describe('Formance managed Call evidence', () => {
  it('attaches one exact reservation and one payout-ineligible Provider obligation', async () => {
    const backend = convexTest(schema, convexModules)
    await expect(seedReservationFixture(backend)).resolves.toEqual({ kind: 'attached', replayed: false })
    await expect(backend.mutation(internal.moneyManagedCall.attachReservation, {
      invocationRef,
      transactionRefs: reservationRefs,
    })).resolves.toEqual({ kind: 'attached', replayed: true })
    await expect(backend.mutation(internal.moneyManagedCall.attachReservation, {
      invocationRef,
      transactionRefs: [...reservationRefs.slice(0, 2), 'formance:changed'],
    })).resolves.toEqual({ kind: 'refused', code: 'formance_reservation_conflict' })

    await expect(backend.run(async (ctx) => ({
      invocation: await ctx.db.query('capabilityOperationInvocations')
        .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef)).unique(),
      obligations: await ctx.db.query('moneyProviderObligations').collect(),
    }))).resolves.toMatchObject({
      invocation: { formanceFinancialState: 'reserved', formanceReservationRefs: reservationRefs },
      obligations: [expect.objectContaining({
        obligationRef: `provider-obligation:${invocationRef}`,
        buyerAmountUnits: '6000000',
        providerAmountUnits: '5000000',
        state: 'accrued',
        payoutEligibility: 'ineligible_x402',
        evidenceRefs: [commitmentRef, ...reservationRefs],
      })],
    })
  })

  it('retains possible submission and settles only from exact Formance references', async () => {
    const backend = convexTest(schema, convexModules)
    await seedReservationFixture(backend)
    await expect(backend.mutation(internal.moneyManagedCallLifecycle.markPossiblySubmitted, {
      invocationRef,
      evidenceDigest: 'sha256:submission-fence',
      now: now + 1,
    })).resolves.toEqual({ kind: 'accepted', state: 'possibly_submitted', replayed: false })
    await expect(backend.mutation(internal.moneyManagedCallLifecycle.markOutcomeUnknown, {
      invocationRef,
      evidenceDigest: 'sha256:transport-timeout',
      now: now + 2,
    })).resolves.toEqual({ kind: 'accepted', state: 'outcome_unknown', replayed: false })
    await expect(backend.mutation(internal.moneyManagedCallLifecycle.finalizeRelease, {
      invocationRef,
      transactionRefs: ['formance:release-aud', 'formance:release-usdc'],
      now: now + 3,
    })).resolves.toEqual({ kind: 'refused', code: 'managed_call_state_conflict' })
    const settlementRefs = ['formance:settle-buyer', 'formance:settle-provider']
    await expect(backend.mutation(internal.moneyManagedCallLifecycle.finalizeSettlement, {
      invocationRef,
      transactionRefs: settlementRefs,
      now: now + 4,
    })).resolves.toEqual({ kind: 'accepted', state: 'settled', replayed: false })
    await expect(backend.mutation(internal.moneyManagedCallLifecycle.finalizeSettlement, {
      invocationRef,
      transactionRefs: settlementRefs,
      now: now + 5,
    })).resolves.toEqual({ kind: 'accepted', state: 'settled', replayed: true })

    await expect(backend.run(async (ctx) => ({
      invocation: await ctx.db.query('capabilityOperationInvocations')
        .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef)).unique(),
      obligation: await ctx.db.query('moneyProviderObligations')
        .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef)).unique(),
    }))).resolves.toMatchObject({
      invocation: { formanceFinancialState: 'settled', formanceSettlementRefs: settlementRefs },
      obligation: { state: 'settled', settledAt: now + 4 },
    })
  })

  it('records a proven pre-submission release without claiming settlement', async () => {
    const backend = convexTest(schema, convexModules)
    await seedReservationFixture(backend)
    const releaseRefs = ['formance:release-aud', 'formance:release-usdc']
    await expect(backend.mutation(internal.moneyManagedCallLifecycle.finalizeRelease, {
      invocationRef,
      transactionRefs: releaseRefs,
      now: now + 1,
    })).resolves.toEqual({ kind: 'accepted', state: 'released', replayed: false })
    await expect(backend.run(async (ctx) => ({
      invocation: await ctx.db.query('capabilityOperationInvocations')
        .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef)).unique(),
      obligation: await ctx.db.query('moneyProviderObligations')
        .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef)).unique(),
    }))).resolves.toMatchObject({
      invocation: { formanceFinancialState: 'released', formanceReleaseRefs: releaseRefs },
      obligation: { state: 'reversed' },
    })
  })
})
