import { createFileRoute } from '@tanstack/react-router'
import type { z } from 'zod'

import { degrade } from '@/lib/observability/degrade'
import { executeCorrelatedJsonRoute, postOnlyRoute } from '@/lib/server/gateway-json-route'
import { toolReadUnavailableResponse } from '@/lib/server/tool-read-problem'
import { readToolReadRequest } from '@/lib/server/tool-read-request'
import { problem } from '@/lib/server/problem'
import { registryToolsDescribeAction } from '@/modules/registry/tools.actions'
import { toolChoiceDescribeOutputSchema, toolDescribeInputSchema } from '@/modules/registry/tool-choice-contracts'

const MAX_TOOL_DESCRIBE_BODY_BYTES = 4 * 1024

export const Route = createFileRoute('/api/v1/market-tools/describe')({
  server: { handlers: postOnlyRoute((request) => handleMarketToolDescribeRequest(request)) },
})

export async function handleMarketToolDescribeRequest(request: Request): Promise<Response> {
  let parsedData: z.infer<typeof toolDescribeInputSchema>
  return await executeCorrelatedJsonRoute(
    request,
    'public-read',
    async () => {
      const result = toolChoiceDescribeOutputSchema.safeParse(await registryToolsDescribeAction.run({
        data: parsedData,
        context: { caller: 'http', request },
      }))
      return result.success
        ? Response.json(result.data, { headers: { 'Cache-Control': 'no-store' } })
        : problem({ status: 503, kind: 'INTERNAL', code: 'tool_read_result_invalid' })
    },
    (cause) => degrade(cause, toolReadUnavailableResponse(), {
      site: 'handleMarketToolDescribeRequest',
      reason: 'source_unavailable',
    }),
    async () => {
      const parsed = await readToolReadRequest(request, MAX_TOOL_DESCRIBE_BODY_BYTES, toolDescribeInputSchema)
      if (!parsed.ok) return parsed.response
      parsedData = parsed.data
      return null
    },
  )
}
