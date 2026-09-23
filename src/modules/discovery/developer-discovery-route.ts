import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import type {
  DeveloperDiscoveryArtifactMetadata,
  DeveloperDiscoveryRouteReadback,
} from '@/modules/discovery/developer-discovery'

export type DeveloperDiscoveryRoutePageReadback = Omit<DeveloperDiscoveryRouteReadback, 'artifacts'> & {
  artifacts: readonly (DeveloperDiscoveryArtifactMetadata & Readonly<{ checkedAt: number }>)[]
}

export async function loadDeveloperDiscoveryRoute(
  request: Request,
  now = 0,
): Promise<DeveloperDiscoveryRoutePageReadback> {
  const [{ readDeveloperDiscoveryRoute }, { buildDeveloperDiscoveryRouteSnapshot }] = await Promise.all([
    import('@/modules/discovery/developer-discovery'),
    import('@/routes/api.discovery.schema'),
  ])
  const canonicalBaseUrl = resolveCanonicalBaseUrl(request).baseUrl
  const routeSnapshot = await buildDeveloperDiscoveryRouteSnapshot(request, { canonicalBaseUrl, now })
  const readback = readDeveloperDiscoveryRoute(undefined, { canonicalBaseUrl, now, routeSnapshot })

  return {
    ...readback,
    artifacts: readback.artifacts.map((artifact) => ({ ...artifact, checkedAt: readback.generatedAt })),
    copy: {
      ...readback.copy,
      title: 'Discovery status',
    },
  }
}

export const loadDeveloperDiscoveryRouteServer = createServerFn({ method: 'GET' })
  .handler(() => loadDeveloperDiscoveryRoute(getRequest(), Date.now()))
