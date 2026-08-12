import { createFileRoute } from '@tanstack/react-router'

import { readBoundedRequestJson } from '@/lib/server/bounded-request-body'
import { kindForStatus } from '@/lib/errors'
import { ConvexSourceError } from '@/lib/server/convex-source'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { problem } from '@/lib/server/problem'
import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import {
  operationCompareInputSchema,
  operationCompareOutputSchema,
} from '@/modules/capability-supply/public'
import { registryOperationsCompareAction } from '@/modules/registry/operations.actions'

const MAX_OPERATION_COMPARE_BODY_BYTES = 8 * 1024

export const Route = createFileRoute('/api/v1/market-operations/compare')({
  server: {
    handlers: {
      POST: ({ request }) => handleMarketOperationCompareRequest(request),
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

export async function handleMarketOperationCompareRequest(request: Request): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    let response: Response
    try {
      response = await withHttpRateLimit(request, 'public-read', async () => {
        if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
          return problem({ status: 415, kind: 'UNSUPPORTED_MEDIA_TYPE', code: 'invalid_content_type' })
        }
        const bounded = await readBoundedRequestJson(request, MAX_OPERATION_COMPARE_BODY_BYTES)
        if (!bounded.ok) {
          return problem({
            status: bounded.code === 'payload_too_large' ? 413 : 400,
            kind: bounded.code === 'payload_too_large' ? 'PAYLOAD_TOO_LARGE' : 'INVALID_ARGUMENT',
            code: bounded.code,
          })
        }
        const parsed = operationCompareInputSchema.safeParse(bounded.value)
        if (!parsed.success) {
          const detail = parsed.error.issues[0]?.message
          return problem({
            status: 400,
            kind: 'INVALID_ARGUMENT',
            code: 'invalid_body',
            ...(detail === undefined ? {} : { detail }),
          })
        }
        const result = operationCompareOutputSchema.safeParse(await registryOperationsCompareAction.run({
          data: parsed.data,
          context: { caller: 'http', request },
        }))
        if (!result.success) return problem({ status: 503, kind: 'INTERNAL', code: 'operation_read_result_invalid' })
        return Response.json(result.data, { headers: { 'Cache-Control': 'no-store' } })
      })
    } catch (error) {
      response = operationMarketCompareError(error)
    }
    return withRequestCorrelationHeader(response, correlationId)
  })
}

function operationMarketCompareError(error: unknown): Response {
  if (error instanceof ConvexSourceError) {
    return problem({ status: error.status, kind: kindForStatus(error.status), code: error.code })
  }
  return problem({ status: 503, kind: 'UNAVAILABLE', code: 'operation_read_unavailable' })
}
