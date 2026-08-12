import { createFileRoute } from '@tanstack/react-router'

import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { discoveryTextResponse } from '@/lib/http/discovery-response'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { readPublicLlmsTxt } from '@/modules/discovery/discovery.functions'

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: ({ request }) => handleDurableLlmsTxtRequest(request),
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

export async function handleDurableLlmsTxtRequest(request: Request): Promise<Response> {
  const canonicalBaseUrl = resolveCanonicalBaseUrl(request).baseUrl
  const result = await readPublicLlmsTxt({
    canonicalBaseUrl,
    routingBaseUrl: process.env.AE_ROUTING_PUBLIC_BASE_URL?.trim() || canonicalBaseUrl,
  })

  return discoveryTextResponse(result.body, 'text/plain; charset=utf-8')
}

