import { createFileRoute } from '@tanstack/react-router'

import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { discoveryTextResponse } from '@/lib/http/discovery-response'
import { readPublicLlmsTxt } from '@/modules/discovery/discovery.functions'
import {
  readFixtureLlmsTxt,
} from '@/modules/discovery/public'

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: ({ request }) => handleDurableLlmsTxtRequest(request),
    },
  },
})

export async function handleDurableLlmsTxtRequest(request: Request): Promise<Response> {
  const result = await readPublicLlmsTxt({
    canonicalBaseUrl: resolveCanonicalBaseUrl(request).baseUrl,
  })

  return discoveryTextResponse(result.body, 'text/plain; charset=utf-8')
}

export function handleLlmsTxtRequest(request: Request): Response {
  const result = readFixtureLlmsTxt({
    canonicalBaseUrl: resolveCanonicalBaseUrl(request).baseUrl,
  })

  return discoveryTextResponse(result.body, 'text/plain; charset=utf-8')
}

