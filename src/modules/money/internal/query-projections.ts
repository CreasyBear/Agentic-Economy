import type {
  CreditAccountQuery,
  CreditAccountView,
  CreditActivityQuery,
  CreditActivityView,
  KeyUsageQuery,
  KeyUsageView,
  MoneyQueryPort,
  PayoutStatusQuery,
  PayoutStatusView,
  ProviderEarningsQuery,
  ProviderEarningsView,
  TopupState,
} from '../public'
import { usageSummaryKey } from './ledger'
import type { LedgerState } from './ledger'

export function createInMemoryMoneyQueryPort(input: Readonly<{
  ledger: LedgerState
  topups?: TopupState
  payoutStatuses?: readonly PayoutStatusView[]
}>): MoneyQueryPort {
  const topups = input.topups
  const payoutStatuses = input.payoutStatuses ?? []
  return {
    readCreditAccount: async (query: CreditAccountQuery): Promise<CreditAccountView> => {
      const account = [...input.ledger.accounts.values()].find((item) => item.accountKind === 'operator_credit' && item.principalId === query.principalId && item.currency === query.currency)
      if (account === undefined) throw new Error('billing_identity_missing')
      const pending = topups?.commands.find((command) => command.principalId === query.principalId && command.currency === query.currency && (command.state === 'pending' || command.state === 'outcome_unknown'))
      const accountAutoRecharge = topups?.autoRecharge.get(account.accountRef)
      return {
        principalId: query.principalId,
        currency: query.currency,
        balanceMinor: account.balanceMinor,
        ...(pending === undefined ? {} : { pendingTopup: { amountMinor: pending.amountMinor, state: pending.state === 'pending' ? 'pending' as const : 'outcome_unknown' as const, ...(pending.externalRef === undefined ? {} : { externalRef: pending.externalRef }) } }),
        autoRecharge: {
          enabled: accountAutoRecharge?.enabled ?? false,
          thresholdMinor: accountAutoRecharge?.thresholdMinor ?? 0,
          rechargeAmountMinor: accountAutoRecharge?.rechargeAmountMinor ?? 0,
        },
        evidence: 'labelled_local_dev',
      }
    },
    listCreditActivity: async (query: CreditActivityQuery) => {
      const rows = input.ledger.usageEvents
        .filter((event) => event.principalId === query.principalId
          && event.credentialId === query.credentialId
          && event.currency === query.currency)
        .sort((left, right) => right.observedAt - left.observedAt)
      const rawOffset = query.paginationOpts.cursor === null ? 0 : Number(query.paginationOpts.cursor)
      const offset = Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0
      const page = rows.slice(offset, offset + query.paginationOpts.numItems).map(activity)
      const nextOffset = offset + page.length
      return { page, isDone: nextOffset >= rows.length, continueCursor: String(nextOffset) }
    },
    readKeyUsage: async (query: KeyUsageQuery): Promise<KeyUsageView> => {
      const summary = input.ledger.usageSummaries.get(usageSummaryKey(query.principalId, query.credentialId, query.currency))
      if (summary !== undefined) return { credentialId: summary.credentialId, callCount: summary.callCount, paidCallCount: summary.paidCallCount, freeCallCount: summary.freeCallCount, grossSpendMinor: summary.grossSpendMinor, currency: summary.currency, states: summary.states }
      return { credentialId: query.credentialId, callCount: 0, paidCallCount: 0, freeCallCount: 0, grossSpendMinor: 0, currency: query.currency, states: [] }
    },
    readProviderEarnings: async (query: ProviderEarningsQuery): Promise<ProviderEarningsView> => {
      const provider = [...input.ledger.accounts.values()].find((item) => item.accountKind === 'provider_earnings' && item.businessId === query.businessId && item.currency === query.currency)
      if (provider === undefined) throw new Error('payout_not_ready')
      const grossEntries = input.ledger.entries.filter((entry) => entry.businessId === query.businessId && entry.entryType === 'payout_accrual' && entry.direction === 'credit' && entry.currency === query.currency)
      const rakeEntries = input.ledger.entries.filter((entry) => entry.businessId === query.businessId && entry.entryType === 'rake' && entry.direction === 'credit' && entry.currency === query.currency)
      const providerNetAccruedMinor = grossEntries.reduce((sum, entry) => sum + entry.amountMinor, 0)
      const rakeMinor = rakeEntries.reduce((sum, entry) => sum + entry.amountMinor, 0)
      const grossAccrualMinor = providerNetAccruedMinor + rakeMinor
      return { businessId: query.businessId, currency: query.currency, grossAccrualMinor, rakeMinor, providerNetMinor: provider.balanceMinor, paidOutMinor: Math.max(0, providerNetAccruedMinor - provider.balanceMinor), heldMinor: provider.balanceMinor, evidence: 'labelled_local_dev' }
    },
    readPayoutStatus: async (query: PayoutStatusQuery): Promise<PayoutStatusView> => {
      const status = payoutStatuses.find((item) => item.businessId === query.businessId && item.currency === query.currency)
      if (status !== undefined) return status
      return { businessId: query.businessId, currency: query.currency, accountState: 'missing', providerNetMinor: 0, minimumPayoutMinor: 0, evidence: 'labelled_local_dev' }
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
    grossAmountMinor: event.amountMinor,
    currency: event.currency,
    chargeState: event.chargeState,
    observedAt: event.observedAt,
    ...(event.transactionRef === undefined ? {} : { transactionRef: event.transactionRef }),
  }
}

