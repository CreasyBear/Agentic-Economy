import { createFileRoute } from '@tanstack/react-router'

import { normalizeClientError, clientErrorPayloadSchema } from '@/lib/observability/client-error'
import { readObservabilityServerConfig } from '@/lib/observability/config'
import { assertHttpAdmission, rateLimitedResponse } from '@/lib/server/rate-limit'
import { readBoundedRequestJson } from '@/lib/server/bounded-request-body'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { problem } from '@/lib/server/problem'
import type { RequestCorrelation } from '@/lib/server/request-correlation'

const MAX_CLIENT_ERROR_BODY_BYTES = 16 * 1024

export const Route = createFileRoute('/api/observability/client-error')({
  server: {
    handlers: {
      POST: ({ request }) => handleClientErrorRequest(request),
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

export async function handleClientErrorRequest(request: Request): Promise<Response> {
  const [
    { runWithRequestCorrelation, withRequestCorrelationHeader },
    { captureClientError, captureServerException },
  ] = await Promise.all([
    import('@/lib/server/request-correlation'),
    import('@/lib/observability/sentry.server'),
  ])
  return await runWithRequestCorrelation(request, async ({ correlationId }: RequestCorrelation) => {
    const config = readObservabilityServerConfig()
    if (!config.enabled || config.sentryDsn === undefined) {
      return withRequestCorrelationHeader(noContentResponse(), correlationId)
    }

    let admission
    try {
      admission = await assertHttpAdmission(request, 'public-mutation', { keySuffix: 'client-error' })
    } catch (error) {
      captureServerException(error, { 'ae.operation': 'client_error_rate_limit' })
      return withRequestCorrelationHeader(
        problem({
          status: 503,
          kind: 'UNAVAILABLE',
          code: 'client_error_rate_limit_unavailable',
          retryable: true,
          detail: 'Client diagnostics are temporarily unavailable.',
        }),
        correlationId,
      )
    }
    if (!admission.ok) return withRequestCorrelationHeader(rateLimitedResponse(admission.retryAfter), correlationId)

    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return withRequestCorrelationHeader(
        problem({ status: 415, kind: 'UNSUPPORTED_MEDIA_TYPE', code: 'invalid_content_type' }),
        correlationId,
      )
    }

    const boundedBody = await readBoundedRequestJson(request, MAX_CLIENT_ERROR_BODY_BYTES)
    if (!boundedBody.ok) {
      return withRequestCorrelationHeader(
        problem({
          status: boundedBody.code === 'payload_too_large' ? 413 : 400,
          kind: boundedBody.code === 'payload_too_large' ? 'PAYLOAD_TOO_LARGE' : 'INVALID_ARGUMENT',
          code: boundedBody.code,
        }),
        correlationId,
      )
    }

    const parsed = clientErrorPayloadSchema.safeParse(boundedBody.value)
    if (!parsed.success) {
      return withRequestCorrelationHeader(
        problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_body' }),
        correlationId,
      )
    }

    captureClientError(normalizeClientError(parsed.data))
    return withRequestCorrelationHeader(noContentResponse(), correlationId)
  })
}

function noContentResponse(): Response {
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
