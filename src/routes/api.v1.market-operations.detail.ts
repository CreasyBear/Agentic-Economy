import { createFileRoute } from '@tanstack/react-router'

import { methodNotAllowed } from '@/lib/server/method-guard'
import { operationReadUnavailableResponse } from '@/lib/server/operation-read-problem'
import { readOperationReadRequest } from '@/lib/server/operation-read-request'
import { problem } from '@/lib/server/problem'
import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import {
  operationDetailInputSchema,
  operationDetailOutputSchema,
} from '@/modules/capability-supply/public'
import { registryOperationsDetailAction } from '@/modules/registry/operations.actions'

const MAX_OPERATION_DETAIL_BODY_BYTES = 4 * 1024

export const Route = createFileRoute('/api/v1/market-operations/detail')({
  server: {
    handlers: {
      POST: ({ request }) => handleMarketOperationDetailRequest(request),
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

export async function handleMarketOperationDetailRequest(request: Request): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    let response: Response
    try {
      const parsed = await readOperationReadRequest(request, MAX_OPERATION_DETAIL_BODY_BYTES, operationDetailInputSchema)
      response = !parsed.ok ? parsed.response : await withHttpRateLimit(request, 'public-read', async () => {
        const result = operationDetailOutputSchema.safeParse(await registryOperationsDetailAction.run({
          data: parsed.data,
          context: { caller: 'http', request },
        }))
        if (!result.success) return problem({ status: 503, kind: 'INTERNAL', code: 'operation_read_result_invalid' })
        return Response.json(result.data, { headers: { 'Cache-Control': 'no-store' } })
      })
    } catch {
      response = operationReadUnavailableResponse()
    }
    return withRequestCorrelationHeader(response, correlationId)
  })
}
