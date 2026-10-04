import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { hashOAuthValue } from '@/modules/agent-access/oauth-state'
import type { AgentOnboardingLocator, AgentOnboardingRequest } from '@/modules/agent-access/public'
import { currentNow, ownerIdentity, requireStore, type OAuthApiOptions } from './runtime'

/** Requires authenticated owner + one exact locator. Ensures only sanitized
 * request facts and a separately proven owned Agent. Invariant: observation
 * never claims issuance/delivery or exposes tokens, inputs or anonymous lists.
 * On ownership refusal clear evidence; outages remain distinguishable and retryable.
 * Existing consent rows replace a new workflow store; all reads are indexed. */
export async function readOnboardingRequest(locator: AgentOnboardingLocator, options: OAuthApiOptions,
  findOwnedAgent: (credentialId: string) => Promise<string | null>): Promise<AgentOnboardingRequest> {
  const owner = await ownerIdentity(options)
  if (!owner.isAuthenticated || owner.userId === null) return { kind: 'refused', reason: 'authentication_required' }
  const store = requireStore(options)
  const grant = locator.grantRef === undefined
    ? await store.getGrantByHash('user', await hashOAuthValue(locator.userCode.trim().toUpperCase()))
    : await store.getGrantByRef(locator.grantRef)
  if (grant === null) return { kind: 'refused', reason: 'not_found' }
  if (grant.ownerId !== undefined && grant.ownerId !== owner.userId) return { kind: 'refused', reason: 'owner_mismatch' }
  if (grant.requestedAccess.environment !== deploymentPaymentEnvironment(process.env)) return { kind: 'refused', reason: 'environment_mismatch' }
  const principalRef = grant.keyId === undefined ? undefined : await findOwnedAgent(grant.keyId)
  if (principalRef === null) return { kind: 'refused', reason: 'owner_mismatch' }
  const phase = grant.status === 'consumed' ? 'exchanged' : grant.status === 'denied' ? 'denied'
    : grant.expiresAt <= currentNow(options) || grant.status === 'expired' ? 'expired' : grant.status === 'issuing' ? 'issuing'
    : grant.status === 'delivery_claimed' ? 'exchanging' : grant.status
  const client = await store.getClient(grant.clientId)
  return { kind: 'request', grantRef: grant.grantRef, revision: grant.revision,
    clientName: client?.clientName ?? 'Your Agent', flow: grant.flow, environment: grant.requestedAccess.environment,
    phase, createdAt: grant.createdAt, expiresAt: grant.expiresAt,
    ...(principalRef === undefined ? {} : { principalRef }) }
}
