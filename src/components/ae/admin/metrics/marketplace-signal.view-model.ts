import type { MarketplaceMetricsReport } from '@/lib/operator/admin-console/metrics.contracts'

export function marketplaceFundingChartViewModel(funding: NonNullable<MarketplaceMetricsReport['funding']>) {
  const data = [
    { key: 'purchased', label: 'Uses purchased credit', value: funding.customerFundedCalls, color: 'var(--signal-violet)' },
    { key: 'promotional', label: 'Promotional only', value: funding.promotionalOnlyCalls, color: 'var(--signal-mint)' },
  ]

  return {
    data,
    size: funding.customerFundedCalls + funding.promotionalOnlyCalls === 0 ? 176 : 208,
  }
}
