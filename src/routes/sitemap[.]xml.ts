import { createFileRoute } from '@tanstack/react-router'

import { discoveryTextResponse } from '@/lib/http/discovery-response'
import {
  buildSitemapXml,
  createDefaultDiscoverySourceState,
} from '@/modules/discovery/public'

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: ({ request }) => handleSitemapXmlRequest(request),
    },
  },
})

export function handleSitemapXmlRequest(request: Request): Response {
  const result = buildSitemapXml(createDefaultDiscoverySourceState(), {
    canonicalBaseUrl: requestOrigin(request),
    now: Date.now(),
  })

  return discoveryTextResponse(result.body, 'application/xml; charset=utf-8')
}

function requestOrigin(request: Request): string {
  try {
    return new URL(request.url).origin
  } catch {
    return 'https://ae.example'
  }
}
