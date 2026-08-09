import { createFileRoute } from '@tanstack/react-router'

import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { problem } from '@/lib/server/problem'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { sandboxCheckupQuoteAction } from '@/modules/sandbox-supply/sandbox-supply.actions'

import { jsonResponse } from './api.businesses'

export const Route = createFileRoute('/api/sandbox/$slug/checkup-quote')({
  server: {
    handlers: {
      POST: ({ request, params }) => withHttpRateLimit(request, 'public-read', () => handleSandboxCheckupQuoteRequest(params.slug)),
      GET: () => methodNotAllowed(['POST']),
      PUT: () => methodNotAllowed(['POST']),
      PATCH: () => methodNotAllowed(['POST']),
      DELETE: () => methodNotAllowed(['POST']),
      HEAD: () => methodNotAllowed(['POST']),
      OPTIONS: () => methodNotAllowed(['POST']),
      TRACE: () => methodNotAllowed(['POST']),
      CONNECT: () => methodNotAllowed(['POST']),
    },
  },
})

export async function handleSandboxCheckupQuoteRequest(slug: string): Promise<Response> {
  const result = await sandboxCheckupQuoteAction.run({
    data: sandboxCheckupQuoteAction.schema.parse({ slug }),
    context: { caller: 'http' },
  })
  if (result.kind === 'refused') {
    return problem({ status: 404, kind: 'NOT_FOUND', code: result.code, detail: result.reason })
  }
  return jsonResponse(result.quote)
}

