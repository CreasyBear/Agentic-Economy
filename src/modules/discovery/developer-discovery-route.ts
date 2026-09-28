import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import {
  buildDeveloperDiscoveryRouteSnapshot,
  loadDeveloperDiscoveryRoute,
} from './internal/developer-discovery-route-snapshot'

import type {
  DeveloperDiscoveryArtifactMetadata,
  DeveloperDiscoveryRouteReadback,
} from '@/modules/discovery/developer-discovery'

export { buildDeveloperDiscoveryRouteSnapshot, loadDeveloperDiscoveryRoute }

export type DeveloperDiscoveryRoutePageReadback = Omit<DeveloperDiscoveryRouteReadback, 'artifacts'> & {
  artifacts: readonly (DeveloperDiscoveryArtifactMetadata & Readonly<{ checkedAt: number }>)[]
}

export const loadDeveloperDiscoveryRouteServer = createServerFn({ method: 'GET' })
  .handler(async (): Promise<DeveloperDiscoveryRoutePageReadback> => {
    // TanStack Start strips this server handler and its route dependencies from the client stub.
    return loadDeveloperDiscoveryRoute(getRequest(), Date.now())
  })
