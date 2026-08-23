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
  transitionPayoutAccount,
  type StripeAccountUpdatedWebhookEvent,
} from '../src/modules/money/public'

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
export const recordConnectAccountEventArgs = {
  businessId: identifier,
  currency: identifier,
  exponent: v.number(),
  event: accountUpdatedEventArg,
  readback: connectAccountReadbackArg,
  expectedVersion: v.optional(v.number()),
  ...billingSourceArgs,
}

function refusedConnect(code: string, retryable: boolean) {
  return { kind: 'refused' as const, code, retryable }
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

export async function reserveConnectAccountHandler() {
  return {
    kind: 'refused' as const,
    code: 'connect_account_unlisted',
    retryable: false,
  }
}

export async function finalizeConnectAccountHandler() {
  return {
    kind: 'refused' as const,
    code: 'connect_account_unlisted',
    retryable: false,
  }
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

export async function readOwnerPayoutAccountHandler(
  ctx: QueryCtx,
  args: ReadOwnerPayoutAccountArgs,
) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return null
  const owner = await ctx.db
    .query('owners')
    .withIndex('by_clerkUserId', (q) =>
      q.eq('clerkUserId', actor.clerkUserId),
    )
    .unique()
  if (owner === null) return null
  const businesses = await ctx.db
    .query('businesses')
    .withIndex('by_owner_updatedAt', (q) => q.eq('ownerId', owner._id))
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
