import { convexTest } from 'convex-test'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import schema from '../../convex/schema'
import { convexModules as modules } from '../helpers/convex-fixtures'

const reserve = anyApi.moneyLedger?.reserveExternalInvocationSpend
const finalize = anyApi.moneyLedger?.finalizeExternalInvocationSpend
const reconcile = anyApi.moneyLedger?.reconcileExternalInvocationSpend
const reverse = anyApi.moneyLedger?.reverseExternalInvocationSpend
const reconcilePaymentAttempt = anyApi.customerRequestRouteExecution
  ?.reconcileX402PaymentAttempt
if (
  reserve === undefined
  || finalize === undefined
  || reconcile === undefined
  || reverse === undefined
  || reconcilePaymentAttempt === undefined
) {
  throw new Error('external spend mutations missing')
}

const amount = { currency: 'USD', units: '500', exponent: 2 }
const baseIdentity = {
  reservationRef: 'external-reservation:one',
  principalId: 'principal:external-one',
  credentialId: 'credential:external-one',
  grantRef: 'grant:external-one',
  grantGeneration: 1,
  environment: 'sandbox' as const,
  invocationRef: 'invocation:external-one',
  attemptRef: 'attempt:external-one',
  effectGeneration: 1,
  operationRef: 'operation:external-one',
  providerRef: 'provider:external-one',
  paymentIdentifier: 'payment:external-one',
  challengeDigest: 'challenge:external-one',
  idempotencyDigest: 'idempotency:external-one',
  amount,
  observedAt: 1_000,
}

async function seeded() {
  const backend = convexTest(schema, modules)
  await backend.run(async (ctx) => {
    const policy = {
      format: 'ae.agent-access-policy:v1' as const,
      operationAccess: 'all_admitted' as const,
      environment: 'sandbox' as const,
      budget: {
        budgetPolicyRef: 'budget:external-one',
        generation: 1,
        currency: 'USD',
        exponent: 2,
        maximumSpendPerInvocation: amount,
        maximumDailySpend: { currency: 'USD', units: '1000', exponent: 2 },
        maximumMonthlySpend: { currency: 'USD', units: '2000', exponent: 2 },
        maximumConcurrentInvocations: 1,
      },
      rate: {
        ratePolicyRef: 'rate:external-one',
        generation: 1,
        maximumCallsPerMinute: 30,
        maximumCallsPerHour: 300,
      },
    }
    await ctx.db.insert('agentAccessPrincipals', {
      principalId: baseIdentity.principalId,
      ownerId: 'owner:external-one',
      credentialId: baseIdentity.credentialId,
      applicationRef: 'app:external-one',
      environment: 'sandbox',
      scopes: ['operations:invoke'],
      authorityMode: 'bounded_mandate',
      grantGeneration: 1,
      policyDigest: 'policy:external-one',
      lifecycle: 'active',
      expiresAt: 10_000,
      recordedAt: 1,
      lastSeenAt: 1,
    })
    await ctx.db.insert('agentAccessGrants', {
      format: 'ae.agent-access-grant:v1',
      grantRef: baseIdentity.grantRef,
      principalId: baseIdentity.principalId,
      ownerId: 'owner:external-one',
      applicationRef: 'app:external-one',
      credentialId: baseIdentity.credentialId,
      environment: 'sandbox',
      operationAccess: 'all_admitted',
      authorityMode: 'bounded_mandate',
      policy,
      budgetPolicyRef: policy.budget.budgetPolicyRef,
      ratePolicyRef: policy.rate.ratePolicyRef,
      lifecycle: 'active',
      generation: 1,
      policyDigest: 'policy:external-one',
      createdAt: 1,
      updatedAt: 1,
      expiresAt: 10_000,
    })
  })
  return backend
}

describe('provider-direct external spend reservations', () => {
  it('rejects identity conflicts, consumes budget once, and rejects double finalization/reversal', async () => {
    const backend = await seeded()
    const first = await backend.mutation(reserve, baseIdentity)
    expect(first).toMatchObject({ kind: 'accepted', status: 'reserved', replayed: false })

    const conflict = await backend.mutation(reserve, {
      ...baseIdentity,
      amount: { ...amount, units: '400' },
    })
    expect(conflict).toEqual({ kind: 'refused', code: 'external_spend_identity_conflict', retryable: false })

    const settled = await backend.mutation(finalize, {
      ...baseIdentity,
      settlementStatus: 'settled',
      submissionStatus: 'observed',
      paymentResponseDigest: 'payment-response:one',
      evidenceRefs: ['provider-receipt:one'],
    })
    expect(settled).toMatchObject({ kind: 'accepted', status: 'settled', replayed: false })

    const doubleFinalization = await backend.mutation(finalize, {
      ...baseIdentity,
      settlementStatus: 'not_settled',
      submissionStatus: 'observed',
      paymentResponseDigest: 'payment-response:two',
      evidenceRefs: ['provider-receipt:two'],
      observedAt: 2_001,
    })
    expect(doubleFinalization).toEqual({ kind: 'refused', code: 'external_spend_state_conflict', retryable: false })

    const reversed = await backend.mutation(reverse, {
      ...baseIdentity,
      evidenceRef: 'reversal:one',
      evidenceDigest: 'reversal-digest:one',
      observedAt: 2_002,
    })
    expect(reversed).toMatchObject({ kind: 'accepted', status: 'reversed', replayed: false })

    const doubleReversal = await backend.mutation(reverse, {
      ...baseIdentity,
      evidenceRef: 'reversal:two',
      evidenceDigest: 'reversal-digest:two',
      observedAt: 2_003,
    })
    expect(doubleReversal).toEqual({ kind: 'refused', code: 'external_spend_already_reversed', retryable: false })

    const budget = await backend.run(async (ctx) => await ctx.db
      .query('moneyCredentialBudgetStates')
      .withIndex('by_principal_credential_env_generation_window', (query) => query
        .eq('principalId', baseIdentity.principalId)
        .eq('credentialId', baseIdentity.credentialId)
        .eq('environment', 'sandbox')
        .eq('generation', 1)
        .eq('windowKind', 'day')
        .eq('windowStart', '1970-01-01'))
      .unique())
    expect(budget).toMatchObject({ settledUnits: '0', reservedUnits: '0', reservedCount: 0 })
  })

  it('keeps unknown holds and releases only from authoritative reconciliation', async () => {
    const backend = await seeded()
    await expect(backend.mutation(reserve, baseIdentity)).resolves.toMatchObject({ status: 'reserved' })

    const unknown = await backend.mutation(finalize, {
      ...baseIdentity,
      submissionStatus: 'possibly_submitted',
      settlementStatus: 'unknown',
      providerReceiptDigest: 'provider-receipt:unknown',
      evidenceRefs: ['provider-observation:unknown'],
    })
    expect(unknown).toMatchObject({ kind: 'accepted', status: 'outcome_unknown' })

    const blocked = await backend.mutation(reserve, {
      ...baseIdentity,
      reservationRef: 'external-reservation:blocked',
      invocationRef: 'invocation:external-blocked',
      attemptRef: 'attempt:external-blocked',
      paymentIdentifier: 'payment:external-blocked',
      idempotencyDigest: 'idempotency:external-blocked',
    })
    expect(blocked).toEqual({ kind: 'refused', code: 'external_spend_budget_refused', retryable: true })

    const held = await backend.run(async (ctx) => await ctx.db
      .query('moneyCredentialBudgetStates')
      .withIndex('by_principal_credential_env_generation_window', (query) => query
        .eq('principalId', baseIdentity.principalId)
        .eq('credentialId', baseIdentity.credentialId)
        .eq('environment', 'sandbox')
        .eq('generation', 1)
        .eq('windowKind', 'day')
        .eq('windowStart', '1970-01-01'))
      .unique())
    expect(held).toMatchObject({ settledUnits: '0', reservedUnits: amount.units, reservedCount: 0 })

    const released = await backend.mutation(reconcile, {
      ...baseIdentity,
      settlementStatus: 'not_settled',
      paymentResponseDigest: 'payment-response:not-settled',
      evidenceRef: 'reconciliation:not-settled',
      evidenceDigest: 'reconciliation-digest:not-settled',
      observedAt: 2_100,
    })
    expect(released).toMatchObject({ kind: 'accepted', status: 'released', replayed: false })
  })
  it('releases a known pre-send refusal without fabricating a payment response', async () => {
    const backend = await seeded()
    await expect(backend.mutation(reserve, baseIdentity)).resolves.toMatchObject({ status: 'reserved' })

    const released = await backend.mutation(finalize, {
      ...baseIdentity,
      submissionStatus: 'not_submitted',
      settlementStatus: 'not_settled',
      evidenceRefs: ['pre-send:authority-refused'],
      observedAt: 2_200,
    })
    expect(released).toMatchObject({ kind: 'accepted', status: 'released', replayed: false })
  })
  it('replaces an unknown payment observation with definitive reconciliation', async () => {
    const backend = await seeded()
    const paymentAttempt = {
      dispatchRef: baseIdentity.invocationRef,
      attemptRef: baseIdentity.attemptRef,
      effectGeneration: baseIdentity.effectGeneration,
      operationRef: baseIdentity.operationRef,
      inputDigest: 'input:external-one',
      paymentIdentifier: baseIdentity.paymentIdentifier,
      operationKeyDigest: 'operation-key:external-one',
      challengeDigest: baseIdentity.challengeDigest,
      challengeJson: '{}',
      selectedRequirementJson: '{}',
      providerEndpoint: 'https://provider.example/paid',
      credentialRef: 'env:AE_TEST_PAYMENT_CREDENTIAL',
      scheme: 'exact',
      network: 'eip155:84532',
      asset: 'asset:usdc',
      payTo: 'payee:external-one',
      amountUnits: amount.units,
      currency: amount.currency,
      exponent: amount.exponent,
      custodyRef: 'custody:external-one',
      authorizationDigest: 'authorization:external-one',
      reservationRef: baseIdentity.reservationRef,
      state: 'reconciliation_required' as const,
      preparedAt: 1_000,
      observedAt: 1_500,
      transportObservationDigest: 'transport:external-one',
      transportRequestDigest: 'request:external-one',
      paymentObservationDigest: 'payment-observation:external-one',
      settlementStatus: 'unknown' as const,
      evidenceRefs: [],
    }
    await backend.run(async (ctx) => {
      await ctx.db.insert('customerRequestX402PaymentAttempts', paymentAttempt)
    })

    await expect(backend.mutation(reconcilePaymentAttempt, {
      dispatchRef: paymentAttempt.dispatchRef,
      attemptRef: paymentAttempt.attemptRef,
      effectGeneration: paymentAttempt.effectGeneration,
      operationRef: paymentAttempt.operationRef,
      inputDigest: paymentAttempt.inputDigest,
      evidenceRef: 'evidence:external-one',
      evidenceDigest: 'evidence-digest:external-one',
      reservationRef: paymentAttempt.reservationRef,
      paymentIdentifier: paymentAttempt.paymentIdentifier,
      challengeDigest: paymentAttempt.challengeDigest,
      settlementStatus: 'settled',
      amountUnits: paymentAttempt.amountUnits,
      currency: paymentAttempt.currency,
      exponent: paymentAttempt.exponent,
      paymentResponseDigest: 'payment-response:external-one',
      transportObservationDigest: paymentAttempt.transportObservationDigest,
      transportRequestDigest: paymentAttempt.transportRequestDigest,
      paymentObservationDigest: paymentAttempt.paymentObservationDigest,
      observedAt: 2_000,
    })).resolves.toEqual({ kind: 'settled', settlementStatus: 'settled' })

    const stored = await backend.run(async (ctx) => await ctx.db
      .query('customerRequestX402PaymentAttempts')
      .withIndex('by_attemptRef_and_effectGeneration', (query) => query
        .eq('attemptRef', paymentAttempt.attemptRef)
        .eq('effectGeneration', paymentAttempt.effectGeneration))
      .unique())
    expect(stored).toMatchObject({
      state: 'observed',
      settlementStatus: 'settled',
      reconciliationEvidenceDigest: 'evidence-digest:external-one',
    })
  })
})
