import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { assertHttpAdmission, rateLimitedResponse } from '@/lib/server/rate-limit'
import { readBoundedRequestJson } from '@/lib/server/bounded-request-body'
import { methodNotAllowed } from '@/lib/server/method-guard'
import { problem } from '@/lib/server/problem'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import type { RequestCorrelation } from '@/lib/server/request-correlation'

/*
 * This is AEcon's own sandbox counterparty for the seeded `ae_envelope`
 * reference Tool (`sandbox-aecon-reference` in convex/devSeed.ts). It exists
 * so the capability's readiness probe and Calls have a real endpoint to hit
 * instead of the fixture's placeholder `sandbox.aecon-reference.example`
 * host. It is served as public HTTPS on hosted origins; on loopback (local
 * dev) the readiness probe cannot reach it by design, because the probe's
 * SSRF guard refuses private/loopback targets — see D9 in the Wells 1+2
 * plan. The response is a pure deterministic function of the request body
 * with no state and no credential, and this route does not verify AE-Call
 * signatures: it is a public counterparty, not an authenticated provider.
 */

const MAX_SANDBOX_REFERENCE_BODY_BYTES = 16 * 1024

const sandboxReferenceRequestSchema = z.strictObject({
  request: z.string().optional(),
})

export const Route = createFileRoute('/api/v1/sandbox-reference')({
  server: {
    handlers: {
      POST: ({ request }) => handleSandboxReferenceRequest(request),
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

export async function handleSandboxReferenceRequest(request: Request): Promise<Response> {
  return await runWithRequestCorrelation(request, async ({ correlationId }: RequestCorrelation) => {
    const admission = await assertHttpAdmission(request, 'public-mutation', { keySuffix: 'sandbox-reference' })
    if (!admission.ok) return withRequestCorrelationHeader(rateLimitedResponse(admission.retryAfter), correlationId)

    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      return withRequestCorrelationHeader(
        problem({ status: 415, kind: 'UNSUPPORTED_MEDIA_TYPE', code: 'invalid_content_type' }),
        correlationId,
      )
    }

    const boundedBody = await readBoundedRequestJson(request, MAX_SANDBOX_REFERENCE_BODY_BYTES)
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

    const parsed = sandboxReferenceRequestSchema.safeParse(boundedBody.value)
    if (!parsed.success) {
      return withRequestCorrelationHeader(
        problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_body' }),
        correlationId,
      )
    }

    const digest = canonicalDigest(parsed.data.request ?? '')
    const result = `sandbox-reference:${digest.slice('sha256:'.length).slice(0, 16)}`
    return withRequestCorrelationHeader(
      Response.json({ result }, { headers: { 'Cache-Control': 'no-store' } }),
      correlationId,
    )
  })
}
