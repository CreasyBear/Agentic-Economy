import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { accountFromRow } from './moneyCanonicalAccounts'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import {
  addExactAmounts,
  amountAtScale,
  amountFromParts,
  applyProviderAccountCredit,
  compareExactAmounts,
  readExactAmount,
  sameEvidenceRefs,
  subtractExactAmounts,
  transitionPayout,
  zeroExactAmount,
  type ExactAmount,
  type MoneyAccount,
  type MoneyPayout,
} from '../src/modules/money/public'
import {
  payoutAccountAfterReservationMatches,
  payoutAuthorityAllowed,
  payoutEvidenceSourceDigest,
  payoutFromRow,
  payoutReservationCurrentAmountMatches,
  payoutReservationRowIdentityMatches,
  payoutSnapshotAmounts,
  payoutTransferRow,
  payoutTransferView,
  readLatestCompletedPayoutPaidAfter,
  readPayoutReservationJournal,
  requireBillingSourceWrite,
  type BillingSourceWriteArgs,
  type PayoutReservationJournal,
  type PayoutTransferResult,
} from './moneyPayoutTransferShared'

function refusedPayout(code: string, retryable: boolean): PayoutTransferResult {
  return { kind: 'refused', code, retryable }
}

export type PayoutTransferEvidence =
  | {
      provider: 'stripe'
      transferId: string
      destinationAccountId: string
      amount: ExactAmount
      status: 'pending' | 'succeeded' | 'failed' | 'reversed' | 'outcome_unknown'
      requestDigest: string
      evidenceDigest: string
      observedAt: number
    }
  | {
      provider: 'stripe'
      resolution: 'not_released'
      destinationAccountId: string
      amount: ExactAmount
      status: 'failed'
      requestDigest: string
      evidenceDigest: string
      observedAt: number
    }

export type CompletePayoutTransferArgs = BillingSourceWriteArgs & {
  authority: { principalId: string }
  businessId: string
  amount: ExactAmount
  providerAccountRef: string
  destinationAccountId: string
  payoutRef: string
  commandId: string
  inputDigest: string
  idempotencyKey: string
  evidence: PayoutTransferEvidence
  sourceDigest: string
  evidenceRefs: string[]
  observedAt: number
  failureCode?: string
}

type PayoutCompletionInput = Readonly<{
  authority: { principalId: string }
  businessId: string
  amount: ExactAmount
  providerAccountRef: string
  destinationAccountId: string
  payoutRef: string
  commandId: string
  inputDigest: string
  idempotencyKey: string
  evidence: PayoutTransferEvidence
  sourceDigest: string
  evidenceRefs: string[]
  observedAt: number
  failureCode?: string
}>

async function reversePayoutReservation(
  ctx: MutationCtx,
  args: PayoutCompletionInput,
  payout: Doc<'moneyPayouts'>,
  providerAccount: Doc<'moneyAccounts'>,
  provider: MoneyAccount,
  journal: Extract<PayoutReservationJournal, { kind: 'found' }>,
  policyValue: MoneyPayout,
  transferId: string | undefined,
  mode: 'pre_release' | 'post_success',
): Promise<PayoutTransferResult> {
  const snapshots = payoutSnapshotAmounts(payout)
  const reversalAmount =
    snapshots === undefined || journal.transaction.amountUnits === undefined
      ? undefined
      : amountFromParts(
          snapshots.providerHeldBefore.currency,
          journal.transaction.amountUnits,
          snapshots.providerHeldBefore.exponent,
        )
  if (snapshots === undefined || reversalAmount === undefined || reversalAmount.units === '0')
    return refusedPayout('payout_reconciliation_required', false)
  const reversalTransactionRef = canonicalDigest({
    format: 'money-payout-reversal-transaction:v1',
    reservationTransactionRef: journal.transaction.transactionRef,
  })
  const reversalIdempotencyKey = canonicalDigest({
    format: 'money-payout-reversal-idempotency:v1',
    reservationTransactionRef: journal.transaction.transactionRef,
  })
  const priorReversals = await ctx.db
    .query('moneyTransactions')
    .withIndex('by_reversalOf', (q) =>
      q.eq('reversalOf', journal.transaction.transactionRef),
    )
    .take(2)
  if (priorReversals.length > 1)
    return refusedPayout('ledger_idempotency_conflict', false)
  const existingReversal = priorReversals[0]
  if (existingReversal !== undefined) {
    const reversalRows = await ctx.db
      .query('moneyLedgerEntries')
      .withIndex('by_transactionRef', (q) =>
        q.eq('transactionRef', existingReversal.transactionRef),
      )
      .take(2)
    const reversalEntry = reversalRows[0]
    const expectedState = mode === 'post_success' ? 'reversed' : policyValue.state
    const reservationRestored =
      addExactAmounts(snapshots.providerHeldAfter, reversalAmount)
    if (
      reversalRows.length !== 1 ||
      reversalEntry === undefined ||
      journal.transaction.state !== 'reversed' ||
      existingReversal.transactionRef !== reversalTransactionRef ||
      existingReversal.kind !== 'payout_accrual' ||
      existingReversal.state !== 'reversed' ||
      existingReversal.idempotencyKey !== reversalIdempotencyKey ||
      existingReversal.inputDigest !== args.inputDigest ||
      existingReversal.principalId !== `business:${args.businessId}` ||
      existingReversal.currency !== snapshots.providerHeldBefore.currency ||
      existingReversal.exponent !== reversalAmount.exponent ||
      existingReversal.amountUnits !== reversalAmount.units ||
      existingReversal.externalRef !== args.payoutRef ||
      existingReversal.reversalOf !== journal.transaction.transactionRef ||
      existingReversal.expectedAccountVersion <
        journal.transaction.expectedAccountVersion + 1 ||
      reversalEntry.accountRef !== providerAccount.accountRef ||
      reversalEntry.entryRef !== `${reversalTransactionRef}:payout-reversal` ||
      reversalEntry.entryType !== 'payout_accrual' ||
      reversalEntry.direction !== 'credit' ||
      reversalEntry.amountUnits !== journal.transaction.amountUnits ||
      reversalEntry.currency !== snapshots.providerHeldBefore.currency ||
      reversalEntry.exponent !== snapshots.providerHeldBefore.exponent ||
      reversalEntry.transactionRef !== reversalTransactionRef ||
      reversalEntry.idempotencyKey !== reversalIdempotencyKey ||
      reversalEntry.businessId !== args.businessId ||
      reversalEntry.reversalOf !== journal.transaction.transactionRef ||
      reversalEntry.sourceDigest !== args.sourceDigest ||
      !sameEvidenceRefs(reversalEntry.evidenceRefs, args.evidenceRefs) ||
      reservationRestored === undefined ||
      compareExactAmounts(
        reservationRestored,
        snapshots.providerHeldBefore,
      ) !== 0 ||
      payout.state !== expectedState ||
      (mode === 'post_success'
        ? payout.transferStatus !== 'reversed' ||
          payout.transferReversalEvidenceDigest !== args.evidence.evidenceDigest ||
          payout.stripeTransferId !== transferId
        : payout.transferStatus !== 'failed' ||
          payout.transferEvidenceDigest !== args.evidence.evidenceDigest ||
          (transferId !== undefined && payout.stripeTransferId !== transferId)) ||
      provider.version < existingReversal.expectedAccountVersion + 1
    ) {
      return refusedPayout('ledger_idempotency_conflict', false)
    }
    const transfer = payoutTransferView(payout, reversalAmount)
    return transfer === undefined
      ? refusedPayout('payout_reconciliation_required', false)
      : { kind: 'accepted' as const, transfer }
  }
  const providerPaidAfter =
    payout.providerPaidAfterUnits === undefined
      ? undefined
      : amountFromParts(
          payout.currency,
          payout.providerPaidAfterUnits,
          payout.exponent,
        )
  const expectedProviderPaidAfter = addExactAmounts(
    snapshots.providerPaidBefore,
    reversalAmount,
  )
  const currentProviderPaidAfter =
    mode === 'post_success'
      ? await readLatestCompletedPayoutPaidAfter(
          ctx,
          args.businessId,
          reversalAmount,
        )
      : undefined
  const paidBeforeReversal =
    currentProviderPaidAfter === null
      ? zeroExactAmount(reversalAmount.currency, reversalAmount.exponent)
      : currentProviderPaidAfter
  const providerPaidAfterReversal =
    mode === 'post_success' && paidBeforeReversal !== undefined
      ? subtractExactAmounts(paidBeforeReversal, reversalAmount)
      : undefined
  if (
    mode === 'post_success'
      ? journal.transaction.state !== 'applied' ||
        payout.state !== 'paid' ||
        payout.transferStatus !== 'succeeded' ||
        payout.transferEvidenceDigest === undefined ||
        providerPaidAfter === undefined ||
        expectedProviderPaidAfter === undefined ||
        compareExactAmounts(providerPaidAfter, expectedProviderPaidAfter) !== 0 ||
        providerPaidAfterReversal === undefined ||
        provider.version < journal.transaction.expectedAccountVersion + 1
      : (journal.transaction.state !== 'pending' &&
          journal.transaction.state !== 'outcome_unknown') ||
        (payout.state !== 'transfer_pending' &&
          payout.state !== 'outcome_unknown') ||
        !payoutAccountAfterReservationMatches(
          provider,
          journal.transaction,
          snapshots,
          reversalAmount,
        ) ||
        provider.recoveryDue.units !== '0'
  )
    return refusedPayout('payout_reconciliation_required', false)
  const restoredProvider = applyProviderAccountCredit(
    provider,
    reversalAmount,
    args.observedAt,
  )
  const expectedRestoredBalance =
    restoredProvider === undefined
      ? undefined
      : addExactAmounts(provider.balance, restoredProvider.heldCredit)
  const expectedRecoveryDue =
    restoredProvider === undefined
      ? undefined
      : subtractExactAmounts(
          provider.recoveryDue,
          restoredProvider.recoveryPayment,
        )
  const creditedAmount =
    restoredProvider === undefined
      ? undefined
      : addExactAmounts(
          restoredProvider.heldCredit,
          restoredProvider.recoveryPayment,
        )
  if (
    restoredProvider === undefined ||
    expectedRestoredBalance === undefined ||
    expectedRecoveryDue === undefined ||
    creditedAmount === undefined ||
    compareExactAmounts(creditedAmount, reversalAmount) !== 0 ||
    compareExactAmounts(
      restoredProvider.account.balance,
      expectedRestoredBalance,
    ) !== 0 ||
    compareExactAmounts(
      restoredProvider.account.recoveryDue,
      expectedRecoveryDue,
    ) !== 0 ||
    restoredProvider.account.version !== provider.version + 1
  )
    return refusedPayout('payout_reconciliation_required', false)
  await ctx.db.insert('moneyLedgerEntries', {
    entryRef: `${reversalTransactionRef}:payout-reversal`,
    accountRef: providerAccount.accountRef,
    entryType: 'payout_accrual',
    direction: 'credit',
    amountUnits: reversalAmount.units,
    currency: reversalAmount.currency,
    exponent: reversalAmount.exponent,
    transactionRef: reversalTransactionRef,
    idempotencyKey: reversalIdempotencyKey,
    businessId: args.businessId,
    sourceDigest: args.sourceDigest,
    evidenceRefs: [...args.evidenceRefs],
    reversalOf: journal.transaction.transactionRef,
    createdAt: args.evidence.observedAt,
  })
  await ctx.db.patch('moneyAccounts', providerAccount._id, {
    balanceUnits: restoredProvider.account.balance.units,
    recoveryDueUnits: restoredProvider.account.recoveryDue.units,
    version: restoredProvider.account.version,
    updatedAt: restoredProvider.account.updatedAt,
  })
  await ctx.db.insert('moneyTransactions', {
    transactionRef: reversalTransactionRef,
    kind: 'payout_accrual',
    idempotencyKey: reversalIdempotencyKey,
    inputDigest: args.inputDigest,
    principalId: `business:${args.businessId}`,
    currency: reversalAmount.currency,
    amountUnits: reversalAmount.units,
    exponent: reversalAmount.exponent,
    state: 'reversed',
    expectedAccountVersion: provider.version,
    externalRef: args.payoutRef,
    reversalOf: journal.transaction.transactionRef,
    createdAt: args.evidence.observedAt,
    updatedAt: args.observedAt,
  })
  await ctx.db.patch('moneyTransactions', journal.transaction._id, {
    state: 'reversed',
    updatedAt: args.observedAt,
  })
  await ctx.db.replace(
    'moneyPayouts',
    payout._id,
    payoutTransferRow(payout, {
      providerAccountRef: args.providerAccountRef,
      destinationAccountId: args.destinationAccountId,
      commandId: args.commandId,
      inputDigest: args.inputDigest,
      requestDigest: args.evidence.requestDigest,
      idempotencyKey: args.idempotencyKey,
      state: policyValue.state,
      transferStatus: mode === 'post_success' ? 'reversed' : 'failed',
      ...(transferId === undefined ? {} : { stripeTransferId: transferId }),
      ...(mode === 'post_success'
        ? {
            ...(payout.transferEvidenceDigest === undefined
              ? {}
              : { evidenceDigest: payout.transferEvidenceDigest }),
            reversalEvidenceDigest: args.evidence.evidenceDigest,
            providerHeldBefore: snapshots.providerHeldBefore,
            providerHeldAfter: snapshots.providerHeldAfter,
            providerPaidBefore: snapshots.providerPaidBefore,
            ...(providerPaidAfterReversal === undefined
              ? {}
              : { providerPaidAfter: providerPaidAfterReversal }),
          }
        : {
            evidenceDigest: args.evidence.evidenceDigest,
            failureCode: args.failureCode ?? 'provider_transfer_failed',
          }),
      transferObservedAt: args.evidence.observedAt,
      updatedAt: args.observedAt,
    }),
  )
  const updated = await ctx.db.get(payout._id)
  const transfer = updated === null ? undefined : payoutTransferView(updated)
  return transfer === undefined
    ? refusedPayout('payout_reconciliation_required', false)
    : { kind: 'accepted' as const, transfer }
}

export async function completePayoutBody(
  ctx: MutationCtx,
  args: PayoutCompletionInput,
): Promise<PayoutTransferResult> {
  if (
    !(await payoutAuthorityAllowed(
      ctx,
      args.businessId,
      args.authority.principalId,
    ))
  )
    return refusedPayout('billing_identity_missing', false)
  if (args.evidenceRefs.length !== 1 || args.sourceDigest.length === 0)
    return refusedPayout('payout_reconciliation_required', false)
  const transferId =
    'transferId' in args.evidence ? args.evidence.transferId : undefined
  if (
    args.sourceDigest !==
      payoutEvidenceSourceDigest(args.evidence.evidenceDigest) ||
    args.evidenceRefs[0] !== args.evidence.evidenceDigest
  )
    return refusedPayout('ledger_idempotency_conflict', false)
  const [providerAccount, payout] = await Promise.all([
    ctx.db
      .query('moneyAccounts')
      .withIndex('by_businessId_and_currency', (q) =>
        q
          .eq('businessId', args.businessId)
          .eq('currency', args.amount.currency),
      )
      .unique(),
    ctx.db
      .query('moneyPayouts')
      .withIndex('by_payoutRef', (q) => q.eq('payoutRef', args.payoutRef))
      .unique(),
  ])
  if (
    providerAccount === null ||
    payout === null ||
    payout.businessId !== args.businessId ||
    payout.currency !== args.amount.currency ||
    providerAccount.accountKind !== 'provider_earnings' ||
    providerAccount.accountRef !== args.providerAccountRef ||
    providerAccount.businessId !== args.businessId ||
    providerAccount.currency !== args.amount.currency ||
    payout.providerAccountRef !== args.providerAccountRef
  )
    return refusedPayout('payout_reconciliation_required', false)
  const current = payoutFromRow(payout)
  const provider = accountFromRow(providerAccount)
  if (
    current === undefined ||
    provider === undefined ||
    payout.payoutCommandId !== args.commandId ||
    payout.inputDigest !== args.inputDigest ||
    payout.idempotencyKey !== args.idempotencyKey ||
    payout.destinationAccountId !== args.destinationAccountId ||
    payout.transferRequestDigest !== args.evidence.requestDigest ||
    (transferId !== undefined && transferId.length === 0) ||
    args.evidence.requestDigest.length === 0 ||
    args.evidence.evidenceDigest.length === 0
  )
    return refusedPayout('ledger_idempotency_conflict', false)
  const expectedAmount = amountAtScale(
    args.amount,
    payout.currency,
    payout.exponent,
  )
  const evidenceAmount = readExactAmount(args.evidence.amount)
  if (
    expectedAmount === undefined ||
    evidenceAmount === undefined ||
    compareExactAmounts(expectedAmount, evidenceAmount) !== 0 ||
    args.evidence.destinationAccountId !== args.destinationAccountId
  )
    return refusedPayout('payout_reconciliation_required', false)
  if (
    payout.stripeTransferId !== undefined &&
    transferId !== undefined &&
    payout.stripeTransferId !== transferId
  )
    return refusedPayout('ledger_idempotency_conflict', false)
  if (
    args.evidence.status !== 'pending' &&
    args.evidence.status !== 'outcome_unknown' &&
    args.evidence.status !== 'reversed' &&
    payout.transferEvidenceDigest !== undefined &&
    payout.transferEvidenceDigest !== args.evidence.evidenceDigest
  )
    return refusedPayout('ledger_idempotency_conflict', false)
  if (
    args.evidence.status === 'reversed' &&
    payout.transferReversalEvidenceDigest !== undefined &&
    payout.transferReversalEvidenceDigest !== args.evidence.evidenceDigest
  )
    return refusedPayout('ledger_idempotency_conflict', false)
  const journal = await readPayoutReservationJournal(ctx, {
    payoutRef: args.payoutRef,
    payoutCommandId: args.commandId,
    inputDigest: args.inputDigest,
    requestDigest: args.evidence.requestDigest,
    idempotencyKey: args.idempotencyKey,
    amount: expectedAmount,
    providerAccountRef: args.providerAccountRef,
    businessId: args.businessId,
  })
  if (journal.kind === 'conflict')
    return refusedPayout('ledger_idempotency_conflict', false)
  if (journal.kind === 'missing')
    return refusedPayout('payout_reconciliation_required', false)
  const snapshots = payoutSnapshotAmounts(payout)
  if (
    snapshots === undefined ||
    !payoutReservationRowIdentityMatches(payout, {
      businessId: args.businessId,
      payoutRef: args.payoutRef,
      amount: expectedAmount,
      providerAccountRef: args.providerAccountRef,
      destinationAccountId: args.destinationAccountId,
      payoutCommandId: args.commandId,
      inputDigest: args.inputDigest,
      requestDigest: args.evidence.requestDigest,
      idempotencyKey: args.idempotencyKey,
    })
  )
    return refusedPayout('ledger_idempotency_conflict', false)
  if (
    (journal.transaction.state === 'pending' ||
      journal.transaction.state === 'outcome_unknown') &&
    !payoutReservationCurrentAmountMatches(payout, expectedAmount)
  )
    return refusedPayout('payout_reconciliation_required', false)
  let payoutAccount: Doc<'moneyPayoutAccounts'> | null = null
  if (
    journal.transaction.state !== 'applied' &&
    journal.transaction.state !== 'reversed'
  ) {
    payoutAccount = await ctx.db
      .query('moneyPayoutAccounts')
      .withIndex('by_businessId_and_currency', (q) =>
        q
          .eq('businessId', args.businessId)
          .eq('currency', args.amount.currency),
      )
      .unique()
  }
  if (
    journal.transaction.state !== 'applied' &&
    journal.transaction.state !== 'reversed' &&
    (payoutAccount === null ||
      payoutAccount.stripeAccountId !== args.destinationAccountId)
  )
    return refusedPayout('payout_reconciliation_required', false)
  if (
    journal.transaction.state === 'reversed' &&
    args.evidence.status !== 'failed' &&
    args.evidence.status !== 'reversed'
  )
    return refusedPayout('payout_reconciliation_required', false)
  const accountState =
    payoutAccount === null
      ? {
          state: 'not_started' as const,
          detailsSubmitted: false,
          recipientCapabilityActive: false,
        }
      : {
          state: payoutAccount.state,
          detailsSubmitted: payoutAccount.detailsSubmitted,
          recipientCapabilityActive: payoutAccount.recipientCapabilityActive,
        }
  if ('resolution' in args.evidence) {
    if (
      args.evidence.status !== 'failed' ||
      (payout.state !== 'transfer_pending' &&
        payout.state !== 'outcome_unknown' &&
        payout.state !== 'held_threshold' &&
        payout.state !== 'held_kyc')
    )
      return refusedPayout('payout_reconciliation_required', false)
    const policy =
      payout.state === 'held_threshold' ||
      payout.state === 'held_kyc'
        ? { kind: 'accepted' as const, value: current }
        : transitionPayout({
            current,
            now: args.observedAt,
            action: {
              kind: 'reconcile',
              payoutCommandId: args.commandId,
              idempotencyKey: args.idempotencyKey,
              outcome: 'not_released',
              ...(transferId === undefined ? {} : { stripeTransferId: transferId }),
              evidenceDigest: args.evidence.evidenceDigest,
            },
            account: accountState,
          })
    if (policy.kind === 'refused') return policy
    return await reversePayoutReservation(
      ctx,
      args,
      payout,
      providerAccount,
      provider,
      journal,
      policy.value,
      transferId,
      'pre_release',
    )
  }
  if (!('transferId' in args.evidence)) {
    const _exhaustive: never = args.evidence
    return refusedPayout('payout_reconciliation_required', false)
  }
  switch (args.evidence.status) {
    case 'reversed': {
    if (transferId === undefined)
      return refusedPayout('payout_reconciliation_required', false)
    const policy =
      payout.state === 'reversed'
        ? { kind: 'accepted' as const, value: current }
        : transitionPayout({
            current,
            now: args.observedAt,
            action: {
              kind: 'transfer_reversed',
              payoutCommandId: args.commandId,
              idempotencyKey: args.idempotencyKey,
              stripeTransferId: transferId,
              requestDigest: args.evidence.requestDigest,
              evidenceDigest: args.evidence.evidenceDigest,
              observedAt: args.evidence.observedAt,
            },
            account: accountState,
          })
    if (policy.kind === 'refused') return policy
    return await reversePayoutReservation(
      ctx,
      args,
      payout,
      providerAccount,
      provider,
      journal,
      policy.value,
      transferId,
      'post_success',
    )
    }
    case 'failed': {
    if (
      payout.state !== 'transfer_pending' &&
      payout.state !== 'outcome_unknown' &&
      payout.state !== 'held_threshold' &&
      payout.state !== 'held_kyc'
    )
      return refusedPayout('payout_reconciliation_required', false)
    const policy =
      payout.state === 'held_threshold' ||
      payout.state === 'held_kyc'
        ? { kind: 'accepted' as const, value: current }
        : transitionPayout({
            current,
            now: args.observedAt,
            action: {
              kind: 'transfer_failed',
              payoutCommandId: args.commandId,
              idempotencyKey: args.idempotencyKey,
              failureCode: args.failureCode ?? 'provider_transfer_failed',
              ...(transferId === undefined ? {} : { stripeTransferId: transferId }),
              requestDigest: args.evidence.requestDigest,
              evidenceDigest: args.evidence.evidenceDigest,
              observedAt: args.evidence.observedAt,
            },
            account: accountState,
          })
    if (policy.kind === 'refused') return policy
    return await reversePayoutReservation(
      ctx,
      args,
      payout,
      providerAccount,
      provider,
      journal,
      policy.value,
      transferId,
      'pre_release',
    )
    }
    case 'pending': {
    if (
      transferId === undefined ||
      journal.transaction.state !== 'pending' ||
      payout.state !== 'transfer_pending' ||
      !payoutAccountAfterReservationMatches(
        provider,
        journal.transaction,
        snapshots,
        expectedAmount,
      )
    )
      return refusedPayout('payout_reconciliation_required', false)
    if (
      payout.stripeTransferId === transferId &&
      payout.transferStatus === 'pending'
    ) {
      const transfer = payoutTransferView(payout)
      return transfer === undefined
        ? refusedPayout('payout_reconciliation_required', false)
        : { kind: 'accepted' as const, transfer }
    }
    await ctx.db.replace(
      'moneyPayouts',
      payout._id,
      payoutTransferRow(payout, {
        providerAccountRef: args.providerAccountRef,
        destinationAccountId: args.destinationAccountId,
        commandId: args.commandId,
        inputDigest: args.inputDigest,
        requestDigest: args.evidence.requestDigest,
        idempotencyKey: args.idempotencyKey,
        state: 'transfer_pending',
        transferStatus: 'pending',
        stripeTransferId: transferId,
        transferObservedAt: args.evidence.observedAt,
        updatedAt: args.observedAt,
      }),
    )
      break
    }
    case 'outcome_unknown': {
    if (
      (payout.state !== 'transfer_pending' &&
        payout.state !== 'outcome_unknown') ||
      (journal.transaction.state !== 'pending' &&
        journal.transaction.state !== 'outcome_unknown') ||
      !payoutAccountAfterReservationMatches(
        provider,
        journal.transaction,
        snapshots,
        expectedAmount,
      )
    )
      return refusedPayout('payout_reconciliation_required', false)
    if (journal.transaction.state === 'outcome_unknown') {
      if (payout.state !== 'outcome_unknown')
        return refusedPayout('payout_reconciliation_required', false)
      const transfer = payoutTransferView(payout)
      return transfer === undefined
        ? refusedPayout('payout_reconciliation_required', false)
        : { kind: 'accepted' as const, transfer }
    }
    const policy = transitionPayout({
      current,
      now: args.observedAt,
      action: {
        kind: 'transfer_unknown',
        payoutCommandId: args.commandId,
        idempotencyKey: args.idempotencyKey,
        ...(transferId === undefined ? {} : { stripeTransferId: transferId }),
      },
      account: accountState,
    })
    if (policy.kind === 'refused') return policy
    await ctx.db.patch('moneyTransactions', journal.transaction._id, {
      state: 'outcome_unknown',
      updatedAt: args.observedAt,
    })
    await ctx.db.replace(
      'moneyPayouts',
      payout._id,
      payoutTransferRow(payout, {
        providerAccountRef: args.providerAccountRef,
        destinationAccountId: args.destinationAccountId,
        commandId: args.commandId,
        inputDigest: args.inputDigest,
        requestDigest: args.evidence.requestDigest,
        idempotencyKey: args.idempotencyKey,
        state: policy.value.state,
        transferStatus: 'outcome_unknown',
        ...(transferId === undefined ? {} : { stripeTransferId: transferId }),
        transferObservedAt: args.evidence.observedAt,
        updatedAt: args.observedAt,
      }),
    )
      break
    }
    case 'succeeded': {
      if (transferId === undefined)
        return refusedPayout('payout_reconciliation_required', false)
      const providerPaidAfter =
      payout.providerPaidAfterUnits === undefined
        ? addExactAmounts(snapshots.providerPaidBefore, expectedAmount)
        : amountFromParts(
            payout.currency,
            payout.providerPaidAfterUnits,
            payout.exponent,
          )
    if (providerPaidAfter === undefined)
      return refusedPayout('payout_reconciliation_required', false)
    if (payout.state === 'paid') {
      const expectedPaidAfter = addExactAmounts(
        snapshots.providerPaidBefore,
        expectedAmount,
      )
      if (
        journal.transaction.state !== 'applied' ||
        payout.transferStatus !== 'succeeded' ||
        payout.stripeTransferId !== transferId ||
        payout.transferEvidenceDigest !== args.evidence.evidenceDigest ||
        expectedPaidAfter === undefined ||
        compareExactAmounts(providerPaidAfter, expectedPaidAfter) !== 0 ||
        provider.version < journal.transaction.expectedAccountVersion + 1
      )
        return refusedPayout('payout_reconciliation_required', false)
      const transfer = payoutTransferView(payout, expectedAmount)
      return transfer === undefined
        ? refusedPayout('payout_reconciliation_required', false)
        : { kind: 'accepted' as const, transfer }
    }
    if (
      (payout.state !== 'transfer_pending' &&
        payout.state !== 'outcome_unknown') ||
      (journal.transaction.state !== 'pending' &&
        journal.transaction.state !== 'outcome_unknown') ||
      !payoutAccountAfterReservationMatches(
        provider,
        journal.transaction,
        snapshots,
        expectedAmount,
      )
    )
      return refusedPayout('payout_reconciliation_required', false)
    const policy = transitionPayout({
      current,
      now: args.observedAt,
      action: {
        kind: 'transfer_succeeded',
        payoutCommandId: args.commandId,
        idempotencyKey: args.idempotencyKey,
        stripeTransferId: transferId,
        requestDigest: args.evidence.requestDigest,
        evidenceDigest: args.evidence.evidenceDigest,
        observedAt: args.evidence.observedAt,
      },
      account: accountState,
    })
    if (policy.kind === 'refused') return policy
    const latestProviderPaidAfter = await readLatestCompletedPayoutPaidAfter(
      ctx,
      args.businessId,
      expectedAmount,
      payout._id,
    )
    if (latestProviderPaidAfter === undefined)
      return refusedPayout('payout_reconciliation_required', false)
    const currentPaidBefore =
      latestProviderPaidAfter ??
      zeroExactAmount(expectedAmount.currency, expectedAmount.exponent)
    if (currentPaidBefore === undefined)
      return refusedPayout('payout_reconciliation_required', false)
    const derivedPaidAfter = addExactAmounts(
      currentPaidBefore,
      expectedAmount,
    )
    if (derivedPaidAfter === undefined)
      return refusedPayout('payout_reconciliation_required', false)
    await ctx.db.patch('moneyTransactions', journal.transaction._id, {
      state: 'applied',
      updatedAt: args.observedAt,
    })
    await ctx.db.replace(
      'moneyPayouts',
      payout._id,
      payoutTransferRow(payout, {
        providerAccountRef: args.providerAccountRef,
        destinationAccountId: args.destinationAccountId,
        commandId: args.commandId,
        inputDigest: args.inputDigest,
        requestDigest: args.evidence.requestDigest,
        idempotencyKey: args.idempotencyKey,
        state: policy.value.state,
        transferStatus: 'succeeded',
        stripeTransferId: transferId,
        evidenceDigest: args.evidence.evidenceDigest,
        transferObservedAt: args.evidence.observedAt,
        updatedAt: args.observedAt,
        providerHeldBefore: snapshots.providerHeldBefore,
        providerHeldAfter: snapshots.providerHeldAfter,
        providerPaidBefore: currentPaidBefore,
        providerPaidAfter: derivedPaidAfter,
      }),
    )
      break
    }
    default: {
      const _exhaustive: never = args.evidence
      return refusedPayout('payout_reconciliation_required', false)
    }
  }
  const updated = await ctx.db.get(payout._id)
  const transfer = updated === null ? undefined : payoutTransferView(updated)
  return transfer === undefined
    ? refusedPayout('payout_reconciliation_required', false)
    : { kind: 'accepted' as const, transfer }
}

export async function completePayoutTransferHandler(
  ctx: MutationCtx,
  args: CompletePayoutTransferArgs,
): Promise<PayoutTransferResult> {
    await requireBillingSourceWrite(ctx, args)
    return await completePayoutBody(ctx, args)
}
