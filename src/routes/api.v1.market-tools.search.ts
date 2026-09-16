import { createFileRoute } from '@tanstack/react-router'
import type { z } from 'zod'

import { executeCorrelatedJsonRoute, postOnlyRoute } from '@/lib/server/gateway-json-route'
import { toolReadUnavailableResponse } from '@/lib/server/tool-read-problem'
import { publicToolReadCacheControl, readToolReadRequest } from '@/lib/server/tool-read-request'
import { problem } from '@/lib/server/problem'
import { InvalidOpaqueCursorError } from '@/modules/registry/opaque-cursor'
import { registryToolsSearchAction } from '@/modules/registry/tools.actions'
import { toolCatalogSearchInputSchema, toolChoiceSearchOutputSchema } from '@/modules/registry/tool-choice-contracts'

const MAX_TOOL_SEARCH_BODY_BYTES = 16 * 1024

export const Route = createFileRoute('/api/v1/market-tools/search')({
  server: {
    handlers: postOnlyRoute((request) => handleMarketToolSearchRequest(request)),
  },
})

export async function handleMarketToolSearchRequest(request: Request): Promise<Response> {
  let parsedData: z.infer<typeof toolCatalogSearchInputSchema>
  return await executeCorrelatedJsonRoute(
    request,
    'public-read',
    async () => {
      const result = toolChoiceSearchOutputSchema.safeParse(await registryToolsSearchAction.run({
        data: parsedData,
        context: { caller: 'http', request },
      }))
      if (!result.success) return problem({ status: 503, kind: 'INTERNAL', code: 'tool_read_result_invalid', detail: 'The tool catalogue result failed its own output contract.' })
      return Response.json(result.data, { headers: { 'Cache-Control': publicToolReadCacheControl(result.data) } })
    },
    (error) => error instanceof InvalidOpaqueCursorError
      ? problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_cursor', detail: error.message })
      : toolReadUnavailableResponse(),
    async () => {
      const parsed = await readToolReadRequest(request, MAX_TOOL_SEARCH_BODY_BYTES, toolCatalogSearchInputSchema)
      if (!parsed.ok) return parsed.response
      parsedData = parsed.data
      return null
    },
  )
}
