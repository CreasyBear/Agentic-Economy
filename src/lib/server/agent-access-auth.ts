import { auth, clerkClient } from '@clerk/tanstack-react-start/server'

import { authContinuation } from '@/lib/http/auth-continuation'
import { bearerChallenge, bearerModeChallenge } from '@/lib/http/oauth-challenge'
import { gatewayFailureToProblem } from '@/lib/errors'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { canonicalResolvedPrincipal, type AgentAccessCredentialProjection } from '@/lib/server/agent-access-principal'
import { problem } from '@/lib/server/problem'
import { currentRequestCorrelationId, readRequestCorrelationId, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import { callPublicSourceMutation, sourceMutation } from '@/lib/server/convex-source'
import {
  sourceWriteAdmissionFromRequest,
  sourceWriteRequestFromAdmission,
} from '@/lib/server/source-write-admission'
import {
  AGENT_ACCESS_DEFAULT_APPLICATION_REF,
  AGENT_ACCESS_ENVIRONMENT_VALUES,
  MARKET_TOOLS_CALL_SCOPE,
  agentAuthorityModeAllows,
  agentAuthorityModeForScopes,
  type AgentAccessEnvironment,
  type AgentAccessPrincipal,
} from '@/modules/agent-access/agent-access'
import type { AgentAccessAuthorityMode } from '@/modules/agent-access/contract'
import type { SourceWriteAdmission, SourceWriteAdmissionRequest } from '@/modules/security/source-write-admission'
import { degrade } from '@/lib/observability/degrade'
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
  }
}

export type AgentAccessRefusal = Readonly<
  | { kind: 'refused'; status: 401 | 403; reason: 'authentication_required' | 'scope_required' }
  | { kind: 'refused'; status: 503; reason: 'source_unavailable'; retryable: true }
>

const AUTH_SOURCE_UNAVAILABLE = {
  kind: 'refused', status: 503, reason: 'source_unavailable', retryable: true,
} as const satisfies AgentAccessRefusal

/** Authentication failures carry recovery, while source outages never masquerade as bad keys. */
export function authRefusalProblem(request: Request, refusal: AgentAccessRefusal, requiredScope?: string, requiredMode?: AgentAccessAuthorityMode, correlationId?: string): Response {
  const base = resolveCanonicalBaseUrl(request).baseUrl
  const requestId = correlationId ?? currentRequestCorrelationId() ?? readRequestCorrelationId(request)
  const unavailable = refusal.status === 503
  const failure = gatewayFailureToProblem({
    code: refusal.reason,
    kind: unavailable ? 'error' : 'refused',
    retryable: unavailable,
  })
  const detail = unavailable
    ? 'Agent credential verification is temporarily unavailable. Retry after 5 seconds.'
    : refusal.reason === 'scope_required'
      ? `This agent key lacks the required scope. Run \`ae connect\` for an owner-approved credential or complete OAuth device authorization at ${base}/oauth/device_authorization.`
      : `Connect an agent key: run \`ae connect\` or complete OAuth device authorization at ${base}/oauth/device_authorization.`
  return withRequestCorrelationHeader(problem({
    ...failure,
    status: refusal.status,
    detail,
    retryable: unavailable,
    extras: {
      requestId,
      next: unavailable ? [] : authContinuation(base),
    },
  }, unavailable
    ? { 'Retry-After': '5', Vary: 'Authorization' }
    : { 'WWW-Authenticate': requiredMode === undefined ? bearerChallenge(base, requiredScope) : bearerModeChallenge(base, requiredMode), Vary: 'Authorization' }), requestId)
}

export type AgentAccessAuthenticationOptions = Readonly<{
  authenticate?: () => Promise<AgentAccessApiKeyAuth>
  verifyKeyState?: (keyId: string) => Promise<AgentAccessCurrentApiKey>
  resolvePrincipal?: AgentAccessPrincipalResolver
  requiredScope?: string | null
  requiredScopes?: readonly string[]
  requiredAnyScopes?: readonly string[]
  requiredMode?: AgentAccessAuthorityMode
  consequenceResource?: string
}>

export async function authenticateAgentAccess(
  options: AgentAccessAuthenticationOptions = {},
): Promise<Readonly<{ kind: 'authenticated'; principal: AgentAccessPrincipal }> | AgentAccessRefusal> {
  const requiredScope = options.requiredScope === undefined ? MARKET_TOOLS_CALL_SCOPE : options.requiredScope
  const requiredScopes = Object.freeze([...new Set(
    options.requiredScopes ?? (requiredScope === null ? [] : [requiredScope]),
  )].sort())
  const requiredAnyScopes = Object.freeze([...new Set(options.requiredAnyScopes ?? [])].sort())
  let candidate: AgentAccessApiKeyAuth
  try {
    candidate = options.authenticate !== undefined
      ? await options.authenticate()
      : await auth({ acceptsToken: 'api_key' }) as AgentAccessApiKeyAuth
  } catch (cause) {
    return degrade(cause, AUTH_SOURCE_UNAVAILABLE, { site: 'authenticateAgentAccess', reason: 'source_unavailable' })
  }
  if (!candidate.isAuthenticated || candidate.tokenType !== 'api_key' || candidate.id === null || candidate.subject === null || candidate.scopes === null) {
    return { kind: 'refused', status: 401, reason: 'authentication_required' }
  }
  if (!candidate.subject.startsWith('user_')) {
    return { kind: 'refused', status: 403, reason: 'scope_required' }
  }
  const candidateScopes = candidate.scopes
  if (requiredScopes.some((scope) => !candidateScopes.includes(scope))) return { kind: 'refused', status: 403, reason: 'scope_required' }
  if (requiredAnyScopes.length > 0 && !requiredAnyScopes.some((scope) => candidateScopes.includes(scope))) {
    return { kind: 'refused', status: 403, reason: 'scope_required' }
  }
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
      if (requiredAnyScopes.length > 0 && !requiredAnyScopes.some((scope) => current.scopes.includes(scope))) {
        return { kind: 'refused', status: 403, reason: 'scope_required' }
      }
      admittedScopes = current.scopes
      claims = current.claims
    } catch (cause) {
      return degrade(cause, AUTH_SOURCE_UNAVAILABLE, { site: 'authenticateAgentAccess', reason: 'source_unavailable' })
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
      const matchedAnyScope = requiredAnyScopes.find((scope) => projection.scopes.includes(scope))
      const bindingRequiredScopes = matchedAnyScope === undefined
        ? requiredScopes
        : Object.freeze([...new Set([...requiredScopes, matchedAnyScope])].sort())
      const stored = canonicalResolvedPrincipal(
        await options.resolvePrincipal(projection, bindingRequiredScopes, consequenceResource),
        projection,
        bindingRequiredScopes,
      )
      if (stored === undefined) {
        return { kind: 'refused', status: 403, reason: 'scope_required' }
      }
      return { kind: 'authenticated', principal: stored }
    } catch (cause) {
      return degrade(cause, AUTH_SOURCE_UNAVAILABLE, { site: 'authenticateAgentAccess', reason: 'source_unavailable' })
    }
  }
  return { kind: 'refused', status: 401, reason: 'authentication_required' }
}

function canonicalConsequenceResource(value: string | undefined): string | undefined {
  if (value === undefined || value !== value.trim()) return undefined
  return /^surface:[a-z0-9][a-z0-9:._/-]{0,199}$/.test(value) ? value : undefined
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
