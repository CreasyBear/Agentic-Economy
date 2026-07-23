import { createFileRoute } from '@tanstack/react-router'

import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { comparisonCompareAction } from '@/modules/comparison/comparison.actions'
import { actionToHarnessTool, runHarnessTool } from '@/modules/harness/public'

const MAX_COMPARE_BODY_BYTES = 16 * 1024

export const Route = createFileRoute('/api/compare')({
  server: {
    handlers: {
      POST: ({ request }) => handleCompareRequest(request),
    },
  },
})

export async function handleCompareRequest(request: Request): Promise<Response> {
  const boundedBody = await readBoundedRequestText(request, MAX_COMPARE_BODY_BYTES)
  if (!boundedBody.ok) {
    return json({ kind: 'error', code: 'comparison_payload_too_large' }, 413)
  }

  let body: unknown
  try {
    body = JSON.parse(boundedBody.text)
  } catch {
    return json({ kind: 'error', code: 'comparison_invalid_body' }, 400)
  }

  const parsed = comparisonCompareAction.schema.safeParse(body)
  if (!parsed.success) {
    return json({ kind: 'error', code: 'comparison_invalid_body' }, 400)
  }

  const outcome = await runHarnessTool({
    tool: actionToHarnessTool(comparisonCompareAction),
    input: parsed.data,
    context: { request },
    surface: 'agentJson',
    allowWrites: false,
  })
  if (outcome.result.status !== 'ok' || outcome.result.output === undefined) {
    return json({ kind: 'error', code: 'comparison_unavailable' }, 503)
  }

  const { kind: _transportKind, ...comparison } = outcome.result.output as {
    kind: 'comparison'
    schemaVersion: 'offering-comparison:v1'
  } & Record<string, unknown>
  return json(comparison, 200)
}

function json(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}
