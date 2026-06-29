import { createFileRoute } from '@tanstack/react-router'

import { discoveryTextResponse } from '@/lib/http/discovery-response'
import { readPublicSitemapXml } from '@/modules/discovery/discovery.functions'
import {
  readFixtureSitemapXml,
} from '@/modules/discovery/public'

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: ({ request }) => handleDurableSitemapXmlRequest(request),
    },
  },
})

export async function handleDurableSitemapXmlRequest(request: Request): Promise<Response> {
  const result = await readPublicSitemapXml({
    canonicalBaseUrl: requestOrigin(request),
    now: Date.now(),
  })

  return discoveryTextResponse(result.body, 'application/xml; charset=utf-8')
}

export function handleSitemapXmlRequest(request: Request): Response {
  const result = readFixtureSitemapXml({
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
