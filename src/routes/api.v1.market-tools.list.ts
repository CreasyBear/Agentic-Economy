import { createFileRoute } from '@tanstack/react-router'

import { methodNotAllowed } from '@/lib/server/method-guard'
import { toolReadUnavailableResponse } from '@/lib/server/tool-read-problem'
import { readToolReadRequest } from '@/lib/server/tool-read-request'
import { problem } from '@/lib/server/problem'
import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import { registryToolsListAction } from '@/modules/registry/tools.actions'
import { toolChoiceListOutputSchema, toolListInputSchema } from '@/modules/registry/tool-choice-contracts'

const MAX_TOOL_LIST_BODY_BYTES = 16 * 1024
const unsupported = () => methodNotAllowed(['POST'])

export const Route = createFileRoute('/api/v1/market-tools/list')({
  server: { handlers: { POST: ({ request }) => handleMarketToolListRequest(request), GET: unsupported, PUT: unsupported, PATCH: unsupported, DELETE: unsupported, HEAD: unsupported, OPTIONS: unsupported, TRACE: unsupported, CONNECT: unsupported } },
})

export async function handleMarketToolListRequest(request: Request): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    let response: Response
    try {
      const parsed = await readToolReadRequest(request, MAX_TOOL_LIST_BODY_BYTES, toolListInputSchema)
      response = !parsed.ok ? parsed.response : await withHttpRateLimit(request, 'public-read', async () => {
        const result = toolChoiceListOutputSchema.safeParse(await registryToolsListAction.run({
          data: parsed.data,
          context: { caller: 'http', request },
        }))
        return result.success
          ? Response.json(result.data, { headers: { 'Cache-Control': 'no-store' } })
          : problem({ status: 503, kind: 'INTERNAL', code: 'tool_read_result_invalid' })
      })
    } catch {
      response = toolReadUnavailableResponse()
    }
    return withRequestCorrelationHeader(response, correlationId)
  })
}
