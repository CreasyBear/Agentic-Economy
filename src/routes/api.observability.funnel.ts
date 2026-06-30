import { createFileRoute } from '@tanstack/react-router'

import { recordOwnerActivationThroughSource, recordFunnelEventSchema } from '@/modules/observability/funnel.functions'

export const Route = createFileRoute('/api/observability/funnel')({
  server: {
    handlers: {
      POST: ({ request }) => handleRecordOwnerActivationEvent(request),
    },
  },
})

export async function handleRecordOwnerActivationEvent(request: Request): Promise<Response> {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return jsonResponse({ ok: false, reason: 'invalid_content_type' }, 415)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ ok: false, reason: 'invalid_json' }, 400)
  }

  try {
    const parsed = recordFunnelEventSchema.parse(body)
    if (parsed.businessId === undefined) {
      return jsonResponse({ ok: true, skipped: 'no_business_id' })
    }

    await recordOwnerActivationThroughSource(parsed)
    return jsonResponse({ ok: true })
  } catch (error) {
    const { captureServerException } = await import('@/lib/observability/sentry.server')
    captureServerException(error, { 'ae.operation': 'owner_activation_sync' })
    return jsonResponse({ ok: false, reason: 'record_failed' }, 500)
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
