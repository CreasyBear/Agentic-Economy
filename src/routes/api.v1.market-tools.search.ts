import { createFileRoute } from '@tanstack/react-router'

import { methodNotAllowed } from '@/lib/server/method-guard'
import { toolReadUnavailableResponse } from '@/lib/server/tool-read-problem'
import { publicToolReadCacheControl, readToolReadRequest } from '@/lib/server/tool-read-request'
import { problem } from '@/lib/server/problem'
import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import { InvalidOpaqueCursorError } from '@/modules/registry/opaque-cursor'
import { registryToolsSearchAction } from '@/modules/registry/tools.actions'
import { toolCatalogSearchInputSchema, toolChoiceSearchOutputSchema } from '@/modules/registry/tool-choice-contracts'

const MAX_TOOL_SEARCH_BODY_BYTES = 16 * 1024

export const Route = createFileRoute('/api/v1/market-tools/search')({
  server: {
    handlers: {
      POST: ({ request }) => handleMarketToolSearchRequest(request),
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

export async function handleMarketToolSearchRequest(request: Request): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    let response: Response
    try {
      const parsed = await readToolReadRequest(request, MAX_TOOL_SEARCH_BODY_BYTES, toolCatalogSearchInputSchema)
      response = !parsed.ok ? parsed.response : await withHttpRateLimit(request, 'public-read', async () => {
        const result = toolChoiceSearchOutputSchema.safeParse(await registryToolsSearchAction.run({
          data: parsed.data,
          context: { caller: 'http', request },
        }))
        if (!result.success) return problem({ status: 503, kind: 'INTERNAL', code: 'tool_read_result_invalid', detail: 'The tool catalogue result failed its own output contract.' })
        return Response.json(result.data, { headers: { 'Cache-Control': publicToolReadCacheControl(result.data) } })
      })
    } catch (error) {
      response = error instanceof InvalidOpaqueCursorError
        ? problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_cursor', detail: error.message })
        : toolReadUnavailableResponse()
    }
    return withRequestCorrelationHeader(response, correlationId)
  })
}
