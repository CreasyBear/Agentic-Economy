import { createFileRoute } from '@tanstack/react-router'

import { methodNotAllowed } from '@/lib/server/method-guard'
import { toolReadUnavailableResponse } from '@/lib/server/tool-read-problem'
import { readToolReadRequest } from '@/lib/server/tool-read-request'
import { problem } from '@/lib/server/problem'
import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import {
  toolCompareInputSchema,
} from '@/modules/capability-supply/public'
import { registryToolsCompareAction } from '@/modules/registry/tools.actions'
import { toolChoiceCompareOutputSchema } from '@/modules/registry/tool-choice-contracts'

const MAX_TOOL_COMPARE_BODY_BYTES = 8 * 1024

export const Route = createFileRoute('/api/v1/market-tools/compare')({
  server: {
    handlers: {
      POST: ({ request }) => handleMarketToolCompareRequest(request),
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

export async function handleMarketToolCompareRequest(request: Request): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    let response: Response
    try {
      const parsed = await readToolReadRequest(request, MAX_TOOL_COMPARE_BODY_BYTES, toolCompareInputSchema)
      response = !parsed.ok ? parsed.response : await withHttpRateLimit(request, 'public-read', async () => {
        const result = toolChoiceCompareOutputSchema.safeParse(await registryToolsCompareAction.run({
          data: parsed.data,
          context: { caller: 'http', request },
        }))
        if (!result.success) return problem({ status: 503, kind: 'INTERNAL', code: 'tool_read_result_invalid' })
        return Response.json(result.data, { headers: { 'Cache-Control': 'no-store' } })
      })
    } catch {
      response = toolReadUnavailableResponse()
    }
    return withRequestCorrelationHeader(response, correlationId)
  })
}
