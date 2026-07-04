import { createFileRoute } from '@tanstack/react-router'

import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { discoveryTextResponse } from '@/lib/http/discovery-response'
import { buildRobotsTxt } from '@/modules/discovery/public'

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: ({ request }) => handleRobotsTxtRequest(request),
    },
  },
})

export function handleRobotsTxtRequest(request: Request): Response {
  const result = buildRobotsTxt({
    canonicalBaseUrl: resolveCanonicalBaseUrl(request).baseUrl,
  })

  return discoveryTextResponse(result.body, 'text/plain; charset=utf-8')
}

