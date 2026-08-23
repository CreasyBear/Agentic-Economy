import { v, type Infer } from 'convex/values'

import { internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import {
  env,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import {
  accountFromRow,
  applyPreparedCanonicalMoneyAccount,
  canonicalMoneyAccountMatches,
  prepareCanonicalMoneyAccount,
} from './moneyCanonicalAccounts'
import {
  ownerPrincipalAllowed,
  requireBillingSourceWrite,
} from './moneyBillingAuthorization'
import { entryAmount } from './moneyChargeJournal'
import {
  billingSourceArgs,
  exactAmount,
  identifier,
  moneyRefusalValue,
  serverFunctionAuth,
  stripeMoneyWebhookEventArg,
} from './moneyLedgerValues'
import { eventRowFields, eventRowMatches } from './moneyStripeEvents'
import {
  verifyCustomerRequestServiceAssertion,
  type CustomerRequestServiceAssertion,
} from '../src/modules/agent-access/service-auth-envelope'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  accountRefForOwner,
  addExactAmounts,
  amountAtScale,
  amountFromParts,
  calculateCreditTopupFinancials,
  compareExactAmounts,
  productionCreditTopupConfig,
  readExactAmount,
  STRIPE_CREDIT_RECOVERY_WINDOW_MS,
} from '../src/modules/money/public'

const TOPUP_WEBHOOK_LOOKUP_OPERATION =
  'moneyLedger:readCreditTopupWebhookCommand'
const TOPUP_WEBHOOK_LOOKUP_SCOPE = 'money:topup_webhook_read'

const topupState = v.union(
  v.literal('pending'),
  v.literal('succeeded'),
  v.literal('failed'),
  v.literal('outcome_unknown'),
)
export const topupCommandValue = v.object({
  commandRef: identifier,
  principalId: identifier,
  accountRef: identifier,
  currency: identifier,
  exponent: v.number(),
  amountUnits: identifier,
  processingFeeUnits: identifier,
  chargeAmountUnits: identifier,
  idempotencyKey: identifier,
  inputDigest: identifier,
  successReturnRef: identifier,
  providerRecoveryDeadlineAt: v.number(),
  state: topupState,
  externalRef: v.optional(identifier),
  providerStatus: v.optional(topupState),
  metadataDigest: v.optional(identifier),
  requestDigest: v.optional(identifier),
  checkoutSessionDigest: v.optional(identifier),
  paymentIntentDigest: v.optional(identifier),
  evidenceDigest: v.optional(identifier),
  providerEvidenceRef: v.optional(identifier),
  appliedStripeEventId: v.optional(identifier),
  appliedPayloadDigest: v.optional(identifier),
  appliedTransactionRef: v.optional(identifier),
  buyerBalanceBefore: v.optional(exactAmount),
  buyerBalanceAfter: v.optional(exactAmount),
  createdAt: v.number(),
  updatedAt: v.number(),
})
export const topupCommandResultValue = v.union(
  v.object({ kind: v.literal('accepted'), command: topupCommandValue }),
  moneyRefusalValue,
)
export const topupWebhookResultValue = v.union(
  v.object({
    kind: v.literal('accepted'),
    status: v.union(
      v.literal('applied'),
      v.literal('replayed'),
      v.literal('ignored'),
    ),
    appliedRef: v.optional(identifier),
  }),
  moneyRefusalValue,
)
export const topupProviderEvidenceArg = v.object({
  externalRef: identifier,
  amount: exactAmount,
  status: topupState,
  evidenceRef: identifier,
  requestDigest: identifier,
  metadataDigest: identifier,
  checkoutSessionDigest: identifier,
  paymentIntentDigest: v.optional(identifier),
  evidenceDigest: identifier,
  paymentId: v.optional(identifier),
})
export const topupReadInputArg = v.object({
  externalRef: v.optional(identifier),
  commandRef: v.optional(identifier),
  idempotencyKey: identifier,
})
export const reserveCreditTopupArgs = v.object({
  principalId: identifier,
  accountRef: identifier,
  amount: exactAmount,
  commandRef: identifier,
  idempotencyKey: identifier,
  inputDigest: identifier,
  successReturnRef: identifier,
  ...billingSourceArgs,
})
export const markCreditTopupOutcomeUnknownArgs = v.object({
  commandRef: identifier,
  principalId: identifier,
  accountRef: identifier,
  amount: exactAmount,
  idempotencyKey: identifier,
  inputDigest: identifier,
  successReturnRef: identifier,
  providerRecoveryDeadlineAt: v.number(),
  externalRef: v.optional(identifier),
  ...billingSourceArgs,
})
export const bindCreditPaymentSessionArgs = v.object({
  commandRef: identifier,
  evidence: topupProviderEvidenceArg,
  ...billingSourceArgs,
})
export const readCreditTopupWebhookCommandArgs = v.object({
  commandRef: identifier,
  externalRef: identifier,
  serviceAuth: serverFunctionAuth,
})
export const applyCreditTopupArgs = v.object({
  event: stripeMoneyWebhookEventArg,
  readback: topupProviderEvidenceArg,
  ...billingSourceArgs,
})
export type TopupProviderEvidence = Infer<typeof topupProviderEvidenceArg>
type MoneyRefusal = Infer<typeof moneyRefusalValue>
export type TopupWebhookResult = Infer<typeof topupWebhookResultValue>
export type ReserveCreditTopupArgs = Infer<typeof reserveCreditTopupArgs>
export type MarkCreditTopupOutcomeUnknownArgs = Infer<
  typeof markCreditTopupOutcomeUnknownArgs
>
export type BindCreditPaymentSessionArgs = Infer<
  typeof bindCreditPaymentSessionArgs
>
export type ReadCreditTopupCommandArgs = Infer<typeof topupReadInputArg>
export type ReadCreditTopupWebhookCommandArgs = Infer<
  typeof readCreditTopupWebhookCommandArgs
>
export type ApplyCreditTopupArgs = Infer<typeof applyCreditTopupArgs>

function refusedTopup(code: string, retryable: boolean): MoneyRefusal {
  return { kind: 'refused', code, retryable }
}

function topupCommandView(row: Doc<'moneyTopupCommands'>) {
  const buyerBalanceBefore =
    row.buyerBalanceBeforeUnits === undefined
      ? undefined
      : amountFromParts(row.currency, row.buyerBalanceBeforeUnits, row.exponent)
  const buyerBalanceAfter =
    row.buyerBalanceAfterUnits === undefined
      ? undefined
      : amountFromParts(row.currency, row.buyerBalanceAfterUnits, row.exponent)
  return {
    commandRef: row.commandRef,
    principalId: row.principalId,
    accountRef: row.accountRef,
    currency: row.currency,
    exponent: row.exponent,
    amountUnits: row.amountUnits,
    processingFeeUnits: row.processingFeeUnits,
    chargeAmountUnits: row.chargeAmountUnits,
    idempotencyKey: row.idempotencyKey,
    inputDigest: row.inputDigest,
    successReturnRef: row.successReturnRef,
    providerRecoveryDeadlineAt: row.providerRecoveryDeadlineAt,
    state: row.state,
    ...(row.externalRef === undefined ? {} : { externalRef: row.externalRef }),
    ...(row.paymentId === undefined ? {} : { paymentId: row.paymentId }),
    ...(row.providerStatus === undefined
      ? {}
      : { providerStatus: row.providerStatus }),
    ...(row.metadataDigest === undefined
      ? {}
      : { metadataDigest: row.metadataDigest }),
    ...(row.requestDigest === undefined
      ? {}
      : { requestDigest: row.requestDigest }),
    ...(row.checkoutSessionDigest === undefined
      ? {}
      : { checkoutSessionDigest: row.checkoutSessionDigest }),
    ...(row.paymentIntentDigest === undefined
      ? {}
      : { paymentIntentDigest: row.paymentIntentDigest }),
    ...(row.evidenceDigest === undefined
      ? {}
      : { evidenceDigest: row.evidenceDigest }),
    ...(row.providerEvidenceRef === undefined
      ? {}
      : { providerEvidenceRef: row.providerEvidenceRef }),
    ...(row.appliedStripeEventId === undefined
      ? {}
      : { appliedStripeEventId: row.appliedStripeEventId }),
    ...(row.appliedPayloadDigest === undefined
      ? {}
      : { appliedPayloadDigest: row.appliedPayloadDigest }),
    ...(row.appliedTransactionRef === undefined
      ? {}
      : { appliedTransactionRef: row.appliedTransactionRef }),
    ...(buyerBalanceBefore === undefined ? {} : { buyerBalanceBefore }),
    ...(buyerBalanceAfter === undefined ? {} : { buyerBalanceAfter }),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function topupWebhookLookupAuthorized(
  serviceAuth: CustomerRequestServiceAssertion,
  commandRef: string,
  externalRef: string,
): Promise<boolean> {
  const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (
    key === undefined ||
    key.length < 32 ||
    !serviceAuth.scopes.includes(TOPUP_WEBHOOK_LOOKUP_SCOPE)
  )
    return false
  return await verifyCustomerRequestServiceAssertion({
    key,
    operation: TOPUP_WEBHOOK_LOOKUP_OPERATION,
    command: { commandRef, externalRef },
    assertion: serviceAuth,
  })
}

export async function reserveCreditTopupHandler(
  ctx: MutationCtx,
  args: ReserveCreditTopupArgs,
) {
  await requireBillingSourceWrite(ctx, args)
  const prior = await ctx.db
    .query('moneyTopupCommands')
    .withIndex('by_idempotencyKey', (q) =>
      q.eq('idempotencyKey', args.idempotencyKey),
    )
    .unique()
  if (prior !== null) {
    if (
      prior.inputDigest !== args.inputDigest ||
      prior.commandRef !== args.commandRef ||
      prior.principalId !== args.principalId ||
      prior.accountRef !== args.accountRef
    )
      return refusedTopup('ledger_idempotency_conflict', false)
    return { kind: 'accepted' as const, command: topupCommandView(prior) }
  }
  const identity = await ctx.auth.getUserIdentity()
  const ownerAllowed = await ownerPrincipalAllowed(
    identity,
    args.principalId,
    async () =>
      await ctx.db
        .query('agentAccessPrincipals')
        .withIndex('by_principalId', (q) =>
          q.eq('principalId', args.principalId),
        )
        .unique(),
  )
  if (!ownerAllowed) return refusedTopup('billing_identity_missing', false)
  const principal = await ctx.db
    .query('agentAccessPrincipals')
    .withIndex('by_principalId', (q) =>
      q.eq('principalId', args.principalId),
    )
    .unique()
  if (principal === null) return refusedTopup('billing_identity_missing', false)
  const requestedAmount = readExactAmount(args.amount)
  if (requestedAmount === undefined)
    return refusedTopup('credit_topup_amount_invalid', false)
  const expectedAccountRef = accountRefForOwner(
    principal.ownerId,
    requestedAmount.currency,
  )
  if (args.accountRef !== expectedAccountRef)
    return refusedTopup('billing_identity_mismatch', false)
  const existing = await ctx.db
    .query('moneyAccounts')
    .withIndex('by_accountRef', (q) => q.eq('accountRef', expectedAccountRef))
    .unique()
  if (
    existing !== null &&
    !canonicalMoneyAccountMatches(
      existing,
      {
        accountKind: 'operator_credit',
        accountId: principal.ownerId,
        currency: existing.currency,
        exponent: existing.exponent,
        now: 0,
      },
      expectedAccountRef,
    )
  )
    return refusedTopup('billing_identity_mismatch', false)
  const financials = calculateCreditTopupFinancials({
    amount: requestedAmount,
    accountCurrency: existing?.currency ?? requestedAmount.currency,
    accountExponent: existing?.exponent ?? requestedAmount.exponent,
    config: productionCreditTopupConfig(),
  })
  if (financials === undefined)
    return refusedTopup('credit_topup_amount_invalid', false)
  const now = Date.now()
  const preparedAccount =
    existing === null
      ? await prepareCanonicalMoneyAccount(ctx, {
          accountKind: 'operator_credit',
          accountId: principal.ownerId,
          currency: financials.amount.currency,
          exponent: financials.amount.exponent,
          now,
        })
      : { kind: 'existing' as const, row: existing }
  if (preparedAccount === undefined)
    return refusedTopup('billing_identity_mismatch', false)
  await applyPreparedCanonicalMoneyAccount(ctx, preparedAccount)
  const metadataDigest = canonicalDigest({ ae_command_ref: args.commandRef })
  const row = {
    commandRef: args.commandRef,
    principalId: args.principalId,
    accountRef: args.accountRef,
    currency: financials.amount.currency,
    exponent: financials.amount.exponent,
    amountUnits: financials.amount.units,
    processingFeeUnits: financials.processingFee.units,
    chargeAmountUnits: financials.chargeAmount.units,
    idempotencyKey: args.idempotencyKey,
    inputDigest: args.inputDigest,
    successReturnRef: args.successReturnRef,
    providerRecoveryDeadlineAt: now + STRIPE_CREDIT_RECOVERY_WINDOW_MS,
    state: 'pending' as const,
    providerStatus: 'pending' as const,
    metadataDigest,
    createdAt: now,
    updatedAt: now,
  }
  await ctx.db.insert('moneyTopupCommands', row)
  return { kind: 'accepted' as const, command: row }
}

export async function markCreditTopupOutcomeUnknownHandler(
  ctx: MutationCtx,
  args: MarkCreditTopupOutcomeUnknownArgs,
) {
  await requireBillingSourceWrite(ctx, args)
  const identity = await ctx.auth.getUserIdentity()
  const ownerAllowed = await ownerPrincipalAllowed(
    identity,
    args.principalId,
    async () =>
      await ctx.db
        .query('agentAccessPrincipals')
        .withIndex('by_principalId', (q) =>
          q.eq('principalId', args.principalId),
        )
        .unique(),
  )
  if (!ownerAllowed) return refusedTopup('billing_identity_missing', false)
  const command = await ctx.db
    .query('moneyTopupCommands')
    .withIndex('by_commandRef', (q) => q.eq('commandRef', args.commandRef))
    .unique()
  if (command === null) return refusedTopup('credit_topup_pending', true)
  const requestedAmount = readExactAmount(args.amount)
  const commandAmount = amountFromParts(
    command.currency,
    command.amountUnits,
    command.exponent,
  )
  if (
    requestedAmount === undefined ||
    commandAmount === undefined ||
    compareExactAmounts(requestedAmount, commandAmount) !== 0 ||
    command.commandRef !== args.commandRef ||
    command.principalId !== args.principalId ||
    command.accountRef !== args.accountRef ||
    command.idempotencyKey !== args.idempotencyKey ||
    command.inputDigest !== args.inputDigest ||
    command.successReturnRef !== args.successReturnRef ||
    command.providerRecoveryDeadlineAt !== args.providerRecoveryDeadlineAt ||
    command.externalRef !== args.externalRef
  )
    return refusedTopup('ledger_idempotency_conflict', false)
  if (command.state === 'failed')
    return refusedTopup('ledger_idempotency_conflict', false)
  if (command.state === 'succeeded' || command.state === 'outcome_unknown') {
    return { kind: 'accepted' as const, command: topupCommandView(command) }
  }
  const now = Date.now()
  await ctx.db.patch('moneyTopupCommands', command._id, {
    state: 'outcome_unknown',
    providerStatus: 'outcome_unknown',
    updatedAt: now,
  })
  const updated = await ctx.db.get(command._id)
  return updated === null
    ? refusedTopup('credit_topup_outcome_unknown', true)
    : { kind: 'accepted' as const, command: topupCommandView(updated) }
}

export async function bindCreditPaymentSessionHandler(
  ctx: MutationCtx,
  args: BindCreditPaymentSessionArgs,
) {
  await requireBillingSourceWrite(ctx, args)
  const command = await ctx.db
    .query('moneyTopupCommands')
    .withIndex('by_commandRef', (q) => q.eq('commandRef', args.commandRef))
    .unique()
  if (command === null) return refusedTopup('credit_topup_pending', true)
  const evidenceAmount = readExactAmount(args.evidence.amount)
  const chargeAmount = amountFromParts(
    command.currency,
    command.chargeAmountUnits,
    command.exponent,
  )
  if (
    evidenceAmount === undefined ||
    chargeAmount === undefined ||
    compareExactAmounts(evidenceAmount, chargeAmount) !== 0
  )
    return refusedTopup('credit_topup_outcome_unknown', true)
  if (
    command.externalRef !== undefined &&
    command.externalRef !== args.evidence.externalRef
  )
    return refusedTopup('ledger_idempotency_conflict', false)
  if (
    command.metadataDigest !== undefined &&
    command.metadataDigest !== args.evidence.metadataDigest
  )
    return refusedTopup('ledger_idempotency_conflict', false)
  if (
    command.requestDigest !== undefined &&
    command.requestDigest !== args.evidence.requestDigest
  )
    return refusedTopup('ledger_idempotency_conflict', false)
  if (
    command.paymentId !== undefined &&
    command.paymentId !== args.evidence.paymentId
  )
    return refusedTopup('ledger_idempotency_conflict', false)
  if (
    command.checkoutSessionDigest !== undefined &&
    command.checkoutSessionDigest !== args.evidence.checkoutSessionDigest
  )
    return refusedTopup('ledger_idempotency_conflict', false)
  if (
    command.paymentIntentDigest !== undefined &&
    command.paymentIntentDigest !== args.evidence.paymentIntentDigest
  )
    return refusedTopup('ledger_idempotency_conflict', false)
  if (command.state === 'succeeded') {
    if (
      command.providerStatus !== 'succeeded' ||
      command.evidenceDigest !== args.evidence.evidenceDigest ||
      args.evidence.status !== 'succeeded'
    ) {
      return refusedTopup('ledger_idempotency_conflict', false)
    }
    return { kind: 'accepted' as const, command: topupCommandView(command) }
  }
  const now = Date.now()
  const patch = {
    externalRef: args.evidence.externalRef,
    providerStatus: args.evidence.status,
    providerEvidenceRef: args.evidence.evidenceRef,
    requestDigest: args.evidence.requestDigest,
    metadataDigest: args.evidence.metadataDigest,
    ...(args.evidence.paymentId === undefined
      ? {}
      : { paymentId: args.evidence.paymentId }),
    checkoutSessionDigest: args.evidence.checkoutSessionDigest,
    ...(args.evidence.paymentIntentDigest === undefined
      ? {}
      : { paymentIntentDigest: args.evidence.paymentIntentDigest }),
    evidenceDigest: args.evidence.evidenceDigest,
    updatedAt: now,
    ...(args.evidence.status === 'failed'
      ? { state: 'failed' as const }
      : args.evidence.status === 'outcome_unknown'
        ? { state: 'outcome_unknown' as const }
        : {}),
  }
  await ctx.db.patch('moneyTopupCommands', command._id, patch)
  const updated = await ctx.db.get(command._id)
  return updated === null
    ? refusedTopup('credit_topup_outcome_unknown', true)
    : { kind: 'accepted' as const, command: topupCommandView(updated) }
}

export async function readCreditTopupCommandHandler(
  ctx: QueryCtx,
  args: ReadCreditTopupCommandArgs,
) {
  if ((args.externalRef === undefined) === (args.commandRef === undefined)) {
    return refusedTopup('payment_binding_invalid', false)
  }
  let command: Doc<'moneyTopupCommands'> | null
  if (args.externalRef !== undefined) {
    const externalRef = args.externalRef
    command = await ctx.db
      .query('moneyTopupCommands')
      .withIndex('by_externalRef', (q) => q.eq('externalRef', externalRef))
      .unique()
  } else {
    const commandRef = args.commandRef
    if (commandRef === undefined)
      return refusedTopup('payment_binding_invalid', false)
    command = await ctx.db
      .query('moneyTopupCommands')
      .withIndex('by_commandRef', (q) => q.eq('commandRef', commandRef))
      .unique()
  }
  if (command === null || command.idempotencyKey !== args.idempotencyKey)
    return refusedTopup('credit_topup_pending', true)
  const identity = await ctx.auth.getUserIdentity()
  const ownerAllowed = await ownerPrincipalAllowed(
    identity,
    command.principalId,
    async () =>
      await ctx.db
        .query('agentAccessPrincipals')
        .withIndex('by_principalId', (q) =>
          q.eq('principalId', command.principalId),
        )
        .unique(),
  )
  if (!ownerAllowed) return refusedTopup('billing_identity_missing', false)
  if (
    command.state === 'succeeded' &&
    (command.buyerBalanceBeforeUnits === undefined ||
      command.buyerBalanceAfterUnits === undefined)
  )
    return refusedTopup('credit_topup_outcome_unknown', false)
  return { kind: 'accepted' as const, command: topupCommandView(command) }
}

export async function readCreditTopupWebhookCommandHandler(
  ctx: QueryCtx,
  args: ReadCreditTopupWebhookCommandArgs,
) {
  if (
    !(await topupWebhookLookupAuthorized(
      args.serviceAuth,
      args.commandRef,
      args.externalRef,
    ))
  )
    return refusedTopup('billing_identity_missing', false)
  const command = await ctx.db
    .query('moneyTopupCommands')
    .withIndex('by_commandRef', (q) => q.eq('commandRef', args.commandRef))
    .unique()
  if (command === null) return refusedTopup('credit_topup_pending', true)
  if (
    command.externalRef !== undefined &&
    command.externalRef !== args.externalRef
  )
    return refusedTopup('ledger_idempotency_conflict', false)
  return { kind: 'accepted' as const, command: topupCommandView(command) }
}

export async function applyCreditTopupHandler(
  ctx: MutationCtx,
  args: ApplyCreditTopupArgs,
): Promise<TopupWebhookResult> {
  await requireBillingSourceWrite(ctx, args)
  const event = args.event
  const priorEvent = await ctx.db
    .query('moneyStripeEvents')
    .withIndex('by_stripeEventId', (q) =>
      q.eq('stripeEventId', event.stripeEventId),
    )
    .unique()
  if (priorEvent !== null && !eventRowMatches(priorEvent, event))
    return refusedTopup('ledger_idempotency_conflict', false)
  if (event.kind === 'account')
    return refusedTopup('payment_binding_invalid', false)
  if (
    event.externalRef !== event.sessionId ||
    (event.eventType === 'checkout.session.expired' &&
      event.status !== 'expired') ||
    (event.eventType === 'checkout.session.async_payment_failed' &&
      event.status !== 'failed') ||
    (event.eventType === 'checkout.session.async_payment_succeeded' &&
      event.status !== 'paid') ||
    (event.eventType === 'checkout.session.completed' &&
      event.status !== 'paid' &&
      event.status !== 'failed')
  )
    return refusedTopup('payment_binding_invalid', false)
  const command = await ctx.db
    .query('moneyTopupCommands')
    .withIndex('by_commandRef', (q) => q.eq('commandRef', event.commandRef))
    .unique()
  if (command === null) return refusedTopup('credit_topup_pending', true)
  const readbackStatusValid =
    event.status === 'paid'
      ? args.readback.status === 'succeeded'
      : event.status === 'expired'
        ? args.readback.status === 'failed'
        : args.readback.status !== 'succeeded'
  const commandPaymentIdMatches =
    command.paymentId === undefined ||
    command.paymentId === args.readback.paymentId
  const commandPaymentDigestMatches =
    command.paymentIntentDigest === undefined ||
    command.paymentIntentDigest === args.readback.paymentIntentDigest
  const commandRequestDigestMatches =
    command.requestDigest === undefined ||
    command.requestDigest === args.readback.requestDigest
  const commandCheckoutSessionDigestMatches =
    command.checkoutSessionDigest === undefined ||
    command.checkoutSessionDigest === args.readback.checkoutSessionDigest
  const frozenTerminalMatches =
    command.state !== 'succeeded' ||
    (command.providerStatus === 'succeeded' &&
      command.evidenceDigest === args.readback.evidenceDigest &&
      args.readback.status === 'succeeded')
  if (
    !readbackStatusValid ||
    args.readback.externalRef !== event.sessionId ||
    compareExactAmounts(args.readback.amount, event.amount) !== 0 ||
    args.readback.paymentId !== event.paymentId ||
    args.readback.checkoutSessionDigest !== event.checkoutSessionDigest ||
    args.readback.paymentIntentDigest !== event.paymentIntentDigest ||
    args.readback.metadataDigest !== event.metadataDigest ||
    !frozenTerminalMatches
  )
    return refusedTopup('ledger_idempotency_conflict', false)
  if (
    !commandRequestDigestMatches ||
    command.metadataDigest !== args.readback.metadataDigest ||
    !commandCheckoutSessionDigestMatches ||
    !commandPaymentDigestMatches ||
    !commandPaymentIdMatches
  )
    return refusedTopup('ledger_idempotency_conflict', false)
  if (
    command.externalRef !== undefined &&
    command.externalRef !== event.externalRef
  )
    return refusedTopup('ledger_idempotency_conflict', false)
  const commandAmount = amountFromParts(
    command.currency,
    command.amountUnits,
    command.exponent,
  )
  const chargeAmount = amountFromParts(
    command.currency,
    command.chargeAmountUnits,
    command.exponent,
  )
  if (
    commandAmount === undefined ||
    chargeAmount === undefined ||
    compareExactAmounts(chargeAmount, event.amount) !== 0 ||
    event.amount.currency !== command.currency ||
    command.metadataDigest !== event.metadataDigest
  ) {
    return refusedTopup('payment_binding_invalid', false)
  }
  if (priorEvent?.status === 'applied') {
    if (
      command.buyerBalanceBeforeUnits === undefined ||
      command.buyerBalanceAfterUnits === undefined
    )
      return refusedTopup('credit_topup_outcome_unknown', false)
    return {
      kind: 'accepted' as const,
      status: 'replayed' as const,
      ...(priorEvent.appliedRef === undefined
        ? {}
        : { appliedRef: priorEvent.appliedRef }),
    }
  }
  if (priorEvent?.status === 'ignored')
    return { kind: 'accepted' as const, status: 'replayed' as const }
  const boundPatch = {
    externalRef: event.externalRef,
    providerStatus:
      event.status === 'paid' ? ('succeeded' as const) : ('failed' as const),
    providerEvidenceRef: args.readback.evidenceRef,
    requestDigest: args.readback.requestDigest,
    metadataDigest: event.metadataDigest,
    checkoutSessionDigest: args.readback.checkoutSessionDigest,
    evidenceDigest: args.readback.evidenceDigest,
    ...(args.readback.paymentId === undefined
      ? {}
      : { paymentId: args.readback.paymentId }),
    ...(args.readback.paymentIntentDigest === undefined
      ? {}
      : { paymentIntentDigest: args.readback.paymentIntentDigest }),
    updatedAt: event.observedAt,
  }
  if (event.status !== 'paid') {
    if (command.state !== 'succeeded')
      await ctx.db.patch('moneyTopupCommands', command._id, {
        ...boundPatch,
        state: 'failed' as const,
      })
    if (priorEvent === null)
      await ctx.db.insert('moneyStripeEvents', {
        ...eventRowFields(event),
        status: 'ignored',
      })
    else
      await ctx.db.patch('moneyStripeEvents', priorEvent._id, {
        status: 'ignored',
      })
    return { kind: 'accepted' as const, status: 'ignored' as const }
  }
  const priorTransaction = await ctx.db
    .query('moneyTransactions')
    .withIndex('by_idempotencyKey', (q) =>
      q.eq('idempotencyKey', command.idempotencyKey),
    )
    .unique()
  if (priorTransaction !== null) {
    const priorEntry = await ctx.db
      .query('moneyLedgerEntries')
      .withIndex('by_transactionRef', (q) =>
        q.eq('transactionRef', priorTransaction.transactionRef),
      )
      .unique()
    const priorAmount =
      priorEntry === null ? undefined : entryAmount(priorEntry)
    if (
      priorTransaction.kind !== 'topup' ||
      priorTransaction.inputDigest !== command.inputDigest ||
      priorTransaction.principalId !== command.principalId ||
      priorEntry === null ||
      priorEntry.accountRef !== command.accountRef ||
      priorAmount === undefined ||
      compareExactAmounts(priorAmount, commandAmount) !== 0 ||
      command.buyerBalanceBeforeUnits === undefined ||
      command.buyerBalanceAfterUnits === undefined
    )
      return refusedTopup('credit_topup_outcome_unknown', false)
    if (command.state === 'succeeded') {
      if (
        command.appliedTransactionRef !== priorTransaction.transactionRef ||
        command.appliedStripeEventId === undefined ||
        command.appliedPayloadDigest === undefined
      )
        return refusedTopup('credit_topup_outcome_unknown', false)
      if (priorEvent === null)
        await ctx.db.insert('moneyStripeEvents', {
          ...eventRowFields(event),
          status: 'applied',
          appliedRef: priorTransaction.transactionRef,
          appliedAt: event.observedAt,
        })
      return {
        kind: 'accepted' as const,
        status: 'replayed' as const,
        appliedRef: priorTransaction.transactionRef,
      }
    }
    await ctx.db.patch('moneyTopupCommands', command._id, {
      ...boundPatch,
      state: 'succeeded',
      buyerBalanceBeforeUnits: command.buyerBalanceBeforeUnits,
      buyerBalanceAfterUnits: command.buyerBalanceAfterUnits,
      appliedStripeEventId: event.stripeEventId,
      appliedPayloadDigest: event.payloadDigest,
      appliedTransactionRef: priorTransaction.transactionRef,
    })
    if (priorEvent === null)
      await ctx.db.insert('moneyStripeEvents', {
        ...eventRowFields(event),
        status: 'applied',
        appliedRef: priorTransaction.transactionRef,
        appliedAt: event.observedAt,
      })
    else
      await ctx.db.patch('moneyStripeEvents', priorEvent._id, {
        status: 'applied',
        appliedRef: priorTransaction.transactionRef,
        appliedAt: event.observedAt,
      })
    return {
      kind: 'accepted' as const,
      status: 'replayed' as const,
      appliedRef: priorTransaction.transactionRef,
    }
  }
  const account = await ctx.db
    .query('moneyAccounts')
    .withIndex('by_accountRef', (q) => q.eq('accountRef', command.accountRef))
    .unique()
  const accountDomain = account === null ? undefined : accountFromRow(account)
  const accountAmount =
    account === null || accountDomain === undefined
      ? undefined
      : amountAtScale(commandAmount, account.currency, account.exponent)
  if (
    account === null ||
    accountDomain === undefined ||
    accountAmount === undefined ||
    account.accountKind !== 'operator_credit' ||
    account.accountId === undefined ||
    account.currency !== command.currency
  )
    return refusedTopup('currency_mismatch', false)
  const principal = await ctx.db
    .query('agentAccessPrincipals')
    .withIndex('by_principalId', (q) =>
      q.eq('principalId', command.principalId),
    )
    .unique()
  if (principal === null || principal.ownerId !== account.accountId)
    return refusedTopup('billing_identity_mismatch', false)
  const nextBalance = addExactAmounts(accountDomain.balance, accountAmount)
  if (nextBalance === undefined)
    return refusedTopup('credit_topup_amount_invalid', false)
  const transactionRef = canonicalDigest({
    format: 'money-topup-transaction:v1',
    commandRef: command.commandRef,
  })
  const transaction = {
    transactionRef,
    kind: 'topup' as const,
    idempotencyKey: command.idempotencyKey,
    inputDigest: command.inputDigest,
    principalId: command.principalId,
    accountId: account.accountId,
    currency: accountAmount.currency,
    amountUnits: accountAmount.units,
    exponent: accountAmount.exponent,
    state: 'applied' as const,
    expectedAccountVersion: account.version,
    externalRef: event.externalRef,
    createdAt: event.observedAt,
    updatedAt: event.observedAt,
  }
  await ctx.db.insert('moneyLedgerEntries', {
    entryRef: `${transactionRef}:topup`,
    accountRef: account.accountRef,
    entryType: 'topup',
    direction: 'credit',
    amountUnits: accountAmount.units,
    currency: accountAmount.currency,
    exponent: accountAmount.exponent,
    transactionRef,
    idempotencyKey: command.idempotencyKey,
    principalId: command.principalId,
    sourceDigest: event.payloadDigest,
    evidenceRefs: [
      `stripe:event:${event.stripeEventId}`,
      `stripe:session:${event.sessionId}`,
      `stripe:metadata:${event.metadataDigest}`,
    ],
    createdAt: event.observedAt,
  })
  await ctx.db.patch('moneyAccounts', account._id, {
    balanceUnits: nextBalance.units,
    version: account.version + 1,
    updatedAt: event.observedAt,
  })
  await ctx.db.insert('moneyTransactions', transaction)
  await ctx.db.patch('moneyTopupCommands', command._id, {
    ...boundPatch,
    state: 'succeeded',
    buyerBalanceBeforeUnits: account.balanceUnits,
    buyerBalanceAfterUnits: nextBalance.units,
    appliedStripeEventId: event.stripeEventId,
    appliedPayloadDigest: event.payloadDigest,
    appliedTransactionRef: transactionRef,
  })
  if (priorEvent === null)
    await ctx.db.insert('moneyStripeEvents', {
      ...eventRowFields(event),
      status: 'applied',
      appliedRef: transactionRef,
      appliedAt: event.observedAt,
    })
  else
    await ctx.db.patch('moneyStripeEvents', priorEvent._id, {
      status: 'applied',
      appliedRef: transactionRef,
      appliedAt: event.observedAt,
    })
  return {
    kind: 'accepted' as const,
    status: 'applied' as const,
    appliedRef: transactionRef,
  }
}

export async function applyVerifiedStripeEventHandler(
  ctx: ActionCtx,
  args: ApplyCreditTopupArgs,
): Promise<TopupWebhookResult> {
  const result: TopupWebhookResult = await ctx.runMutation(
    internal.moneyLedger.applyCreditTopup,
    {
      event: args.event,
      readback: args.readback,
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      ...(args.sourceWrite === undefined ? {} : { sourceWrite: args.sourceWrite }),
      ...(args.sourceWriteRequest === undefined
        ? {}
        : { sourceWriteRequest: args.sourceWriteRequest }),
    },
  )
  return result
}
