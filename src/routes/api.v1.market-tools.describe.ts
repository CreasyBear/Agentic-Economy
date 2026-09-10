import { createFileRoute } from '@tanstack/react-router'

import { methodNotAllowed } from '@/lib/server/method-guard'
import { toolReadUnavailableResponse } from '@/lib/server/tool-read-problem'
import { readToolReadRequest } from '@/lib/server/tool-read-request'
import { problem } from '@/lib/server/problem'
import { withHttpRateLimit } from '@/lib/server/rate-limit'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import { registryToolsDescribeAction } from '@/modules/registry/tools.actions'
import { toolChoiceDescribeOutputSchema, toolDescribeInputSchema } from '@/modules/registry/tool-choice-contracts'

const MAX_TOOL_DESCRIBE_BODY_BYTES = 4 * 1024
const unsupported = () => methodNotAllowed(['POST'])

export const Route = createFileRoute('/api/v1/market-tools/describe')({
  server: { handlers: { POST: ({ request }) => handleMarketToolDescribeRequest(request), GET: unsupported, PUT: unsupported, PATCH: unsupported, DELETE: unsupported, HEAD: unsupported, OPTIONS: unsupported, TRACE: unsupported, CONNECT: unsupported } },
})

export async function handleMarketToolDescribeRequest(request: Request): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }) => {
    let response: Response
    try {
      const parsed = await readToolReadRequest(request, MAX_TOOL_DESCRIBE_BODY_BYTES, toolDescribeInputSchema)
      response = !parsed.ok ? parsed.response : await withHttpRateLimit(request, 'public-read', async () => {
        const result = toolChoiceDescribeOutputSchema.safeParse(await registryToolsDescribeAction.run({
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
