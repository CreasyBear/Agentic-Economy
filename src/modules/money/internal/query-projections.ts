import { canonicalDigest } from '@/modules/common/canonical-digest'
import type {
  CreditAccountQuery,
  CreditAccountView,
  CreditActivityQuery,
  CreditActivityView,
  ExactAmount,
  KeyUsageQuery,
  KeyUsageView,
  MoneyAccount,
  MoneyLedgerEntry,
  MoneyQueryPort,
  MoneyTransaction,
  PayoutStatusQuery,
  PayoutStatusView,
  ProviderEarningsQuery,
  ProviderEarningsView,
  TopupState,
} from '../public'
import { addExactAmounts, compareExactAmounts, subtractExactAmounts } from './exact-amount'
import { accountRefForRake, sameEvidenceRefs, usageSummaryKey } from './ledger'
import type { LedgerState } from './ledger'

export type ProviderEarningsProjectionResult =
  | Readonly<{ kind: 'ok' } & ProviderEarningsView>
  | Readonly<{
      kind: 'refused'
      code:
        | 'payout_not_ready'
        | 'payout_reconciliation_required'
        | 'currency_mismatch'
    }>

export function projectProviderEarnings(input: Readonly<{
  businessId: string
  currency: string
  accounts: readonly MoneyAccount[]
  entries: readonly MoneyLedgerEntry[]
  transactions: readonly MoneyTransaction[]
  evidence: ProviderEarningsView['evidence']
}>): ProviderEarningsProjectionResult {
  const provider = input.accounts.find(
    (item) =>
      item.accountKind === 'provider_earnings' &&
      item.businessId === input.businessId &&
      item.balance.currency === input.currency,
  )
  if (provider === undefined)
    return { kind: 'refused', code: 'payout_not_ready' }
  const transactions = new Map(
    input.transactions.map((transaction) => [
      transaction.transactionRef,
      transaction,
    ]),
  )
  const providerCredits = sumMatchingEntries(input.entries, provider.balance, (entry) =>
    entry.accountRef === provider.accountRef &&
    entry.businessId === input.businessId &&
    entry.entryType === 'payout_accrual' &&
    entry.direction === 'credit' &&
    entry.reversalOf === undefined &&
    entry.invocationRef !== undefined &&
    entry.amount.currency === input.currency &&
    isSettledCharge(transactions, entry.transactionRef),
  )
  const rakeCredits = sumMatchingEntries(input.entries, provider.balance, (entry) =>
    entry.accountRef === accountRefForRake(input.currency) &&
    entry.businessId === input.businessId &&
    entry.entryType === 'rake' &&
    entry.direction === 'credit' &&
    entry.reversalOf === undefined &&
    entry.amount.currency === input.currency &&
    isSettledCharge(transactions, entry.transactionRef),
  )
  const providerRefunds = sumMatchingEntries(input.entries, provider.balance, (entry) =>
    entry.accountRef === provider.accountRef &&
    entry.businessId === input.businessId &&
    entry.entryType === 'refund' &&
    entry.direction === 'debit' &&
    entry.reversalOf !== undefined &&
    entry.amount.currency === input.currency &&
    isSettledCharge(transactions, entry.reversalOf),
  )
  const rakeRefunds = sumMatchingEntries(input.entries, provider.balance, (entry) =>
    entry.accountRef === accountRefForRake(input.currency) &&
    entry.businessId === input.businessId &&
    entry.entryType === 'refund' &&
    entry.direction === 'debit' &&
    entry.reversalOf !== undefined &&
    entry.amount.currency === input.currency &&
    isSettledCharge(transactions, entry.reversalOf),
  )
  const payout = projectPayoutPaidOut({
    businessId: input.businessId,
    currency: input.currency,
    provider,
    entries: input.entries,
    transactions,
  })
  if (payout.kind === 'refused') return payout
  const providerNet = subtractExactAmounts(providerCredits, providerRefunds)
  const rake = subtractExactAmounts(rakeCredits, rakeRefunds)
  if (
    providerCredits === undefined ||
    providerRefunds === undefined ||
    rakeCredits === undefined ||
    rakeRefunds === undefined ||
    providerNet === undefined ||
    rake === undefined
  )
    return { kind: 'refused', code: 'currency_mismatch' }
  const grossAccrual = addExactAmounts(providerNet, rake)
  const providerNetPlusRecovery = addExactAmounts(
    providerNet,
    provider.recoveryDue,
  )
  if (grossAccrual === undefined || providerNetPlusRecovery === undefined)
    return { kind: 'refused', code: 'currency_mismatch' }
  const balanceComparison = compareExactAmounts(
    providerNetPlusRecovery,
    provider.balance,
  )
  if (balanceComparison === undefined)
    return { kind: 'refused', code: 'currency_mismatch' }
  return {
    kind: 'ok',
    businessId: input.businessId,
    grossAccrual,
    rake,
    providerNet,
    paidOut: payout.paidOut,
    held: provider.balance,
    recoveryDue: provider.recoveryDue,
    truncated: false,
    evidence: input.evidence,
  }
}

function isSettledCharge(
  transactions: ReadonlyMap<string, MoneyTransaction>,
  transactionRef: string,
): boolean {
  const transaction = transactions.get(transactionRef)
  if (transaction === undefined || transaction.kind !== 'charge') return false
  if (
    transaction.settledAt !== undefined ||
    transaction.budgetState === 'settled'
  )
    return true
  return transaction.budgetState === undefined && transaction.state === 'applied'
}

function sumMatchingEntries(
  entries: readonly MoneyLedgerEntry[],
  zero: ExactAmount,
  predicate: (entry: MoneyLedgerEntry) => boolean,
): ExactAmount | undefined {
  const template = { currency: zero.currency, units: '0', exponent: zero.exponent }
  let total: ExactAmount | undefined = template
  for (const entry of entries) {
    if (!predicate(entry)) continue
    total = total === undefined ? undefined : addExactAmounts(total, entry.amount)
  }
  return total
}

function payoutAmountConflicts(
  transaction: MoneyTransaction,
  entry: MoneyLedgerEntry,
): boolean {
  if (transaction.amount === undefined) return false
  return compareExactAmounts(transaction.amount, entry.amount) !== 0
}

function projectPayoutPaidOut(input: Readonly<{
  businessId: string
  currency: string
  provider: MoneyAccount
  entries: readonly MoneyLedgerEntry[]
  transactions: ReadonlyMap<string, MoneyTransaction>
}>):
  | Readonly<{ kind: 'ok'; paidOut: ExactAmount }>
  | Readonly<{
      kind: 'refused'
      code: 'payout_reconciliation_required' | 'currency_mismatch'
    }> {
  const { businessId, currency, provider, entries, transactions } = input
  const payoutTransactions = new Map(
    [...transactions.values()]
      .filter((transaction) => transaction.kind === 'payout_accrual')
      .map((transaction) => [transaction.transactionRef, transaction]),
  )
  const payoutOriginalTransactions = [...payoutTransactions.values()].filter(
    (transaction) =>
      transaction.principalId === `business:${businessId}` &&
      transaction.currency === currency &&
      transaction.exponent === provider.balance.exponent &&
      transaction.reversalOf === undefined &&
      (transaction.state === 'applied' || transaction.state === 'reversed'),
  )
  const payoutOriginalRefs = new Set(
    payoutOriginalTransactions.map((transaction) => transaction.transactionRef),
  )
  const payoutReversalEntries = entries.filter(
    (entry) =>
      entry.accountRef === provider.accountRef &&
      entry.businessId === businessId &&
      entry.entryType === 'payout_accrual' &&
      entry.direction === 'credit' &&
      entry.reversalOf !== undefined &&
      entry.amount.currency === currency,
  )
  const payoutDebitRows = entries.filter(
    (entry) =>
      entry.accountRef === provider.accountRef &&
      entry.businessId === businessId &&
      entry.entryType === 'payout_accrual' &&
      entry.direction === 'debit' &&
      entry.amount.currency === currency,
  )
  let invalidPayoutComposition = false
  for (const entry of payoutDebitRows) {
    const transaction = transactions.get(entry.transactionRef)
    const providerCredits = entries.filter(
      (candidate) =>
        candidate.transactionRef === entry.transactionRef &&
        candidate.accountRef === provider.accountRef &&
        candidate.entryType === 'payout_accrual' &&
        candidate.direction === 'credit' &&
        candidate.businessId === businessId &&
        candidate.amount.currency === currency &&
        candidate.amount.exponent === provider.balance.exponent,
    )
    const providerCredit = providerCredits[0]
    const isCanonicalRecoveryDebit =
      transaction?.kind === 'charge' &&
      providerCredits.length === 1 &&
      providerCredit !== undefined &&
      entry.amount.currency === providerCredit.amount.currency &&
      entry.amount.exponent === providerCredit.amount.exponent &&
      entry.entryRef === `${transaction.transactionRef}:provider-recovery` &&
      transaction.transactionRef === entry.transactionRef &&
      transaction.idempotencyKey === entry.idempotencyKey &&
      transaction.currency === currency &&
      transaction.exponent === provider.balance.exponent &&
      providerCredit.entryRef === `${transaction.transactionRef}:provider` &&
      providerCredit.transactionRef === transaction.transactionRef &&
      providerCredit.idempotencyKey === transaction.idempotencyKey &&
      providerCredit.createdAt === transaction.createdAt &&
      entry.businessId === providerCredit.businessId &&
      entry.invocationRef !== undefined &&
      entry.invocationRef.length > 0 &&
      entry.invocationRef === providerCredit.invocationRef &&
      entry.attemptRef !== undefined &&
      entry.attemptRef.length > 0 &&
      entry.attemptRef === providerCredit.attemptRef &&
      entry.principalId === undefined &&
      entry.reversalOf === undefined &&
      entry.sourceDigest === providerCredit.sourceDigest &&
      sameEvidenceRefs(entry.evidenceRefs, providerCredit.evidenceRefs) &&
      compareExactAmounts(entry.amount, providerCredit.amount) !== 1
    if (isCanonicalRecoveryDebit) continue
    if (
      transaction === undefined ||
      transaction.kind !== 'payout_accrual' ||
      transaction.transactionRef !== entry.transactionRef ||
      transaction.idempotencyKey !== entry.idempotencyKey ||
      transaction.principalId !== `business:${businessId}` ||
      transaction.currency !== currency ||
      transaction.exponent !== provider.balance.exponent ||
      payoutAmountConflicts(transaction, entry) ||
      transaction.reversalOf !== undefined ||
      entry.reversalOf !== undefined ||
      ((transaction.state === 'applied' ||
        transaction.state === 'reversed') &&
        !payoutOriginalRefs.has(transaction.transactionRef))
    )
      invalidPayoutComposition = true
  }
  const payoutOriginalAmounts: ExactAmount[] = []
  const payoutReversalAmounts: ExactAmount[] = []
  for (const original of payoutOriginalTransactions) {
    const originalRows = entries.filter(
      (entry) =>
        entry.transactionRef === original.transactionRef &&
        entry.entryType === 'payout_accrual',
    )
    const debitRows = originalRows.filter(
      (entry) =>
        entry.accountRef === provider.accountRef &&
        entry.businessId === businessId &&
        entry.direction === 'debit' &&
        entry.reversalOf === undefined &&
        entry.idempotencyKey === original.idempotencyKey &&
        entry.amount.currency === currency &&
        entry.amount.exponent === provider.balance.exponent &&
        !payoutAmountConflicts(original, entry),
    )
    const originalAmount = debitRows[0]?.amount
    if (
      originalRows.length !== 1 ||
      debitRows.length !== 1 ||
      originalAmount === undefined
    ) {
      invalidPayoutComposition = true
      continue
    }
    payoutOriginalAmounts.push(originalAmount)
    const linkedReversals = [...transactions.values()].filter(
      (transaction) =>
        transaction.kind === 'payout_accrual' &&
        transaction.reversalOf === original.transactionRef,
    )
    if (original.state === 'applied') {
      if (
        linkedReversals.length !== 0 ||
        entries.some((entry) => entry.reversalOf === original.transactionRef)
      )
        invalidPayoutComposition = true
      continue
    }
    const reversal = linkedReversals[0]
    const expectedReversalRef = canonicalDigest({
      format: 'money-payout-reversal-transaction:v1',
      reservationTransactionRef: original.transactionRef,
    })
    const expectedReversalIdempotencyKey = canonicalDigest({
      format: 'money-payout-reversal-idempotency:v1',
      reservationTransactionRef: original.transactionRef,
    })
    const reversalRows =
      reversal === undefined
        ? []
        : entries.filter(
            (entry) =>
              entry.transactionRef === reversal.transactionRef &&
              entry.entryType === 'payout_accrual',
          )
    const exactReversalRows =
      reversal === undefined
        ? []
        : reversalRows.filter(
            (entry) =>
              entry.accountRef === provider.accountRef &&
              entry.businessId === businessId &&
              entry.direction === 'credit' &&
              entry.reversalOf === original.transactionRef &&
              entry.idempotencyKey === reversal.idempotencyKey &&
              entry.amount.currency === currency &&
              entry.amount.exponent === provider.balance.exponent &&
              compareExactAmounts(entry.amount, originalAmount) === 0 &&
              !payoutAmountConflicts(reversal, entry),
          )
    const exactReversal = exactReversalRows[0]
    if (
      linkedReversals.length !== 1 ||
      reversal === undefined ||
      reversal.transactionRef !== expectedReversalRef ||
      reversal.idempotencyKey !== expectedReversalIdempotencyKey ||
      reversal.kind !== 'payout_accrual' ||
      reversal.state !== 'reversed' ||
      reversal.reversalOf !== original.transactionRef ||
      reversal.principalId !== `business:${businessId}` ||
      reversal.currency !== currency ||
      reversal.exponent !== provider.balance.exponent ||
      (reversal.amount !== undefined &&
        compareExactAmounts(reversal.amount, originalAmount) !== 0) ||
      reversalRows.length !== 1 ||
      exactReversal === undefined ||
      exactReversalRows.length !== 1
    ) {
      invalidPayoutComposition = true
      continue
    }
    payoutReversalAmounts.push(exactReversal.amount)
  }
  invalidPayoutComposition ||= payoutReversalEntries.some((entry) => {
    const reversal = payoutTransactions.get(entry.transactionRef)
    const original =
      entry.reversalOf === undefined
        ? undefined
        : payoutTransactions.get(entry.reversalOf)
    if (
      reversal === undefined ||
      original === undefined ||
      !payoutOriginalRefs.has(original.transactionRef) ||
      original.kind !== 'payout_accrual' ||
      original.principalId !== `business:${businessId}` ||
      original.reversalOf !== undefined ||
      original.state !== 'reversed' ||
      original.currency !== currency ||
      original.exponent !== provider.balance.exponent ||
      reversal.transactionRef !==
        canonicalDigest({
          format: 'money-payout-reversal-transaction:v1',
          reservationTransactionRef: original.transactionRef,
        }) ||
      reversal.kind !== 'payout_accrual' ||
      reversal.state !== 'reversed' ||
      reversal.reversalOf !== original.transactionRef ||
      reversal.principalId !== `business:${businessId}` ||
      reversal.currency !== currency ||
      reversal.exponent !== provider.balance.exponent ||
      (original.amount !== undefined &&
        (payoutAmountConflicts(original, entry) ||
          (reversal.amount !== undefined &&
            compareExactAmounts(reversal.amount, original.amount) !== 0)))
    )
      return true
    return false
  })
  const zero = {
    currency: provider.balance.currency,
    units: '0',
    exponent: provider.balance.exponent,
  }
  const payoutDebits = payoutOriginalAmounts.reduce<ExactAmount | undefined>(
    (sum, value) =>
      sum === undefined ? undefined : addExactAmounts(sum, value),
    zero,
  )
  const payoutReversals = payoutReversalAmounts.reduce<ExactAmount | undefined>(
    (sum, value) =>
      sum === undefined ? undefined : addExactAmounts(sum, value),
    zero,
  )
  const paidOut = subtractExactAmounts(payoutDebits, payoutReversals)
  if (invalidPayoutComposition)
    return { kind: 'refused', code: 'payout_reconciliation_required' }
  if (payoutDebits === undefined || payoutReversals === undefined || paidOut === undefined)
    return { kind: 'refused', code: 'currency_mismatch' }
  return { kind: 'ok', paidOut }
}

export function createInMemoryMoneyQueryPort(input: Readonly<{
  ledger: LedgerState
  topups?: TopupState
  payoutStatuses?: readonly PayoutStatusView[]
  resolveOwnerId?: (principalId: string) => string | undefined
}>): MoneyQueryPort {
  const topups = input.topups
  const payoutStatuses = input.payoutStatuses ?? []
  return {
    readCreditAccount: async (query: CreditAccountQuery): Promise<CreditAccountView> => {
      const ownerId = input.resolveOwnerId?.(query.principalId)
      if (input.resolveOwnerId !== undefined && ownerId === undefined) throw new Error('billing_identity_missing')
      const account = [...input.ledger.accounts.values()].find((item) => item.accountKind === 'operator_credit' && item.balance.currency === query.currency && (ownerId === undefined || item.accountId === ownerId))
      if (account === undefined) throw new Error('billing_identity_missing')
      const pending = topups?.commands.find((command) => command.principalId === query.principalId && command.amount.currency === query.currency && (command.state === 'pending' || command.state === 'outcome_unknown'))
      const accountAutoRecharge = topups?.autoRecharge.get(account.accountRef)
      if (accountAutoRecharge !== undefined && (accountAutoRecharge.threshold.currency !== account.balance.currency || accountAutoRecharge.rechargeAmount.currency !== account.balance.currency)) throw new Error('currency_mismatch')
      const zero = { currency: account.balance.currency, units: '0', exponent: account.balance.exponent }
      return {
        principalId: query.principalId,
        accountId: account.accountId ?? ownerId ?? query.principalId,
        balance: account.balance,
        ...(pending === undefined ? {} : { pendingTopup: { amount: pending.amount, state: pending.state === 'pending' ? 'pending' as const : 'outcome_unknown' as const, ...(pending.externalRef === undefined ? {} : { externalRef: pending.externalRef }) } }),
        autoRecharge: {
          enabled: accountAutoRecharge?.enabled ?? false,
          threshold: accountAutoRecharge?.threshold ?? zero,
          rechargeAmount: accountAutoRecharge?.rechargeAmount ?? zero,
        },
        evidence: 'labelled_local_dev',
      }
    },
    listCreditActivity: async (query: CreditActivityQuery) => {
      const rows = input.ledger.usageEvents
        .filter((event) => event.principalId === query.principalId
          && event.credentialId === query.credentialId
          && event.amount.currency === query.currency)
        .sort((left, right) => right.observedAt - left.observedAt)
      const rawOffset = query.paginationOpts.cursor === null ? 0 : Number(query.paginationOpts.cursor)
      const offset = Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0
      const page = rows.slice(offset, offset + query.paginationOpts.numItems).map(activity)
      const nextOffset = offset + page.length
      return { page, isDone: nextOffset >= rows.length, continueCursor: String(nextOffset) }
    },
    readKeyUsage: async (query: KeyUsageQuery): Promise<KeyUsageView> => {
      const summary = input.ledger.usageSummaries.get(usageSummaryKey(query.principalId, query.credentialId, query.currency))
      if (summary !== undefined) return { credentialId: summary.credentialId, callCount: summary.callCount, paidCallCount: summary.paidCallCount, freeCallCount: summary.freeCallCount, grossSpend: summary.grossSpend, states: summary.states }
      const template = [...input.ledger.accounts.values()].find((item) => item.balance.currency === query.currency)?.balance
        ?? input.ledger.usageEvents.find((event) => event.amount.currency === query.currency)?.amount
      if (template === undefined) throw new Error('currency_mismatch')
      return { credentialId: query.credentialId, callCount: 0, paidCallCount: 0, freeCallCount: 0, grossSpend: { currency: query.currency, units: '0', exponent: template.exponent }, states: [] }
    },
    readProviderEarnings: async (query: ProviderEarningsQuery): Promise<ProviderEarningsView> => {
      const projected = projectProviderEarnings({
        businessId: query.businessId,
        currency: query.currency,
        accounts: [...input.ledger.accounts.values()],
        entries: input.ledger.entries,
        transactions: input.ledger.transactions,
        evidence: 'labelled_local_dev',
      })
      if (projected.kind === 'ok') return projected
      switch (projected.code) {
        case 'payout_not_ready':
          throw new Error('payout_not_ready')
        case 'payout_reconciliation_required':
        case 'currency_mismatch':
          throw new Error('currency_mismatch')
        default: {
          const _exhaustive: never = projected.code
          throw new Error(_exhaustive)
        }
      }
    },
    readPayoutStatus: async (query: PayoutStatusQuery): Promise<PayoutStatusView> => {
      const status = payoutStatuses.find((item) => item.businessId === query.businessId && item.providerNet.currency === query.currency)
      if (status !== undefined) {
        if (status.minimumPayout.currency !== status.providerNet.currency) throw new Error('currency_mismatch')
        return status
      }
      const provider = [...input.ledger.accounts.values()].find((item) => item.accountKind === 'provider_earnings' && item.businessId === query.businessId && item.balance.currency === query.currency)
      if (provider === undefined) throw new Error('payout_not_ready')
      const zero = { currency: provider.balance.currency, units: '0', exponent: provider.balance.exponent }
      return { businessId: query.businessId, accountState: 'missing', providerNet: zero, minimumPayout: zero, evidence: 'labelled_local_dev' }
    },
  }
}

function activity(event: LedgerState['usageEvents'][number]): CreditActivityView {
  return {
    activityRef: event.usageRef,
    credentialId: event.credentialId,
    serviceRef: event.serviceRef,
    offeringRef: event.offeringRef,
    businessId: event.businessId,
    operationKey: event.operationKey,
    invocationRef: event.invocationRef,
    attemptRef: event.attemptRef,
    grossAmount: event.amount,
    chargeState: event.chargeState,
    priceDigest: event.priceDigest,
    observedAt: event.observedAt,
    ...(event.transactionRef === undefined ? {} : { transactionRef: event.transactionRef }),
  }
}
