import { createFileRoute } from '@tanstack/react-router'

import { readBoundedRequestJson } from '@/lib/server/bounded-request-body'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { problem } from '@/lib/server/problem'
import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import { fundingQuoteInputSchema, quoteFunding } from '@/modules/money/public'

const MAX_FUNDING_QUOTE_BODY_BYTES = 2 * 1024

export const Route = createFileRoute('/api/v1/funding/quote')({
  server: {
    handlers: {
      POST: ({ request }) => handleFundingQuoteRequest(request),
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

export async function handleFundingQuoteRequest(
  request: Request,
  options: Readonly<{ now?: number }> = {},
): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    let response: Response
    try {
      response = await withHttpRateLimit(request, 'public-read', async () => {
        if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
          return problem({ status: 415, kind: 'UNSUPPORTED_MEDIA_TYPE', code: 'invalid_content_type' })
        }
        const bounded = await readBoundedRequestJson(request, MAX_FUNDING_QUOTE_BODY_BYTES)
        if (!bounded.ok) {
          return problem({
            status: bounded.code === 'payload_too_large' ? 413 : 400,
            kind: bounded.code === 'payload_too_large' ? 'PAYLOAD_TOO_LARGE' : 'INVALID_ARGUMENT',
            code: bounded.code,
          })
        }
        const parsed = fundingQuoteInputSchema.safeParse(bounded.value)
        if (!parsed.success) {
          return problem({
            status: 400,
            kind: 'INVALID_ARGUMENT',
            code: 'invalid_funding_quote',
            detail: 'Amount must use exact currency, integer units, and exponent fields.',
          })
        }
        const quote = quoteFunding({ amount: parsed.data.amount, now: options.now ?? Date.now() })
        if (quote === undefined) {
          return problem({
            status: 400,
            kind: 'INVALID_ARGUMENT',
            code: 'funding_amount_out_of_range',
            detail: 'The requested credit amount does not meet the current funding constraints.',
          })
        }
        return Response.json(quote, { headers: { 'Cache-Control': 'no-store' } })
      })
    } catch {
      response = problem({
        status: 503,
        kind: 'UNAVAILABLE',
        code: 'funding_quote_unavailable',
        retryable: true,
      })
    }
    return withRequestCorrelationHeader(response, correlationId)
  })
}
