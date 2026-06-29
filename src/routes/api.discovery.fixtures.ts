import { createFileRoute } from '@tanstack/react-router'

import { createDefaultDiscoverySourceState, generateDeveloperDiscoveryFixtureBundle } from '@/modules/discovery/public'
import type { DiscoverySourceState, ReadDeveloperDiscoveryRouteOptions } from '@/modules/discovery/public'
import {
  developerDiscoveryJsonResponse,
  readDeveloperDiscoveryFetchReadback,
  readDeveloperDiscoveryRuntimeOptions,
} from './api.discovery.schema'

export const Route = createFileRoute('/api/discovery/fixtures')({
  server: {
    handlers: {
      GET: ({ request }) => handleDeveloperDiscoveryFixturesRequest(request),
    },
  },
})

export async function handleDeveloperDiscoveryFixturesRequest(
  request: Request,
  state?: DiscoverySourceState,
  options: ReadDeveloperDiscoveryRouteOptions = {}
): Promise<Response> {
  const routeOptions = await readDeveloperDiscoveryRuntimeOptions(request, state, options)
  const artifact = generateDeveloperDiscoveryFixtureBundle(state ?? createDefaultDiscoverySourceState(), routeOptions)
  const fetchReadback = readDeveloperDiscoveryFetchReadback(
    'fixtures',
    '/api/discovery/fixtures',
    artifact,
    routeOptions.now ?? 0
  )

  return developerDiscoveryJsonResponse(artifact, fetchReadback)
}
