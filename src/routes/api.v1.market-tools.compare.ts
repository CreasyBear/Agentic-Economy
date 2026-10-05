import { createFileRoute } from '@tanstack/react-router'
import type { z } from 'zod'

import { degrade } from '@/lib/observability/degrade'
import { executeCorrelatedJsonRoute, postOnlyRoute } from '@/lib/server/gateway-json-route'
import { toolReadUnavailableResponse } from '@/lib/server/tool-read-problem'
import { readToolReadRequest } from '@/lib/server/tool-read-request'
import { problem } from '@/lib/server/problem'
import { registryToolsCompareAction } from '@/modules/registry/tools.actions'
import { toolChoiceCompareOutputSchema, toolCatalogCompareInputSchema as toolCompareInputSchema } from '@/modules/registry/tool-choice-contracts'

const MAX_TOOL_COMPARE_BODY_BYTES = 8 * 1024

export const Route = createFileRoute('/api/v1/market-tools/compare')({
  server: {
    handlers: postOnlyRoute((request) => handleMarketToolCompareRequest(request)),
  },
})

export async function handleMarketToolCompareRequest(request: Request): Promise<Response> {
  let parsedData: z.infer<typeof toolCompareInputSchema>
  return await executeCorrelatedJsonRoute(
    request,
    'public-read',
    async () => {
      const result = toolChoiceCompareOutputSchema.safeParse(await registryToolsCompareAction.run({
        data: parsedData,
        context: { caller: 'http', request },
      }))
      if (!result.success) return problem({ status: 503, kind: 'INTERNAL', code: 'tool_read_result_invalid' })
      return Response.json(result.data, { headers: { 'Cache-Control': 'no-store' } })
    },
    (cause) => degrade(cause, toolReadUnavailableResponse(), {
      site: 'handleMarketToolCompareRequest',
      reason: 'source_unavailable',
    }),
    async () => {
      const parsed = await readToolReadRequest(request, MAX_TOOL_COMPARE_BODY_BYTES, toolCompareInputSchema)
      if (!parsed.ok) return parsed.response
      parsedData = parsed.data
      return null
    },
  )
}
