import {
  OperatorRouteError,
  OperatorRouteNotFound,
  OperatorRoutePending,
} from '@/components/ae/layout/AeRouteStates'
import {
  OperatorSurfaceForbiddenError,
} from '@/lib/operator/operator-context'
import { requireOperatorBeforeLoad } from '@/lib/server/require-operator-session'

/**
 * Spread into operator leaf routes so slow or failed child loads swap only the
 * content region while the pathless operator layout keeps its shell mounted.
 */
export const operatorRouteOptions = {
  pendingComponent: OperatorRoutePending,
  errorComponent: OperatorRouteError,
  notFoundComponent: OperatorRouteNotFound,
} as const
async function requireOperatorLayoutBeforeLoad(
  options: Parameters<typeof requireOperatorBeforeLoad>[0],
) {
  try {
    return await requireOperatorBeforeLoad(options)
  } catch (cause) {
    if (cause instanceof OperatorSurfaceForbiddenError) {
      return { kind: 'forbidden', surface: cause.surface } as const
    }
    throw cause
  }
}


/**
 * Applied once at the pathless operator layout. This is the shared
 * /owner/* and /admin/* auth boundary.
 */
export const operatorLayoutRouteOptions = {
  beforeLoad: requireOperatorLayoutBeforeLoad,
  pendingComponent: OperatorRoutePending,
  errorComponent: OperatorRouteError,
  notFoundComponent: OperatorRouteNotFound,
} as const
