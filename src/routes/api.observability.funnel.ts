import { createFileRoute } from '@tanstack/react-router'
import { readBoundedRequestJson } from '@/lib/server/bounded-request-body'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { problem } from '@/lib/server/problem'

import { recordOwnerActivationThroughSource, recordFunnelEventSchema } from '@/modules/observability/funnel.functions'
import { shouldDropPublicFunnelSourceSync } from '@/modules/observability/source-sync-gate'

export const Route = createFileRoute('/api/observability/funnel')({
  server: {
    handlers: {
      POST: ({ request }) => handleRecordOwnerActivationEvent(request),
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

const MAX_PUBLIC_FUNNEL_BODY_BYTES = 16 * 1024

export async function handleRecordOwnerActivationEvent(request: Request): Promise<Response> {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return problem({ status: 415, kind: 'UNSUPPORTED_MEDIA_TYPE', code: 'invalid_content_type', detail: 'invalid_content_type' })
  }

  const boundedBody = await readBoundedRequestJson(request, MAX_PUBLIC_FUNNEL_BODY_BYTES)
  if (!boundedBody.ok) {
    return problem({
      status: boundedBody.code === 'payload_too_large' ? 413 : 400,
      kind: boundedBody.code === 'payload_too_large' ? 'PAYLOAD_TOO_LARGE' : 'INVALID_ARGUMENT',
      code: boundedBody.code,
      detail: boundedBody.code,
    })
  }

  const parsed = recordFunnelEventSchema.safeParse(boundedBody.value)
  if (!parsed.success) {
    return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_body' })
  }

  if (isPublicFunnelSourceSyncDisabled()) {
    return jsonResponse({ ok: true })
  }

  const eventType = readStringField(boundedBody.value, 'eventType')
  if (eventType !== undefined && shouldDropPublicFunnelSourceSync(eventType)) {
    return jsonResponse({ ok: true })
  }

  try {
    await recordOwnerActivationThroughSource(parsed.data)
    return jsonResponse({ ok: true })
  } catch (error) {
    const { captureServerException } = await import('@/lib/observability/sentry.server')
    captureServerException(error, { 'ae.operation': 'owner_activation_sync' })
    return problem({ status: 500, kind: 'INTERNAL', code: 'record_failed', detail: 'record_failed' })
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
