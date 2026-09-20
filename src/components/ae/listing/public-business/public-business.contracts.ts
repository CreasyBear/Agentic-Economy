import type { PublicBusinessRouteDataResult } from '@/lib/server/public-business-route.functions'

export type AePublicBusinessProps = Readonly<{
  routeData: Extract<PublicBusinessRouteDataResult, { kind: 'available' | 'unavailable' }>
  backFrom?: 'thread'
  backThreadId?: string
}>
