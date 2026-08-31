import { createFileRoute } from '@tanstack/react-router'

import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { discoveryTextResponse } from '@/lib/http/discovery-response'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { readPublicLlmsTxt } from '@/modules/discovery/discovery.functions'

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: ({ request }) => handleDurableLlmsTxtRequest(request),
      POST: () => methodNotAllowed(['GET', 'HEAD']),
      PUT: () => methodNotAllowed(['GET', 'HEAD']),
      PATCH: () => methodNotAllowed(['GET', 'HEAD']),
      DELETE: () => methodNotAllowed(['GET', 'HEAD']),
      HEAD: ({ request }) => handleDurableLlmsTxtRequest(request, true),
      OPTIONS: () => methodNotAllowed(['GET', 'HEAD']),
      TRACE: () => methodNotAllowed(['GET', 'HEAD']),
      CONNECT: () => methodNotAllowed(['GET', 'HEAD']),
    },
  },
})

export async function handleDurableLlmsTxtRequest(request: Request, head = false): Promise<Response> {
  const canonicalBaseUrl = resolveCanonicalBaseUrl(request).baseUrl
  const result = await readPublicLlmsTxt({
    canonicalBaseUrl,
    routingBaseUrl: process.env.AE_ROUTING_PUBLIC_BASE_URL?.trim() || canonicalBaseUrl,
  })

  const response = discoveryTextResponse(result.body, 'text/plain; charset=utf-8')
  return head ? new Response(null, { status: response.status, headers: response.headers }) : response
}
