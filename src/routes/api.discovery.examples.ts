import { createFileRoute } from '@tanstack/react-router'

import { createDefaultDiscoverySourceState, generateDeveloperDiscoveryExamples } from '@/modules/discovery/public'
import type { DiscoverySourceState, ReadDeveloperDiscoveryRouteOptions } from '@/modules/discovery/public'
import {
  developerDiscoveryJsonResponse,
  readDeveloperDiscoveryFetchReadback,
  readDeveloperDiscoveryRuntimeOptions,
} from './api.discovery.schema'

export const Route = createFileRoute('/api/discovery/examples')({
  server: {
    handlers: {
      GET: ({ request }) => handleDeveloperDiscoveryExamplesRequest(request),
    },
  },
})

export async function handleDeveloperDiscoveryExamplesRequest(
  request: Request,
  state?: DiscoverySourceState,
  options: ReadDeveloperDiscoveryRouteOptions = {}
): Promise<Response> {
  const routeOptions = await readDeveloperDiscoveryRuntimeOptions(request, state, options)
  const artifact = generateDeveloperDiscoveryExamples(state ?? createDefaultDiscoverySourceState(), routeOptions)
  const fetchReadback = readDeveloperDiscoveryFetchReadback(
    'examples',
    '/api/discovery/examples',
    artifact,
    routeOptions.now ?? 0
  )

  return developerDiscoveryJsonResponse(artifact, fetchReadback)
}
