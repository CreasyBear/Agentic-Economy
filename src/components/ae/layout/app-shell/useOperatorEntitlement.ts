import { useContext } from 'react'

import { OperatorEntitlementContext } from '../AeConvexProviders'

export function useOperatorEntitlement(): { canAccessAdmin: boolean } {
  return { canAccessAdmin: useContext(OperatorEntitlementContext) }
}
