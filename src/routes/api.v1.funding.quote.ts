import { createFileRoute } from '@tanstack/react-router'

import { readBoundedRequestJson } from '@/lib/server/bounded-request-body'
import { degrade } from '@/lib/observability/degrade'
import { executeCorrelatedJsonRoute, postOnlyRoute } from '@/lib/server/gateway-json-route'
import { problem } from '@/lib/server/problem'
import {
  commercialPolicyControlsFromFundingProjection,
  fundingQuoteInputSchema,
  quoteFunding,
} from '@/modules/money/public'
import { readPlatformFundingConstraintsThroughSource } from '@/modules/money/server'

const MAX_FUNDING_QUOTE_BODY_BYTES = 2 * 1024

export const Route = createFileRoute('/api/v1/funding/quote')({
  server: {
    handlers: postOnlyRoute((request) => handleFundingQuoteRequest(request)),
  },
})

export async function handleFundingQuoteRequest(
  request: Request,
  options: Readonly<{ now?: number }> = {},
): Promise<Response> {
  return await executeCorrelatedJsonRoute(
    request,
    'public-read',
    async () => {
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
      const live = await readPlatformFundingConstraintsThroughSource()
      if (live.kind !== 'available') {
        return problem({
          status: 503,
          kind: 'UNAVAILABLE',
          code: 'funding_quote_unavailable',
          retryable: true,
        })
      }
      const quote = quoteFunding({
        amount: parsed.data.amount,
        now: options.now ?? Date.now(),
        controls: commercialPolicyControlsFromFundingProjection(live),
      })
      if (quote === undefined) {
        return problem({
          status: 400,
          kind: 'INVALID_ARGUMENT',
          code: 'funding_amount_out_of_range',
          detail: 'The requested AUD principal does not meet the current funding constraints.',
        })
      }
      return Response.json(quote, { headers: { 'Cache-Control': 'no-store' } })
    },
    (cause) =>
      degrade(cause, problem({
        status: 503,
        kind: 'UNAVAILABLE',
        code: 'funding_quote_unavailable',
        retryable: true,
      }), { site: 'handleFundingQuoteRequest', reason: 'source_unavailable' }),
  )
}
