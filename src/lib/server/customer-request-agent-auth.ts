import { auth } from '@clerk/tanstack-react-start/server'

const REQUIRED_SCOPE = 'customer_requests:create'

type ApiKeyAuth = Readonly<{
  isAuthenticated: boolean
  tokenType: 'api_key' | null
  id: string | null
  subject: string | null
  scopes: readonly string[] | null
  userId?: string | null
  orgId?: string | null
}>

export type CustomerRequestAgentPrincipal = Readonly<{
  principalId: string
  ownerId: string
  credentialId: string
  scopes: readonly string[]
}>

export async function authenticateCustomerRequestAgent(options: Readonly<{
  authenticate?: () => Promise<ApiKeyAuth>
}> = {}): Promise<Readonly<{ kind: 'authenticated'; principal: CustomerRequestAgentPrincipal }> | Readonly<{
  kind: 'refused'
  status: 401 | 403
  reason: 'authentication_required' | 'scope_required'
}>> {
  const candidate = await (options.authenticate ?? (async () => await auth({ acceptsToken: 'api_key' }) as ApiKeyAuth))()
  if (!candidate.isAuthenticated || candidate.tokenType !== 'api_key' || candidate.id === null || candidate.subject === null || candidate.scopes === null) {
    return { kind: 'refused', status: 401, reason: 'authentication_required' }
  }
  if (!candidate.scopes.includes(REQUIRED_SCOPE)) return { kind: 'refused', status: 403, reason: 'scope_required' }
  const ownerId = candidate.orgId ?? candidate.userId ?? candidate.subject
  return {
    kind: 'authenticated',
    principal: Object.freeze({
      principalId: `clerk_api_key:${candidate.id}`,
      ownerId,
      credentialId: candidate.id,
      scopes: Object.freeze([...candidate.scopes].sort()),
    }),
  }
}
