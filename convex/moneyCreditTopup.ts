import { internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import {
  env,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import {
  applyPreparedCanonicalMoneyAccount,
  canonicalMoneyAccountMatches,
  prepareCanonicalMoneyAccount,
} from './moneyCanonicalAccounts'
import {
  ownerPrincipalAllowed,
  requireBillingSourceWrite,
} from './moneyBillingAuthorization'
import {
  verifyCustomerRequestServiceAssertion,
  type CustomerRequestServiceAssertion,
} from '../src/modules/agent-access/service-auth-envelope'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  accountRefForOwner,
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

import {
  refusedTopup,
  type ApplyCreditTopupArgs,
  type BindCreditPaymentSessionArgs,
  type MarkCreditTopupOutcomeUnknownArgs,
  type ReadCreditTopupCommandArgs,
  type ReadCreditTopupWebhookCommandArgs,
  type ReserveCreditTopupArgs,
  type TopupWebhookResult,
} from './moneyCreditTopup/contracts'
import { topupCommandView } from './moneyCreditTopup/command_view'

export {
  applyCreditTopupArgs,
  bindCreditPaymentSessionArgs,
  markCreditTopupOutcomeUnknownArgs,
  readCreditTopupWebhookCommandArgs,
  reserveCreditTopupArgs,
  topupCommandResultValue,
  topupCommandValue,
  topupProviderEvidenceArg,
  topupReadInputArg,
  topupWebhookResultValue,
  type ApplyCreditTopupArgs,
  type BindCreditPaymentSessionArgs,
  type MarkCreditTopupOutcomeUnknownArgs,
  type ReadCreditTopupCommandArgs,
  type ReadCreditTopupWebhookCommandArgs,
  type ReserveCreditTopupArgs,
  type TopupProviderEvidence,
  type TopupWebhookResult,
} from './moneyCreditTopup/contracts'
export { applyCreditTopupHandler } from './moneyCreditTopup/apply'

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
