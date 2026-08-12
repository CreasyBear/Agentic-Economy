import { createServerFn } from '@tanstack/react-start'

import type { DeveloperDiscoveryRouteReadback } from '@/modules/discovery/developer-discovery'

export async function loadDeveloperDiscoveryRoute(): Promise<DeveloperDiscoveryRouteReadback> {
  const [{ readDeveloperDiscoveryRoute }, { buildDeveloperDiscoveryRouteSnapshot }] = await Promise.all([
    import('@/modules/discovery/developer-discovery'),
    import('@/routes/api.discovery.schema'),
  ])
  const request = new Request('https://ae.example/developers/discovery')
  const routeSnapshot = await buildDeveloperDiscoveryRouteSnapshot(request, {
    canonicalBaseUrl: 'https://ae.example',
    now: 0,
  })

  return readDeveloperDiscoveryRoute(undefined, {
    canonicalBaseUrl: 'https://ae.example',
    now: 0,
    routeSnapshot,
  })
}

export const loadDeveloperDiscoveryRouteServer = createServerFn({ method: 'GET' })
  .handler(loadDeveloperDiscoveryRoute)
