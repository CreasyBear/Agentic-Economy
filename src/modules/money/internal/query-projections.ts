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
      const rakeCreditEntries = input.ledger.entries.filter((entry) => entry.accountRef === accountRefForRake(query.currency) && entry.businessId === query.businessId && entry.entryType === 'rake' && entry.direction === 'credit' && entry.amount.currency === query.currency)
      const rakeRefundEntries = input.ledger.entries.filter((entry) => entry.accountRef === accountRefForRake(query.currency) && entry.businessId === query.businessId && entry.entryType === 'refund' && entry.direction === 'debit' && entry.reversalOf !== undefined && entry.amount.currency === query.currency)
      const providerCredits = providerCreditEntries.reduce<ExactAmount | undefined>((sum, entry) => sum === undefined ? undefined : addExactAmounts(sum, entry.amount), { currency: provider.balance.currency, units: '0', exponent: provider.balance.exponent })
      const providerRefunds = providerRefundEntries.reduce<ExactAmount | undefined>((sum, entry) => sum === undefined ? undefined : addExactAmounts(sum, entry.amount), { currency: provider.balance.currency, units: '0', exponent: provider.balance.exponent })
      const rakeCredits = rakeCreditEntries.reduce<ExactAmount | undefined>((sum, entry) => sum === undefined ? undefined : addExactAmounts(sum, entry.amount), { currency: provider.balance.currency, units: '0', exponent: provider.balance.exponent })
      const rakeRefunds = rakeRefundEntries.reduce<ExactAmount | undefined>((sum, entry) => sum === undefined ? undefined : addExactAmounts(sum, entry.amount), { currency: provider.balance.currency, units: '0', exponent: provider.balance.exponent })
      if (providerCredits === undefined || providerRefunds === undefined || rakeCredits === undefined || rakeRefunds === undefined) throw new Error('currency_mismatch')
      const providerNet = subtractExactAmounts(providerCredits, providerRefunds)
      const rake = subtractExactAmounts(rakeCredits, rakeRefunds)
      if (providerNet === undefined || rake === undefined) throw new Error('currency_mismatch')
      const grossAccrual = addExactAmounts(providerNet, rake)
      const providerNetPlusRecovery = addExactAmounts(providerNet, provider.recoveryDue)
      if (grossAccrual === undefined || providerNetPlusRecovery === undefined) throw new Error('currency_mismatch')
      const balanceComparison = compareExactAmounts(providerNetPlusRecovery, provider.balance)
      if (balanceComparison === undefined) throw new Error('currency_mismatch')
      const paidOut = balanceComparison === -1 ? { currency: provider.balance.currency, units: '0', exponent: provider.balance.exponent } : subtractExactAmounts(providerNetPlusRecovery, provider.balance)
      if (paidOut === undefined) throw new Error('currency_mismatch')
      return { businessId: query.businessId, grossAccrual, rake, providerNet, paidOut, held: provider.balance, recoveryDue: provider.recoveryDue, truncated: false, evidence: 'labelled_local_dev' }
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
