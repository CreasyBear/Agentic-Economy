import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

import type {
  DeveloperDiscoveryArtifactMetadata,
  DeveloperDiscoveryRouteReadback,
} from '@/modules/discovery/developer-discovery'

export type DeveloperDiscoveryRoutePageReadback = Omit<DeveloperDiscoveryRouteReadback, 'artifacts'> & {
  artifacts: readonly (DeveloperDiscoveryArtifactMetadata & Readonly<{ checkedAt: number }>)[]
}

export const loadDeveloperDiscoveryRouteServer = createServerFn({ method: 'GET' })
  .handler(async (): Promise<DeveloperDiscoveryRoutePageReadback> => {
    // Keep route-handler dependencies outside the browser's server-function stub.
    const { loadDeveloperDiscoveryRoute } = await import('./developer-discovery-route.server')
    return loadDeveloperDiscoveryRoute(getRequest(), Date.now())
  })
