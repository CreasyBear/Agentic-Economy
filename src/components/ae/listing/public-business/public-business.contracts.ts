import type { PublicBusinessRouteDataResult } from '@/lib/server/public-business-route.functions'

export type ProviderListingSearch = Readonly<{ from?: 'thread'; id?: string }>

export type AePublicBusinessProps = Readonly<{
  routeData: Extract<PublicBusinessRouteDataResult, { kind: 'available' | 'unavailable' }>
  backFrom?: 'thread'
  backThreadId?: string
}>
