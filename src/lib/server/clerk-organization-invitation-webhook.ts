import { degrade } from '@/lib/observability/degrade'
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

type ObservationApplier = (
  command: OrganizationInvitationCreatedObservation,
) => Promise<OrganizationInvitationCreatedObservationResult>
type RevokedObservationApplier = (
  command: OrganizationInvitationRevokedObservation,
) => Promise<OrganizationInvitationCreatedObservationResult>

export type InvitationWebhookDependencies = Readonly<{
  apply?: ObservationApplier
  applyRevoked?: RevokedObservationApplier
  issuer?: string
}>

export async function handleClerkOrganizationInvitationWebhookRequest(
  webhook: VerifiedClerkWebhook,
  dependencies: InvitationWebhookDependencies = {},
): Promise<Response> {
  const projection = invitationObservationFromVerifiedEvent({
    event: webhook.event,
    deliveryRef: webhook.deliveryRef,
  })
  if (projection.kind === 'ignored') return clerkWebhookIgnoredResponse()
  if (projection.kind === 'invalid') return clerkWebhookProblem(400, 'clerk_webhook_invalid')

  let applied: OrganizationInvitationCreatedObservationResult
  try {
    applied = projection.eventKind === 'revoked'
      ? await (dependencies.applyRevoked ?? recordOrganizationInvitationRevokedThroughSource)(projection.command)
      : await (dependencies.apply ?? recordOrganizationInvitationCreatedThroughSource)(projection.command)
  } catch (cause) {
    return degrade(
      safeClerkWebhookError(cause),
      clerkWebhookProblem(503, 'workspace_invitation_unavailable', CLERK_WEBHOOK_RETRY_AFTER_SECONDS),
      { site: 'handleClerkOrganizationInvitationWebhookRequest', reason: 'source_unavailable' },
    )
  }
  if (applied.kind === 'refused') return clerkWebhookProblem(409, applied.code)
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
  if (!isValidClerkWebhookDeliveryRef(input.deliveryRef)) return { kind: 'invalid' }
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
    deliveryRefHash: clerkWebhookDeliveryRefHash(input.deliveryRef),
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
