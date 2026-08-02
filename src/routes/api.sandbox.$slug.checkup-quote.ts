import { createFileRoute } from '@tanstack/react-router'

import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { sandboxCheckupQuoteAction } from '@/modules/sandbox-supply/sandbox-supply.actions'

import { jsonResponse } from './api.businesses'

export const Route = createFileRoute('/api/sandbox/$slug/checkup-quote')({
  server: {
    handlers: {
      POST: ({ request, params }) => withHttpRateLimit(request, 'public-read', () => handleSandboxCheckupQuoteRequest(params.slug)),
    },
  },
})

export async function handleSandboxCheckupQuoteRequest(slug: string): Promise<Response> {
  const result = await sandboxCheckupQuoteAction.run({
    data: sandboxCheckupQuoteAction.schema.parse({ slug }),
    context: { caller: 'http' },
  })
  if (result.kind === 'refused') {
    return jsonResponse({ kind: 'refused', reason: result.code }, { status: 404 })
  }
  return jsonResponse(result.quote)
}

