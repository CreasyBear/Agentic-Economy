import { toStableHashValue, verifyCustomerRequestServiceAssertion } from '../../../../src/modules/agent-access/service-auth-envelope'
import { env } from '../../../_generated/server'
import { WorkspaceProvisioningError } from './contracts'

const PROVISION_OPERATION = 'workspaceProvisioning.provisionOrganizationWorkspaceForServer'
const PROVISION_SCOPE = 'workspace:provision_organization'

export async function verifyProvisionServiceAuth(
  args: Readonly<{
    clerkOrgId: string
    displayName: string
    creatorTokenIdentifier: string
    correlationRef: string
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
    operation: PROVISION_OPERATION,
    command: toStableHashValue({
      clerkOrgId: args.clerkOrgId,
      displayName: args.displayName,
      creatorTokenIdentifier: args.creatorTokenIdentifier,
      correlationRef: args.correlationRef,
    }),
    assertion: args.serviceAuth,
    now: Date.now(),
  })
  if (!verified || !args.serviceAuth.scopes.includes(PROVISION_SCOPE)) {
    throw new WorkspaceProvisioningError('authority_conflict')
  }
}
