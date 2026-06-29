import { createFileRoute } from '@tanstack/react-router'

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
    canonicalBaseUrl: requestOrigin(request),
  })

  return discoveryTextResponse(result.body, 'text/plain; charset=utf-8')
}

export function handleLlmsTxtRequest(request: Request): Response {
  const result = readFixtureLlmsTxt({
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
