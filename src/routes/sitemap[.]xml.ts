import { createFileRoute } from '@tanstack/react-router'

import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
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
    canonicalBaseUrl: resolveCanonicalBaseUrl(request).baseUrl,
    now: Date.now(),
  })

  return discoveryTextResponse(result.body, 'application/xml; charset=utf-8')
}

export function handleSitemapXmlRequest(request: Request): Response {
  const result = readFixtureSitemapXml({
    canonicalBaseUrl: resolveCanonicalBaseUrl(request).baseUrl,
    now: Date.now(),
  })

  return discoveryTextResponse(result.body, 'application/xml; charset=utf-8')
}

