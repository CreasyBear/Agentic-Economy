import { degrade } from '@/lib/observability/degrade'
import { readTrimmedEnv } from '@/lib/server/read-trimmed-env'
import {
  CLERK_WEBHOOK_RETRY_AFTER_SECONDS,
  clerkWebhookDeliveryRefHash,
  clerkWebhookIgnoredResponse,
  clerkWebhookProblem,
  isValidClerkWebhookDeliveryRef,
  safeClerkWebhookError,
  type VerifiedClerkWebhook,
} from '@/lib/server/clerk-webhook-core'
import { response as jsonResponse } from '@/lib/server/no-store-response'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { clerkUserProviderIdentifier } from '@/modules/principal-account/external-identity/public'
import { recordClerkSecurityObservationThroughSource } from '@/modules/security/account-security.functions'
import type {
  ClerkSecurityAction,
  ClerkSecurityObservation,
  ClerkSecurityObservationResult,
} from '@/modules/security/account-security'

type ObservationApplier = (command: ClerkSecurityObservation) => Promise<ClerkSecurityObservationResult>

export type SecurityWebhookDependencies = Readonly<{
  apply?: ObservationApplier
  issuer?: string
}>

export async function handleClerkSecurityWebhookRequest(
  webhook: VerifiedClerkWebhook,
  dependencies: SecurityWebhookDependencies = {},
): Promise<Response> {
  const event = redactedObservationFromVerifiedEvent({
    event: webhook.event,
    deliveryRef: webhook.deliveryRef,
    issuer: dependencies.issuer ?? readTrimmedEnv(process.env, 'CLERK_JWT_ISSUER_DOMAIN'),
  })
  if (event.kind === 'ignored') return clerkWebhookIgnoredResponse()
  if (event.kind === 'invalid') return clerkWebhookProblem(400, 'clerk_webhook_invalid')

  let applied: ClerkSecurityObservationResult
  try {
    applied = await (dependencies.apply ?? recordClerkSecurityObservationThroughSource)(event.command)
  } catch (cause) {
    return degrade(
      safeClerkWebhookError(cause),
      clerkWebhookProblem(503, 'security_history_unavailable', CLERK_WEBHOOK_RETRY_AFTER_SECONDS),
      { site: 'handleClerkSecurityWebhookRequest', reason: 'source_unavailable' },
    )
  }
  if (applied.kind === 'refused') {
    const retryable = applied.code === 'authentication_required'
    return clerkWebhookProblem(
      retryable ? 503 : 409,
      applied.code,
      retryable ? CLERK_WEBHOOK_RETRY_AFTER_SECONDS : undefined,
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
  if (!isValidClerkWebhookDeliveryRef(input.deliveryRef)) return { kind: 'invalid' }
  if (!isRecord(input.event.data)) return { kind: 'invalid' }

  if (input.event.type === 'user.deleted') {
    return redactedUserDeletedObservation({
      event: input.event,
      deliveryRef: input.deliveryRef,
      issuer: input.issuer,
    })
  }

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

  const observedAtMs = observedAt as number
  let securityAction: ClerkSecurityAction
  if (input.event.type === 'session.revoked') {
    securityAction = 'revoke_interactive_credentials'
  } else if (input.event.type === 'user.updated') {
    const passwordLastUpdatedAt = data.password_last_updated_at
    securityAction = typeof passwordLastUpdatedAt === 'number'
      && Math.abs(passwordLastUpdatedAt - observedAtMs) <= 1_000
      ? 'revoke_interactive_credentials'
      : 'observe_only'
  } else {
    securityAction = 'observe_only'
  }

  let profileDisplayName: string | undefined
  if (input.event.type === 'user.updated') {
    const firstName = typeof data.first_name === 'string' ? data.first_name.trim() : ''
    const lastName = typeof data.last_name === 'string' ? data.last_name.trim() : ''
    const joined = [firstName, lastName].filter(Boolean).join(' ')
    const username = typeof data.username === 'string' ? data.username.trim() : ''
    const candidate = (joined || username).trim()
    if (
      candidate.length > 0
      && candidate.length <= 200
      && /^[\p{L}\p{N}\p{P}\p{S}\p{Zs}]+$/u.test(candidate)
    ) {
      profileDisplayName = candidate
    }
  }

  let primaryEmailDigest: string | undefined
  let otherEmailAddresses: string[] | undefined
  if (input.event.type === 'user.updated' && Array.isArray(data.email_addresses)) {
    const primary = data.email_addresses.find((row: unknown) => isRecord(row) && row.id === data.primary_email_address_id)
    if (isRecord(primary) && typeof primary.email_address === 'string' && primary.email_address.length > 0) {
      primaryEmailDigest = canonicalDigest({ contract: 'ae.clerk-primary-email:v1', email: primary.email_address.trim().toLowerCase() })
      otherEmailAddresses = data.email_addresses
        .filter((row: unknown): row is Record<string, unknown> => isRecord(row) && row.id !== data.primary_email_address_id && typeof row.email_address === 'string' && row.email_address.length > 0)
        .map((row) => (row.email_address as string).trim().toLowerCase()).slice(0, 10)
    }
  }

  return {
    kind: 'accepted',
    command: {
      deliveryRefHash: clerkWebhookDeliveryRefHash(input.deliveryRef),
      providerIdentifier,
      eventType: input.event.type,
      targetRefHash: canonicalDigest({
        contract: 'ae.clerk-webhook-target:v1',
        provider: 'clerk',
        targetKind: input.event.type === 'user.updated' ? 'security_profile' : 'session',
        targetRef,
      }),
      observedAt: observedAtMs,
      securityAction,
      ...(profileDisplayName === undefined ? {} : { profileDisplayName }),
      ...(primaryEmailDigest === undefined ? {} : { primaryEmailDigest }),
      ...(otherEmailAddresses === undefined || otherEmailAddresses.length === 0 ? {} : { otherEmailAddresses }),
    },
  }
}

function supportedEventType(value: string): value is ClerkSecurityObservation['eventType'] {
  return value === 'session.created'
    || value === 'session.ended'
    || value === 'session.revoked'
    || value === 'user.updated'
    || value === 'user.deleted'
}

function redactedUserDeletedObservation(input: Readonly<{
  event: Record<string, unknown>
  deliveryRef: string
  issuer: string | undefined
}>): ObservationProjection {
  if (!isRecord(input.event.data)) return { kind: 'invalid' }
  const data = input.event.data
  if (data.deleted !== true || typeof data.id !== 'string' || data.id.length === 0) {
    return { kind: 'invalid' }
  }
  const observedAt = input.event.timestamp
  if (!Number.isSafeInteger(observedAt) || (observedAt as number) <= 0) {
    return { kind: 'invalid' }
  }
  const providerIdentifier = clerkUserProviderIdentifier(input.issuer, data.id)
  if (providerIdentifier === undefined) return { kind: 'invalid' }

  return {
    kind: 'accepted',
    command: {
      deliveryRefHash: clerkWebhookDeliveryRefHash(input.deliveryRef),
      providerIdentifier,
      eventType: 'user.deleted',
      targetRefHash: canonicalDigest({
        contract: 'ae.clerk-webhook-target:v1',
        provider: 'clerk',
        targetKind: 'user_deletion',
        targetRef: data.id,
      }),
      observedAt: observedAt as number,
      securityAction: 'retire_personal_account',
    },
  }
}
