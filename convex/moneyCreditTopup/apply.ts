import type { MutationCtx } from '../_generated/server'
import type { Doc } from '../_generated/dataModel'
import {
  accountFromRow,
} from '../moneyCanonicalAccounts'
import { requireBillingSourceWrite } from '../moneyBillingAuthorization'
import { entryAmount } from '../moneyChargeJournal'
import { eventRowFields, eventRowMatches } from '../moneyStripeEvents'
import { applyOwnerMoneyPromotionsOnCompletedTopup } from '../moneyCreditPromotions'
import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import {
  addExactAmounts,
  amountAtScale,
  amountFromParts,
  compareExactAmounts,
} from '../../src/modules/money/public'
import {
  refusedTopup,
  type ApplyCreditTopupArgs,
  type TopupWebhookResult,
} from './contracts'

const everyFact = (facts: readonly boolean[]): boolean => facts.every(Boolean)
type CheckoutTopupEvent = Extract<ApplyCreditTopupArgs['event'], { kind: 'checkout' }>
type TopupReadback = ApplyCreditTopupArgs['readback']

function eventStatusMatches(event: CheckoutTopupEvent): boolean {
  switch (event.eventType) {
    case 'checkout.session.expired':
      return event.status === 'expired'
    case 'checkout.session.async_payment_failed':
      return event.status === 'failed'
    case 'checkout.session.async_payment_succeeded':
      return event.status === 'paid'
    case 'checkout.session.completed':
      return event.status === 'paid' || event.status === 'failed'
  }
}

function optionalMatches<T>(stored: T | undefined, observed: T): boolean {
  return stored === undefined || stored === observed
}

function readbackStatusMatches(
  event: CheckoutTopupEvent,
  readback: TopupReadback,
): boolean {
  switch (event.status) {
    case 'paid':
      return readback.status === 'succeeded'
    case 'expired':
      return readback.status === 'failed'
    default:
      return readback.status !== 'succeeded'
  }
}

function frozenTerminalMatches(
  command: Doc<'moneyTopupCommands'>,
  readback: TopupReadback,
): boolean {
  if (command.state !== 'succeeded') return true
  return everyFact([
    command.providerStatus === 'succeeded',
    command.evidenceDigest === readback.evidenceDigest,
    readback.status === 'succeeded',
  ])
}

function readbackMatchesEventAndCommand(
  command: Doc<'moneyTopupCommands'>,
  event: CheckoutTopupEvent,
  readback: TopupReadback,
): boolean {
  return everyFact([
    readbackStatusMatches(event, readback),
    readback.externalRef === event.sessionId,
    compareExactAmounts(readback.amount, event.amount) === 0,
    readback.paymentId === event.paymentId,
    readback.checkoutSessionDigest === event.checkoutSessionDigest,
    readback.paymentIntentDigest === event.paymentIntentDigest,
    readback.metadataDigest === event.metadataDigest,
    frozenTerminalMatches(command, readback),
    optionalMatches(command.requestDigest, readback.requestDigest),
    command.metadataDigest === readback.metadataDigest,
    optionalMatches(command.checkoutSessionDigest, readback.checkoutSessionDigest),
    optionalMatches(command.paymentIntentDigest, readback.paymentIntentDigest),
    optionalMatches(command.paymentId, readback.paymentId),
  ])
}

function commandAmountMatchesEvent(
  command: Doc<'moneyTopupCommands'>,
  commandAmount: ReturnType<typeof amountFromParts>,
  chargeAmount: ReturnType<typeof amountFromParts>,
  event: CheckoutTopupEvent,
): boolean {
  if (commandAmount === undefined || chargeAmount === undefined) return false
  return everyFact([
    compareExactAmounts(chargeAmount, event.amount) === 0,
    event.amount.currency === command.currency,
    command.metadataDigest === event.metadataDigest,
  ])
}

function priorTopupMaterialMatches(
  command: Doc<'moneyTopupCommands'>,
  transaction: Doc<'moneyTransactions'>,
  entry: Doc<'moneyLedgerEntries'> | null,
  commandAmount: NonNullable<ReturnType<typeof amountFromParts>>,
): boolean {
  if (entry === null) return false
  const priorAmount = entryAmount(entry)
  if (priorAmount === undefined) return false
  return everyFact([
    transaction.kind === 'topup',
    transaction.inputDigest === command.inputDigest,
    transaction.principalId === command.principalId,
    entry.accountRef === command.accountRef,
    compareExactAmounts(priorAmount, commandAmount) === 0,
    command.buyerBalanceBeforeUnits !== undefined,
    command.buyerBalanceAfterUnits !== undefined,
  ])
}

function topupBoundPatch(event: CheckoutTopupEvent, readback: TopupReadback) {
  return {
    externalRef: event.externalRef,
    providerStatus:
      event.status === 'paid' ? ('succeeded' as const) : ('failed' as const),
    providerEvidenceRef: readback.evidenceRef,
    requestDigest: readback.requestDigest,
    metadataDigest: event.metadataDigest,
    checkoutSessionDigest: readback.checkoutSessionDigest,
    evidenceDigest: readback.evidenceDigest,
    ...(readback.paymentId === undefined ? {} : { paymentId: readback.paymentId }),
    ...(readback.paymentIntentDigest === undefined
      ? {}
      : { paymentIntentDigest: readback.paymentIntentDigest }),
    updatedAt: event.observedAt,
  }
}

type TopupBoundPatch = ReturnType<typeof topupBoundPatch>

async function recordAppliedEvent(
  ctx: MutationCtx,
  priorEvent: Doc<'moneyStripeEvents'> | null,
  event: CheckoutTopupEvent,
  transactionRef: string,
): Promise<void> {
  if (priorEvent === null) {
    await ctx.db.insert('moneyStripeEvents', {
      ...eventRowFields(event),
      status: 'applied',
      appliedRef: transactionRef,
      appliedAt: event.observedAt,
    })
    return
  }
  await ctx.db.patch('moneyStripeEvents', priorEvent._id, {
    status: 'applied',
    appliedRef: transactionRef,
    appliedAt: event.observedAt,
  })
}

async function handleUnpaidTopup(
  ctx: MutationCtx,
  command: Doc<'moneyTopupCommands'>,
  priorEvent: Doc<'moneyStripeEvents'> | null,
  event: CheckoutTopupEvent,
  boundPatch: TopupBoundPatch,
): Promise<TopupWebhookResult> {
  if (command.state !== 'succeeded') {
    await ctx.db.patch('moneyTopupCommands', command._id, {
      ...boundPatch,
      state: 'failed' as const,
    })
  }
  if (priorEvent === null) {
    await ctx.db.insert('moneyStripeEvents', {
      ...eventRowFields(event),
      status: 'ignored',
    })
  } else {
    await ctx.db.patch('moneyStripeEvents', priorEvent._id, {
      status: 'ignored',
    })
  }
  return { kind: 'accepted' as const, status: 'ignored' as const }
}

async function replayPriorTopupTransaction(
  ctx: MutationCtx,
  command: Doc<'moneyTopupCommands'>,
  priorTransaction: Doc<'moneyTransactions'>,
  priorEvent: Doc<'moneyStripeEvents'> | null,
  commandAmount: NonNullable<ReturnType<typeof amountFromParts>>,
  event: CheckoutTopupEvent,
  boundPatch: TopupBoundPatch,
): Promise<TopupWebhookResult> {
  const priorEntry = await ctx.db
    .query('moneyLedgerEntries')
    .withIndex('by_transactionRef', (q) =>
      q.eq('transactionRef', priorTransaction.transactionRef),
    )
    .unique()
  if (!priorTopupMaterialMatches(command, priorTransaction, priorEntry, commandAmount)) {
    return refusedTopup('credit_topup_outcome_unknown', false)
  }
  if (command.state === 'succeeded') {
    if (
      command.appliedTransactionRef !== priorTransaction.transactionRef
      || command.appliedStripeEventId === undefined
      || command.appliedPayloadDigest === undefined
    ) return refusedTopup('credit_topup_outcome_unknown', false)
    if (priorEvent === null) {
      await ctx.db.insert('moneyStripeEvents', {
        ...eventRowFields(event),
        status: 'applied',
        appliedRef: priorTransaction.transactionRef,
        appliedAt: event.observedAt,
      })
    }
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
  await recordAppliedEvent(ctx, priorEvent, event, priorTransaction.transactionRef)
  return {
    kind: 'accepted' as const,
    status: 'replayed' as const,
    appliedRef: priorTransaction.transactionRef,
  }
}

async function applyFreshTopup(
  ctx: MutationCtx,
  command: Doc<'moneyTopupCommands'>,
  priorEvent: Doc<'moneyStripeEvents'> | null,
  commandAmount: NonNullable<ReturnType<typeof amountFromParts>>,
  event: CheckoutTopupEvent,
  boundPatch: TopupBoundPatch,
): Promise<TopupWebhookResult> {
  const account = await ctx.db
    .query('moneyAccounts')
    .withIndex('by_accountRef', (q) => q.eq('accountRef', command.accountRef))
    .unique()
  const accountDomain = account === null ? undefined : accountFromRow(account)
  const accountAmount =
    account === null || accountDomain === undefined
      ? undefined
      : amountAtScale(commandAmount, account.currency, account.exponent)
  if (account === null || accountDomain === undefined || accountAmount === undefined) {
    return refusedTopup('currency_mismatch', false)
  }
  if (!everyFact([
    account.accountKind === 'operator_credit',
    account.accountId !== undefined,
    account.currency === command.currency,
  ])) return refusedTopup('currency_mismatch', false)
  const principal = await ctx.db
    .query('agentAccessPrincipals')
    .withIndex('by_principalId', (q) => q.eq('principalId', command.principalId))
    .unique()
  if (principal === null || principal.ownerId !== account.accountId) {
    return refusedTopup('billing_identity_mismatch', false)
  }
  const nextBalance = addExactAmounts(accountDomain.balance, accountAmount)
  if (nextBalance === undefined) {
    return refusedTopup('credit_topup_amount_invalid', false)
  }
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
  const postTopupVersion = account.version + 1
  await ctx.db.patch('moneyAccounts', account._id, {
    balanceUnits: nextBalance.units,
    version: postTopupVersion,
    updatedAt: event.observedAt,
  })
  await ctx.db.insert('moneyTransactions', transaction)
  const promotedBalanceAfter = await applyOwnerMoneyPromotionsOnCompletedTopup(
    ctx,
    {
      account,
      postTopupBalanceUnits: nextBalance.units,
      postTopupVersion,
      principalId: command.principalId,
      topupAmount: accountAmount,
      topupTransactionRef: transactionRef,
      event,
    },
  )
  await ctx.db.patch('moneyTopupCommands', command._id, {
    ...boundPatch,
    state: 'succeeded',
    buyerBalanceBeforeUnits: account.balanceUnits,
    buyerBalanceAfterUnits: promotedBalanceAfter.balanceUnits,
    appliedStripeEventId: event.stripeEventId,
    appliedPayloadDigest: event.payloadDigest,
    appliedTransactionRef: transactionRef,
  })
  await recordAppliedEvent(ctx, priorEvent, event, transactionRef)
  return {
    kind: 'accepted' as const,
    status: 'applied' as const,
    appliedRef: transactionRef,
  }
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
  if (event.externalRef !== event.sessionId || !eventStatusMatches(event))
    return refusedTopup('payment_binding_invalid', false)
  const command = await ctx.db
    .query('moneyTopupCommands')
    .withIndex('by_commandRef', (q) => q.eq('commandRef', event.commandRef))
    .unique()
  if (command === null) return refusedTopup('credit_topup_pending', true)
  if (!readbackMatchesEventAndCommand(command, event, args.readback))
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
  if (!commandAmountMatchesEvent(command, commandAmount, chargeAmount, event)) {
    return refusedTopup('payment_binding_invalid', false)
  }
  if (commandAmount === undefined) {
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
  const boundPatch = topupBoundPatch(event, args.readback)
  if (event.status !== 'paid') {
    return handleUnpaidTopup(ctx, command, priorEvent, event, boundPatch)
  }
  const priorTransaction = await ctx.db
    .query('moneyTransactions')
    .withIndex('by_idempotencyKey', (q) =>
      q.eq('idempotencyKey', command.idempotencyKey),
    )
    .unique()
  if (priorTransaction !== null) {
    return replayPriorTopupTransaction(
      ctx,
      command,
      priorTransaction,
      priorEvent,
      commandAmount,
      event,
      boundPatch,
    )
  }
  return applyFreshTopup(
    ctx,
    command,
    priorEvent,
    commandAmount,
    event,
    boundPatch,
  )
}
