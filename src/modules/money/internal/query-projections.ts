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
} from '../public'
import type { LedgerState } from './ledger'
import type { TopupState } from './topup'

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
        .filter((event) => event.principalId === query.principalId)
        .filter((event) => query.credentialId === undefined || event.credentialId === query.credentialId)
        .filter((event) => query.currency === undefined || event.currency === query.currency)
        .filter((event) => query.from === undefined || event.observedAt >= query.from)
        .filter((event) => query.to === undefined || event.observedAt <= query.to)
        .sort((left, right) => right.observedAt - left.observedAt)
      const offset = readCursor(query.cursor)
      const items = rows.slice(offset, offset + boundedLimit(query.limit)).map(activity)
      const nextOffset = offset + items.length
      return { items, ...(nextOffset < rows.length ? { nextCursor: String(nextOffset) } : {}) }
    },
    readKeyUsage: async (query: KeyUsageQuery) => {
      const events = input.ledger.usageEvents
        .filter((event) => event.principalId === query.principalId)
        .filter((event) => query.credentialId === undefined || event.credentialId === query.credentialId)
        .filter((event) => query.from === undefined || event.observedAt >= query.from)
        .filter((event) => query.to === undefined || event.observedAt <= query.to)
      const grouped = new Map<string, KeyUsageView>()
      for (const event of events) {
        const prior = grouped.get(event.credentialId)
        const current: KeyUsageView = prior === undefined
          ? {
              credentialId: event.credentialId,
              callCount: 1,
              paidCallCount: event.chargeState === 'paid' ? 1 : 0,
              freeCallCount: event.chargeState === 'free_tier' ? 1 : 0,
              grossSpendMinor: event.chargeState === 'paid' ? event.amountMinor : 0,
              currency: event.currency,
              states: [event.chargeState],
            }
          : {
              ...prior,
              callCount: prior.callCount + 1,
              paidCallCount: prior.paidCallCount + (event.chargeState === 'paid' ? 1 : 0),
              freeCallCount: prior.freeCallCount + (event.chargeState === 'free_tier' ? 1 : 0),
              grossSpendMinor: prior.grossSpendMinor + (event.chargeState === 'paid' ? event.amountMinor : 0),
              states: prior.states.includes(event.chargeState) ? prior.states : [...prior.states, event.chargeState],
            }
        grouped.set(event.credentialId, current)
      }
      const rows = [...grouped.values()]
      const offset = readCursor(query.cursor)
      const items = rows.slice(offset, offset + boundedLimit(query.limit))
      const nextOffset = offset + items.length
      return { items, ...(nextOffset < rows.length ? { nextCursor: String(nextOffset) } : {}) }
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

function boundedLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1) return 1
  return Math.min(limit, 100)
}

function readCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0
  const value = Number(cursor)
  if (!Number.isSafeInteger(value) || value < 0) return 0
  return value
}
