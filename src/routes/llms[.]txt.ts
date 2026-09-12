import { createFileRoute } from '@tanstack/react-router'

import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { discoveryTextResponse } from '@/lib/http/discovery-response'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { toolReadUnavailableResponse } from '@/lib/server/tool-read-problem'
import { readPublicLlmsTxt } from '@/modules/discovery/discovery.functions'

export const Route = createFileRoute('/llms.txt')({
  staticData: {
    nav: {
      label: 'llms.txt',
      footer: { column: 'Machines', order: 0 },
    },
  },
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
  let result
  try {
    result = await readPublicLlmsTxt({
      canonicalBaseUrl,
      routingBaseUrl: process.env.AE_ROUTING_PUBLIC_BASE_URL?.trim() || canonicalBaseUrl,
    })
  } catch {
    const response = toolReadUnavailableResponse()
    return head ? new Response(null, { status: response.status, headers: response.headers }) : response
  }

  const response = discoveryTextResponse(result.body, 'text/plain; charset=utf-8')
  return head ? new Response(null, { status: response.status, headers: response.headers }) : response
}
