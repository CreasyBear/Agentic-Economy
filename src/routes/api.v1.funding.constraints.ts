import { createFileRoute } from '@tanstack/react-router'

import { degrade } from '@/lib/observability/degrade'
import { defineRouteHandlers, executeCorrelatedJsonRoute } from '@/lib/server/gateway-json-route'
import { problem } from '@/lib/server/problem'
import {
  commercialPolicyControlsFromFundingProjection,
  readFundingConstraints,
} from '@/modules/money/public'
import { readPlatformFundingConstraintsThroughSource } from '@/modules/money/server'

// Source refusal codes meaning the audience switch is closed on purpose.
const PAYMENTS_OFF_CODES: ReadonlySet<string> = new Set(['payments_paused', 'payments_admins_only', 'payments_not_open'])

export const Route = createFileRoute('/api/v1/funding/constraints')({
  server: {
    handlers: defineRouteHandlers({
      GET: ({ request }) => handleFundingConstraintsRequest(request),
      HEAD: ({ request }) => handleFundingConstraintsRequest(request, true),
    }),
  },
})

export async function handleFundingConstraintsRequest(request: Request, head = false): Promise<Response> {
  const response = await executeCorrelatedJsonRoute(
    request,
    'public-read',
    async () => {
      const live = await readPlatformFundingConstraintsThroughSource()
      if (live.kind !== 'available') {
        // Payments deliberately closed is a typed refusal, not an outage.
        if (PAYMENTS_OFF_CODES.has(live.code)) {
          return problem({ status: 409, kind: 'ALREADY_EXISTS', code: 'payments_not_open', retryable: false })
        }
        return problem({
          status: 503,
          kind: 'UNAVAILABLE',
          code: 'funding_constraints_unavailable',
          retryable: live.retryable,
          extras: { reason: live.code },
        })
      }
      const constraints = readFundingConstraints(
        commercialPolicyControlsFromFundingProjection(live),
      )
      return Response.json(constraints, {
        headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=60' },
      })
    },
    (cause) =>
      degrade(cause, problem({
        status: 503,
        kind: 'UNAVAILABLE',
        code: 'funding_constraints_unavailable',
        retryable: true,
      }), { site: 'handleFundingConstraintsRequest', reason: 'source_unavailable' }),
  )
  return head
    ? new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers })
    : response
}
