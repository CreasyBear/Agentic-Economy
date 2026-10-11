import { createFileRoute } from '@tanstack/react-router'

import { availabilityStatement } from '@/content/availability-copy'
import { degrade } from '@/lib/observability/degrade'
import { defineRouteHandlers, executeCorrelatedJsonRoute } from '@/lib/server/gateway-json-route'
import { problem } from '@/lib/server/problem'
import { readPublicAvailabilityThroughSource } from '@/modules/money/server'

export const Route = createFileRoute('/api/v1/availability')({
  server: {
    handlers: defineRouteHandlers({
      GET: ({ request }) => handleAvailabilityRequest(request),
      HEAD: ({ request }) => handleAvailabilityRequest(request, true),
    }),
  },
})

const unavailable = () => problem({ status: 503, kind: 'UNAVAILABLE', code: 'availability_unavailable', retryable: true })

export async function handleAvailabilityRequest(request: Request, head = false): Promise<Response> {
  const response = await executeCorrelatedJsonRoute(
    request,
    'public-read',
    async () => {
      const { paidCalls } = await readPublicAvailabilityThroughSource()
      return Response.json({ paidCalls, statement: availabilityStatement(paidCalls) }, {
        headers: { 'Cache-Control': 'public, max-age=60' },
      })
    },
    (cause) => degrade(cause, unavailable(), { site: 'handleAvailabilityRequest', reason: 'source_unavailable' }),
  )
  return head
    ? new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers })
    : response
}
