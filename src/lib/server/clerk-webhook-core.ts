import { verifyWebhook } from '@clerk/tanstack-react-start/webhooks'

import { kindForStatus } from '@/lib/errors'
import { degrade } from '@/lib/observability/degrade'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { response as jsonResponse } from '@/lib/server/no-store-response'
import { problem } from '@/lib/server/problem'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'

export const MAX_CLERK_WEBHOOK_BODY_BYTES = 256 * 1024
export const CLERK_WEBHOOK_RETRY_AFTER_SECONDS = 5

export type VerifiedClerkWebhook = Readonly<{
  event: unknown
  deliveryRef: string | null
}>

export type ClerkWebhookVerifier = (request: Request) => Promise<unknown>

export type ClerkWebhookVerificationResult =
  | Readonly<{ kind: 'verified'; webhook: VerifiedClerkWebhook }>
  | Readonly<{ kind: 'rejected'; response: Response }>

export async function verifyClerkWebhookRequest(
  request: Request,
  verify: ClerkWebhookVerifier = verifyWebhook,
): Promise<ClerkWebhookVerificationResult> {
  const bounded = await readBoundedRequestText(request, MAX_CLERK_WEBHOOK_BODY_BYTES)
  if (!bounded.ok) {
    return {
      kind: 'rejected',
      response: clerkWebhookProblem(413, 'request_too_large'),
    }
  }

  try {
    // A cloned body is a tee branch whose cancel() never settles until the sibling is read, so the
    // body is consumed once under the cap and the verifier reads the same bytes from a fresh Request.
    const event = await verify(new Request(request.url, { method: request.method, headers: request.headers, body: bounded.text }))
    return {
      kind: 'verified',
      webhook: {
        event,
        deliveryRef: request.headers.get('svix-id'),
      },
    }
  } catch (cause) {
    return {
      kind: 'rejected',
      response: degrade(
        safeClerkWebhookError(cause),
        clerkWebhookProblem(400, 'clerk_webhook_invalid'),
        { site: 'verifyClerkWebhookRequest', reason: 'forbidden' },
      ),
    }
  }
}
export function clerkWebhookFailureResponse(
  cause: unknown,
  site: string,
  code: string,
): Response {
  return degrade(
    safeClerkWebhookError(cause),
    clerkWebhookProblem(503, code, CLERK_WEBHOOK_RETRY_AFTER_SECONDS),
    { site, reason: 'source_unavailable' },
  )
}


export function clerkWebhookProblem(
  status: 400 | 409 | 413 | 503,
  code: string,
  retryAfterSeconds?: number,
): Response {
  return problem(
    { status, kind: kindForStatus(status), code, detail: code },
    {
      ...(retryAfterSeconds === undefined ? {} : { 'Retry-After': String(retryAfterSeconds) }),
      // The unread remainder of a rejected upload must not be parsed as the next request on this socket.
      ...(status === 413 ? { Connection: 'close' } : {}),
    },
  )
}

export function clerkWebhookIgnoredResponse(): Response {
  return jsonResponse({ kind: 'accepted', status: 'ignored' }, 200)
}

export function clerkWebhookDeliveryRefHash(deliveryRef: string): string {
  return canonicalDigest({
    contract: 'ae.clerk-webhook-delivery:v1',
    deliveryRef,
  })
}

export function isValidClerkWebhookDeliveryRef(deliveryRef: string | null): deliveryRef is string {
  return deliveryRef !== null
    && deliveryRef.trim().length > 0
    && deliveryRef.length <= 300
}

export function safeClerkWebhookError(cause: unknown): Error {
  const name = cause instanceof Error && /^[A-Za-z][A-Za-z0-9]{0,31}$/u.test(cause.name)
    ? cause.name
    : 'Error'
  const code = isRecord(cause) && typeof cause.code === 'string' && /^[a-z][a-z0-9_]{0,63}$/u.test(cause.code)
    ? cause.code
    : isRecord(cause) && isRecord(cause.data) && typeof cause.data.code === 'string'
      && /^[a-z][a-z0-9_]{0,63}$/u.test(cause.data.code)
      ? cause.data.code
      : undefined
  const sanitized = new Error(code === undefined ? `Clerk webhook failed (${name})` : `Clerk webhook failed (${code})`)
  sanitized.name = name
  return sanitized
}
