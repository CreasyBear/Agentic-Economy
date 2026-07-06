import { OperatorRouteError, OperatorRoutePending } from '@/components/ae/layout/AeOperatorRouteStates'
import { requireOperatorBeforeLoad } from '@/lib/server/require-operator-session'

/**
 * Spread into operator leaf routes so slow or failed child loads swap only the
 * content region while the pathless operator layout keeps its shell mounted.
 */
export const operatorRouteOptions = {
  pendingComponent: OperatorRoutePending,
  errorComponent: OperatorRouteError,
} as const

/**
 * Applied once at the pathless operator layout. This is the shared
 * /owner/*, /admin/*, and /developers/* auth boundary.
 */
export const operatorLayoutRouteOptions = {
  beforeLoad: requireOperatorBeforeLoad,
  pendingComponent: OperatorRoutePending,
  errorComponent: OperatorRouteError,
} as const
