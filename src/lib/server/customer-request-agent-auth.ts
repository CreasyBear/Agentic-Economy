import { auth, clerkClient } from '@clerk/tanstack-react-start/server'

import { CUSTOMER_REQUEST_AGENT_SCOPE } from '@/modules/customer-request/agent-contract'

type ApiKeyAuth = Readonly<{
  isAuthenticated: boolean
  tokenType: 'api_key' | null
  id: string | null
  subject: string | null
  scopes: readonly string[] | null
  userId?: string | null
  orgId?: string | null
}>

type CurrentApiKey = Readonly<{
  id: string
  subject: string
  revoked: boolean
  expired: boolean
  scopes: readonly string[]
}>

export type CustomerRequestAgentPrincipal = Readonly<{
  principalId: string
  ownerId: string
  credentialId: string
  scopes: readonly string[]
}>

export async function authenticateCustomerRequestAgent(options: Readonly<{
  authenticate?: () => Promise<ApiKeyAuth>
  verifyKeyState?: (keyId: string) => Promise<CurrentApiKey>
  /** Defaults to the Customer Request scope; business tool calling requires its own. */
  requiredScope?: string
}> = {}): Promise<Readonly<{ kind: 'authenticated'; principal: CustomerRequestAgentPrincipal }> | Readonly<{
  kind: 'refused'
  status: 401 | 403
  reason: 'authentication_required' | 'scope_required'
}>> {
  const requiredScope = options.requiredScope ?? CUSTOMER_REQUEST_AGENT_SCOPE
  const candidate = await (options.authenticate ?? (async () => await auth({ acceptsToken: 'api_key' }) as ApiKeyAuth))()
  if (!candidate.isAuthenticated || candidate.tokenType !== 'api_key' || candidate.id === null || candidate.subject === null || candidate.scopes === null) {
    return { kind: 'refused', status: 401, reason: 'authentication_required' }
  }
  if (!candidate.scopes.includes(requiredScope)) return { kind: 'refused', status: 403, reason: 'scope_required' }
  let admittedScopes = candidate.scopes
  if (options.verifyKeyState !== undefined || options.authenticate === undefined) {
    try {
      const current = await (options.verifyKeyState ?? (async (keyId: string) => {
        const key = await clerkClient().apiKeys.get(keyId)
        return { id: key.id, subject: key.subject, revoked: key.revoked, expired: key.expired, scopes: key.scopes }
      }))(candidate.id)
      if (current.id !== candidate.id || current.subject !== candidate.subject || current.revoked || current.expired) {
        return { kind: 'refused', status: 401, reason: 'authentication_required' }
      }
      if (!current.scopes.includes(requiredScope)) {
        return { kind: 'refused', status: 403, reason: 'scope_required' }
      }
      admittedScopes = current.scopes
    } catch {
      return { kind: 'refused', status: 401, reason: 'authentication_required' }
    }
  }
  const ownerId = candidate.orgId ?? candidate.userId ?? candidate.subject
  return {
    kind: 'authenticated',
    principal: Object.freeze({
      principalId: `clerk_api_key:${candidate.id}`,
      ownerId,
      credentialId: candidate.id,
      scopes: Object.freeze([...admittedScopes].sort()),
    }),
  }
}
