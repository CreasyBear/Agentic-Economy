import type { OwnerProviderEarningsReadback } from './internal/supply-funnel/earnings-readback'

export type OwnerEarningsAccount = Extract<
  OwnerProviderEarningsReadback,
  { kind: 'available' }
>['accounts'][number]
