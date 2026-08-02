import { createFileRoute } from '@tanstack/react-router'
import { readBoundedRequestJson } from '@/lib/server/bounded-request-body'

import { recordOwnerActivationThroughSource, recordFunnelEventSchema } from '@/modules/observability/funnel.functions'
import { shouldDropPublicFunnelSourceSync } from '@/modules/observability/source-sync-gate'

export const Route = createFileRoute('/api/observability/funnel')({
  server: {
    handlers: {
      POST: ({ request }) => handleRecordOwnerActivationEvent(request),
    },
  },
})

const MAX_PUBLIC_FUNNEL_BODY_BYTES = 16 * 1024

export async function handleRecordOwnerActivationEvent(request: Request): Promise<Response> {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return jsonResponse({ ok: false, reason: 'invalid_content_type' }, 415)
  }

  const boundedBody = await readBoundedRequestJson(request, MAX_PUBLIC_FUNNEL_BODY_BYTES)
  if (!boundedBody.ok) {
    return jsonResponse(
      { ok: false, reason: boundedBody.code },
      boundedBody.code === 'payload_too_large' ? 413 : 400,
    )
  }

  if (isPublicFunnelSourceSyncDisabled()) {
    return jsonResponse({ ok: true })
  }

  const eventType = readStringField(boundedBody.value, 'eventType')
  if (eventType !== undefined && shouldDropPublicFunnelSourceSync(eventType)) {
    return jsonResponse({ ok: true })
  }

  try {
    const parsed = recordFunnelEventSchema.parse(boundedBody.value)

    await recordOwnerActivationThroughSource(parsed)
    return jsonResponse({ ok: true })
  } catch (error) {
    const { captureServerException } = await import('@/lib/observability/sentry.server')
    captureServerException(error, { 'ae.operation': 'owner_activation_sync' })
    return jsonResponse({ ok: false, reason: 'record_failed' }, 500)
  }
}

function isPublicFunnelSourceSyncDisabled(): boolean {
  return process.env.AE_DISABLE_PUBLIC_FUNNEL_SOURCE_SYNC === 'true'
}

function readStringField(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }

  const field = (value as Record<string, unknown>)[key]
  return typeof field === 'string' ? field : undefined
}

function jsonResponse(payload: unknown, status = 200): Response {
  return Response.json(payload, { status })
}
