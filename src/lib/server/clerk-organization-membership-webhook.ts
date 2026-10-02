import { degrade } from '@/lib/observability/degrade'
import { readTrimmedEnv } from '@/lib/server/read-trimmed-env'
import { response as jsonResponse } from '@/lib/server/no-store-response'
import {
  CLERK_WEBHOOK_RETRY_AFTER_SECONDS,
  clerkWebhookDeliveryRefHash,
  clerkWebhookIgnoredResponse,
  clerkWebhookProblem,
  isValidClerkWebhookDeliveryRef,
  safeClerkWebhookError,
  type VerifiedClerkWebhook,
} from '@/lib/server/clerk-webhook-core'
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

const ORGANIZATION_PROVISIONING_RETRY_WINDOW_MS = 6 * 60 * 60 * 1000
const ORGANIZATION_PROVISIONING_RETRY_AFTER_SECONDS = 60

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
  apply?: ObservationApplier
  applyUpdated?: UpdatedObservationApplier
  applyDeleted?: DeletedObservationApplier
  issuer?: string
}>

export async function handleClerkOrganizationMembershipWebhookRequest(
  webhook: VerifiedClerkWebhook,
  dependencies: MembershipWebhookDependencies = {},
): Promise<Response> {
  const issuer = dependencies.issuer ?? readTrimmedEnv(process.env, 'CLERK_JWT_ISSUER_DOMAIN') ?? ''
  const projection = membershipObservationFromVerifiedEvent({
    event: webhook.event,
    deliveryRef: webhook.deliveryRef,
    issuer,
  })
  if (projection.kind === 'ignored') return clerkWebhookIgnoredResponse()
  if (projection.kind === 'invalid') return clerkWebhookProblem(400, 'clerk_webhook_invalid')

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
    return degrade(
      safeClerkWebhookError(cause),
      clerkWebhookProblem(503, 'workspace_membership_unavailable', CLERK_WEBHOOK_RETRY_AFTER_SECONDS),
      { site: 'handleClerkOrganizationMembershipWebhookRequest', reason: 'source_unavailable' },
    )
  }
  if (applied.kind === 'refused') {
    if (applied.code === 'organization_unbound') {
      if (
        projection.eventKind === 'created'
        && Date.now() - projection.organizationCreatedAt < ORGANIZATION_PROVISIONING_RETRY_WINDOW_MS
      ) {
        return clerkWebhookProblem(503, applied.code, ORGANIZATION_PROVISIONING_RETRY_AFTER_SECONDS)
      }
      return clerkWebhookIgnoredResponse()
    }
    if (applied.code === 'identity_binding_missing') {
      return clerkWebhookProblem(503, applied.code, CLERK_WEBHOOK_RETRY_AFTER_SECONDS)
    }
    return clerkWebhookProblem(409, applied.code)
  }
  return jsonResponse({ kind: 'accepted', status: applied.status }, 200)
}

type ObservationProjection =
  | Readonly<{
    kind: 'accepted'
    eventKind: 'created'
    command: OrganizationMembershipCreatedObservation
    organizationCreatedAt: number
  }>
  | Readonly<{ kind: 'accepted'; eventKind: 'updated' | 'deleted'; command: OrganizationMembershipUpdatedObservation }>
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
  if (eventKind === null) return { kind: 'ignored' }

  const deliveryRef = input.deliveryRef
  if (!isValidClerkWebhookDeliveryRef(deliveryRef)) return { kind: 'invalid' }
  if (!isRecord(input.event.data)) return { kind: 'invalid' }

  const data = input.event.data
  const id = data.id
  const organization = data.organization
  const publicUserData = data.public_user_data
  const role = data.role
  const observedAtField = eventKind === 'created' ? data.created_at : data.updated_at
  const organizationId = isRecord(organization) ? organization.id : undefined
  const organizationCreatedAt = isRecord(organization) ? organization.created_at : undefined
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
    || (eventKind === 'created'
      && (typeof organizationCreatedAt !== 'number'
        || !Number.isSafeInteger(organizationCreatedAt)
        || organizationCreatedAt < 0))
  ) {
    return { kind: 'invalid' }
  }
  if (role !== 'org:admin' && role !== 'org:member') return { kind: 'invalid' }

  const membershipRole = role as OrganizationMembershipCreatedObservation['role']
  const providerIdentifier = clerkUserProviderIdentifier(input.issuer, userId)
  if (providerIdentifier === undefined) return { kind: 'invalid' }

  const command = {
    clerkOrgId: organizationId,
    providerIdentifier,
    deliveryRefHash: clerkWebhookDeliveryRefHash(deliveryRef),
    membershipRefHash: canonicalDigest({
      contract: 'ae.clerk-organization-membership-ref:v1',
      membershipRef: id,
    }),
    role: membershipRole,
    observedAt: observedAtField,
  }

  if (eventKind === 'created') {
    if (typeof organizationCreatedAt !== 'number') return { kind: 'invalid' }
    return { kind: 'accepted', eventKind, command, organizationCreatedAt }
  }
  return { kind: 'accepted', eventKind, command }
}
