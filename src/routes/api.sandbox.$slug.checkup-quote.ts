import { createFileRoute } from '@tanstack/react-router'

import { quoteStandardCheckup } from '@/modules/sandbox-supply/checkup-quote'
import { jsonResponse } from './api.businesses'

export const Route = createFileRoute('/api/sandbox/$slug/checkup-quote')({
  server: {
    handlers: {
      POST: ({ params }) => handleSandboxCheckupQuoteRequest(params.slug),
    },
  },
})

export function handleSandboxCheckupQuoteRequest(slug: string): Response {
  const result = quoteStandardCheckup({ slug, requestedAt: Date.now() })
  if (result.kind === 'refused') {
    return jsonResponse({ kind: 'refused', reason: result.reason }, { status: 404 })
  }
  return jsonResponse(result.quote)
}
