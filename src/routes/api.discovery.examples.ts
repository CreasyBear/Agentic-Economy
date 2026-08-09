import { createFileRoute } from '@tanstack/react-router'

import { methodNotAllowed } from '@/lib/server/method-guard'
import { createDefaultDiscoverySourceState } from '@/modules/discovery/public'
import type { DiscoverySourceState } from '@/modules/discovery/public'
import { generateDeveloperDiscoveryExamples } from '@/modules/discovery/developer-discovery'
import type { ReadDeveloperDiscoveryRouteOptions } from '@/modules/discovery/developer-discovery'
import {
  developerDiscoveryJsonResponse,
  readDeveloperDiscoveryFetchReadback,
  readDeveloperDiscoveryRuntimeOptions,
} from './api.discovery.schema'

export const Route = createFileRoute('/api/discovery/examples')({
  server: {
    handlers: {
      GET: ({ request }) => handleDeveloperDiscoveryExamplesRequest(request),
      POST: () => methodNotAllowed(['GET']),
      PUT: () => methodNotAllowed(['GET']),
      PATCH: () => methodNotAllowed(['GET']),
      DELETE: () => methodNotAllowed(['GET']),
      HEAD: () => methodNotAllowed(['GET']),
      OPTIONS: () => methodNotAllowed(['GET']),
      TRACE: () => methodNotAllowed(['GET']),
      CONNECT: () => methodNotAllowed(['GET']),
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
