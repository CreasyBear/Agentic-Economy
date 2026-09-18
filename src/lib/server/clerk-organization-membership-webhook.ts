import { verifyWebhook } from '@clerk/tanstack-react-start/webhooks'

import { kindForStatus } from '@/lib/errors'
import { degrade } from '@/lib/observability/degrade'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { response as jsonResponse } from '@/lib/server/no-store-response'
import { problem } from '@/lib/server/problem'
import { readTrimmedEnv } from '@/lib/server/read-trimmed-env'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { clerkUserProviderIdentifier } from '@/modules/principal-account/external-identity/public'
import {
  recordOrganizationMembershipCreatedThroughSource,
  recordOrganizationMembershipDeletedThroughSource,
  recordOrganizationMembershipUpdatedThroughSource,
} from '@/modules/workspace-membership/organization-membership-observation'
import type {
  OrganizationMembershipCreatedObservation,
  OrganizationMembershipCreatedObservationResult,
  OrganizationMembershipDeletedObservation,
  OrganizationMembershipUpdatedObservation,
  OrganizationMembershipUpdatedObservationResult,
} from '@/modules/workspace-membership/organization-membership-observation'

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
  command: OrganizationMembershipCreatedObservation,
) => Promise<OrganizationMembershipCreatedObservationResult>
type UpdatedObservationApplier = (
  command: OrganizationMembershipUpdatedObservation,
) => Promise<OrganizationMembershipUpdatedObservationResult>
type DeletedObservationApplier = (
  command: OrganizationMembershipDeletedObservation,
) => Promise<OrganizationMembershipCreatedObservationResult>

export type MembershipWebhookDependencies = Readonly<{
  verify?: WebhookVerifier
  apply?: ObservationApplier
  applyUpdated?: UpdatedObservationApplier
  applyDeleted?: DeletedObservationApplier
  issuer?: string
}>

export async function handleClerkOrganizationMembershipWebhookRequest(
  request: Request,
  dependencies: MembershipWebhookDependencies = {},
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
    return degrade(cause, problem({ status: 400, kind: kindForStatus(400), code: 'clerk_webhook_invalid', detail: 'clerk_webhook_invalid' }), { site: 'handleClerkOrganizationMembershipWebhookRequest', reason: 'forbidden' })
  }

  const issuer = dependencies.issuer ?? readTrimmedEnv(process.env, 'CLERK_JWT_ISSUER_DOMAIN') ?? ''
  const projection = membershipObservationFromVerifiedEvent({
    event: verified,
    deliveryRef: request.headers.get('svix-id'),
    issuer,
  })
  if (projection.kind === 'ignored') {
    return jsonResponse({ kind: 'accepted', status: 'ignored' }, 200)
  }
  if (projection.kind === 'invalid') {
    return problem({ status: 400, kind: kindForStatus(400), code: 'clerk_webhook_invalid', detail: 'clerk_webhook_invalid' })
  }

  let applied: OrganizationMembershipCreatedObservationResult
  try {
    if (projection.eventKind === 'deleted') {
      applied = await (dependencies.applyDeleted ?? recordOrganizationMembershipDeletedThroughSource)(
        projection.command,
      )
    } else if (projection.eventKind === 'updated') {
      applied = await (dependencies.applyUpdated ?? recordOrganizationMembershipUpdatedThroughSource)(
        projection.command,
      )
    } else {
      applied = await (dependencies.apply ?? recordOrganizationMembershipCreatedThroughSource)(
        projection.command,
      )
    }
  } catch (cause) {
    return degrade(cause, problem(
      { status: 503, kind: kindForStatus(503), code: 'workspace_membership_unavailable', detail: 'workspace_membership_unavailable' },
      { 'Retry-After': String(RETRY_AFTER_SECONDS) },
    ), { site: 'handleClerkOrganizationMembershipWebhookRequest', reason: 'source_unavailable' })
  }
  if (applied.kind === 'refused') {
    if (applied.code === 'identity_binding_missing') {
      return problem(
        { status: 503, kind: kindForStatus(503), code: applied.code, detail: applied.code },
        { 'Retry-After': String(RETRY_AFTER_SECONDS) },
      )
    }
    return problem(
      { status: 409, kind: kindForStatus(409), code: applied.code, detail: applied.code },
    )
  }
  return jsonResponse({ kind: 'accepted', status: applied.status }, 200)
}

type ObservationProjection =
  | Readonly<{ kind: 'accepted'; eventKind: 'created'; command: OrganizationMembershipCreatedObservation }>
  | Readonly<{ kind: 'accepted'; eventKind: 'updated'; command: OrganizationMembershipUpdatedObservation }>
  | Readonly<{ kind: 'accepted'; eventKind: 'deleted'; command: OrganizationMembershipDeletedObservation }>
  | Readonly<{ kind: 'ignored' }>
  | Readonly<{ kind: 'invalid' }>

function membershipObservationFromVerifiedEvent(input: Readonly<{
  event: unknown
  deliveryRef: string | null
  issuer: string
}>): ObservationProjection {
  if (!isRecord(input.event) || typeof input.event.type !== 'string') return { kind: 'invalid' }
  const eventKind = input.event.type === 'organizationMembership.created'
    ? 'created'
    : input.event.type === 'organizationMembership.updated'
      ? 'updated'
      : input.event.type === 'organizationMembership.deleted'
        ? 'deleted'
        : null
  if (eventKind === null) {
    return { kind: 'ignored' }
  }

  const deliveryRef = input.deliveryRef
  if (deliveryRef === null || deliveryRef.trim().length === 0 || deliveryRef.length > 300) {
    return { kind: 'invalid' }
  }
  if (!isRecord(input.event.data)) return { kind: 'invalid' }

  const data = input.event.data
  const id = data.id
  const organization = data.organization
  const publicUserData = data.public_user_data
  const role = data.role
  const observedAtField = eventKind === 'created' ? data.created_at : data.updated_at

  const organizationId = isRecord(organization) ? organization.id : undefined
  const userId = isRecord(publicUserData) ? publicUserData.user_id : undefined

  if (
    typeof id !== 'string'
    || !id.startsWith('orgmem_')
    || typeof organizationId !== 'string'
    || !organizationId.startsWith('org_')
    || typeof userId !== 'string'
    || !userId.startsWith('user_')
    || typeof observedAtField !== 'number'
    || !Number.isSafeInteger(observedAtField)
    || observedAtField < 0
  ) {
    return { kind: 'invalid' }
  }
  if (role !== 'org:admin' && role !== 'org:member') {
    return { kind: 'invalid' }
  }

  const membershipRole = role as OrganizationMembershipCreatedObservation['role']
  const providerIdentifier = clerkUserProviderIdentifier(input.issuer, userId)
  if (providerIdentifier === undefined) {
    return { kind: 'invalid' }
  }

  const command = {
    clerkOrgId: organizationId,
    providerIdentifier,
    deliveryRefHash: canonicalDigest({
      contract: 'ae.clerk-webhook-delivery:v1',
      deliveryRef,
    }),
    membershipRefHash: canonicalDigest({
      contract: 'ae.clerk-organization-membership-ref:v1',
      membershipRef: id,
    }),
    role: membershipRole,
    observedAt: observedAtField,
  }

  return eventKind === 'updated'
    ? { kind: 'accepted', eventKind: 'updated', command }
    : eventKind === 'deleted'
      ? { kind: 'accepted', eventKind: 'deleted', command }
      : { kind: 'accepted', eventKind: 'created', command }
}
