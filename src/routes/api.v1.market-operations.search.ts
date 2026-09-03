import { createFileRoute } from '@tanstack/react-router'

import { methodNotAllowed } from '@/lib/server/method-guard'
import { operationReadUnavailableResponse } from '@/lib/server/operation-read-problem'
import { readOperationReadRequest } from '@/lib/server/operation-read-request'
import { problem } from '@/lib/server/problem'
import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import { registryOperationsSearchAction } from '@/modules/registry/operations.actions'
import { operationCatalogSearchInputSchema, operationChoiceSearchOutputSchema } from '@/modules/registry/operation-choice-contracts'

const MAX_OPERATION_SEARCH_BODY_BYTES = 16 * 1024

export const Route = createFileRoute('/api/v1/market-operations/search')({
  server: {
    handlers: {
      POST: ({ request }) => handleMarketOperationSearchRequest(request),
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

export async function handleMarketOperationSearchRequest(request: Request): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    let response: Response
    try {
      const parsed = await readOperationReadRequest(request, MAX_OPERATION_SEARCH_BODY_BYTES, operationCatalogSearchInputSchema)
      response = !parsed.ok ? parsed.response : await withHttpRateLimit(request, 'public-read', async () => {
        const result = operationChoiceSearchOutputSchema.safeParse(await registryOperationsSearchAction.run({
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
