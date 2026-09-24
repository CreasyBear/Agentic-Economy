import type { Doc } from '../../../_generated/dataModel'
import { env, type MutationCtx } from '../../../_generated/server'
import { toStableHashValue, verifyCustomerRequestServiceAssertion } from '../../../../src/modules/agent-access/service-auth-envelope'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { CLERK_ORGANIZATION_PROVIDER_NAMESPACE } from '../interactiveAuthority/constants'
import { WorkspaceInvitationError, type RecordCommand } from './contracts'


export const RECORD_OPERATION = 'workspaceInvitations.recordOrganizationInvitationCreatedForServer'
export const RECORD_SCOPE = 'workspace:record_organization_invitation_created'
export const RECORD_REVOKED_OPERATION = 'workspaceInvitations.recordOrganizationInvitationRevokedForServer'
export const RECORD_REVOKED_SCOPE = 'workspace:record_organization_invitation_revoked'

const digestPattern = /^sha256:[0-9a-f]{64}$/u
const clerkOrgIdPattern = /^org_/

export function validateRecordCommand(command: RecordCommand): void {
  if (!clerkOrgIdPattern.test(command.clerkOrgId)) {
    throw new WorkspaceInvitationError('authority_conflict')
  }
  if (
    !digestPattern.test(command.deliveryRefHash)
    || !digestPattern.test(command.invitationRefHash)
    || !digestPattern.test(command.emailHash)
  ) {
    throw new WorkspaceInvitationError('authority_conflict')
  }
  if (command.status !== undefined && command.status !== 'pending') {
    throw new WorkspaceInvitationError('authority_conflict')
  }
}

export function recordCommandDigest(command: RecordCommand): string {
  return canonicalDigest({
    clerkOrgId: command.clerkOrgId,
    deliveryRefHash: command.deliveryRefHash,
    invitationRefHash: command.invitationRefHash,
    emailHash: command.emailHash,
    role: command.role,
    observedAt: command.observedAt,
  })
}

export function auditEventIdFromDeliveryRefHash(deliveryRefHash: string): string {
  const digestValue = deliveryRefHash.slice('sha256:'.length)
  return `audit:clerk-org-invite:${digestValue}`
}

export async function verifyRecordServiceAuth(
  args: Readonly<{
    operation: string
    scope: string
    clerkOrgId: string
    deliveryRefHash: string
    invitationRefHash: string
    emailHash: string
    role: 'org:admin' | 'org:member'
    observedAt: number
    serviceAuth: {
      scopes: readonly string[]
      issuedAt: number
      signature: string
      principalId: string
      ownerId: string
      credentialId: string
    }
  }>,
): Promise<void> {
  const key = env.AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim() ?? ''
  const verified = await verifyCustomerRequestServiceAssertion({
    key,
    operation: args.operation,
    command: toStableHashValue({
      clerkOrgId: args.clerkOrgId,
      deliveryRefHash: args.deliveryRefHash,
      invitationRefHash: args.invitationRefHash,
      emailHash: args.emailHash,
      role: args.role,
      observedAt: args.observedAt,
    }),
    assertion: args.serviceAuth,
    now: Date.now(),
  })
  if (!verified || !args.serviceAuth.scopes.includes(args.scope)) {
    throw new WorkspaceInvitationError('authority_conflict')
  }
}

export async function resolveActiveOrgBinding(
  db: MutationCtx['db'],
  clerkOrgId: string,
): Promise<Doc<'accountExternalOrganizationBindings'> | 'ignored' | 'conflict'> {
  const bindings = await db
    .query('accountExternalOrganizationBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', CLERK_ORGANIZATION_PROVIDER_NAMESPACE)
      .eq('providerIdentifier', clerkOrgId))
    .take(2)
  if (bindings.length > 1) return 'conflict'
  const [binding] = bindings
  if (binding === undefined || binding.lifecycle !== 'active') return 'ignored'
  return binding
}
