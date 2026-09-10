import { verifyWebhook } from '@clerk/tanstack-react-start/webhooks'

import { kindForStatus } from '@/lib/errors'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { response as jsonResponse } from '@/lib/server/no-store-response'
import { problem } from '@/lib/server/problem'
import { readTrimmedEnv } from '@/lib/server/read-trimmed-env'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { clerkUserProviderIdentifier } from '@/modules/principal-account/external-identity/public'
import {
  recordClerkSecurityObservationThroughSource,
} from '@/modules/security/account-security.functions'
import type {
  ClerkSecurityObservation,
  ClerkSecurityObservationResult,
} from '@/modules/security/account-security'

const MAX_CLERK_WEBHOOK_BODY_BYTES = 256 * 1024
const RETRY_AFTER_SECONDS = 5

type VerifiedWebhookEvent = Readonly<{
  type: string
  object: string
  data: unknown
  event_attributes?: unknown
}>
type WebhookVerifier = (request: Request) => Promise<VerifiedWebhookEvent>
type ObservationApplier = (command: ClerkSecurityObservation) => Promise<ClerkSecurityObservationResult>

export async function handleClerkSecurityWebhookRequest(
  request: Request,
  dependencies: Readonly<{
    verify?: WebhookVerifier
    apply?: ObservationApplier
    issuer?: string
  }> = {},
): Promise<Response> {
  const declaredContentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredContentLength) && declaredContentLength > MAX_CLERK_WEBHOOK_BODY_BYTES) {
    return problem({ status: 413, kind: kindForStatus(413), code: 'request_too_large', detail: 'request_too_large' })
  }
  const bounded = await readBoundedRequestText(request.clone(), MAX_CLERK_WEBHOOK_BODY_BYTES)
  if (!bounded.ok) {
    return problem({ status: 413, kind: kindForStatus(413), code: 'request_too_large', detail: 'request_too_large' })
  }

  let verified: unknown
  try {
    verified = await (dependencies.verify ?? verifyWebhook)(request)
  } catch {
    return problem({ status: 400, kind: kindForStatus(400), code: 'clerk_webhook_invalid', detail: 'clerk_webhook_invalid' })
  }

  const event = redactedObservationFromVerifiedEvent({
    event: verified,
    deliveryRef: request.headers.get('svix-id'),
    issuer: dependencies.issuer ?? readTrimmedEnv(process.env, 'CLERK_JWT_ISSUER_DOMAIN'),
  })
  if (event.kind === 'ignored') {
    return jsonResponse({ kind: 'accepted', status: 'ignored' }, 200)
  }
  if (event.kind === 'invalid') {
    return problem({ status: 400, kind: kindForStatus(400), code: 'clerk_webhook_invalid', detail: 'clerk_webhook_invalid' })
  }

  let applied: ClerkSecurityObservationResult
  try {
    applied = await (dependencies.apply ?? recordClerkSecurityObservationThroughSource)(event.command)
  } catch {
    return problem(
      { status: 503, kind: kindForStatus(503), code: 'security_history_unavailable', detail: 'security_history_unavailable' },
      { 'Retry-After': String(RETRY_AFTER_SECONDS) },
    )
  }
  if (applied.kind === 'refused') {
    const retryable = applied.code === 'authentication_required'
    const status = retryable ? 503 : 409
    return problem(
      { status, kind: kindForStatus(status), code: applied.code, detail: applied.code },
      retryable ? { 'Retry-After': String(RETRY_AFTER_SECONDS) } : {},
    )
  }
  return jsonResponse({
    kind: 'accepted',
    status: applied.status,
    ...(applied.eventRef === undefined ? {} : { eventRef: applied.eventRef }),
  }, 200)
}

type ObservationProjection =
  | Readonly<{ kind: 'accepted'; command: ClerkSecurityObservation }>
  | Readonly<{ kind: 'ignored' }>
  | Readonly<{ kind: 'invalid' }>

function redactedObservationFromVerifiedEvent(input: Readonly<{
  event: unknown
  deliveryRef: string | null
  issuer: string | undefined
}>): ObservationProjection {
  if (!isRecord(input.event) || typeof input.event.type !== 'string') return { kind: 'invalid' }
  if (input.event.type === 'session.removed' || !supportedEventType(input.event.type)) {
    return { kind: 'ignored' }
  }
  if (input.deliveryRef === null || input.deliveryRef.trim().length === 0 || input.deliveryRef.length > 300) {
    return { kind: 'invalid' }
  }
  if (!isRecord(input.event.data)) return { kind: 'invalid' }

  const data = input.event.data
  const subject = input.event.type === 'user.updated' ? data.id : data.user_id
  const targetRef = data.id
  const observedAt = input.event.type === 'session.created' ? data.created_at : data.updated_at
  if (typeof subject !== 'string' || typeof targetRef !== 'string'
    || !Number.isSafeInteger(observedAt) || (observedAt as number) < 0) {
    return { kind: 'invalid' }
  }
  const providerIdentifier = clerkUserProviderIdentifier(input.issuer, subject)
  if (providerIdentifier === undefined) return { kind: 'invalid' }

  return {
    kind: 'accepted',
    command: {
      deliveryRefHash: canonicalDigest({
        contract: 'ae.clerk-webhook-delivery:v1',
        deliveryRef: input.deliveryRef,
      }),
      providerIdentifier,
      eventType: input.event.type,
      targetRefHash: canonicalDigest({
        contract: 'ae.clerk-webhook-target:v1',
        provider: 'clerk',
        targetKind: input.event.type === 'user.updated' ? 'security_profile' : 'session',
        targetRef,
      }),
      observedAt: observedAt as number,
    },
  }
}

function supportedEventType(value: string): value is ClerkSecurityObservation['eventType'] {
  return value === 'session.created'
    || value === 'session.ended'
    || value === 'session.revoked'
    || value === 'user.updated'
}
