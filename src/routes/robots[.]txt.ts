import { createFileRoute } from '@tanstack/react-router'

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
