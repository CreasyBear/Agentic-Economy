import type { PayoutStatusView, ProviderEarningsView } from '@/modules/money/public'

export type OwnerProviderEarningsAccountReadback = Readonly<{
  currency: string
  earnings: Readonly<{ kind: 'ok' } & ProviderEarningsView>
  payout: Readonly<{ kind: 'ok' } & PayoutStatusView>
}>

export type OwnerProviderEarningsReadback = Readonly<
  | { kind: 'error'; code: 'unauthenticated' | 'source_unavailable' }
  | { kind: 'not_found' }
  | {
      kind: 'available'
      businessId: string
      accounts: readonly OwnerProviderEarningsAccountReadback[]
      accountsTruncated: boolean
    }
>
