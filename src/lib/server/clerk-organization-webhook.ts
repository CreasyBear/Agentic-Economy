import { degrade } from '@/lib/observability/degrade'
import {
  clerkWebhookDeliveryRefHash,
  clerkWebhookIgnoredResponse,
  clerkWebhookProblem,
  isValidClerkWebhookDeliveryRef,
  safeClerkWebhookError,
  type VerifiedClerkWebhook,
} from '@/lib/server/clerk-webhook-core'
import { callPublicSourceMutation, createConvexServerFunctionAssertion, sourceMutation, type ConvexServerFunctionAssertion } from '@/lib/server/convex-source'
import { response as jsonResponse } from '@/lib/server/no-store-response'
import { readTrimmedEnv } from '@/lib/server/read-trimmed-env'
import { isRecord } from '@/modules/common/is-record'
import { clerkUserProviderIdentifier } from '@/modules/principal-account/external-identity/public'

const PROVISION_OPERATION = 'workspaceProvisioning.provisionOrganizationWorkspaceForServer'
const PROVISION_SCOPE = 'workspace:provision_organization'
const CLERK_ORG_ID_PATTERN = /^org_[A-Za-z0-9_-]{1,195}$/u

export type OrganizationProvisioningCommand = Readonly<{
  clerkOrgId: string
  displayName: string
  creatorTokenIdentifier: string
  correlationRef: string
}>

type OrganizationProvisioningResult = Readonly<
  | {
    kind: 'created' | 'replayed'
    accountRef: string
    ownershipRef: string
    bindingRef: string
  }
  | {
    kind: 'refused'
    code: 'creator_binding_missing' | 'creator_principal_inactive' | 'authority_conflict' | 'clerk_org_id_invalid' | 'workspace_closed'
  }
>

type OrganizationProvisioner = (
  command: OrganizationProvisioningCommand,
) => Promise<OrganizationProvisioningResult>

export type OrganizationWebhookDependencies = Readonly<{
  provision?: OrganizationProvisioner
  issuer?: string
}>

type ProvisionOrganizationWorkspaceArgs = OrganizationProvisioningCommand & Readonly<{
  serviceAuth: ConvexServerFunctionAssertion
}>

const provisionOrganizationWorkspaceMutation = sourceMutation<
  ProvisionOrganizationWorkspaceArgs,
  OrganizationProvisioningResult
>('workspaceProvisioning:provisionOrganizationWorkspaceForServer')

export async function handleClerkOrganizationWebhookRequest(
  webhook: VerifiedClerkWebhook,
  dependencies: OrganizationWebhookDependencies = {},
): Promise<Response> {
  const projection = organizationProvisioningFromVerifiedEvent({
    event: webhook.event,
    deliveryRef: webhook.deliveryRef,
    issuer: dependencies.issuer ?? readTrimmedEnv(process.env, 'CLERK_JWT_ISSUER_DOMAIN') ?? '',
  })
  if (projection.kind === 'ignored') return clerkWebhookIgnoredResponse()
  if (projection.kind === 'creator_missing') {
    return degrade(
      new Error('clerk_organization_creator_missing'),
      clerkWebhookProblem(409, 'clerk_organization_creator_missing'),
      { site: 'handleClerkOrganizationWebhookRequest', reason: 'invalid_response' },
    )
  }
  if (projection.kind === 'invalid') return clerkWebhookProblem(400, 'clerk_webhook_invalid')

  let applied: OrganizationProvisioningResult
  try {
    applied = await (dependencies.provision ?? provisionOrganizationWorkspaceThroughSource)(projection.command)
  } catch (cause) {
    return degrade(
      safeClerkWebhookError(cause),
      clerkWebhookProblem(503, 'workspace_provisioning_unavailable', 5),
      { site: 'handleClerkOrganizationWebhookRequest', reason: 'source_unavailable' },
    )
  }
  if (applied.kind === 'refused') {
    if (applied.code === 'creator_binding_missing') {
      return clerkWebhookProblem(503, applied.code, 5)
    }
    if (applied.code === 'workspace_closed') return clerkWebhookIgnoredResponse()
    return clerkWebhookProblem(409, applied.code)
  }
  return jsonResponse({ kind: 'accepted', status: applied.kind }, 200)
}

type OrganizationProvisioningProjection =
  | Readonly<{ kind: 'accepted'; command: OrganizationProvisioningCommand }>
  | Readonly<{ kind: 'creator_missing' }>
  | Readonly<{ kind: 'ignored' }>
  | Readonly<{ kind: 'invalid' }>

function organizationProvisioningFromVerifiedEvent(input: Readonly<{
  event: unknown
  deliveryRef: string | null
  issuer: string
}>): OrganizationProvisioningProjection {
  if (!isRecord(input.event) || typeof input.event.type !== 'string') return { kind: 'invalid' }
  if (input.event.type !== 'organization.created') return { kind: 'ignored' }

  const deliveryRef = input.deliveryRef
  if (!isValidClerkWebhookDeliveryRef(deliveryRef)) return { kind: 'invalid' }
  if (!isRecord(input.event.data)) return { kind: 'invalid' }

  const data = input.event.data
  if (data.created_by === undefined || data.created_by === null) return { kind: 'creator_missing' }
  if (
    typeof data.id !== 'string'
    || !CLERK_ORG_ID_PATTERN.test(data.id)
    || typeof data.name !== 'string'
    || typeof data.created_by !== 'string'
  ) {
    return { kind: 'invalid' }
  }

  const creatorTokenIdentifier = clerkUserProviderIdentifier(input.issuer, data.created_by)
  if (creatorTokenIdentifier === undefined) return { kind: 'invalid' }

  return {
    kind: 'accepted',
    command: {
      clerkOrgId: data.id,
      displayName: data.name,
      creatorTokenIdentifier,
      correlationRef: clerkWebhookDeliveryRefHash(deliveryRef),
    },
  }
}

async function provisionOrganizationWorkspaceThroughSource(
  command: OrganizationProvisioningCommand,
): Promise<OrganizationProvisioningResult> {
  const serviceAuth = await createConvexServerFunctionAssertion({
    operation: PROVISION_OPERATION,
    scope: PROVISION_SCOPE,
    command,
  })
  return await callPublicSourceMutation(provisionOrganizationWorkspaceMutation, {
    ...command,
    serviceAuth,
  })
}
