import type { DeveloperDiscoveryRouteReadback } from '@/modules/discovery/developer-discovery'

export async function loadDeveloperDiscoveryRoute(): Promise<DeveloperDiscoveryRouteReadback> {
  const [{ readDeveloperDiscoveryRoute }, { buildDeveloperDiscoveryRouteSnapshot }, { createDefaultDiscoverySourceState }] =
    await Promise.all([
      import('@/modules/discovery/developer-discovery'),
      import('@/routes/api.discovery.schema'),
      import('@/modules/discovery/public'),
    ])
  const request = new Request('https://ae.example/developers/discovery')
  const routeSnapshot = await buildDeveloperDiscoveryRouteSnapshot(request, {
    canonicalBaseUrl: 'https://ae.example',
    now: 0,
  })

  return readDeveloperDiscoveryRoute(createDefaultDiscoverySourceState(), {
    canonicalBaseUrl: 'https://ae.example',
    now: 0,
    routeSnapshot,
  })
}
