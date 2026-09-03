import { createFileRoute } from '@tanstack/react-router'

import { methodNotAllowed } from '@/lib/server/method-guard'
import { operationReadUnavailableResponse } from '@/lib/server/operation-read-problem'
import { readOperationReadRequest } from '@/lib/server/operation-read-request'
import { problem } from '@/lib/server/problem'
import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import { registryOperationsListAction } from '@/modules/registry/operations.actions'
import { operationChoiceListOutputSchema, operationListInputSchema } from '@/modules/registry/operation-choice-contracts'

const MAX_OPERATION_LIST_BODY_BYTES = 16 * 1024
const unsupported = () => methodNotAllowed(['POST'])

export const Route = createFileRoute('/api/v1/market-operations/list')({
  server: { handlers: { POST: ({ request }) => handleMarketOperationListRequest(request), GET: unsupported, PUT: unsupported, PATCH: unsupported, DELETE: unsupported, HEAD: unsupported, OPTIONS: unsupported, TRACE: unsupported, CONNECT: unsupported } },
})

export async function handleMarketOperationListRequest(request: Request): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    let response: Response
    try {
      const parsed = await readOperationReadRequest(request, MAX_OPERATION_LIST_BODY_BYTES, operationListInputSchema)
      response = !parsed.ok ? parsed.response : await withHttpRateLimit(request, 'public-read', async () => {
        const result = operationChoiceListOutputSchema.safeParse(await registryOperationsListAction.run({
          data: parsed.data,
          context: { caller: 'http', request },
        }))
        return result.success
          ? Response.json(result.data, { headers: { 'Cache-Control': 'no-store' } })
          : problem({ status: 503, kind: 'INTERNAL', code: 'operation_read_result_invalid' })
      })
    } catch {
      response = operationReadUnavailableResponse()
    }
    return withRequestCorrelationHeader(response, correlationId)
  })
}
