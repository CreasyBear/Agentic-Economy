import { createFileRoute } from '@tanstack/react-router'

import { methodNotAllowed } from '@/lib/server/method-guard'
import { operationReadUnavailableResponse } from '@/lib/server/operation-read-problem'
import { readOperationReadRequest } from '@/lib/server/operation-read-request'
import { problem } from '@/lib/server/problem'
import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import {
  operationInspectPlanInputSchema,
  operationInspectPlanOutputSchema,
} from '@/modules/capability-supply/public'
import { registryOperationsInspectPlanAction } from '@/modules/registry/operations.actions'

const MAX_OPERATION_INSPECT_PLAN_BODY_BYTES = 16 * 1024

export const Route = createFileRoute('/api/v1/market-operations/inspect-plan')({
  server: {
    handlers: {
      POST: ({ request }) => handleMarketOperationInspectPlanRequest(request),
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

export async function handleMarketOperationInspectPlanRequest(request: Request): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    let response: Response
    try {
      const parsed = await readOperationReadRequest(request, MAX_OPERATION_INSPECT_PLAN_BODY_BYTES, operationInspectPlanInputSchema)
      response = !parsed.ok ? parsed.response : await withHttpRateLimit(request, 'public-read', async () => {
        const result = operationInspectPlanOutputSchema.safeParse(await registryOperationsInspectPlanAction.run({
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
