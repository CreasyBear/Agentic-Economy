import { canonicalDigest } from '@/modules/common/canonical-digest'
import type {
  CreditAccountQuery,
  CreditAccountView,
  CreditActivityQuery,
  CreditActivityView,
  ExactAmount,
  KeyUsageQuery,
  KeyUsageView,
  MoneyQueryPort,
  PayoutStatusQuery,
  PayoutStatusView,
  ProviderEarningsQuery,
  ProviderEarningsView,
  TopupState,
} from '../public'
import { addExactAmounts, compareExactAmounts, subtractExactAmounts } from './exact-amount'
import { accountRefForRake, usageSummaryKey } from './ledger'
import type { LedgerState } from './ledger'

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
      const provider = [...input.ledger.accounts.values()].find((item) => item.accountKind === 'provider_earnings' && item.businessId === query.businessId && item.balance.currency === query.currency)
      if (provider === undefined) throw new Error('payout_not_ready')
      const providerCreditEntries = input.ledger.entries.filter((entry) => entry.accountRef === provider.accountRef && entry.businessId === query.businessId && entry.entryType === 'payout_accrual' && entry.direction === 'credit' && entry.reversalOf === undefined && entry.amount.currency === query.currency)
      const providerRefundEntries = input.ledger.entries.filter((entry) => entry.accountRef === provider.accountRef && entry.businessId === query.businessId && entry.entryType === 'refund' && entry.direction === 'debit' && entry.reversalOf !== undefined && entry.amount.currency === query.currency)
      const rakeCreditEntries = input.ledger.entries.filter((entry) => entry.accountRef === accountRefForRake(query.currency) && entry.businessId === query.businessId && entry.entryType === 'rake' && entry.direction === 'credit' && entry.reversalOf === undefined && entry.amount.currency === query.currency)
      const rakeRefundEntries = input.ledger.entries.filter((entry) => entry.accountRef === accountRefForRake(query.currency) && entry.businessId === query.businessId && entry.entryType === 'refund' && entry.direction === 'debit' && entry.reversalOf !== undefined && entry.amount.currency === query.currency)
      const transactions = new Map(
        input.ledger.transactions.map((transaction) => [
          transaction.transactionRef,
          transaction,
        ]),
      )
      const payoutTransactions = new Map(
        [...transactions.values()]
          .filter((transaction) => transaction.kind === 'payout_accrual')
          .map((transaction) => [transaction.transactionRef, transaction]),
      )
      const payoutOriginalTransactions = [...payoutTransactions.values()].filter(
        (transaction) =>
          transaction.principalId === `business:${query.businessId}` &&
          transaction.currency === query.currency &&
          transaction.exponent === provider.balance.exponent &&
          transaction.reversalOf === undefined &&
          (transaction.state === 'applied' || transaction.state === 'reversed'),
      )
      const payoutOriginalRefs = new Set(
        payoutOriginalTransactions.map((transaction) => transaction.transactionRef),
      )
      const payoutReversalEntries = input.ledger.entries.filter(
        (entry) =>
          entry.accountRef === provider.accountRef &&
          entry.businessId === query.businessId &&
          entry.entryType === 'payout_accrual' &&
          entry.direction === 'credit' &&
          entry.reversalOf !== undefined &&
          entry.amount.currency === query.currency,
      )
      const payoutOriginalAmounts: ExactAmount[] = []
      const payoutReversalAmounts: ExactAmount[] = []
      const payoutDebitRows = input.ledger.entries.filter(
        (entry) =>
          entry.accountRef === provider.accountRef &&
          entry.businessId === query.businessId &&
          entry.entryType === 'payout_accrual' &&
          entry.direction === 'debit' &&
          entry.amount.currency === query.currency,
      )
      let invalidPayoutComposition = false
      for (const entry of payoutDebitRows) {
        const transaction = transactions.get(entry.transactionRef)
        const providerCredits = input.ledger.entries.filter(
          (candidate) =>
            candidate.transactionRef === entry.transactionRef &&
            candidate.accountRef === provider.accountRef &&
            candidate.entryType === 'payout_accrual' &&
            candidate.direction === 'credit' &&
            candidate.businessId === query.businessId &&
            candidate.amount.currency === query.currency &&
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
          transaction.currency === query.currency &&
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
          entry.evidenceRefs.length === providerCredit.evidenceRefs.length &&
          entry.evidenceRefs.every(
            (ref, index) => ref === providerCredit.evidenceRefs[index],
          ) &&
          compareExactAmounts(entry.amount, providerCredit.amount) !== 1
        if (isCanonicalRecoveryDebit) continue
        if (
          transaction === undefined ||
          transaction.kind !== 'payout_accrual' ||
          transaction.transactionRef !== entry.transactionRef ||
          transaction.idempotencyKey !== entry.idempotencyKey ||
          transaction.principalId !== `business:${query.businessId}` ||
          transaction.currency !== query.currency ||
          transaction.exponent !== provider.balance.exponent ||
          transaction.reversalOf !== undefined ||
          entry.reversalOf !== undefined ||
          ((transaction.state === 'applied' ||
            transaction.state === 'reversed') &&
            !payoutOriginalRefs.has(transaction.transactionRef))
        )
          invalidPayoutComposition = true
      }
      for (const original of payoutOriginalTransactions) {
        const originalRows = input.ledger.entries.filter(
          (entry) =>
            entry.transactionRef === original.transactionRef &&
            entry.entryType === 'payout_accrual',
        )
        const debitRows = originalRows.filter(
          (entry) =>
            entry.accountRef === provider.accountRef &&
            entry.businessId === query.businessId &&
            entry.direction === 'debit' &&
            entry.reversalOf === undefined &&
            entry.idempotencyKey === original.idempotencyKey &&
            entry.amount.currency === query.currency &&
            entry.amount.exponent === provider.balance.exponent,
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
        const linkedReversals = input.ledger.transactions.filter(
          (transaction) =>
            transaction.kind === 'payout_accrual' &&
            transaction.reversalOf === original.transactionRef,
        )
        if (original.state === 'applied') {
          if (
            linkedReversals.length !== 0 ||
            input.ledger.entries.some(
              (entry) => entry.reversalOf === original.transactionRef,
            )
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
            : input.ledger.entries.filter(
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
                  entry.businessId === query.businessId &&
                  entry.direction === 'credit' &&
                  entry.reversalOf === original.transactionRef &&
                  entry.idempotencyKey === reversal.idempotencyKey &&
                  entry.amount.currency === query.currency &&
                  entry.amount.exponent === provider.balance.exponent &&
                  compareExactAmounts(entry.amount, originalAmount) === 0,
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
          reversal.principalId !== `business:${query.businessId}` ||
          reversal.currency !== query.currency ||
          reversal.exponent !== provider.balance.exponent ||
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
          original.principalId !== `business:${query.businessId}` ||
          original.reversalOf !== undefined ||
          original.state !== 'reversed' ||
          original.currency !== query.currency ||
          original.exponent !== provider.balance.exponent ||
          reversal.transactionRef !==
            canonicalDigest({
              format: 'money-payout-reversal-transaction:v1',
              reservationTransactionRef: original.transactionRef,
            }) ||
          reversal.kind !== 'payout_accrual' ||
          reversal.state !== 'reversed' ||
          reversal.reversalOf !== original.transactionRef ||
          reversal.principalId !== `business:${query.businessId}` ||
          reversal.currency !== query.currency ||
          reversal.exponent !== provider.balance.exponent
        )
          return true
        return false
      })
      const payoutDebits = payoutOriginalAmounts.reduce<ExactAmount | undefined>(
        (sum, value) =>
          sum === undefined ? undefined : addExactAmounts(sum, value),
        { currency: provider.balance.currency, units: '0', exponent: provider.balance.exponent },
      )
      const payoutReversals = payoutReversalAmounts.reduce<ExactAmount | undefined>(
        (sum, value) =>
          sum === undefined ? undefined : addExactAmounts(sum, value),
        { currency: provider.balance.currency, units: '0', exponent: provider.balance.exponent },
      )
      const zero = {
        currency: provider.balance.currency,
        units: '0',
        exponent: provider.balance.exponent,
      }
      const providerCredits = providerCreditEntries.reduce<
        ExactAmount | undefined
      >(
        (sum, entry) =>
          sum === undefined ? undefined : addExactAmounts(sum, entry.amount),
        zero,
      )
      const providerRefunds = providerRefundEntries.reduce<
        ExactAmount | undefined
      >(
        (sum, entry) =>
          sum === undefined ? undefined : addExactAmounts(sum, entry.amount),
        zero,
      )
      const rakeCredits = rakeCreditEntries.reduce<ExactAmount | undefined>(
        (sum, entry) =>
          sum === undefined ? undefined : addExactAmounts(sum, entry.amount),
        zero,
      )
      const rakeRefunds = rakeRefundEntries.reduce<ExactAmount | undefined>(
        (sum, entry) =>
          sum === undefined ? undefined : addExactAmounts(sum, entry.amount),
        zero,
      )
      const providerNet = subtractExactAmounts(providerCredits, providerRefunds)
      const rake = subtractExactAmounts(rakeCredits, rakeRefunds)
      if (
        providerCredits === undefined ||
        providerRefunds === undefined ||
        rakeCredits === undefined ||
        rakeRefunds === undefined ||
        providerNet === undefined ||
        rake === undefined ||
        payoutDebits === undefined ||
        payoutReversals === undefined ||
        invalidPayoutComposition
      )
        throw new Error('currency_mismatch')
      const grossAccrual = addExactAmounts(providerNet, rake)
      const providerNetPlusRecovery = addExactAmounts(
        providerNet,
        provider.recoveryDue,
      )
      if (
        grossAccrual === undefined ||
        providerNetPlusRecovery === undefined
      )
        throw new Error('currency_mismatch')
      const balanceComparison = compareExactAmounts(
        providerNetPlusRecovery,
        provider.balance,
      )
      if (balanceComparison === undefined) throw new Error('currency_mismatch')
      const paidOut = subtractExactAmounts(payoutDebits, payoutReversals)
      if (paidOut === undefined) throw new Error('currency_mismatch')
      return {
        businessId: query.businessId,
        grossAccrual,
        rake,
        providerNet,
        paidOut,
        held: provider.balance,
        recoveryDue: provider.recoveryDue,
        truncated: false,
        evidence: 'labelled_local_dev',
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
