import { createFileRoute } from '@tanstack/react-router'
import type { z } from 'zod'

import { executeCorrelatedJsonRoute, postOnlyRoute } from '@/lib/server/gateway-json-route'
import { toolReadUnavailableResponse } from '@/lib/server/tool-read-problem'
import { publicToolReadCacheControl, readToolReadRequest } from '@/lib/server/tool-read-request'
import { problem } from '@/lib/server/problem'
import { InvalidOpaqueCursorError } from '@/modules/registry/opaque-cursor'
import { registryToolsListAction } from '@/modules/registry/tools.actions'
import { toolChoiceListOutputSchema, toolListInputSchema } from '@/modules/registry/tool-choice-contracts'

const MAX_TOOL_LIST_BODY_BYTES = 16 * 1024

export const Route = createFileRoute('/api/v1/market-tools/list')({
  server: { handlers: postOnlyRoute((request) => handleMarketToolListRequest(request)) },
})

export async function handleMarketToolListRequest(request: Request): Promise<Response> {
  let parsedData: z.infer<typeof toolListInputSchema>
  return await executeCorrelatedJsonRoute(
    request,
    'public-read',
    async () => {
      const result = toolChoiceListOutputSchema.safeParse(await registryToolsListAction.run({
        data: parsedData,
        context: { caller: 'http', request },
      }))
      return result.success
        ? Response.json(result.data, { headers: { 'Cache-Control': publicToolReadCacheControl(result.data) } })
        : problem({ status: 503, kind: 'INTERNAL', code: 'tool_read_result_invalid', detail: 'The tool catalogue result failed its own output contract.' })
    },
    (error) => error instanceof InvalidOpaqueCursorError
      ? problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_cursor', detail: error.message })
      : toolReadUnavailableResponse(),
    async () => {
      const parsed = await readToolReadRequest(request, MAX_TOOL_LIST_BODY_BYTES, toolListInputSchema)
      if (!parsed.ok) return parsed.response
      parsedData = parsed.data
      return null
    },
  )
}
