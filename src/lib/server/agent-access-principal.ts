import { degrade } from '@/lib/observability/degrade'
import type { AgentAccessCredentialProjection } from '@/lib/server/agent-access-auth'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { accountRef, principalRef } from '@/modules/principal-account/public'

export function canonicalResolvedPrincipal(
  value: AgentAccessPrincipal | null,
  projection: AgentAccessCredentialProjection,
  requiredScopes: readonly string[],
): AgentAccessPrincipal | undefined {
  if (value === null) return undefined
  try {
    const principalId = principalRef(value.principalId)
    const ownerId = accountRef(value.ownerId)
    const credentialId = value.credentialId
    const applicationRef = value.applicationRef
    const environment = value.environment
    const authorityMode = value.authorityMode
    const scopeValues = value.scopes
    if (!Array.isArray(scopeValues)
      || scopeValues.length === 0
      || scopeValues.some((scope) => typeof scope !== 'string')
      || new Set(scopeValues).size !== scopeValues.length) return undefined
    const scopes = Object.freeze([...scopeValues].sort())
    if (credentialId !== projection.credentialId
      || applicationRef !== projection.applicationRef
      || environment !== projection.environment
      || authorityMode !== projection.authorityMode
      || scopes.some((scope) => !projection.scopes.includes(scope))
      || requiredScopes.some((scope) => !scopes.includes(scope))) return undefined
    return Object.freeze({
      principalId,
      ownerId,
      credentialId,
      applicationRef,
      environment,
      scopes,
      authorityMode,
    })
  } catch (cause) {
    return degrade(cause, undefined, { site: 'canonicalResolvedPrincipal', reason: 'invalid_response' })
  }
}
