import { OperatorRouteError, OperatorRoutePending } from '@/components/ae/layout/AeOperatorRouteStates'
import { requireOperatorBeforeLoad } from '@/lib/server/require-operator-session'

/**
 * Spread into every /owner/*, /admin/*, and /developers/* route's
 * `createFileRoute(...)({ ... })` options: `{ ...operatorRouteOptions, ... }`.
 * Bundles the shared auth guard plus in-shell loading/error chrome so no
 * operator route has to wire these individually.
 */
export const operatorRouteOptions = {
  beforeLoad: requireOperatorBeforeLoad,
  pendingComponent: OperatorRoutePending,
  errorComponent: OperatorRouteError,
} as const
