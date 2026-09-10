import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import { env, type MutationCtx, type QueryCtx } from './_generated/server'
import { resolveBusinessActor } from './authz'
import {
  requireBillingSourceWrite,
  type BillingSourceWriteArgs,
} from './moneyBillingAuthorization'
import {
  accountUpdatedEventArg,
  billingSourceArgs,
  identifier,
  moneyRefusalValue,
  serverFunctionAuth,
} from './moneyLedgerValues'
import { eventRowFields, eventRowMatches } from './moneyStripeEvents'
import {
  verifyCustomerRequestServiceAssertion,
  type CustomerRequestServiceAssertion,
} from '../src/modules/agent-access/service-auth-envelope'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  STRIPE_CONNECT_RECOVERY_LEASE_MS,
  STRIPE_CONNECT_RECOVERY_WINDOW_MS,
  transitionPayoutAccount,
  type StripeAccountUpdatedWebhookEvent,
} from '../src/modules/money/public'
import {
  clerkConsequenceProofValue,
  type ClerkConsequenceProofInput,
} from './lib/consequenceProof'
import { admitInteractiveOwnerConsequence } from './lib/ownerConsequence'

const PAYOUT_BINDING_LOOKUP_OPERATION =
  'moneyLedger:readPayoutAccountByStripeId'
const PAYOUT_BINDING_LOOKUP_SCOPE = 'money:payout_binding_read'

export type BindConnectAccountArgs = BillingSourceWriteArgs & {
  businessId: string
  currency: string
  exponent: number
  stripeAccountId: string
  observedAt: number
}

export type ReserveConnectAccountArgs = BillingSourceWriteArgs & {
  businessId: string
  currency: string
  exponent: number
  idempotencyKey: string
  commandRef: string
  inputDigest: string
  providerRequestDigest: string
  recoveryLeaseOwner: string
  proof?: ClerkConsequenceProofInput
}

export type FinalizeConnectAccountArgs = BillingSourceWriteArgs & {
  businessId: string
  currency: string
  exponent: number
  idempotencyKey: string
  commandRef: string
  inputDigest: string
  providerRequestDigest: string
  recoveryLeaseOwner: string
  recoveryLeaseGeneration: number
  outcome:
    | Readonly<{ state: 'succeeded'; stripeAccountId: string; providerEvidenceRef: string }>
    | Readonly<{ state: 'failed' | 'outcome_unknown'; failureCode: string; failureRetryable: boolean }>
}

export type AuthorizeConnectOnboardingArgs = BillingSourceWriteArgs & {
  businessId: string
  currency: string
  stripeAccountId: string
  expectedAccountVersion: number
  commandRef: string
  idempotencyKey: string
  proof?: ClerkConsequenceProofInput
}

export type ReadPayoutAccountByStripeIdArgs = {
  stripeAccountId: string
  serviceAuth?: CustomerRequestServiceAssertion
}

export type ReadOwnerPayoutAccountArgs = {
  businessId: string
  currency: string
}

export type RecordConnectAccountEventArgs = BillingSourceWriteArgs & {
  businessId: string
  currency: string
  exponent: number
  event: StripeAccountUpdatedWebhookEvent
  readback: {
    detailsSubmitted: boolean
    recipientCapabilityActive: boolean
    restricted: boolean
    requirementsDigest: string
    providerObjectDigest: string
    providerObjectVersion?: number
    observedAt: number
  }
  expectedVersion?: number
}

export const connectAccountViewValue = v.object({
  businessId: identifier,
  currency: identifier,
  exponent: v.number(),
  stripeAccountId: identifier,
  state: v.union(
    v.literal('not_started'),
    v.literal('onboarding_started'),
    v.literal('submitted'),
    v.literal('restricted'),
    v.literal('ready'),
  ),
  detailsSubmitted: v.boolean(),
  recipientCapabilityActive: v.boolean(),
  requirementsDigest: identifier,
  providerObjectDigest: v.optional(identifier),
  lastStripePayloadDigest: v.optional(identifier),
  providerObjectVersion: v.optional(v.number()),
  lastStripeObservedAt: v.optional(v.number()),
  version: v.optional(v.number()),
  lastStripeEventId: v.optional(identifier),
  createdAt: v.number(),
  updatedAt: v.number(),
})
export const payoutBindingViewValue = v.object({
  businessId: identifier,
  currency: identifier,
  exponent: v.number(),
  stripeAccountId: identifier,
  lastStripeEventId: v.optional(identifier),
  version: v.optional(v.number()),
})
export const connectAccountResultValue = v.union(
  v.object({ kind: v.literal('accepted'), account: connectAccountViewValue }),
  moneyRefusalValue,
)
export const connectAccountCommandValue = v.object({
  commandRef: identifier,
  businessId: identifier,
  currency: identifier,
  exponent: v.number(),
  idempotencyKey: identifier,
  inputDigest: identifier,
  providerRequestDigest: identifier,
  providerRecoveryDeadlineAt: v.number(),
  recoveryLeaseGeneration: v.number(),
  recoveryLeaseOwner: v.optional(identifier),
  recoveryLeaseExpiresAt: v.optional(v.number()),
  state: v.union(
    v.literal('pending'),
    v.literal('succeeded'),
    v.literal('failed'),
    v.literal('outcome_unknown'),
  ),
  stripeAccountId: v.optional(identifier),
  providerEvidenceRef: v.optional(identifier),
  failureCode: v.optional(identifier),
  failureRetryable: v.optional(v.boolean()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
export const connectAccountReservationResultValue = v.union(
  v.object({
    kind: v.literal('accepted'),
    command: connectAccountCommandValue,
    execute: v.boolean(),
  }),
  moneyRefusalValue,
)
export const connectAccountFinalizeOutcomeArg = v.union(
  v.object({
    state: v.literal('succeeded'),
    stripeAccountId: identifier,
    providerEvidenceRef: identifier,
  }),
  v.object({
    state: v.union(v.literal('failed'), v.literal('outcome_unknown')),
    failureCode: identifier,
    failureRetryable: v.boolean(),
  }),
)
export const connectAccountReadbackArg = v.object({
  detailsSubmitted: v.boolean(),
  recipientCapabilityActive: v.boolean(),
  restricted: v.boolean(),
  requirementsDigest: identifier,
  providerObjectDigest: identifier,
  providerObjectVersion: v.optional(v.number()),
  observedAt: v.number(),
})
export const reserveConnectAccountArgs = {
  businessId: identifier,
  currency: identifier,
  exponent: v.number(),
  idempotencyKey: identifier,
  commandRef: identifier,
  inputDigest: identifier,
  providerRequestDigest: identifier,
  recoveryLeaseOwner: identifier,
  proof: v.optional(clerkConsequenceProofValue),
  ...billingSourceArgs,
}
export const finalizeConnectAccountArgs = {
  businessId: identifier,
  currency: identifier,
  exponent: v.number(),
  idempotencyKey: identifier,
  commandRef: identifier,
  inputDigest: identifier,
  providerRequestDigest: identifier,
  recoveryLeaseOwner: identifier,
  recoveryLeaseGeneration: v.number(),
  outcome: connectAccountFinalizeOutcomeArg,
  ...billingSourceArgs,
}
export const authorizeConnectOnboardingArgs = {
  businessId: identifier,
  currency: identifier,
  stripeAccountId: identifier,
  expectedAccountVersion: v.number(),
  commandRef: identifier,
  idempotencyKey: identifier,
  proof: v.optional(clerkConsequenceProofValue),
  ...billingSourceArgs,
}
export const bindConnectAccountArgs = {
  businessId: identifier,
  currency: identifier,
  exponent: v.number(),
  stripeAccountId: identifier,
  observedAt: v.number(),
  ...billingSourceArgs,
}
export const readPayoutAccountByStripeIdArgs = {
  stripeAccountId: identifier,
  serviceAuth: v.optional(serverFunctionAuth),
}
export const recordConnectAccountEventFromInboxArgs = {
  businessId: identifier,
  currency: identifier,
  exponent: v.number(),
  event: accountUpdatedEventArg,
  readback: connectAccountReadbackArg,
  expectedVersion: v.optional(v.number()),
}
export const recordConnectAccountEventArgs = {
  ...recordConnectAccountEventFromInboxArgs,
  ...billingSourceArgs,
}

function refusedConnect(code: string, retryable: boolean, correlationRef?: string) {
  return {
    kind: 'refused' as const,
    code,
    retryable,
    ...(correlationRef === undefined ? {} : { correlationRef }),
  }
}

function payoutAccountView(row: Doc<'moneyPayoutAccounts'>) {
  return {
    businessId: row.businessId,
    currency: row.currency,
    exponent: row.exponent,
    stripeAccountId: row.stripeAccountId,
    state: row.state,
    detailsSubmitted: row.detailsSubmitted,
    recipientCapabilityActive: row.recipientCapabilityActive,
    requirementsDigest: row.requirementsDigest,
    ...(row.providerObjectDigest === undefined
      ? {}
      : { providerObjectDigest: row.providerObjectDigest }),
    ...(row.lastStripePayloadDigest === undefined
      ? {}
      : { lastStripePayloadDigest: row.lastStripePayloadDigest }),
    ...(row.providerObjectVersion === undefined
      ? {}
      : { providerObjectVersion: row.providerObjectVersion }),
    ...(row.lastStripeObservedAt === undefined
      ? {}
      : { lastStripeObservedAt: row.lastStripeObservedAt }),
    ...(row.version === undefined ? {} : { version: row.version }),
    ...(row.lastStripeEventId === undefined
      ? {}
      : { lastStripeEventId: row.lastStripeEventId }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function connectAccountCommandView(row: Doc<'moneyConnectAccountCommands'>) {
  return {
    commandRef: row.commandRef,
    businessId: row.businessId,
    currency: row.currency,
    exponent: row.exponent,
    idempotencyKey: row.idempotencyKey,
    inputDigest: row.inputDigest,
    providerRequestDigest: row.providerRequestDigest,
    providerRecoveryDeadlineAt: row.providerRecoveryDeadlineAt,
    recoveryLeaseGeneration: row.recoveryLeaseGeneration,
    ...(row.recoveryLeaseOwner === undefined ? {} : { recoveryLeaseOwner: row.recoveryLeaseOwner }),
    ...(row.recoveryLeaseExpiresAt === undefined ? {} : { recoveryLeaseExpiresAt: row.recoveryLeaseExpiresAt }),
    state: row.state,
    ...(row.stripeAccountId === undefined ? {} : { stripeAccountId: row.stripeAccountId }),
    ...(row.providerEvidenceRef === undefined ? {} : { providerEvidenceRef: row.providerEvidenceRef }),
    ...(row.failureCode === undefined ? {} : { failureCode: row.failureCode }),
    ...(row.failureRetryable === undefined ? {} : { failureRetryable: row.failureRetryable }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function payoutBindingLookupAuthorized(
  serviceAuth: CustomerRequestServiceAssertion | undefined,
  stripeAccountId: string,
): Promise<boolean> {
  const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (
    serviceAuth === undefined ||
    key === undefined ||
    key.length < 32 ||
    !serviceAuth.scopes.includes(PAYOUT_BINDING_LOOKUP_SCOPE)
  )
    return false
  return await verifyCustomerRequestServiceAssertion({
    key,
    operation: PAYOUT_BINDING_LOOKUP_OPERATION,
    command: { stripeAccountId },
    assertion: serviceAuth,
  })
}

export async function reserveConnectAccountHandler(
  ctx: MutationCtx,
  args: ReserveConnectAccountArgs,
) {
  await requireBillingSourceWrite(ctx, args)
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner')
    return refusedConnect('billing_identity_missing', false)
  const businessId = ctx.db.normalizeId('businesses', args.businessId)
  if (businessId === null)
    return refusedConnect('billing_identity_mismatch', false)
  const business = await ctx.db.get(businessId)
  if (business === null || business.owningAccountRef !== actor.canonicalAccountRef)
    return refusedConnect('billing_identity_mismatch', false)

  const now = Date.now()
  const [binding, commands, sameKey] = await Promise.all([
    ctx.db
      .query('moneyPayoutAccounts')
      .withIndex('by_businessId_and_currency', (q) =>
        q.eq('businessId', args.businessId).eq('currency', args.currency),
      )
      .unique(),
    ctx.db
      .query('moneyConnectAccountCommands')
      .withIndex('by_businessId_and_currency', (q) =>
        q.eq('businessId', args.businessId).eq('currency', args.currency),
      )
      .take(21),
    ctx.db
      .query('moneyConnectAccountCommands')
      .withIndex('by_businessId_and_currency_and_idempotencyKey', (q) =>
        q
          .eq('businessId', args.businessId)
          .eq('currency', args.currency)
          .eq('idempotencyKey', args.idempotencyKey),
      )
      .unique(),
  ])
  if (sameKey !== null && (
    sameKey.commandRef !== args.commandRef
    || sameKey.inputDigest !== args.inputDigest
    || sameKey.providerRequestDigest !== args.providerRequestDigest
    || sameKey.exponent !== args.exponent
  )) return refusedConnect('ledger_idempotency_conflict', false)

  const bindingReplay =
    binding !== null
    && sameKey !== null
    && sameKey.state === 'succeeded'
    && sameKey.stripeAccountId === binding.stripeAccountId
  if (binding !== null && !bindingReplay)
    return refusedConnect('payment_binding_invalid', false)
  if (
    binding === null
    && sameKey === null
    && (commands.length > 20 || commands.some((command) => command.state !== 'failed'))
  ) return refusedConnect('payout_reconciliation_required', false)

  const consequence = await admitInteractiveOwnerConsequence(ctx, {
    actor,
    action: 'payout_authority.create',
    target: {
      targetType: 'payout_account',
      targetRef: `payout-account:${args.businessId}:${args.currency}`,
      targetRevision: (binding?.version ?? 0) + 1,
    },
    requiredScopes: ['money:payout_authority_manage'],
    resourceRefs: [`business:${args.businessId}`, `currency:${args.currency}`],
    budgetAmount: 0,
    consequenceSummary: 'Create this Stripe-hosted payout authority for the owner Account.',
    statusReadbackRef: '/owner/offerings#earnings',
    command: {
      version: 'ae.payout-authority-consequence:v1',
      action: 'payout_authority.create',
      businessId: args.businessId,
      currency: args.currency,
      exponent: args.exponent,
      commandRef: args.commandRef,
      idempotencyKey: args.idempotencyKey,
      inputDigest: args.inputDigest,
      providerRequestDigest: args.providerRequestDigest,
      targetRevision: (binding?.version ?? 0) + 1,
    },
    correlationRef: args.correlationId,
    idempotencyRef: args.idempotencyKey,
    ...(args.proof === undefined ? {} : { proof: args.proof }),
    now,
  })
  if (consequence.kind === 'refused')
    return refusedConnect(
      consequence.code,
      consequence.code === 'rate_limited' || consequence.code === 'security_control_unavailable',
      consequence.correlationRef,
    )

  if (bindingReplay)
    return { kind: 'accepted' as const, command: connectAccountCommandView(sameKey), execute: false }
  const leaseExpiresAt = now + STRIPE_CONNECT_RECOVERY_LEASE_MS
  if (sameKey !== null) {
    if (sameKey.state === 'succeeded')
      return { kind: 'accepted' as const, command: connectAccountCommandView(sameKey), execute: false }
    if (sameKey.state === 'failed') {
      const recoveryLeaseGeneration = sameKey.recoveryLeaseGeneration + 1
      await ctx.db.patch('moneyConnectAccountCommands', sameKey._id, {
        state: 'pending',
        recoveryLeaseOwner: args.recoveryLeaseOwner,
        recoveryLeaseGeneration,
        recoveryLeaseExpiresAt: leaseExpiresAt,
        failureCode: undefined,
        failureRetryable: undefined,
        updatedAt: now,
      })
      const updated = await ctx.db.get(sameKey._id)
      return updated === null
        ? refusedConnect('payout_reconciliation_required', false)
        : { kind: 'accepted' as const, command: connectAccountCommandView(updated), execute: true }
    }
    if (now >= sameKey.providerRecoveryDeadlineAt) {
      if (
        sameKey.state !== 'outcome_unknown'
        || sameKey.failureCode !== 'payout_reconciliation_required'
        || sameKey.failureRetryable !== false
        || sameKey.recoveryLeaseOwner !== undefined
        || sameKey.recoveryLeaseExpiresAt !== undefined
      ) {
        await ctx.db.patch('moneyConnectAccountCommands', sameKey._id, {
          state: 'outcome_unknown',
          failureCode: 'payout_reconciliation_required',
          failureRetryable: false,
          recoveryLeaseOwner: undefined,
          recoveryLeaseExpiresAt: undefined,
          updatedAt: now,
        })
      }
      const updated = await ctx.db.get(sameKey._id)
      return updated === null
        ? refusedConnect('payout_reconciliation_required', false)
        : { kind: 'accepted' as const, command: connectAccountCommandView(updated), execute: false }
    }
    if (
      sameKey.recoveryLeaseOwner !== undefined
      && sameKey.recoveryLeaseExpiresAt !== undefined
      && sameKey.recoveryLeaseExpiresAt > now
    ) {
      return { kind: 'accepted' as const, command: connectAccountCommandView(sameKey), execute: false }
    }
    const recoveryLeaseGeneration = sameKey.recoveryLeaseGeneration + 1
    await ctx.db.patch('moneyConnectAccountCommands', sameKey._id, {
      state: 'pending',
      recoveryLeaseOwner: args.recoveryLeaseOwner,
      recoveryLeaseGeneration,
      recoveryLeaseExpiresAt: leaseExpiresAt,
      failureCode: undefined,
      failureRetryable: undefined,
      updatedAt: now,
    })
    const updated = await ctx.db.get(sameKey._id)
    return updated === null
      ? refusedConnect('payout_reconciliation_required', false)
      : { kind: 'accepted' as const, command: connectAccountCommandView(updated), execute: true }
  }
  const row = {
    commandRef: args.commandRef,
    businessId: args.businessId,
    currency: args.currency,
    exponent: args.exponent,
    idempotencyKey: args.idempotencyKey,
    inputDigest: args.inputDigest,
    providerRequestDigest: args.providerRequestDigest,
    providerRecoveryDeadlineAt: now + STRIPE_CONNECT_RECOVERY_WINDOW_MS,
    recoveryLeaseGeneration: 1,
    recoveryLeaseOwner: args.recoveryLeaseOwner,
    recoveryLeaseExpiresAt: leaseExpiresAt,
    state: 'pending' as const,
    createdAt: now,
    updatedAt: now,
  }
  await ctx.db.insert('moneyConnectAccountCommands', row)
  return { kind: 'accepted' as const, command: row, execute: true }
}

export async function authorizeConnectOnboardingHandler(
  ctx: MutationCtx,
  args: AuthorizeConnectOnboardingArgs,
) {
  await requireBillingSourceWrite(ctx, args)
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner')
    return refusedConnect('billing_identity_missing', false)
  const businessId = ctx.db.normalizeId('businesses', args.businessId)
  if (businessId === null)
    return refusedConnect('billing_identity_mismatch', false)
  const [business, binding] = await Promise.all([
    ctx.db.get(businessId),
    ctx.db
      .query('moneyPayoutAccounts')
      .withIndex('by_businessId_and_currency', (q) =>
        q.eq('businessId', args.businessId).eq('currency', args.currency),
      )
      .unique(),
  ])
  if (
    business === null ||
    business.owningAccountRef !== actor.canonicalAccountRef ||
    binding === null ||
    binding.stripeAccountId !== args.stripeAccountId ||
    !Number.isSafeInteger(args.expectedAccountVersion) ||
    args.expectedAccountVersion < 0
  )
    return refusedConnect('payout_not_ready', false)

  const currentVersion = binding.version ?? 0
  if (
    currentVersion !== args.expectedAccountVersion &&
    currentVersion !== args.expectedAccountVersion + 1
  )
    return refusedConnect('payout_not_ready', false)

  const now = Date.now()
  const consequence = await admitInteractiveOwnerConsequence(ctx, {
    actor,
    action: 'payout_authority.replace',
    target: {
      targetType: 'payout_account',
      targetRef: `payout-account:${args.businessId}:${args.currency}`,
      targetRevision: args.expectedAccountVersion,
    },
    requiredScopes: ['money:payout_authority_manage'],
    resourceRefs: [
      `business:${args.businessId}`,
      `currency:${args.currency}`,
      `destination:${args.stripeAccountId}`,
    ],
    budgetAmount: 0,
    consequenceSummary: 'Reopen Stripe-hosted onboarding for this payout authority.',
    statusReadbackRef: '/owner/offerings#earnings',
    command: {
      version: 'ae.payout-authority-replace-consequence:v1',
      businessId: args.businessId,
      currency: args.currency,
      stripeAccountId: args.stripeAccountId,
      expectedAccountVersion: args.expectedAccountVersion,
      nextAccountVersion: args.expectedAccountVersion + 1,
      commandRef: args.commandRef,
      idempotencyKey: args.idempotencyKey,
    },
    correlationRef: args.correlationId,
    idempotencyRef: args.idempotencyKey,
    ...(args.proof === undefined ? {} : { proof: args.proof }),
    now,
  })
  if (consequence.kind === 'refused')
    return refusedConnect(
      consequence.code,
      consequence.code === 'rate_limited' || consequence.code === 'security_control_unavailable',
      consequence.correlationRef,
    )

  if (currentVersion === args.expectedAccountVersion + 1) {
    return consequence.proofUse === 'replayed'
      ? { kind: 'accepted' as const, account: payoutAccountView(binding) }
      : refusedConnect('payout_not_ready', false)
  }
  await ctx.db.patch(binding._id, {
    version: args.expectedAccountVersion + 1,
    updatedAt: now,
  })
  const updated = await ctx.db.get(binding._id)
  return updated === null
    ? refusedConnect('payout_reconciliation_required', false)
    : { kind: 'accepted' as const, account: payoutAccountView(updated) }
}

export async function finalizeConnectAccountHandler(
  ctx: MutationCtx,
  args: FinalizeConnectAccountArgs,
) {
  await requireBillingSourceWrite(ctx, args)
  const command = await ctx.db
    .query('moneyConnectAccountCommands')
    .withIndex('by_commandRef', (q) => q.eq('commandRef', args.commandRef))
    .unique()
  if (
    command === null
    || command.businessId !== args.businessId
    || command.currency !== args.currency
    || command.exponent !== args.exponent
    || command.idempotencyKey !== args.idempotencyKey
    || command.inputDigest !== args.inputDigest
    || command.providerRequestDigest !== args.providerRequestDigest
  ) return refusedConnect('ledger_idempotency_conflict', false)
  const outcome = args.outcome
  if (command.state !== 'pending') {
    const sameOutcome = outcome.state === 'succeeded'
      ? command.state === 'succeeded'
        && command.stripeAccountId === outcome.stripeAccountId
        && command.providerEvidenceRef === outcome.providerEvidenceRef
      : command.state === outcome.state
        && command.failureCode === outcome.failureCode
        && command.failureRetryable === outcome.failureRetryable
    return sameOutcome
      ? { kind: 'accepted' as const, command: connectAccountCommandView(command), execute: false }
      : refusedConnect('ledger_idempotency_conflict', false)
  }
  const now = Date.now()
  const outcomeStripeAccountId = outcome.state === 'succeeded' ? outcome.stripeAccountId : undefined
  const outcomeProviderEvidenceRef = outcome.state === 'succeeded' ? outcome.providerEvidenceRef : undefined
  const retainUnboundProviderOutcome = async () => {
    await ctx.db.patch('moneyConnectAccountCommands', command._id, {
      state: 'outcome_unknown',
      stripeAccountId: outcomeStripeAccountId ?? command.stripeAccountId,
      providerEvidenceRef: outcomeProviderEvidenceRef ?? command.providerEvidenceRef,
      failureCode: 'payout_reconciliation_required',
      failureRetryable: false,
      recoveryLeaseOwner: undefined,
      recoveryLeaseExpiresAt: undefined,
      updatedAt: now,
    })
    return refusedConnect('payout_reconciliation_required', false)
  }
  if (
    command.recoveryLeaseOwner !== args.recoveryLeaseOwner
    || command.recoveryLeaseGeneration !== args.recoveryLeaseGeneration
    || command.recoveryLeaseExpiresAt === undefined
    || now >= command.recoveryLeaseExpiresAt
  ) return refusedConnect('ledger_idempotency_conflict', false)
  if (now >= command.providerRecoveryDeadlineAt)
    return refusedConnect('payout_reconciliation_required', false)
  if (outcome.state === 'succeeded') {
    const stripeAccountId = outcome.stripeAccountId
    const providerEvidenceRef = outcome.providerEvidenceRef
    const [current, stripeBindings] = await Promise.all([
      ctx.db
        .query('moneyPayoutAccounts')
        .withIndex('by_businessId_and_currency', (q) =>
          q.eq('businessId', args.businessId).eq('currency', args.currency),
        )
        .unique(),
      ctx.db
        .query('moneyPayoutAccounts')
        .withIndex('by_stripeAccountId', (q) => q.eq('stripeAccountId', stripeAccountId))
        .take(2),
    ])
    if (
      stripeBindings.some((binding) =>
        binding.businessId !== args.businessId || binding.currency !== args.currency,
      )
      || stripeBindings.length > 1
      || (current !== null && current.stripeAccountId !== stripeAccountId)
    ) return await retainUnboundProviderOutcome()
    const transition = transitionPayoutAccount({
      ...(current === null ? {} : { current: payoutAccountView(current) }),
      businessId: args.businessId,
      currency: args.currency,
      exponent: args.exponent,
      stripeAccountId,
      event: { kind: 'onboarding_started', observedAt: now },
    })
    if (transition.kind === 'refused') return await retainUnboundProviderOutcome()
    if (current === null) await ctx.db.insert('moneyPayoutAccounts', transition.value)
    else await ctx.db.patch('moneyPayoutAccounts', current._id, transition.value)
    await ctx.db.patch('moneyConnectAccountCommands', command._id, {
      state: 'succeeded',
      stripeAccountId,
      providerEvidenceRef,
      failureCode: undefined,
      failureRetryable: undefined,
      recoveryLeaseOwner: undefined,
      recoveryLeaseExpiresAt: undefined,
      updatedAt: now,
    })
  } else {
    await ctx.db.patch('moneyConnectAccountCommands', command._id, {
      state: outcome.state,
      failureCode: outcome.failureCode,
      failureRetryable: outcome.failureRetryable,
      recoveryLeaseOwner: undefined,
      recoveryLeaseExpiresAt: undefined,
      updatedAt: now,
    })
  }
  const updated = await ctx.db.get(command._id)
  return updated === null
    ? refusedConnect('payout_reconciliation_required', false)
    : { kind: 'accepted' as const, command: connectAccountCommandView(updated), execute: false }
}

export async function bindConnectAccountHandler(
  ctx: MutationCtx,
  args: BindConnectAccountArgs,
) {
  await requireBillingSourceWrite(ctx, args)
  const [current, stripeBindings] = await Promise.all([
    ctx.db
      .query('moneyPayoutAccounts')
      .withIndex('by_businessId_and_currency', (q) =>
        q.eq('businessId', args.businessId).eq('currency', args.currency),
      )
      .unique(),
    ctx.db
      .query('moneyPayoutAccounts')
      .withIndex('by_stripeAccountId', (q) =>
        q.eq('stripeAccountId', args.stripeAccountId),
      )
      .take(2),
  ])
  if (
    stripeBindings.some(
      (binding) =>
        binding.businessId !== args.businessId ||
        binding.currency !== args.currency,
    ) ||
    stripeBindings.length > 1
  )
    return refusedConnect('payment_binding_invalid', false)
  if (current !== null && current.stripeAccountId !== args.stripeAccountId)
    return refusedConnect('payment_binding_invalid', false)
  const transition = transitionPayoutAccount({
    ...(current === null ? {} : { current: payoutAccountView(current) }),
    businessId: args.businessId,
    currency: args.currency,
    exponent: args.exponent,
    stripeAccountId: args.stripeAccountId,
    event: { kind: 'onboarding_started', observedAt: args.observedAt },
  })
  if (transition.kind === 'refused') return transition
  const value = transition.value
  if (current === null) {
    await ctx.db.insert('moneyPayoutAccounts', value)
  } else {
    await ctx.db.patch('moneyPayoutAccounts', current._id, value)
  }
  const updated =
    current === null
      ? await ctx.db
          .query('moneyPayoutAccounts')
          .withIndex('by_businessId_and_currency', (q) =>
            q.eq('businessId', args.businessId).eq('currency', args.currency),
          )
          .unique()
      : await ctx.db.get(current._id)
  return updated === null
    ? refusedConnect('payout_reconciliation_required', false)
    : { kind: 'accepted' as const, account: payoutAccountView(updated) }
}

export async function readPayoutAccountByStripeIdHandler(
  ctx: QueryCtx,
  args: ReadPayoutAccountByStripeIdArgs,
) {
  if (
    !(await payoutBindingLookupAuthorized(
      args.serviceAuth,
      args.stripeAccountId,
    ))
  )
    return []
  return (
    await ctx.db
      .query('moneyPayoutAccounts')
      .withIndex('by_stripeAccountId', (q) =>
        q.eq('stripeAccountId', args.stripeAccountId),
      )
      .take(20)
  ).map(
    ({
      businessId,
      currency,
      exponent,
      stripeAccountId,
      lastStripeEventId,
      version,
    }) => ({
      businessId,
      currency,
      exponent,
      stripeAccountId,
      ...(lastStripeEventId === undefined ? {} : { lastStripeEventId }),
      ...(version === undefined ? {} : { version }),
    }),
  )
}

export async function readPayoutAccountByStripeIdForWorkerHandler(
  ctx: QueryCtx,
  stripeAccountId: string,
) {
  return (
    await ctx.db
      .query('moneyPayoutAccounts')
      .withIndex('by_stripeAccountId', (q) => q.eq('stripeAccountId', stripeAccountId))
      .take(20)
  ).map(({ businessId, currency, exponent, stripeAccountId: boundStripeAccountId, lastStripeEventId, version }) => ({
    businessId,
    currency,
    exponent,
    stripeAccountId: boundStripeAccountId,
    ...(lastStripeEventId === undefined ? {} : { lastStripeEventId }),
    ...(version === undefined ? {} : { version }),
  }))
}

export async function readOwnerPayoutAccountHandler(
  ctx: QueryCtx,
  args: ReadOwnerPayoutAccountArgs,
) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return null
  const businesses = await ctx.db
    .query('businesses')
    .withIndex('by_owningAccountRef_and_updatedAt', (q) => q.eq('owningAccountRef', actor.canonicalAccountRef))
    .order('desc')
    .take(20)
  if (
    !businesses.some((business) => String(business._id) === args.businessId)
  )
    return null
  const account = await ctx.db
    .query('moneyPayoutAccounts')
    .withIndex('by_businessId_and_currency', (q) =>
      q.eq('businessId', args.businessId).eq('currency', args.currency),
    )
    .unique()
  return account === null ? null : payoutAccountView(account)
}

export async function recordConnectAccountEventHandler(
  ctx: MutationCtx,
  args: RecordConnectAccountEventArgs,
) {
  await requireBillingSourceWrite(ctx, args)
  return await recordConnectAccountEventFromInboxHandler(ctx, args)
}

export async function recordConnectAccountEventFromInboxHandler(
  ctx: MutationCtx,
  args: Omit<RecordConnectAccountEventArgs, keyof BillingSourceWriteArgs>,
) {
  const event = args.event
  if (event.externalRef !== event.stripeAccountId)
    return refusedConnect('payment_binding_invalid', false)
  if (
    event.providerObjectVersion !== undefined &&
    args.readback.providerObjectVersion !== undefined &&
    event.providerObjectVersion !== args.readback.providerObjectVersion
  )
    return refusedConnect('payout_reconciliation_required', false)
  const priorEvent = await ctx.db
    .query('moneyStripeEvents')
    .withIndex('by_stripeEventId', (q) =>
      q.eq('stripeEventId', event.stripeEventId),
    )
    .unique()
  if (priorEvent !== null && !eventRowMatches(priorEvent, event))
    return refusedConnect('ledger_idempotency_conflict', false)
  const [account, stripeBindings] = await Promise.all([
    ctx.db
      .query('moneyPayoutAccounts')
      .withIndex('by_businessId_and_currency', (q) =>
        q.eq('businessId', args.businessId).eq('currency', args.currency),
      )
      .unique(),
    ctx.db
      .query('moneyPayoutAccounts')
      .withIndex('by_stripeAccountId', (q) =>
        q.eq('stripeAccountId', event.stripeAccountId),
      )
      .take(2),
  ])
  if (
    stripeBindings.some(
      (binding) =>
        binding.businessId !== args.businessId ||
        binding.currency !== args.currency,
    ) ||
    stripeBindings.length > 1
  )
    return refusedConnect('payment_binding_invalid', false)
  if (account !== null && account.stripeAccountId !== event.stripeAccountId)
    return refusedConnect('payment_binding_invalid', false)
  if (
    account !== null &&
    account.lastStripeEventId === event.stripeEventId &&
    account.lastStripePayloadDigest === event.payloadDigest &&
    account.providerObjectDigest === args.readback.providerObjectDigest
  )
    return { kind: 'accepted' as const, account: payoutAccountView(account) }
  const currentVersion = account?.version ?? 0
  if (
    args.expectedVersion !== undefined &&
    args.expectedVersion !== currentVersion
  )
    return refusedConnect('payout_reconciliation_required', false)
  if (account !== null) {
    if (
      account.providerObjectVersion !== undefined &&
      event.providerObjectVersion !== undefined &&
      event.providerObjectVersion < account.providerObjectVersion
    )
      return refusedConnect('payout_reconciliation_required', false)
    if (
      account.lastStripeObservedAt !== undefined &&
      event.observedAt <= account.lastStripeObservedAt
    )
      return refusedConnect('payout_reconciliation_required', false)
  }
  const transition = transitionPayoutAccount({
    ...(account === null ? {} : { current: payoutAccountView(account) }),
    businessId: args.businessId,
    currency: args.currency,
    exponent: account?.exponent ?? args.exponent,
    stripeAccountId: event.stripeAccountId,
    event: {
      kind: 'status',
      detailsSubmitted: args.readback.detailsSubmitted,
      recipientCapabilityActive: args.readback.recipientCapabilityActive,
      restricted: args.readback.restricted,
      requirementsDigest: args.readback.requirementsDigest,
      stripeEventId: event.stripeEventId,
      payloadDigest: event.payloadDigest,
      providerObjectDigest: args.readback.providerObjectDigest,
      observedAt: event.observedAt,
    },
  })
  if (transition.kind === 'refused') return transition
  const value = transition.value
  const nextRow = {
    ...value,
    ...(event.providerObjectVersion === undefined
      ? {}
      : { providerObjectVersion: event.providerObjectVersion }),
  }
  if (account === null) await ctx.db.insert('moneyPayoutAccounts', nextRow)
  else await ctx.db.patch('moneyPayoutAccounts', account._id, nextRow)
  const appliedRef = canonicalDigest({
    format: 'money-connect-account-binding:v1',
    businessId: args.businessId,
    currency: args.currency,
    stripeAccountId: event.stripeAccountId,
  })
  if (priorEvent === null)
    await ctx.db.insert('moneyStripeEvents', {
      ...eventRowFields(event),
      status: 'applied',
      appliedRef,
      appliedAt: event.observedAt,
    })
  else
    await ctx.db.patch('moneyStripeEvents', priorEvent._id, {
      status: 'applied',
      appliedRef,
      appliedAt: event.observedAt,
    })
  const updated =
    account === null
      ? await ctx.db
          .query('moneyPayoutAccounts')
          .withIndex('by_businessId_and_currency', (q) =>
            q.eq('businessId', args.businessId).eq('currency', args.currency),
          )
          .unique()
      : await ctx.db.get(account._id)
  return updated === null
    ? refusedConnect('payout_reconciliation_required', false)
    : { kind: 'accepted' as const, account: payoutAccountView(updated) }
}
