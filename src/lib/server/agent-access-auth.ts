import { clerkClient } from '@clerk/tanstack-react-start/server'
import { isClerkAPIResponseError } from '@clerk/shared/error'

import { authOwnerHandoff } from '@/lib/http/auth-continuation'
import { bearerChallenge, bearerModeChallenge } from '@/lib/http/oauth-challenge'
import { gatewayFailureToProblem } from '@/lib/errors'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
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
export function authRefusalProblem(request: Request, refusal: AgentAccessRefusal, requiredScope?: string, requiredMode?: AgentAccessAuthorityMode, correlationId?: string, hint?: string): Response {
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
      ? `This agent key lacks the required scope. Run \`ae connect\` for an owner-approved credential; owner access is at ${base}/agent-access.`
      : `Connect an agent key: run \`ae connect\` or open owner access at ${base}/agent-access.`
  return withRequestCorrelationHeader(problem({
    ...failure,
    status: refusal.status,
    detail: unavailable || hint === undefined ? detail : `${detail} ${hint}`,
    retryable: unavailable,
    extras: {
      requestId,
      next: [],
      ...(unavailable ? {} : { ownerHandoff: authOwnerHandoff(base) }),
    },
  }, unavailable
    ? { 'Retry-After': '5', Vary: 'Authorization' }
    : { 'WWW-Authenticate': requiredMode === undefined ? bearerChallenge(base, requiredScope) : bearerModeChallenge(base, requiredMode), Vary: 'Authorization' }), requestId)
}

export type AgentAccessAuthenticationOptions = Readonly<{
  request?: Request
  authenticate?: () => Promise<AgentAccessApiKeyAuth>
  verifyKeyState?: (keyId: string) => Promise<AgentAccessCurrentApiKey>
  resolvePrincipal?: AgentAccessPrincipalResolver
  requiredScope?: string | null
  requiredScopes?: readonly string[]
  requiredAnyScopes?: readonly string[]
  requiredMode?: AgentAccessAuthorityMode
  consequenceResource?: string
}>

/**
 * The Clerk-verified API key candidate for the request, or null when the
 * credential is missing, malformed, rejected or unverifiable. Callers pick a
 * rate bucket by verified identity and reuse the candidate instead of verifying
 * the same secret twice.
 */
export async function verifyApiKeyCandidate(
  request: Request,
  authenticate?: () => Promise<AgentAccessApiKeyAuth>,
): Promise<AgentAccessApiKeyAuth | null> {
  try {
    if (authenticate !== undefined) {
      const candidate = await authenticate()
      return candidate.isAuthenticated ? candidate : null
    }
    const authorization = request.headers.get('authorization')
    const secret = authorization === null
      ? request.headers.get('x-api-key')
      : /^Bearer ([^\s]+)$/i.exec(authorization)?.[1]
    if (secret === null || secret === undefined || secret.length === 0) return null
    const verified = await clerkClient().apiKeys.verify(secret)
    return {
      isAuthenticated: true,
      tokenType: 'api_key',
      id: verified.id,
      subject: verified.subject,
      scopes: verified.scopes,
      claims: verified.claims,
    }
  } catch {
    return null
  }
}

export async function authenticateAgentAccess(
  options: AgentAccessAuthenticationOptions = {},
): Promise<Readonly<{ kind: 'authenticated'; principal: AgentAccessPrincipal }> | AgentAccessRefusal> {
  const requiredScope = options.requiredScope === undefined ? MARKET_TOOLS_CALL_SCOPE : options.requiredScope
  const requiredScopes = Object.freeze([...new Set(
    options.requiredScopes ?? (requiredScope === null ? [] : [requiredScope]),
  )].sort())
  const requiredAnyScopes = Object.freeze([...new Set(options.requiredAnyScopes ?? [])].sort())
  let candidate: AgentAccessApiKeyAuth
  if (options.authenticate === undefined && options.request === undefined) {
    return { kind: 'refused', status: 401, reason: 'authentication_required' }
  }
  try {
    if (options.authenticate !== undefined) {
      candidate = await options.authenticate()
    } else {
      const authorization = options.request?.headers.get('authorization')
      const bearer = authorization === null || authorization === undefined
        ? null
        : /^Bearer ([^\s]+)$/i.exec(authorization)
      const secret = bearer?.[1] ?? (authorization === null ? options.request?.headers.get('x-api-key') : null)
      if (secret === null || secret === undefined || secret.length === 0) {
        return { kind: 'refused', status: 401, reason: 'authentication_required' }
      }
      const verified = await clerkClient().apiKeys.verify(secret)
      candidate = {
        isAuthenticated: true,
        tokenType: 'api_key',
        id: verified.id,
        subject: verified.subject,
        scopes: verified.scopes,
        claims: verified.claims,
      }
    }
  } catch (cause) {
    if (isClerkAPIResponseError(cause) && cause.status >= 400 && cause.status < 500 && cause.status !== 429) {
      return { kind: 'refused', status: 401, reason: 'authentication_required' }
    }
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
  const deploymentEnvironment = deploymentPaymentEnvironment(process.env)
  const environment = claims?.aeEnvironment
  if (deploymentEnvironment === undefined
    || (environment !== 'sandbox' && environment !== 'production')
    || environment !== deploymentEnvironment) {
    return { kind: 'refused', status: 401, reason: 'authentication_required' }
  }
  if (environment === 'production' && authorityMode === 'unrestricted_test_only') {
    return { kind: 'refused', status: 403, reason: 'scope_required' }
  }
  const projection: AgentAccessCredentialProjection = Object.freeze({
    credentialId: candidate.id,
    applicationRef: claimString(claims, 'aeApplicationRef') ?? AGENT_ACCESS_DEFAULT_APPLICATION_REF,
    environment,
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
