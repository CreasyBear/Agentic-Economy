import { verifyWebhook } from '@clerk/tanstack-react-start/webhooks'

import { kindForStatus } from '@/lib/errors'
import { degrade } from '@/lib/observability/degrade'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { response as jsonResponse } from '@/lib/server/no-store-response'
import { problem } from '@/lib/server/problem'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import {
  recordOrganizationInvitationCreatedThroughSource,
  recordOrganizationInvitationRevokedThroughSource,
} from '@/modules/workspace-invitation/organization-invitation-observation'
import type {
  OrganizationInvitationCreatedObservation,
  OrganizationInvitationCreatedObservationResult,
  OrganizationInvitationRevokedObservation,
  OrganizationInvitationRole,
} from '@/modules/workspace-invitation/organization-invitation-observation'

const MAX_CLERK_WEBHOOK_BODY_BYTES = 256 * 1024
const RETRY_AFTER_SECONDS = 5

type VerifiedWebhookEvent = Readonly<{
  type: string
  object: string
  data: unknown
  event_attributes?: unknown
}>

type WebhookVerifier = (request: Request) => Promise<VerifiedWebhookEvent>
type ObservationApplier = (
  command: OrganizationInvitationCreatedObservation,
) => Promise<OrganizationInvitationCreatedObservationResult>
type RevokedObservationApplier = (
  command: OrganizationInvitationRevokedObservation,
) => Promise<OrganizationInvitationCreatedObservationResult>

export type InvitationWebhookDependencies = Readonly<{
  verify?: WebhookVerifier
  apply?: ObservationApplier
  applyRevoked?: RevokedObservationApplier
  issuer?: string
}>

export async function handleClerkOrganizationInvitationWebhookRequest(
  request: Request,
  dependencies: InvitationWebhookDependencies = {},
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
  } catch (cause) {
    return degrade(cause, problem({ status: 400, kind: kindForStatus(400), code: 'clerk_webhook_invalid', detail: 'clerk_webhook_invalid' }), { site: 'handleClerkOrganizationInvitationWebhookRequest', reason: 'forbidden' })
  }

  const projection = invitationObservationFromVerifiedEvent({
    event: verified,
    deliveryRef: request.headers.get('svix-id'),
  })
  if (projection.kind === 'ignored') {
    return jsonResponse({ kind: 'accepted', status: 'ignored' }, 200)
  }
  if (projection.kind === 'invalid') {
    return problem({ status: 400, kind: kindForStatus(400), code: 'clerk_webhook_invalid', detail: 'clerk_webhook_invalid' })
  }

  let applied: OrganizationInvitationCreatedObservationResult
  try {
    if (projection.eventKind === 'revoked') {
      applied = await (dependencies.applyRevoked ?? recordOrganizationInvitationRevokedThroughSource)(
        projection.command,
      )
    } else {
      applied = await (dependencies.apply ?? recordOrganizationInvitationCreatedThroughSource)(projection.command)
    }
  } catch (cause) {
    return degrade(cause, problem(
      { status: 503, kind: kindForStatus(503), code: 'workspace_invitation_unavailable', detail: 'workspace_invitation_unavailable' },
      { 'Retry-After': String(RETRY_AFTER_SECONDS) },
    ), { site: 'handleClerkOrganizationInvitationWebhookRequest', reason: 'source_unavailable' })
  }
  if (applied.kind === 'refused') {
    return problem(
      { status: 409, kind: kindForStatus(409), code: applied.code, detail: applied.code },
    )
  }
  return jsonResponse({ kind: 'accepted', status: applied.status }, 200)
}

type ObservationProjection =
  | Readonly<{ kind: 'accepted'; eventKind: 'created'; command: OrganizationInvitationCreatedObservation }>
  | Readonly<{ kind: 'accepted'; eventKind: 'revoked'; command: OrganizationInvitationRevokedObservation }>
  | Readonly<{ kind: 'ignored' }>
  | Readonly<{ kind: 'invalid' }>

function invitationObservationFromVerifiedEvent(input: Readonly<{
  event: unknown
  deliveryRef: string | null
}>): ObservationProjection {
  if (!isRecord(input.event) || typeof input.event.type !== 'string') return { kind: 'invalid' }
  if (
    input.event.type === 'organizationInvitation.accepted'
    || input.event.type === 'session.removed'
    || input.event.type === 'organization.created'
  ) {
    return { kind: 'ignored' }
  }
  const eventKind = input.event.type === 'organizationInvitation.created'
    ? 'created'
    : input.event.type === 'organizationInvitation.revoked'
      ? 'revoked'
      : null
  if (eventKind === null) {
    return { kind: 'ignored' }
  }
  if (input.deliveryRef === null || input.deliveryRef.trim().length === 0 || input.deliveryRef.length > 300) {
    return { kind: 'invalid' }
  }
  if (!isRecord(input.event.data)) return { kind: 'invalid' }

  const data = input.event.data
  const id = data.id
  const organizationId = data.organization_id
  const emailAddress = data.email_address
  const role = data.role
  const status = data.status
  const observedAtField = eventKind === 'created' ? data.created_at : data.updated_at

  if (
    typeof id !== 'string'
    || !id.startsWith('orginv_')
    || typeof organizationId !== 'string'
    || !organizationId.startsWith('org_')
    || typeof emailAddress !== 'string'
    || !emailAddress.includes('@')
    || typeof observedAtField !== 'number'
    || !Number.isSafeInteger(observedAtField)
    || observedAtField < 0
  ) {
    return { kind: 'invalid' }
  }
  if (role !== 'org:admin' && role !== 'org:member') {
    return { kind: 'invalid' }
  }
  if (eventKind === 'created') {
    if (status !== 'pending') {
      return { kind: 'invalid' }
    }
  } else if (status !== 'revoked') {
    return { kind: 'invalid' }
  }

  const invitationRole = role as OrganizationInvitationRole
  const emailNormalized = emailAddress.trim().toLowerCase()

  const command = {
    clerkOrgId: organizationId,
    deliveryRefHash: canonicalDigest({
      contract: 'ae.clerk-webhook-delivery:v1',
      deliveryRef: input.deliveryRef,
    }),
    invitationRefHash: canonicalDigest({
      contract: 'ae.clerk-organization-invitation-ref:v1',
      invitationRef: id,
    }),
    emailHash: canonicalDigest({
      contract: 'ae.workspace-invitee-email:v1',
      emailNormalized,
    }),
    role: invitationRole,
    observedAt: observedAtField,
  }

  return eventKind === 'revoked'
    ? { kind: 'accepted', eventKind: 'revoked', command }
    : { kind: 'accepted', eventKind: 'created', command }
}
