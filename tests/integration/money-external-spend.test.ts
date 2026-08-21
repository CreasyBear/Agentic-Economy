import { convexTest } from 'convex-test'
import { anyApi } from 'convex/server'
import { describe, expect, it } from 'vitest'

import schema from '../../convex/schema'
import {
  externalSpendIdentityFromReservation,
  mintExternalSpendIdentity,
  type ExternalSpendIdentity,
  type ExternalSpendMutationResult,
  type ExternalSpendPaymentFacts,
} from '@/modules/money/public'
import { convexModules as modules } from '../helpers/convex-fixtures'

const reserve = anyApi.moneyLedger?.reserveExternalInvocationSpend
const finalize = anyApi.moneyLedger?.finalizeExternalInvocationSpend
const reconcile = anyApi.moneyLedger?.reconcileExternalInvocationSpend
const reverse = anyApi.moneyLedger?.reverseExternalInvocationSpend
const reverseInvalidOutput = anyApi.moneyLedger
  ?.reverseExternalInvocationSpendForInvalidOutput
const reconcilePaymentAttempt = anyApi.moneyX402PaymentAttempts
  ?.reconcileX402PaymentAttempt
if (
  reserve === undefined
  || finalize === undefined
  || reconcile === undefined
  || reverse === undefined
  || reverseInvalidOutput === undefined
  || reconcilePaymentAttempt === undefined
) {
  throw new Error('external spend mutations missing')
}

const amount = { currency: 'USD', units: '500', exponent: 2 }
const baseFacts: ExternalSpendPaymentFacts = {
  principalId: 'principal:external-one',
  credentialId: 'credential:external-one',
  grantRef: 'grant:external-one',
  grantGeneration: 1,
  environment: 'sandbox',
  invocationRef: 'invocation:external-one',
  attemptRef: 'attempt:external-one',
  effectGeneration: 1,
  operationRef: 'operation:external-one',
  providerRef: 'provider:external-one',
  paymentIdentifier: 'payment:external-one',
  challengeDigest: 'challenge:external-one',
  amount,
}
const reserveArgs = {
  ...baseFacts,
  observedAt: 1_000,
}

type SeedOptions = Readonly<{
  facts?: ExternalSpendPaymentFacts
  maximumSpendPerInvocation?: ExternalSpendPaymentFacts['amount']
  maximumDailySpend?: ExternalSpendPaymentFacts['amount']
  maximumMonthlySpend?: ExternalSpendPaymentFacts['amount']
  maximumConcurrentInvocations?: number
}>

function acceptedIdentity(result: ExternalSpendMutationResult): ExternalSpendIdentity {
  expect(result).toMatchObject({ kind: 'accepted' })
  if (result.kind !== 'accepted') {
    throw new Error('expected accepted external spend reservation')
  }
  return externalSpendIdentityFromReservation(result.reservation)
}

async function seeded(options: SeedOptions = {}) {
  const backend = convexTest(schema, modules)
  const facts = options.facts ?? baseFacts
  const maximumSpendPerInvocation =
    options.maximumSpendPerInvocation ?? facts.amount
  const maximumDailySpend = options.maximumDailySpend ?? {
    currency: facts.amount.currency,
    units: '1000',
    exponent: facts.amount.exponent,
  }
  const maximumMonthlySpend = options.maximumMonthlySpend ?? {
    currency: facts.amount.currency,
    units: '2000',
    exponent: facts.amount.exponent,
  }
  const policyDigest = `policy:${facts.principalId}`
  const budgetPolicyRef = `budget:${facts.grantRef}`
  const ratePolicyRef = `rate:${facts.grantRef}`
  await backend.run(async (ctx) => {
    const policy = {
      format: 'ae.agent-access-policy:v1' as const,
      operationAccess: 'all_admitted' as const,
      environment: facts.environment,
      budget: {
        budgetPolicyRef,
        generation: facts.grantGeneration,
        currency: facts.amount.currency,
        exponent: facts.amount.exponent,
        maximumSpendPerInvocation,
        maximumDailySpend,
        maximumMonthlySpend,
        maximumConcurrentInvocations: options.maximumConcurrentInvocations ?? 1,
      },
      rate: {
        ratePolicyRef,
        generation: 1,
        maximumCallsPerMinute: 30,
        maximumCallsPerHour: 300,
      },
    }
    await ctx.db.insert('agentAccessPrincipals', {
      principalId: facts.principalId,
      ownerId: 'owner:external-one',
      credentialId: facts.credentialId,
      applicationRef: 'app:external-one',
      environment: facts.environment,
      scopes: ['operations:invoke'],
      authorityMode: 'bounded_mandate',
      grantGeneration: facts.grantGeneration,
      policyDigest,
      lifecycle: 'active',
      expiresAt: 10_000,
      recordedAt: 1,
      lastSeenAt: 1,
    })
    await ctx.db.insert('agentAccessGrants', {
      format: 'ae.agent-access-grant:v1',
      grantRef: facts.grantRef,
      principalId: facts.principalId,
      ownerId: 'owner:external-one',
      applicationRef: 'app:external-one',
      credentialId: facts.credentialId,
      environment: facts.environment,
      operationAccess: 'all_admitted',
      authorityMode: 'bounded_mandate',
      policy,
      budgetPolicyRef: policy.budget.budgetPolicyRef,
      ratePolicyRef: policy.rate.ratePolicyRef,
      lifecycle: 'active',
      generation: 1,
      policyDigest,
      createdAt: 1,
      updatedAt: 1,
      expiresAt: 10_000,
    })
  })
  return backend
}

function custodyFacts(
  suffix: string,
  amountUnits = '500',
  custodyDailyMaximumUnits = '1000',
  custodyGeneration = 1,
  grantGeneration = 1,
): ExternalSpendPaymentFacts {
  return {
    ...baseFacts,
    principalId: 'principal:custody-shared',
    credentialId: 'credential:custody-shared',
    grantRef: 'grant:custody-shared',
    grantGeneration,
    environment: 'production',
    invocationRef: `invocation:custody-${suffix}`,
    attemptRef: `attempt:custody-${suffix}`,
    paymentIdentifier: `payment:custody-${suffix}`,
    amount: { currency: 'USD', units: amountUnits, exponent: 2 },
    custodyRef: 'custody:shared-wallet',
    custodyGeneration,
    custodyDailyMaximum: {
      currency: 'USD',
      units: custodyDailyMaximumUnits,
      exponent: 2,
    },
  }
}

async function budgetSnapshot(backend: Awaited<ReturnType<typeof seeded>>) {
  return await backend.run(async (ctx) => await ctx.db
    .query('moneyCredentialBudgetStates')
    .take(50))
}

async function custodyBudget(
  backend: Awaited<ReturnType<typeof seeded>>,
  custodyRef = 'custody:shared-wallet',
  dayStart = '1970-01-01',
) {
  const identity = `custody:${custodyRef}`
  return await backend.run(async (ctx) => await ctx.db
    .query('moneyCredentialBudgetStates')
    .withIndex('by_principal_credential_env_generation_window', (query) => query
      .eq('principalId', identity)
      .eq('credentialId', identity)
      .eq('environment', 'production')
      .eq('generation', 1)
      .eq('windowKind', 'day')
      .eq('windowStart', dayStart))
    .unique())
}

describe('provider-direct external spend reservations', () => {
  it('rejects identity conflicts, consumes budget once, and rejects double finalization/reversal', async () => {
    const backend = await seeded()
    const first = await backend.mutation(reserve, reserveArgs)
    const identity = acceptedIdentity(first)
    expect(first).toMatchObject({ kind: 'accepted', status: 'reserved', replayed: false })
    expect(identity).toEqual(mintExternalSpendIdentity(baseFacts))

    const replay = await backend.mutation(reserve, reserveArgs)
    expect(replay).toMatchObject({ kind: 'accepted', status: 'reserved', replayed: true })

    const conflict = await backend.mutation(reserve, {
      ...reserveArgs,
      amount: { ...amount, units: '400' },
    })
    expect(conflict).toEqual({ kind: 'refused', code: 'external_spend_identity_conflict', retryable: false })

    const settled = await backend.mutation(finalize, {
      ...identity,
      settlementStatus: 'settled',
      submissionStatus: 'observed',
      paymentResponseDigest: 'payment-response:one',
      evidenceRefs: ['provider-receipt:one'],
      observedAt: reserveArgs.observedAt,
    })
    expect(settled).toMatchObject({ kind: 'accepted', status: 'settled', replayed: false })

    const doubleFinalization = await backend.mutation(finalize, {
      ...identity,
      settlementStatus: 'not_settled',
      submissionStatus: 'observed',
      paymentResponseDigest: 'payment-response:two',
      evidenceRefs: ['provider-receipt:two'],
      observedAt: 2_001,
    })
    expect(doubleFinalization).toEqual({ kind: 'refused', code: 'external_spend_state_conflict', retryable: false })

    const reversed = await backend.mutation(reverse, {
      ...identity,
      evidenceRef: 'reversal:one',
      evidenceDigest: 'reversal-digest:one',
      observedAt: 2_002,
    })
    expect(reversed).toMatchObject({ kind: 'accepted', status: 'reversed', replayed: false })

    const doubleReversal = await backend.mutation(reverse, {
      ...identity,
      evidenceRef: 'reversal:two',
      evidenceDigest: 'reversal-digest:two',
      observedAt: 2_003,
    })
    expect(doubleReversal).toEqual({ kind: 'refused', code: 'external_spend_already_reversed', retryable: false })

    const budget = await backend.run(async (ctx) => await ctx.db
      .query('moneyCredentialBudgetStates')
      .withIndex('by_principal_credential_env_generation_window', (query) => query
        .eq('principalId', baseFacts.principalId)
        .eq('credentialId', baseFacts.credentialId)
        .eq('environment', 'sandbox')
        .eq('generation', 1)
        .eq('windowKind', 'day')
        .eq('windowStart', '1970-01-01'))
      .unique())
    expect(budget).toMatchObject({ settledUnits: '0', reservedUnits: '0', reservedCount: 0 })
  })

  it('keeps unknown holds and releases only from authoritative reconciliation', async () => {
    const backend = await seeded()
    const identity = acceptedIdentity(await backend.mutation(reserve, reserveArgs))

    const unknown = await backend.mutation(finalize, {
      ...identity,
      submissionStatus: 'possibly_submitted',
      settlementStatus: 'unknown',
      providerReceiptDigest: 'provider-receipt:unknown',
      evidenceRefs: ['provider-observation:unknown'],
      observedAt: reserveArgs.observedAt,
    })
    expect(unknown).toMatchObject({ kind: 'accepted', status: 'outcome_unknown' })

    const blocked = await backend.mutation(reserve, {
      ...reserveArgs,
      invocationRef: 'invocation:external-blocked',
      attemptRef: 'attempt:external-blocked',
      paymentIdentifier: 'payment:external-blocked',
    })
    expect(blocked).toEqual({ kind: 'refused', code: 'external_spend_budget_refused', retryable: true })

    const held = await backend.run(async (ctx) => await ctx.db
      .query('moneyCredentialBudgetStates')
      .withIndex('by_principal_credential_env_generation_window', (query) => query
        .eq('principalId', baseFacts.principalId)
        .eq('credentialId', baseFacts.credentialId)
        .eq('environment', 'sandbox')
        .eq('generation', 1)
        .eq('windowKind', 'day')
        .eq('windowStart', '1970-01-01'))
      .unique())
    expect(held).toMatchObject({ settledUnits: '0', reservedUnits: amount.units, reservedCount: 0 })

    const released = await backend.mutation(reconcile, {
      ...identity,
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
    const identity = acceptedIdentity(await backend.mutation(reserve, reserveArgs))

    const released = await backend.mutation(finalize, {
      ...identity,
      submissionStatus: 'not_submitted',
      settlementStatus: 'not_settled',
      evidenceRefs: ['pre-send:authority-refused'],
      observedAt: 2_200,
    })
    expect(released).toMatchObject({ kind: 'accepted', status: 'released', replayed: false })
  })

  it('atomically reverses a proven paid invalid output and conserves budget on replay', async () => {
    const backend = await seeded()
    const identity = acceptedIdentity(await backend.mutation(reserve, reserveArgs))
    const args = {
      ...identity,
      submissionStatus: 'observed' as const,
      settlementStatus: 'settled' as const,
      paymentResponseDigest: 'payment-response:invalid-output',
      providerReceiptDigest: 'provider-receipt:invalid-output',
      evidenceRefs: ['chain-settlement:invalid-output'],
      invalidOutputEvidenceRef: 'provider-output-invalid:one',
      invalidOutputEvidenceDigest: 'provider-output-invalid-digest:one',
      observedAt: 2_300,
    }

    const reversed = await backend.mutation(reverseInvalidOutput, args)
    expect(reversed).toMatchObject({
      kind: 'accepted',
      status: 'reversed',
      replayed: false,
      reservation: {
        state: 'reversed',
        submissionStatus: 'observed',
        paymentResponseDigest: args.paymentResponseDigest,
        providerReceiptDigest: args.providerReceiptDigest,
        evidenceRefs: args.evidenceRefs,
        reversalEvidenceRef: args.invalidOutputEvidenceRef,
        reversalEvidenceDigest: args.invalidOutputEvidenceDigest,
      },
    })

    const replay = await backend.mutation(reverseInvalidOutput, args)
    expect(replay).toMatchObject({ kind: 'accepted', status: 'reversed', replayed: true })
    await expect(backend.mutation(reverseInvalidOutput, {
      ...args,
      invalidOutputEvidenceDigest: 'provider-output-invalid-digest:conflict',
    })).resolves.toEqual({
      kind: 'refused',
      code: 'external_spend_already_reversed',
      retryable: false,
    })

    const budgets = await backend.run(async (ctx) => await ctx.db
      .query('moneyCredentialBudgetStates')
      .withIndex('by_principal_credential_env_generation_window', (query) => query
        .eq('principalId', baseFacts.principalId)
        .eq('credentialId', baseFacts.credentialId)
        .eq('environment', 'sandbox')
        .eq('generation', 1))
      .collect())
    expect(budgets).toEqual(expect.arrayContaining([
      expect.objectContaining({ windowKind: 'day', settledUnits: '0', reservedUnits: '0' }),
      expect.objectContaining({ windowKind: 'month', settledUnits: '0', reservedUnits: '0' }),
      expect.objectContaining({ windowKind: 'concurrency', reservedCount: 0 }),
    ]))
  })

  it('rejects unproven and unknown paid-invalid transitions', async () => {
    const unprovenBackend = await seeded()
    const unprovenIdentity = acceptedIdentity(await unprovenBackend.mutation(reserve, reserveArgs))
    const evidence = {
      invalidOutputEvidenceRef: 'provider-output-invalid:unproven',
      invalidOutputEvidenceDigest: 'provider-output-invalid-digest:unproven',
      evidenceRefs: ['chain-settlement:unproven'],
      observedAt: 2_400,
    }
    await expect(unprovenBackend.mutation(reverseInvalidOutput, {
      ...unprovenIdentity,
      submissionStatus: 'possibly_submitted' as const,
      settlementStatus: 'unknown' as const,
      paymentResponseDigest: 'payment-response:unproven',
      ...evidence,
    })).resolves.toEqual({
      kind: 'refused',
      code: 'external_spend_state_conflict',
      retryable: false,
    })

    const unknownBackend = await seeded()
    const unknownIdentity = acceptedIdentity(await unknownBackend.mutation(reserve, reserveArgs))
    await unknownBackend.mutation(finalize, {
      ...unknownIdentity,
      submissionStatus: 'possibly_submitted' as const,
      settlementStatus: 'unknown' as const,
      evidenceRefs: ['provider-observation:unknown'],
      observedAt: 2_401,
    })
    await expect(unknownBackend.mutation(reverseInvalidOutput, {
      ...unknownIdentity,
      submissionStatus: 'observed' as const,
      settlementStatus: 'settled' as const,
      paymentResponseDigest: 'payment-response:unknown',
      ...evidence,
      evidenceRefs: ['chain-settlement:unknown'],
    })).resolves.toEqual({
      kind: 'refused',
      code: 'external_spend_reconciliation_required',
      retryable: false,
    })
  })

  it('enforces the exact custody cap before either budget write and replays without mutation', async () => {
    const facts = custodyFacts('cap', '500', '500')
    const backend = await seeded({
      facts,
      maximumSpendPerInvocation: { currency: 'USD', units: '500', exponent: 2 },
      maximumDailySpend: { currency: 'USD', units: '1000', exponent: 2 },
      maximumMonthlySpend: { currency: 'USD', units: '2000', exponent: 2 },
    })
    const args = { ...facts, observedAt: 1_000 }
    const first = await backend.mutation(reserve, args)
    expect(first).toMatchObject({
      kind: 'accepted',
      status: 'reserved',
      reservation: {
        custodyRef: facts.custodyRef,
        custodyGeneration: facts.custodyGeneration,
        custodyDailyMaximum: facts.custodyDailyMaximum,
        custodyBudgetPolicyRef: 'custody-daily:custody:shared-wallet',
        custodyBudgetDayStart: '1970-01-01',
      },
    })
    const beforeReplay = await budgetSnapshot(backend)
    await expect(backend.mutation(reserve, args)).resolves.toMatchObject({
      kind: 'accepted',
      replayed: true,
    })
    expect(await budgetSnapshot(backend)).toEqual(beforeReplay)

    const overCapFacts = custodyFacts('cap-over', '501', '500')
    const overCap = await backend.mutation(reserve, {
      ...overCapFacts,
      observedAt: 1_001,
    })
    expect(overCap).toEqual({
      kind: 'refused',
      code: 'external_spend_custody_daily_limit_exceeded',
      retryable: false,
    })
    expect(await budgetSnapshot(backend)).toEqual(beforeReplay)
    expect(await custodyBudget(backend)).toMatchObject({
      settledUnits: '0',
      reservedUnits: '500',
      version: 0,
    })
  })

  it('shares one fixed-generation custody row across reservations and credential rotation', async () => {
    const firstFacts = custodyFacts('shared-one', '500', '1000')
    const backend = await seeded({
      facts: firstFacts,
      maximumSpendPerInvocation: { currency: 'USD', units: '500', exponent: 2 },
      maximumDailySpend: { currency: 'USD', units: '10000', exponent: 2 },
      maximumMonthlySpend: { currency: 'USD', units: '20000', exponent: 2 },
      maximumConcurrentInvocations: 10,
    })
    const first = await backend.mutation(reserve, { ...firstFacts, observedAt: 1_000 })
    expect(first).toMatchObject({ kind: 'accepted', replayed: false })

    const secondFacts = custodyFacts('shared-two', '500', '1000')
    const second = await backend.mutation(reserve, { ...secondFacts, observedAt: 1_001 })
    expect(second).toMatchObject({ kind: 'accepted', replayed: false })

    const over = custodyFacts('shared-over', '1', '1000')
    await expect(backend.mutation(reserve, { ...over, observedAt: 1_002 })).resolves.toEqual({
      kind: 'refused',
      code: 'external_spend_custody_daily_limit_exceeded',
      retryable: false,
    })

    await backend.run(async (ctx) => {
      const principal = await ctx.db.query('agentAccessPrincipals')
        .withIndex('by_principalId', (query) => query.eq('principalId', firstFacts.principalId))
        .unique()
      const grant = await ctx.db.query('agentAccessGrants')
        .withIndex('by_grantRef', (query) => query.eq('grantRef', firstFacts.grantRef))
        .unique()
      if (principal === null || grant === null) throw new Error('custody_rotation_seed_missing')
      await ctx.db.patch(principal._id, { grantGeneration: 2 })
      await ctx.db.patch(grant._id, {
        generation: 2,
        policy: {
          ...grant.policy,
          budget: { ...grant.policy.budget, generation: 2 },
        },
      })
    })
    const rotated = custodyFacts('rotated', '1', '1000', 2, 2)
    await expect(backend.mutation(reserve, { ...rotated, observedAt: 1_003 })).resolves.toEqual({
      kind: 'refused',
      code: 'external_spend_custody_daily_limit_exceeded',
      retryable: false,
    })
    expect(await custodyBudget(backend)).toMatchObject({
      generation: 1,
      reservedUnits: '1000',
    })
  })

  it('releases custody on not-settled resolution and retains it for unknown outcomes', async () => {
    const releasedFacts = custodyFacts('released', '500', '1000')
    const releasedBackend = await seeded({ facts: releasedFacts })
    const releasedIdentity = acceptedIdentity(
      await releasedBackend.mutation(reserve, { ...releasedFacts, observedAt: 1_000 }),
    )
    await expect(releasedBackend.mutation(finalize, {
      ...releasedIdentity,
      submissionStatus: 'not_submitted',
      settlementStatus: 'not_settled',
      evidenceRefs: ['custody:release'],
      observedAt: 1_001,
    })).resolves.toMatchObject({ kind: 'accepted', status: 'released' })
    expect(await custodyBudget(releasedBackend)).toMatchObject({
      settledUnits: '0',
      reservedUnits: '0',
    })

    const unknownFacts = custodyFacts('unknown', '500', '1000')
    const unknownBackend = await seeded({ facts: unknownFacts })
    const unknownIdentity = acceptedIdentity(
      await unknownBackend.mutation(reserve, { ...unknownFacts, observedAt: 1_000 }),
    )
    await expect(unknownBackend.mutation(finalize, {
      ...unknownIdentity,
      submissionStatus: 'possibly_submitted',
      settlementStatus: 'unknown',
      evidenceRefs: ['custody:unknown'],
      observedAt: 1_001,
    })).resolves.toMatchObject({ kind: 'accepted', status: 'outcome_unknown' })
    expect(await custodyBudget(unknownBackend)).toMatchObject({
      settledUnits: '0',
      reservedUnits: '500',
    })

    await expect(unknownBackend.mutation(reconcile, {
      ...unknownIdentity,
      settlementStatus: 'not_settled',
      paymentResponseDigest: 'custody:reconcile-release',
      evidenceRef: 'custody:reconcile-release',
      evidenceDigest: 'custody:reconcile-release-digest',
      observedAt: 1_002,
    })).resolves.toMatchObject({ kind: 'accepted', status: 'released' })
    expect(await custodyBudget(unknownBackend)).toMatchObject({
      settledUnits: '0',
      reservedUnits: '0',
    })
  })

  it('settles custody on reconciliation and keeps settled custody through both reversals', async () => {
    const reconciledFacts = custodyFacts('reconcile-settled', '500', '1000')
    const reconciledBackend = await seeded({ facts: reconciledFacts })
    const reconciledIdentity = acceptedIdentity(
      await reconciledBackend.mutation(reserve, { ...reconciledFacts, observedAt: 1_000 }),
    )
    await reconciledBackend.mutation(finalize, {
      ...reconciledIdentity,
      submissionStatus: 'possibly_submitted',
      settlementStatus: 'unknown',
      evidenceRefs: ['custody:unknown-settled'],
      observedAt: 1_001,
    })
    await expect(reconciledBackend.mutation(reconcile, {
      ...reconciledIdentity,
      settlementStatus: 'settled',
      paymentResponseDigest: 'custody:reconcile-settled',
      evidenceRef: 'custody:reconcile-settled',
      evidenceDigest: 'custody:reconcile-settled-digest',
      observedAt: 1_002,
    })).resolves.toMatchObject({ kind: 'accepted', status: 'settled' })
    expect(await custodyBudget(reconciledBackend)).toMatchObject({
      settledUnits: '500',
      reservedUnits: '0',
    })

    const beforeGenericReverse = await custodyBudget(reconciledBackend)
    await expect(reconciledBackend.mutation(reverse, {
      ...reconciledIdentity,
      evidenceRef: 'custody:generic-reversal',
      evidenceDigest: 'custody:generic-reversal-digest',
      observedAt: 1_003,
    })).resolves.toMatchObject({ kind: 'accepted', status: 'reversed' })
    expect(await custodyBudget(reconciledBackend)).toEqual(beforeGenericReverse)

    const invalidFacts = custodyFacts('invalid-output', '500', '1000')
    const invalidBackend = await seeded({ facts: invalidFacts })
    const invalidIdentity = acceptedIdentity(
      await invalidBackend.mutation(reserve, { ...invalidFacts, observedAt: 1_000 }),
    )
    const invalidArgs = {
      ...invalidIdentity,
      submissionStatus: 'observed' as const,
      settlementStatus: 'settled' as const,
      paymentResponseDigest: 'custody:invalid-payment',
      evidenceRefs: ['custody:invalid-settlement'],
      invalidOutputEvidenceRef: 'custody:invalid-output',
      invalidOutputEvidenceDigest: 'custody:invalid-output-digest',
      observedAt: 1_001,
    }
    await expect(invalidBackend.mutation(reverseInvalidOutput, invalidArgs)).resolves.toMatchObject({
      kind: 'accepted',
      status: 'reversed',
    })
    const beforeInvalidReplay = await budgetSnapshot(invalidBackend)
    await expect(invalidBackend.mutation(reverseInvalidOutput, invalidArgs)).resolves.toMatchObject({
      kind: 'accepted',
      replayed: true,
    })
    expect(await budgetSnapshot(invalidBackend)).toEqual(beforeInvalidReplay)
    expect(await custodyBudget(invalidBackend)).toMatchObject({
      settledUnits: '500',
      reservedUnits: '0',
    })
  })

  it('refuses partial and conflicting custody identity material without writes', async () => {
    const partialFacts = custodyFacts('partial', '500', '1000')
    const { custodyDailyMaximum: _omitted, ...partial } = partialFacts
    const partialBackend = await seeded({ facts: partialFacts })
    await expect(partialBackend.mutation(reserve, {
      ...partial,
      observedAt: 1_000,
    })).resolves.toEqual({
      kind: 'refused',
      code: 'external_spend_custody_policy_invalid',
      retryable: false,
    })
    expect(await budgetSnapshot(partialBackend)).toEqual([])

    const conflictingFacts = custodyFacts('conflict', '500', '1000')
    const conflictingBackend = await seeded({ facts: conflictingFacts })
    const identity = acceptedIdentity(
      await conflictingBackend.mutation(reserve, { ...conflictingFacts, observedAt: 1_000 }),
    )
    const beforeConflict = await budgetSnapshot(conflictingBackend)
    await expect(conflictingBackend.mutation(finalize, {
      ...identity,
      custodyDailyMaximum: { currency: 'USD', units: '999', exponent: 2 },
      settlementStatus: 'settled',
      submissionStatus: 'observed',
      paymentResponseDigest: 'custody:conflict-payment',
      evidenceRefs: ['custody:conflict'],
      observedAt: 1_001,
    })).resolves.toEqual({
      kind: 'refused',
      code: 'external_spend_identity_conflict',
      retryable: false,
    })
    expect(await budgetSnapshot(conflictingBackend)).toEqual(beforeConflict)
  })

  it('replaces an unknown payment observation with definitive reconciliation', async () => {
    const backend = await seeded()
    const minted = mintExternalSpendIdentity(baseFacts)
    const paymentAttempt = {
      dispatchRef: baseFacts.invocationRef,
      attemptRef: baseFacts.attemptRef,
      effectGeneration: baseFacts.effectGeneration,
      operationRef: baseFacts.operationRef,
      inputDigest: 'input:external-one',
      paymentIdentifier: baseFacts.paymentIdentifier,
      operationKeyDigest: 'operation-key:external-one',
      challengeDigest: baseFacts.challengeDigest,
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
      reservationRef: minted.reservationRef,
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
      await ctx.db.insert('moneyX402PaymentAttempts', paymentAttempt)
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
      .query('moneyX402PaymentAttempts')
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

  it('replays the same payment-identifier payload and refuses a conflicting one', async () => {
    const prepare = anyApi.moneyX402PaymentAttempts?.prepareX402PaymentAuthorization
    if (prepare === undefined) throw new Error('prepare mutation missing')
    const backend = await seeded()
    const minted = mintExternalSpendIdentity(baseFacts)
    const payload = {
      dispatchRef: baseFacts.invocationRef,
      attemptRef: baseFacts.attemptRef,
      effectGeneration: baseFacts.effectGeneration,
      operationRef: baseFacts.operationRef,
      inputDigest: 'input:external-one',
      paymentIdentifier: 'ae_payment_id_one',
      operationKeyDigest: 'operation-key:external-one',
      challengeDigest: baseFacts.challengeDigest,
      challengeJson: '{"x402Version":2}',
      selectedRequirementJson: '{"scheme":"exact"}',
      providerEndpoint: 'https://provider.example/paid',
      credentialRef: 'env:AE_TEST_PAYMENT_CREDENTIAL',
      scheme: 'exact',
      network: 'eip155:84532',
      asset: 'asset:usdc',
      payTo: 'payee:external-one',
      amountUnits: amount.units,
      currency: amount.currency,
      exponent: amount.exponent,
      reservationRef: minted.reservationRef,
    }
    const first = await backend.mutation(prepare, payload)
    await expect(backend.mutation(prepare, payload)).resolves.toEqual(first)
    await expect(backend.mutation(prepare, {
      ...payload,
      selectedRequirementJson: '{"scheme":"exact","amount":"1"}',
    })).rejects.toThrow('x402_payment_attempt_attribution_invalid')
    await expect(backend.mutation(prepare, {
      ...payload,
      attemptRef: 'attempt:external-two',
      effectGeneration: 2,
    })).rejects.toThrow('x402_payment_attempt_attribution_invalid')
  })
})
