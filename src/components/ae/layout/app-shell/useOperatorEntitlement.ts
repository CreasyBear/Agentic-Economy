import { useConvexAuth, useQuery } from 'convex/react'

import { api } from '../../../../../convex/_generated/api'

export function useOperatorEntitlement(): boolean {
  const { isAuthenticated } = useConvexAuth()
  const result = useQuery(api.operatorContext.readCurrent, isAuthenticated ? {} : 'skip')
  return isAuthenticated && result?.kind === 'authorized' && result.allowedSurfaces.includes('admin')
}
