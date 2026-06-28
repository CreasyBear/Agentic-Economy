import { createFileRoute } from '@tanstack/react-router'

import { discoveryTextResponse } from '@/lib/http/discovery-response'
import {
  buildLlmsTxt,
  createDefaultDiscoverySourceState,
} from '@/modules/discovery/public'

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: ({ request }) => handleLlmsTxtRequest(request),
    },
  },
})

export function handleLlmsTxtRequest(request: Request): Response {
  const result = buildLlmsTxt(createDefaultDiscoverySourceState(), {
    canonicalBaseUrl: requestOrigin(request),
  })

  return discoveryTextResponse(result.body, 'text/plain; charset=utf-8')
}

function requestOrigin(request: Request): string {
  try {
    return new URL(request.url).origin
  } catch {
    return 'https://ae.example'
  }
}
