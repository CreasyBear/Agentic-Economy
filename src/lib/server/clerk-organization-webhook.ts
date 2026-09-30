import { verifyWebhook } from '@clerk/tanstack-react-start/webhooks'

import { kindForStatus } from '@/lib/errors'
import { degrade } from '@/lib/observability/degrade'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { callPublicSourceMutation, createConvexServerFunctionAssertion, sourceMutation, type ConvexServerFunctionAssertion } from '@/lib/server/convex-source'
import { response as jsonResponse } from '@/lib/server/no-store-response'
import { problem } from '@/lib/server/problem'
import { readTrimmedEnv } from '@/lib/server/read-trimmed-env'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { clerkUserProviderIdentifier } from '@/modules/principal-account/external-identity/public'

const MAX_CLERK_WEBHOOK_BODY_BYTES = 256 * 1024
const RETRY_AFTER_SECONDS = 5
const PROVISION_OPERATION = 'workspaceProvisioning.provisionOrganizationWorkspaceForServer'
const PROVISION_SCOPE = 'workspace:provision_organization'
const CLERK_ORG_ID_PATTERN = /^org_[A-Za-z0-9_-]{1,195}$/u

type VerifiedWebhookEvent = Readonly<{
  type: string
  object: string
  data: unknown
  event_attributes?: unknown
}>

type WebhookVerifier = (request: Request) => Promise<VerifiedWebhookEvent>

export type OrganizationProvisioningCommand = Readonly<{
  clerkOrgId: string
  displayName: string
  creatorTokenIdentifier: string
  correlationRef: string
}>

type OrganizationProvisioningResult = Readonly<{
  kind: 'created' | 'replayed'
  accountRef: string
  ownershipRef: string
  bindingRef: string
}>

type OrganizationProvisioner = (
  command: OrganizationProvisioningCommand,
) => Promise<OrganizationProvisioningResult>

export type OrganizationWebhookDependencies = Readonly<{
  verify?: WebhookVerifier
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
  request: Request,
  dependencies: OrganizationWebhookDependencies = {},
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
    return degrade(cause, problem(
      { status: 400, kind: kindForStatus(400), code: 'clerk_webhook_invalid', detail: 'clerk_webhook_invalid' },
    ), { site: 'handleClerkOrganizationWebhookRequest', reason: 'forbidden' })
  }

  const projection = organizationProvisioningFromVerifiedEvent({
    event: verified,
    deliveryRef: request.headers.get('svix-id'),
    issuer: dependencies.issuer ?? readTrimmedEnv(process.env, 'CLERK_JWT_ISSUER_DOMAIN') ?? '',
  })
  if (projection.kind === 'ignored') {
    return jsonResponse({ kind: 'accepted', status: 'ignored' }, 200)
  }
  if (projection.kind === 'creator_missing') {
    return degrade(
      new Error('clerk_organization_creator_missing'),
      problem({ status: 409, kind: kindForStatus(409), code: 'clerk_organization_creator_missing', detail: 'clerk_organization_creator_missing' }),
      { site: 'handleClerkOrganizationWebhookRequest', reason: 'invalid_response' },
    )
  }
  if (projection.kind === 'invalid') {
    return problem({ status: 400, kind: kindForStatus(400), code: 'clerk_webhook_invalid', detail: 'clerk_webhook_invalid' })
  }

  try {
    const applied = await (dependencies.provision ?? provisionOrganizationWorkspaceThroughSource)(projection.command)
    return jsonResponse({ kind: 'accepted', status: applied.kind }, 200)
  } catch (cause) {
    const code = workspaceProvisioningErrorCode(cause)
    if (code === 'creator_binding_missing') {
      return problem(
        { status: 503, kind: kindForStatus(503), code, detail: code },
        { 'Retry-After': String(RETRY_AFTER_SECONDS) },
      )
    }
    if (
      code === 'creator_principal_inactive'
      || code === 'authority_conflict'
      || code === 'clerk_org_id_invalid'
    ) {
      return problem({ status: 409, kind: kindForStatus(409), code, detail: code })
    }
    return degrade(cause, problem(
      { status: 503, kind: kindForStatus(503), code: 'workspace_provisioning_unavailable', detail: 'workspace_provisioning_unavailable' },
      { 'Retry-After': String(RETRY_AFTER_SECONDS) },
    ), { site: 'handleClerkOrganizationWebhookRequest', reason: 'source_unavailable' })
  }
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
  if (deliveryRef === null || deliveryRef.trim().length === 0 || deliveryRef.length > 300) {
    return { kind: 'invalid' }
  }
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
      correlationRef: canonicalDigest({
        contract: 'ae.clerk-webhook-delivery:v1',
        deliveryRef,
      }),
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

function workspaceProvisioningErrorCode(cause: unknown): string | undefined {
  if (!isRecord(cause)) return undefined
  if (typeof cause.code === 'string') return cause.code
  if (isRecord(cause.data) && typeof cause.data.code === 'string') return cause.data.code
  const message = typeof cause.message === 'string' ? cause.message : undefined
  if (message === undefined) return undefined
  return [
    'creator_binding_missing',
    'creator_principal_inactive',
    'authority_conflict',
    'clerk_org_id_invalid',
  ].find((code) => message === code || message.endsWith(`: ${code}`))
}
