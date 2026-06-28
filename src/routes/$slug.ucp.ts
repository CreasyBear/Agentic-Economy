import { createFileRoute } from '@tanstack/react-router'

import { discoveryJsonResponse } from '@/lib/http/discovery-response'
import {
  regenerateDiscoveryManifest,
} from '@/modules/discovery/public'
import type { DiscoverySourceState } from '@/modules/discovery/public'
import { createDefaultRegistrySourceState } from '@/modules/registry/public'

export const Route = createFileRoute('/$slug/ucp')({
  server: {
    handlers: {
      GET: ({ request, params }) => handleUcpManifestRequest(request, params.slug),
    },
  },
})

export function handleUcpManifestRequest(request: Request, slug: string): Response {
  const state = createRouteDiscoveryState()
  const result = regenerateDiscoveryManifest(
    state,
    { slug },
    {
      canonicalBaseUrl: requestOrigin(request),
      now: Date.now(),
    }
  )

  if (result.kind === 'error') {
    return discoveryJsonResponse(
      {
        kind: 'not_found',
        code: 'discovery_manifest_not_found',
        reason: 'No public discovery manifest exists for this slug.',
      },
      { status: 404 }
    )
  }

  return discoveryJsonResponse(result.manifest)
}

function createRouteDiscoveryState(): DiscoverySourceState {
  return {
    ...createDefaultRegistrySourceState(),
    discoveryManifests: [],
    invalidationIntents: [],
  }
}

function requestOrigin(request: Request): string {
  try {
    return new URL(request.url).origin
  } catch {
    return 'https://ae.example'
  }
}
