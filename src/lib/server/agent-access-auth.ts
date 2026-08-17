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
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: AgentAccessEnvironment
  scopes: readonly string[]
  authorityMode: AgentAccessAuthorityMode
  operationKey: string
  correlationId: string
  sourceWrite: SourceWriteAdmission
  sourceWriteRequest: SourceWriteAdmissionRequest
}>

const resolveAgentPrincipalMutation = sourceMutation<ResolveAgentPrincipalArgs, AgentAccessPrincipal | null>(
  'agentAccessPrincipals:resolveAgentPrincipal',
)

export function resolveAgentAccessPrincipal(
  request: Request,
  body: string | Uint8Array,
  correlationId: string,
  options: Readonly<{ env?: Record<string, string | undefined> }> = {},
): (principal: AgentAccessPrincipal) => Promise<AgentAccessPrincipal | null> {
  return async (principal) => {
    try {
      const operationKey = `agent-access:resolve:${principal.credentialId}`
      const command = {
        principalId: principal.principalId,
        ownerId: principal.ownerId,
        credentialId: principal.credentialId,
        applicationRef: principal.applicationRef,
        environment: principal.environment,
        scopes: [...principal.scopes],
        authorityMode: principal.authorityMode,
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
  resolvePrincipal?: (principal: AgentAccessPrincipal) => Promise<AgentAccessPrincipal | null>
  requiredScope?: string | null
  requiredMode?: AgentAccessAuthorityMode
}>

export async function authenticateAgentAccess(
  options: AgentAccessAuthenticationOptions = {},
): Promise<Readonly<{ kind: 'authenticated'; principal: AgentAccessPrincipal }> | Readonly<{
  kind: 'refused'
  status: 401 | 403
  reason: 'authentication_required' | 'scope_required'
}>> {
  const requiredScope = options.requiredScope === undefined ? MARKET_OPERATIONS_INVOKE_SCOPE : options.requiredScope
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
  if (requiredScope !== null && !candidate.scopes.includes(requiredScope)) return { kind: 'refused', status: 403, reason: 'scope_required' }
  let admittedScopes = candidate.scopes
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
      if (requiredScope !== null && !current.scopes.includes(requiredScope)) return { kind: 'refused', status: 403, reason: 'scope_required' }
      admittedScopes = current.scopes
      claims = current.claims
    } catch {
      return { kind: 'refused', status: 401, reason: 'authentication_required' }
    }
  }
  const authorityMode = agentAuthorityModeForScopes(admittedScopes, { allowCustomerDefault: true })
    ?? (requiredScope === null
      ? undefined
      : (requiredScope.startsWith('customer_requests:') || requiredScope.startsWith('work_trees:') ? undefined : 'inspect_only'))
  if (authorityMode === undefined) return { kind: 'refused', status: 403, reason: 'scope_required' }
  if (options.requiredMode !== undefined && !agentAuthorityModeAllows(authorityMode, options.requiredMode)) {
    return { kind: 'refused', status: 403, reason: 'scope_required' }
  }
  const ownerId = candidate.subject
  const principalId = `clerk_api_key:${candidate.id}`
  const principal: AgentAccessPrincipal = Object.freeze({
    principalId,
    ownerId,
    credentialId: candidate.id,
    applicationRef: claimString(claims, 'aeApplicationRef') ?? AGENT_ACCESS_DEFAULT_APPLICATION_REF,
    environment: environmentFromClaims(claims),
    scopes: Object.freeze([...admittedScopes].sort()),
    authorityMode,
  })
  if (options.resolvePrincipal !== undefined) {
    try {
      const stored = await options.resolvePrincipal(principal)
      if (stored === null || stored.credentialId !== principal.credentialId || stored.ownerId !== principal.ownerId
        || stored.applicationRef !== principal.applicationRef || stored.environment !== principal.environment
        || stored.authorityMode !== principal.authorityMode
        || stored.scopes.some((scope) => !principal.scopes.includes(scope))) {
        return { kind: 'refused', status: 403, reason: 'scope_required' }
      }
      return { kind: 'authenticated', principal: stored }
    } catch {
      return { kind: 'refused', status: 401, reason: 'authentication_required' }
    }
  }
  return { kind: 'authenticated', principal }
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
