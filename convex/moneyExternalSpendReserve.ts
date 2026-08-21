import { v } from 'convex/values'

import type { MutationCtx } from './_generated/server'
import {
  applyPreparedCredentialBudgetReservation,
  prepareCredentialBudgetReservation,
  reserveCustodyDailyBudgetInTransaction,
} from './moneyBudgetPersist'
import {
  externalSpendCustodyPolicyRefusal,
  externalSpendIdentityDigest,
  externalSpendPaymentFactsValid,
  mintExternalSpendIdentity,
  readExactAmount,
  type ExternalSpendIdentity,
  type ExternalSpendMutationResult,
  type ExternalSpendPaymentFacts,
} from '../src/modules/money/public'
import {
  externalSpendAccepted,
  externalSpendIdentityMatches,
  externalSpendPaymentFactsArgs,
  externalSpendRefusal,
} from './moneyExternalSpendShared'

export type ReserveExternalInvocationSpendArgs = ExternalSpendPaymentFacts &
  Readonly<{
    observedAt: number
  }>

export const reserveExternalInvocationSpendArgs = {
  ...externalSpendPaymentFactsArgs,
  observedAt: v.number(),
}

async function activeExternalSpendGrant(
  ctx: Pick<MutationCtx, 'db'>,
  input: ExternalSpendIdentity,
  now: number,
): Promise<boolean> {
  const [principal, grant] = await Promise.all([
    ctx.db
      .query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', input.principalId))
      .unique(),
    ctx.db
      .query('agentAccessGrants')
      .withIndex('by_grantRef', (query) => query.eq('grantRef', input.grantRef))
      .unique(),
  ])
  return principal !== null
    && principal.principalId === input.principalId
    && (principal.expiresAt === undefined || principal.expiresAt > now)
    && principal.environment === input.environment
    && principal.lifecycle === 'active'
    && principal.grantGeneration === input.grantGeneration
    && grant !== null
    && grant.grantRef === input.grantRef
    && grant.principalId === input.principalId
    && grant.credentialId === input.credentialId
    && grant.environment === input.environment
    && principal.applicationRef === grant.applicationRef
    && grant.lifecycle === 'active'
    && grant.generation === input.grantGeneration
    && grant.expiresAt > now
    && grant.policy.environment === input.environment
    && grant.policyDigest === principal.policyDigest
    && grant.policy.budget.generation === grant.generation
    && grant.budgetPolicyRef === grant.policy.budget.budgetPolicyRef
}

export async function reserveExternalInvocationSpendHandler(
  ctx: MutationCtx,
  args: ReserveExternalInvocationSpendArgs,
): Promise<ExternalSpendMutationResult> {
  const amount = readExactAmount(args.amount)
  if (amount === undefined || !Number.isFinite(args.observedAt)) {
    return externalSpendRefusal('external_spend_invalid_amount')
  }
  const { observedAt, ...rawFacts } = args
  const facts: ExternalSpendPaymentFacts = {
    ...rawFacts,
    amount,
  }
  const custodyRefusal = externalSpendCustodyPolicyRefusal(facts)
  if (custodyRefusal !== undefined) {
    return externalSpendRefusal(custodyRefusal)
  }
  if (!externalSpendPaymentFactsValid(facts)) {
    return externalSpendRefusal('external_spend_invalid_amount')
  }
  const identity = mintExternalSpendIdentity(facts)
  const priorByAttempt = await ctx.db
    .query('moneyExternalSpendReservations')
    .withIndex('by_invocationRef_and_attemptRef_and_effectGeneration', (query) =>
      query
        .eq('invocationRef', identity.invocationRef)
        .eq('attemptRef', identity.attemptRef)
        .eq('effectGeneration', identity.effectGeneration),
    )
    .unique()
  if (priorByAttempt !== null) {
    return externalSpendIdentityMatches(priorByAttempt, identity)
      ? externalSpendAccepted(priorByAttempt, true)
      : externalSpendRefusal('external_spend_identity_conflict')
  }
  const prior = await ctx.db
    .query('moneyExternalSpendReservations')
    .withIndex('by_reservationRef', (query) =>
      query.eq('reservationRef', identity.reservationRef),
    )
    .unique()
  if (prior !== null) {
    return externalSpendIdentityMatches(prior, identity)
      ? externalSpendAccepted(prior, true)
      : externalSpendRefusal('external_spend_identity_conflict')
  }
  const priorByIdempotency = await ctx.db
    .query('moneyExternalSpendReservations')
    .withIndex('by_idempotencyDigest', (query) =>
      query.eq('idempotencyDigest', identity.idempotencyDigest),
    )
    .unique()
  if (priorByIdempotency !== null) {
    return externalSpendRefusal('external_spend_identity_conflict')
  }
  if (!await activeExternalSpendGrant(ctx, identity, observedAt)) {
    return externalSpendRefusal('external_spend_grant_invalid')
  }
  const spendPrincipal = await ctx.db
    .query('agentAccessPrincipals')
    .withIndex('by_principalId', (query) =>
      query.eq('principalId', identity.principalId),
    )
    .unique()
  if (spendPrincipal === null) {
    return externalSpendRefusal('external_spend_grant_invalid')
  }
  const budgetReservation = await prepareCredentialBudgetReservation(ctx, {
    principalId: identity.principalId,
    accountId: spendPrincipal.ownerId,
    credentialId: identity.credentialId,
    grantRef: identity.grantRef,
    generation: identity.grantGeneration,
    amount: identity.amount,
    observedAt,
  })
  if (budgetReservation.kind === 'refused') {
    return externalSpendRefusal(
      'external_spend_budget_refused',
      budgetReservation.retryable,
    )
  }
  const custodyFacts =
    identity.custodyRef !== undefined
    && identity.custodyGeneration !== undefined
    && identity.custodyDailyMaximum !== undefined
      ? {
          custodyRef: identity.custodyRef,
          custodyGeneration: identity.custodyGeneration,
          custodyDailyMaximum: identity.custodyDailyMaximum,
        }
      : undefined
  const custodyReservation = custodyFacts === undefined
    ? undefined
    : await reserveCustodyDailyBudgetInTransaction(ctx, {
        custodyRef: custodyFacts.custodyRef,
        maximumDailySpend: custodyFacts.custodyDailyMaximum,
        amount: identity.amount,
        observedAt,
      })
  if (custodyReservation?.kind === 'refused') {
    return externalSpendRefusal(custodyReservation.code)
  }
  await applyPreparedCredentialBudgetReservation(ctx, budgetReservation, observedAt)
  const identityDigest = externalSpendIdentityDigest(identity)
  const reservationId = await ctx.db.insert('moneyExternalSpendReservations', {
    reservationRef: identity.reservationRef,
    principalId: identity.principalId,
    credentialId: identity.credentialId,
    grantRef: identity.grantRef,
    grantGeneration: identity.grantGeneration,
    environment: identity.environment,
    budgetPolicyRef: budgetReservation.budgetPolicyRef,
    budgetDayStart: budgetReservation.dayStart,
    budgetMonthStart: budgetReservation.monthStart,
    ...(custodyFacts === undefined || custodyReservation === undefined
      ? {}
      : {
          custodyRef: custodyFacts.custodyRef,
          custodyGeneration: custodyFacts.custodyGeneration,
          custodyDailyMaximumUnits: custodyFacts.custodyDailyMaximum.units,
          custodyBudgetPolicyRef: custodyReservation.budgetPolicyRef,
          custodyBudgetDayStart: custodyReservation.dayStart,
        }),
    invocationRef: identity.invocationRef,
    attemptRef: identity.attemptRef,
    effectGeneration: identity.effectGeneration,
    operationRef: identity.operationRef,
    providerRef: identity.providerRef,
    paymentIdentifier: identity.paymentIdentifier,
    challengeDigest: identity.challengeDigest,
    idempotencyDigest: identity.idempotencyDigest,
    identityDigest,
    currency: identity.amount.currency,
    amountUnits: identity.amount.units,
    exponent: identity.amount.exponent,
    state: 'reserved',
    evidenceRefs: [],
    createdAt: observedAt,
    updatedAt: observedAt,
  })
  const created = await ctx.db.get(reservationId)
  if (created === null) throw new Error('external_spend_reservation_insert_missing')
  const accepted = externalSpendAccepted(created, false)
  if (accepted.kind === 'refused')
    throw new Error('external_spend_reservation_state_conflict')
  return accepted
}
