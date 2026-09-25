import type { Doc } from '../../../_generated/dataModel'
import { env, type MutationCtx } from '../../../_generated/server'
import { toStableHashValue, verifyCustomerRequestServiceAssertion } from '../../../../src/modules/agent-access/service-auth-envelope'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { CLERK_ORGANIZATION_PROVIDER_NAMESPACE } from '../interactiveAuthority/constants'
import { WorkspaceMembershipError, type RecordCommand } from './contracts'


export const RECORD_OPERATION = 'workspaceMemberships.recordOrganizationMembershipCreatedForServer'
export const RECORD_SCOPE = 'workspace:record_organization_membership_created'
export const RECORD_UPDATED_OPERATION =
  'workspaceMemberships.recordOrganizationMembershipUpdatedForServer'
export const RECORD_UPDATED_SCOPE = 'workspace:record_organization_membership_updated'
export const RECORD_DELETED_OPERATION =
  'workspaceMemberships.recordOrganizationMembershipDeletedForServer'
export const RECORD_DELETED_SCOPE = 'workspace:record_organization_membership_deleted'

const digestPattern = /^sha256:[0-9a-f]{64}$/u
const clerkOrgIdPattern = /^org_/

export function validateRecordCommand(command: RecordCommand): void {
  if (!clerkOrgIdPattern.test(command.clerkOrgId)) {
    throw new WorkspaceMembershipError('authority_conflict')
  }
  if (
    !digestPattern.test(command.deliveryRefHash)
    || !digestPattern.test(command.membershipRefHash)
  ) {
    throw new WorkspaceMembershipError('authority_conflict')
  }
}

export function recordCommandDigest(command: RecordCommand): string {
  return canonicalDigest({
    clerkOrgId: command.clerkOrgId,
    providerIdentifier: command.providerIdentifier,
    deliveryRefHash: command.deliveryRefHash,
    membershipRefHash: command.membershipRefHash,
    role: command.role,
    observedAt: command.observedAt,
  })
}

export function auditEventIdFromDeliveryRefHash(deliveryRefHash: string): string {
  const digestValue = deliveryRefHash.slice('sha256:'.length)
  return `audit:clerk-org-membership:${digestValue}`
}

export async function verifyRecordServiceAuth(
  args: Readonly<{
    operation: string
    scope: string
    clerkOrgId: string
    providerIdentifier: string
    deliveryRefHash: string
    membershipRefHash: string
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
      providerIdentifier: args.providerIdentifier,
      deliveryRefHash: args.deliveryRefHash,
      membershipRefHash: args.membershipRefHash,
      role: args.role,
      observedAt: args.observedAt,
    }),
    assertion: args.serviceAuth,
    now: Date.now(),
  })
  if (!verified || !args.serviceAuth.scopes.includes(args.scope)) {
    throw new WorkspaceMembershipError('authority_conflict')
  }
}

export async function resolveOrgBindings(
  db: MutationCtx['db'],
  clerkOrgId: string,
): Promise<Doc<'accountExternalOrganizationBindings'>[] | 'conflict'> {
  const bindings = await db
    .query('accountExternalOrganizationBindings')
    .withIndex('by_providerNamespace_and_providerIdentifier', (query) => query
      .eq('providerNamespace', CLERK_ORGANIZATION_PROVIDER_NAMESPACE)
      .eq('providerIdentifier', clerkOrgId))
    .take(2)
  if (bindings.length > 1) return 'conflict'
  return bindings
}
