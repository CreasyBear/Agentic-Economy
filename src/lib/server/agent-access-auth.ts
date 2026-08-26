import { auth, clerkClient } from '@clerk/tanstack-react-start/server'

import { callPublicSourceMutation, sourceMutation } from '@/lib/server/convex-source'
import {
  sourceWriteAdmissionFromRequest,
  sourceWriteRequestFromAdmission,
} from '@/lib/server/source-write-admission'
import {
  AGENT_ACCESS_DEFAULT_APPLICATION_REF,
  AGENT_ACCESS_ENVIRONMENT_VALUES,
  MARKET_OPERATIONS_INVOKE_SCOPE,
  agentAuthorityModeAllows,
  agentAuthorityModeForScopes,
  type AgentAccessEnvironment,
  type AgentAccessPrincipal,
} from '@/modules/agent-access/agent-access'
import type { AgentAccessAuthorityMode } from '@/modules/agent-access/contract'
import { accountRef, principalRef } from '@/modules/principal-account/public'
import type { SourceWriteAdmission, SourceWriteAdmissionRequest } from '@/modules/security/source-write-admission'
export type { AgentAccessPrincipal }

export type AgentAccessApiKeyAuth = Readonly<{
  isAuthenticated: boolean
  tokenType: 'api_key' | null
  id: string | null
  subject: string | null
  scopes: readonly string[] | null
  claims?: Readonly<Record<string, unknown>> | null
  userId?: string | null
  orgId?: string | null
}>

export type AgentAccessCurrentApiKey = Readonly<{
  id: string
  subject: string
  revoked: boolean
  expired: boolean
  scopes: readonly string[]
  claims?: Readonly<Record<string, unknown>> | null
}>

type ResolveAgentPrincipalArgs = Readonly<{
  credentialId: string
  applicationRef: string
  environment: AgentAccessEnvironment
  scopes: readonly string[]
  requiredScopes: readonly string[]
  authorityMode: AgentAccessAuthorityMode
  operationKey: string
  correlationId: string
  sourceWrite: SourceWriteAdmission
  sourceWriteRequest: SourceWriteAdmissionRequest
}>

const resolveAgentPrincipalMutation = sourceMutation<ResolveAgentPrincipalArgs, AgentAccessPrincipal | null>(
  'authorityBoundary:resolveAgentBinding',
)

export type AgentAccessCredentialProjection = Readonly<{
  credentialId: string
  applicationRef: string
  environment: AgentAccessEnvironment
  scopes: readonly string[]
  authorityMode: AgentAccessAuthorityMode
}>

export type AgentAccessPrincipalResolver = (
  projection: AgentAccessCredentialProjection,
  requiredScopes: readonly string[],
  consequenceResource: string,
) => Promise<AgentAccessPrincipal | null>

export function resolveAgentAccessPrincipal(
  request: Request,
  body: string | Uint8Array,
  correlationId: string,
  options: Readonly<{ env?: Record<string, string | undefined> }> = {},
): AgentAccessPrincipalResolver {
  return async (projection, requiredScopes, consequenceResource) => {
    try {
      const operationKey = canonicalConsequenceResource(consequenceResource)
      if (operationKey === undefined) return null
      const bindingRequiredScopes = requiredScopes.length === 0 ? projection.scopes : requiredScopes
      const command = {
        credentialId: projection.credentialId,
        applicationRef: projection.applicationRef,
        environment: projection.environment,
        scopes: [...projection.scopes],
        requiredScopes: [...bindingRequiredScopes],
        authorityMode: projection.authorityMode,
        operationKey,
        correlationId,
      }
      const sourceWrite = await sourceWriteAdmissionFromRequest({
        request,
        command,
        body,
        scope: 'agent_identity',
        operationKey,
        correlationId,
        ...(options.env === undefined ? {} : { env: options.env }),
      })
      return await callPublicSourceMutation(resolveAgentPrincipalMutation, {
        ...command,
        sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
        sourceWrite,
      })
    } catch {
      return null
    }
  }
}

export type AgentAccessAuthenticationOptions = Readonly<{
  authenticate?: () => Promise<AgentAccessApiKeyAuth>
  verifyKeyState?: (keyId: string) => Promise<AgentAccessCurrentApiKey>
  resolvePrincipal?: AgentAccessPrincipalResolver
  requiredScope?: string | null
  requiredScopes?: readonly string[]
  requiredMode?: AgentAccessAuthorityMode
  consequenceResource?: string
}>

export async function authenticateAgentAccess(
  options: AgentAccessAuthenticationOptions = {},
): Promise<Readonly<{ kind: 'authenticated'; principal: AgentAccessPrincipal }> | Readonly<{
  kind: 'refused'
  status: 401 | 403
  reason: 'authentication_required' | 'scope_required'
}>> {
  const requiredScope = options.requiredScope === undefined ? MARKET_OPERATIONS_INVOKE_SCOPE : options.requiredScope
  const requiredScopes = Object.freeze([...new Set(
    options.requiredScopes ?? (requiredScope === null ? [] : [requiredScope]),
  )].sort())
  let candidate: AgentAccessApiKeyAuth
  try {
    candidate = await (options.authenticate ?? (async () =>
      await auth({ acceptsToken: 'api_key' }) as AgentAccessApiKeyAuth))()
  } catch {
    return { kind: 'refused', status: 401, reason: 'authentication_required' }
  }
  if (!candidate.isAuthenticated || candidate.tokenType !== 'api_key' || candidate.id === null || candidate.subject === null || candidate.scopes === null) {
    return { kind: 'refused', status: 401, reason: 'authentication_required' }
  }
  if (!candidate.subject.startsWith('user_')) {
    return { kind: 'refused', status: 403, reason: 'scope_required' }
  }
  const candidateScopes = candidate.scopes
  if (requiredScopes.some((scope) => !candidateScopes.includes(scope))) return { kind: 'refused', status: 403, reason: 'scope_required' }
  let admittedScopes = candidateScopes
  let claims = candidate.claims
  if (options.verifyKeyState !== undefined || options.authenticate === undefined) {
    try {
      const current = await (options.verifyKeyState ?? (async (keyId: string) => {
        const key = await clerkClient().apiKeys.get(keyId)
        return {
          id: key.id,
          subject: key.subject,
          revoked: key.revoked,
          expired: key.expired,
          scopes: key.scopes,
          claims: key.claims,
        }
      }))(candidate.id)
      if (current.id !== candidate.id || current.subject !== candidate.subject || current.revoked || current.expired) {
        return { kind: 'refused', status: 401, reason: 'authentication_required' }
      }
      if (requiredScopes.some((scope) => !current.scopes.includes(scope))) return { kind: 'refused', status: 403, reason: 'scope_required' }
      admittedScopes = current.scopes
      claims = current.claims
    } catch {
      return { kind: 'refused', status: 401, reason: 'authentication_required' }
    }
  }
  const authorityMode = agentAuthorityModeForScopes(admittedScopes, { allowCustomerDefault: true })
  if (authorityMode === undefined) return { kind: 'refused', status: 403, reason: 'scope_required' }
  if (options.requiredMode !== undefined && !agentAuthorityModeAllows(authorityMode, options.requiredMode)) {
    return { kind: 'refused', status: 403, reason: 'scope_required' }
  }
  const projection: AgentAccessCredentialProjection = Object.freeze({
    credentialId: candidate.id,
    applicationRef: claimString(claims, 'aeApplicationRef') ?? AGENT_ACCESS_DEFAULT_APPLICATION_REF,
    environment: environmentFromClaims(claims),
    scopes: Object.freeze([...admittedScopes].sort()),
    authorityMode,
  })
  if (options.resolvePrincipal !== undefined) {
    const consequenceResource = canonicalConsequenceResource(options.consequenceResource)
    if (consequenceResource === undefined) {
      return { kind: 'refused', status: 403, reason: 'scope_required' }
    }
    try {
      const stored = canonicalResolvedPrincipal(
        await options.resolvePrincipal(projection, requiredScopes, consequenceResource),
        projection,
        requiredScopes,
      )
      if (stored === undefined) {
        return { kind: 'refused', status: 403, reason: 'scope_required' }
      }
      return { kind: 'authenticated', principal: stored }
    } catch {
      return { kind: 'refused', status: 401, reason: 'authentication_required' }
    }
  }
  return { kind: 'refused', status: 401, reason: 'authentication_required' }
}

function canonicalConsequenceResource(value: string | undefined): string | undefined {
  if (value === undefined || value !== value.trim()) return undefined
  return /^surface:[a-z0-9][a-z0-9:._/-]{0,199}$/.test(value) ? value : undefined
}

function canonicalResolvedPrincipal(
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
  } catch {
    return undefined
  }
}

function claimString(claims: Readonly<Record<string, unknown>> | null | undefined, name: string): string | undefined {
  const value = claims?.[name]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function environmentFromClaims(claims: Readonly<Record<string, unknown>> | null | undefined): AgentAccessEnvironment {
  const value = claimString(claims, 'aeEnvironment')
  if (value === 'production') return 'production'
  if (value === 'sandbox' || value === 'development') return 'sandbox'
  return AGENT_ACCESS_ENVIRONMENT_VALUES[0]
}
