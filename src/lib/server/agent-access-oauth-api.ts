import { auth, clerkClient } from '@clerk/tanstack-react-start/server'
import type { RateLimitAdmission } from '@/lib/server/rate-limit'
import type { ProblemInput } from '@/lib/errors'
import { problem } from '@/lib/server/problem'

import { bearerChallenge, oauthProtectedResourceMetadata } from '@/lib/http/oauth-challenge'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { isLocalE2EAuthBypassEnabled, LOCAL_E2E_OPERATOR_PRINCIPAL } from '@/lib/server/local-e2e-bypass'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import {
  AGENT_ACCESS_AUTHORITY_MODE_VALUES,
  MARKET_OPERATIONS_INVOKE_SCOPE,
  agentAuthorityScopeForMode,
  type AgentAccessAuthorityMode,
} from '@/modules/agent-access/contract'
import { isRecord } from '@/modules/common/is-record'
import {
  AGENT_ACCESS_OAUTH_CODE_CHALLENGE_METHODS,
  AGENT_ACCESS_OAUTH_ERROR_DESCRIPTIONS,
  AGENT_ACCESS_OAUTH_ERROR_VALUES,
  AGENT_ACCESS_OAUTH_GRANT_TYPES,
  AGENT_ACCESS_OAUTH_PATHS,
  AGENT_ACCESS_OAUTH_RESPONSE_TYPES,
  AGENT_ACCESS_OAUTH_TOKEN_ENDPOINT_AUTH_METHODS,
  approveGrant,
  beginAuthorizationCodeGrant,
  beginDeviceGrant,
  claimGrantDelivery,
  completeGrantDelivery,
  createOpaqueOAuthValue,
  hashOAuthValue,
  AgentAccessOAuthIssueRefusal,
  denyGrant,
  normalizeRequestedScopes,
  pollDeviceGrant,
  readGrantForConsent,
  resetGrantDelivery,
  type AgentAccessOAuthClient,
  type AgentConnectionTarget,
  type AgentCredentialReplacement,
  type AgentAccessOAuthErrorCode,
  type AgentAccessOAuthGrant,
  type AgentAccessOAuthIssueKey,
  type AgentAccessOAuthRequestedAccess,
  type AgentAccessOAuthStore,
  type AgentAccessOAuthTransition,
} from '@/modules/agent-access/oauth-state'
import {
  AGENT_ACCESS_DEFAULT_APPLICATION_REF,
  AGENT_ACCESS_PURPOSE,
  AGENT_ACCESS_MAX_TTL_SECONDS,
  AGENT_ACCESS_MIN_TTL_SECONDS,
  issueAgentAccessKey,
} from '@/modules/agent-access/agent-access'
import { issuedAgentGrantRef } from '@/modules/agent-access/issued-agent-binding'
import { defaultSandboxAgentAccessPolicy } from '@/modules/agent-access/sandbox-policy'
import { buildProductionAgentAccessPolicy, defaultProductionAgentAccessPolicy } from '@/modules/agent-access/production-policy'
import { agentAccessPolicySchema, type AgentAccessPolicy } from '@/modules/agent-access/policy'
import { registerAgentAccessGrant } from '@/modules/agent-access/policy.functions'
import {
  createClerkAgentAccessKeyApi,
  cancelAgentCredentialReplacement,
  prepareAgentCredentialReplacement,
  promoteAgentCredentialReplacement,
  recordAgentProviderRevocation,
  registerIssuedAgentBinding,
} from '@/modules/agent-access/agent-access.functions'
import { assertCsrf } from '@/modules/security/public'
import { loadAgentDirectoryReadback } from '@/modules/agent-access/agent-access-console'
import { readCapabilityOperationCompare } from '@/modules/capability-supply/operation-source'
import { isPublicOperationRef } from '@/modules/capability-supply/public'

type OAuthApiOptions = Readonly<{
  store?: AgentAccessOAuthStore
  now?: () => number
  canonicalBaseUrl?: string
  authenticateOwner?: () => Promise<{ isAuthenticated: boolean; userId: string | null }>
  issueKey?: (input: Readonly<{
    ownerId: string
    name: string
    idempotencyKey: string
    scopes: readonly string[]
    grantRef: string
    authorityMode: AgentAccessAuthorityMode
    requestedAccess: AgentAccessOAuthRequestedAccess
    policy: AgentAccessPolicy
    target: AgentConnectionTarget
  }>) => Promise<Readonly<{ keyId: string; secret?: string; replacement?: AgentCredentialReplacement }>>
  getSecret?: (keyId: string) => Promise<{ secret: string }>
  promoteReplacement?: (replacement: AgentCredentialReplacement) => Promise<Readonly<{ kind: 'completed' | 'replayed'; providerCredentialId: string } | { kind: 'conflict' | 'unavailable' }>>
  cancelReplacement?: (replacement: AgentCredentialReplacement) => Promise<Readonly<{ kind: 'completed' | 'replayed'; providerCredentialId: string } | { kind: 'conflict' | 'unavailable' }>>
  revokeProviderCredential?: (credentialId: string, reason: string) => Promise<void>
  recordProviderRevocation?: (input: Readonly<{
    principalRef: string
    credentialRef: string
    providerCredentialId: string
    correlationRef: string
    outcome: 'revoked'
  }>) => Promise<Readonly<{ kind: 'completed' | 'replayed' | 'conflict' } | { kind: 'refused'; code: 'authentication_required' }>>
  rateLimit?: RateLimitAdmission
  devicePollRateLimit?: RateLimitAdmission
  listAgents?: (cursor: string | null) => Promise<Readonly<{
    items: readonly Readonly<{ principalRef: string; displayName: string }>[]
    nextCursor?: string
  }>>
}>

type ConsentAgentTargets = Readonly<{
  items: readonly Readonly<{ principalRef: string; displayName: string }>[]
  nextCursor?: string
  unavailable?: true
}>

export type { OAuthApiOptions }

export type OAuthErrorCode = AgentAccessOAuthErrorCode

export {
  AGENT_ACCESS_OAUTH_ERROR_DESCRIPTIONS,
  AGENT_ACCESS_OAUTH_ERROR_VALUES,
  AGENT_ACCESS_OAUTH_GRANT_TYPES,
  AGENT_ACCESS_OAUTH_PATHS,
  AGENT_ACCESS_OAUTH_RESPONSE_TYPES,
  AGENT_ACCESS_OAUTH_TOKEN_ENDPOINT_AUTH_METHODS,
  AGENT_ACCESS_OAUTH_CODE_CHALLENGE_METHODS,
}

const OAUTH_AUTHORIZATION_UNAVAILABLE: ProblemInput = {
  status: 503,
  kind: 'UNAVAILABLE',
  code: 'oauth_authorization_unavailable',
  detail: 'The authorization request is temporarily unavailable.',
  retryable: true,
}
export function oauthAuthorizationUnavailableResponse(): Response {
  return problem(OAUTH_AUTHORIZATION_UNAVAILABLE)
}
import {
  AUTHORIZATION_CODE_GRANT_TYPE,
  DEVICE_GRANT_TYPE,
  PUBLIC_CLIENT_AUTH_METHOD,
  arrayOfStrings,
  consentHtml,
  modeForGrant,
  oauthError,
  oauthTransitionError,
  parseAuthorizationDetails,
  readForm,
  readJson,
  validRedirectUri,
} from './agent-access-oauth/protocol'

export async function handleDeviceAuthorizationPost(request: Request, options: OAuthApiOptions = {}): Promise<Response> {
  const formResult = await readForm(request)
  if (formResult.kind === 'too_large') return oauthError('invalid_request', 413)
  if (formResult.kind !== 'ok') return oauthError('invalid_request', 400)
  const form = formResult.value
  const clientId = form.get('client_id')
  const limited = await oauthAdmissionResponse(request, options, `device_authorization:${clientId ?? 'missing'}`)
  if (limited !== undefined) return limited
  const client = await readClient(clientId, options)
  if (client === null) return oauthError('invalid_client', 401)
  const scopeText = form.get('scope')
  if (scopeText === null) return oauthError('invalid_scope', 400)
  const authorizationDetails = parseAuthorizationDetails(form.get('authorization_details'))
  if (authorizationDetails.kind === 'invalid') return oauthError('invalid_request', 400)
  const requestedAccess = authorizationDetails.kind === 'ok' ? authorizationDetails.requestedAccess : undefined
  if (requestedAccess !== undefined && normalizeRequestedScopes(scopeText)?.mode === 'full_yolo') return oauthError('invalid_request', 400)
  const result = await beginDeviceGrant(requireStore(options), {
    client,
    requestedScopes: scopeText.split(/\s+/u),
    ...(requestedAccess === undefined ? {} : { requestedAccess }),
    now: currentNow(options),
  })
  if (result.kind !== 'ok') return oauthTransitionError(result)
  return Response.json({
    device_code: result.value.deviceCode,
    user_code: result.value.userCode,
    verification_uri: `${baseUrl(request, options)}${AGENT_ACCESS_OAUTH_PATHS.deviceVerification}?user_code=${encodeURIComponent(result.value.userCode)}`,
    expires_in: result.value.expiresIn,
    interval: result.value.interval,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function handleOAuthTokenPost(request: Request, options: OAuthApiOptions = {}): Promise<Response> {
  const formResult = await readForm(request)
  if (formResult.kind === 'too_large') return oauthError('invalid_request', 413)
  if (formResult.kind !== 'ok') return oauthError('invalid_request', 400)
  const form = formResult.value
  const grantType = form.get('grant_type')
  if (grantType === DEVICE_GRANT_TYPE) return await pollDeviceGrantRequest(form, request, options)
  if (grantType === AUTHORIZATION_CODE_GRANT_TYPE) return await exchangeAuthorizationCode(form, request, options)
  return oauthError('invalid_request', 400)
}

export async function handleOAuthRegisterPost(request: Request, options: OAuthApiOptions = {}): Promise<Response> {
  const payload = await readJson(request)
  if (payload.kind === 'too_large') return oauthError('invalid_request', 413)
  if (payload.kind !== 'ok') return oauthError('invalid_request', 400)
  const value = payload.value
  if (value === null || typeof value !== 'object') return oauthError('invalid_request', 400)
  if (Array.isArray(value)) return oauthError('invalid_client', 400)
  if (!isRecord(value)) return oauthError('invalid_request', 400)
  const limited = await oauthAdmissionResponse(request, options, 'registration')
  if (limited !== undefined) return limited
  const clientName = typeof value.client_name === 'string' ? value.client_name.trim() : ''
  const redirectUris = arrayOfStrings(value.redirect_uris)
  const grantTypes = arrayOfStrings(value.grant_types)
  const responseTypes = arrayOfStrings(value.response_types)
  const authorizationCodeRequested = grantTypes.includes(AUTHORIZATION_CODE_GRANT_TYPE)
  const responseTypesValid = authorizationCodeRequested
    ? responseTypes.length === AGENT_ACCESS_OAUTH_RESPONSE_TYPES.length && responseTypes[0] === AGENT_ACCESS_OAUTH_RESPONSE_TYPES[0]
    : responseTypes.length === 0
  const authMethod = value.token_endpoint_auth_method
  if (clientName.length < 1 || clientName.length > 120 || redirectUris.length === 0 || redirectUris.some((uri) => !validRedirectUri(uri))
    || !responseTypesValid
    || grantTypes.some((grant) => grant !== AUTHORIZATION_CODE_GRANT_TYPE && grant !== DEVICE_GRANT_TYPE)
    || grantTypes.length === 0 || authMethod !== PUBLIC_CLIENT_AUTH_METHOD) {
    return oauthError('invalid_client', 400)
  }
  const requestedScopes = normalizeRequestedScopes(typeof value.scope === 'string'
    ? value.scope
    : `${MARKET_OPERATIONS_INVOKE_SCOPE} ${agentAuthorityScopeForMode('inspect_only')}`)
  if (requestedScopes === undefined) return oauthError('invalid_scope', 400)
  const createdAt = currentNow(options)
  const client: AgentAccessOAuthClient = {
    clientId: `ae_${createOpaqueOAuthValue(18)}`,
    clientName,
    redirectUris,
    grantTypes: grantTypes as AgentAccessOAuthClient['grantTypes'],
    tokenEndpointAuthMethod: PUBLIC_CLIENT_AUTH_METHOD,
    createdAt,
  }
  await requireStore(options).insertClient(client)
  return Response.json({
    client_id: client.clientId,
    client_id_issued_at: Math.floor(client.createdAt / 1000),
    client_name: client.clientName,
    redirect_uris: client.redirectUris,
    grant_types: client.grantTypes,
    response_types: authorizationCodeRequested ? [...AGENT_ACCESS_OAUTH_RESPONSE_TYPES] : [],
    token_endpoint_auth_method: PUBLIC_CLIENT_AUTH_METHOD,
    scope: requestedScopes.scopes.join(' '),
  }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}

export async function handleOAuthAuthorizeGet(request: Request, options: OAuthApiOptions = {}): Promise<Response> {
  const url = new URL(request.url)
  const agentCursor = readAgentCursor(url)
  if (agentCursor === undefined) return oauthError('invalid_request', 400)
  const userCode = url.searchParams.get('user_code')
  if (userCode !== null) {
    const limited = await oauthAdmissionResponse(request, options, `user_code:${userCode}`)
    if (limited !== undefined) return limited
    const owner = await ownerIdentity(options)
    if (!owner.isAuthenticated || owner.userId === null) return Response.redirect(new URL('/sign-in', baseUrl(request, options)), 302)
    let result: AgentAccessOAuthTransition<AgentAccessOAuthGrant>
    try {
      result = await readGrantForConsent(requireStore(options), { userCode, ownerId: owner.userId, now: currentNow(options) })
    } catch {
      return oauthAuthorizationUnavailableResponse()
    }
    if (result.kind !== 'ok') return oauthTransitionError(result)
    const mode = modeForGrant(result.value)
    if (mode === undefined) return oauthError('invalid_scope', 400)
    return await consentResponse(result.value, mode, '', options, agentCursor)
  }
  const clientId = url.searchParams.get('client_id')
  const redirectUri = url.searchParams.get('redirect_uri')
  const state = url.searchParams.get('state')
  const responseType = url.searchParams.get('response_type')
  const challenge = url.searchParams.get('code_challenge')
  const challengeMethod = url.searchParams.get('code_challenge_method')
  const scopeText = url.searchParams.get('scope')
  let client: AgentAccessOAuthClient | null
  try {
    client = await readClient(clientId, options)
  } catch {
    return oauthAuthorizationUnavailableResponse()
  }
  if (client === null || redirectUri === null || responseType !== AGENT_ACCESS_OAUTH_RESPONSE_TYPES[0] || state === null || challenge === null || challengeMethod === null || scopeText === null) {
    return oauthError('invalid_request', 400)
  }
  const authorizationDetails = parseAuthorizationDetails(url.searchParams.get('authorization_details'))
  if (authorizationDetails.kind === 'invalid') return oauthError('invalid_request', 400)
  const requestedAccess = authorizationDetails.kind === 'ok' ? authorizationDetails.requestedAccess : undefined
  if (requestedAccess !== undefined && normalizeRequestedScopes(scopeText)?.mode === 'full_yolo') return oauthError('invalid_request', 400)
  const limited = await oauthAdmissionResponse(request, options, `authorization:${clientId ?? 'missing'}`)
  if (limited !== undefined) return limited
  const owner = await ownerIdentity(options)
  if (!owner.isAuthenticated || owner.userId === null) {
    const login = new URL('/sign-in', baseUrl(request, options))
    login.searchParams.set('redirect_url', url.toString())
    return Response.redirect(login, 302)
  }
  const result = await beginAuthorizationCodeGrant(requireStore(options), {
    client,
    redirectUri,
    requestedScopes: scopeText.split(/\s+/u),
    ...(requestedAccess === undefined ? {} : { requestedAccess }),
    codeChallenge: challenge,
    codeChallengeMethod: challengeMethod,
    ownerId: owner.userId,
    now: currentNow(options),
  })
  if (result.kind !== 'ok') return oauthTransitionError(result)
  const mode = modeForGrant(result.value.grant)
  if (mode === undefined) return oauthError('invalid_scope', 400)
  return await consentResponse(result.value.grant, mode, state, options, agentCursor)
}

async function consentResponse(
  grant: AgentAccessOAuthGrant,
  mode: AgentAccessAuthorityMode,
  state: string,
  options: OAuthApiOptions,
  cursor: string | null,
): Promise<Response> {
  const targets = await consentAgentTargets(options, cursor)
  return new Response(consentHtml({
    grantRef: grant.grantRef,
    clientName: grant.displayName,
    mode,
    requestedScopes: grant.requestedScopes,
    state,
    requestedAccess: grant.requestedAccess,
    agentTargets: targets.items,
    ...(targets.nextCursor === undefined ? {} : { agentTargetsNextCursor: targets.nextCursor }),
    ...(targets.unavailable === true ? { agentTargetsUnavailable: true } : {}),
  }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export async function handleOAuthConsentPost(request: Request, options: OAuthApiOptions = {}): Promise<Response> {
  const formResult = await readForm(request)
  if (formResult.kind === 'too_large') return oauthError('invalid_request', 413)
  if (formResult.kind !== 'ok') return oauthError('invalid_request', 400)
  const form = formResult.value
  const requestOrigin = request.headers.get('Origin')
  const csrfDecision = assertCsrf({
    ...(requestOrigin === null ? {} : { origin: requestOrigin }),
    allowedOrigins: [new URL(baseUrl(request, options)).origin],
  })
  if (csrfDecision.kind === 'rejected') return oauthError('access_denied', 403)
  const owner = await ownerIdentity(options)
  const grantRef = form.get('grant_ref')
  const decision = form.get('decision')
  const authorityModeText = form.get('authority_mode')
  const authorityMode = authorityModeText === null
    ? undefined
    : AGENT_ACCESS_AUTHORITY_MODE_VALUES.includes(authorityModeText as AgentAccessAuthorityMode)
      ? authorityModeText as AgentAccessAuthorityMode
      : null
  const limited = await oauthAdmissionResponse(request, options, `consent:${grantRef ?? 'missing'}`)
  if (limited !== undefined) return limited
  if (!owner.isAuthenticated || owner.userId === null || grantRef === null) return oauthError('access_denied', 403)
  const store = requireStore(options)
  if (decision !== 'approve') {
    const denied = await denyGrant(store, {
      grantRef,
      ownerId: owner.userId,
      now: currentNow(options),
    })
    if (denied.kind !== 'ok') return oauthTransitionError(denied)
    return new Response('Authorization denied. You may close this window.', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
  }
  if (authorityMode === null) return oauthError('invalid_scope', 400)
  const connectionTarget = parseConnectionTarget(form)
  const approved = await approveGrant(store, {
    grantRef,
    ownerId: owner.userId,
    now: currentNow(options),
    ...(authorityMode === undefined ? {} : { authorityMode }),
    ...(connectionTarget === undefined ? {} : { connectionTarget }),
    issueKey: async ({ grant: sourceGrant, ownerId, target }) => await issueGrantKey(sourceGrant, ownerId, target, options),
  })
  if (approved.kind !== 'ok') return oauthTransitionError(approved)
  if (approved.value.grant.flow === 'authorization_code' && approved.value.grant.redirectUri !== undefined && approved.value.authorizationCode !== undefined) {
    const location = new URL(approved.value.grant.redirectUri)
    location.searchParams.set('code', approved.value.authorizationCode)
    const state = form.get('state')
    if (state !== null) location.searchParams.set('state', state)
    return Response.redirect(location, 302)
  }
  return new Response('Approved — return to your assistant.', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
}

export function oauthAuthorizationServerMetadata(canonicalBaseUrl: string): Readonly<Record<string, unknown>> {
  const base = trimTrailingSlashes(canonicalBaseUrl)
  return {
    issuer: base,
    authorization_endpoint: `${base}${AGENT_ACCESS_OAUTH_PATHS.authorize}`,
    token_endpoint: `${base}${AGENT_ACCESS_OAUTH_PATHS.token}`,
    registration_endpoint: `${base}${AGENT_ACCESS_OAUTH_PATHS.register}`,
    device_authorization_endpoint: `${base}${AGENT_ACCESS_OAUTH_PATHS.deviceAuthorization}`,
    grant_types_supported: [...AGENT_ACCESS_OAUTH_GRANT_TYPES],
    response_types_supported: [...AGENT_ACCESS_OAUTH_RESPONSE_TYPES],
    token_endpoint_auth_methods_supported: [...AGENT_ACCESS_OAUTH_TOKEN_ENDPOINT_AUTH_METHODS],
    code_challenge_methods_supported: [...AGENT_ACCESS_OAUTH_CODE_CHALLENGE_METHODS],
  }
}

export function oauthProtectedResourceResponse(request: Request, canonicalBaseUrl = resolveCanonicalBaseUrl(request).baseUrl): Response {
  return Response.json(oauthProtectedResourceMetadata(canonicalBaseUrl), { headers: { 'Cache-Control': 'no-store' } })
}

export function oauthAuthorizationServerResponse(request: Request, canonicalBaseUrl = resolveCanonicalBaseUrl(request).baseUrl): Response {
  return Response.json(oauthAuthorizationServerMetadata(canonicalBaseUrl), { headers: { 'Cache-Control': 'no-store' } })
}

async function pollDeviceGrantRequest(form: URLSearchParams, request: Request, options: OAuthApiOptions): Promise<Response> {
  const clientId = form.get('client_id')
  const deviceCode = form.get('device_code')
  if (clientId === null || deviceCode === null) return oauthError('invalid_request', 400)
  const limited = await oauthAdmissionResponse(request, options, `device_code:${deviceCode}`, 'device_poll')
  if (limited !== undefined) return limited
  const client = await readClient(clientId, options)
  if (client === null) return oauthError('invalid_client', 401)
  const now = currentNow(options)
  let result = await pollDeviceGrant(requireStore(options), { clientId: client.clientId, deviceCode, now })
  if (result.kind === 'issuance_recovery_required') {
    const ownerId = result.grant.ownerId
    if (ownerId === undefined) return oauthError('server_error', 503)
    const recovered = await approveGrant(requireStore(options), {
      grantRef: result.grant.grantRef,
      ownerId,
      now,
      ...(result.grant.connectionTarget === undefined ? {} : { connectionTarget: result.grant.connectionTarget }),
      issueKey: async ({ grant: sourceGrant, ownerId: sourceOwnerId, target }) => (
        await issueGrantKey(sourceGrant, sourceOwnerId, target, options)
      ),
    })
    if (recovered.kind !== 'ok') {
      return recovered.kind === 'refused' && recovered.reason === 'issuance_unavailable'
        ? oauthError('server_error', 503)
        : oauthTransitionError(recovered)
    }
    result = { kind: 'ready', grant: recovered.value.grant }
  }
  if (result.kind === 'authorization_pending') return oauthError('authorization_pending', 400)
  if (result.kind === 'slow_down') return oauthError('slow_down', 400)
  if (result.kind !== 'ready') {
    if (result.kind === 'refused' && result.reason === 'expired_token') {
      const expired = await requireStore(options).getGrantByHash('device', await hashOAuthValue(deviceCode))
      if (expired !== null) await cancelExpiredReplacement(expired, options)
    }
    return oauthTransitionError(result)
  }
  const claimed = await claimGrantDelivery(requireStore(options), { credential: { kind: 'device', grantRef: result.grant.grantRef, clientId: client.clientId }, now: currentNow(options) })
  return await deliverClaimedGrant(claimed, options)
}

async function exchangeAuthorizationCode(form: URLSearchParams, request: Request, options: OAuthApiOptions): Promise<Response> {
  const code = form.get('code')
  const clientId = form.get('client_id')
  const redirectUri = form.get('redirect_uri')
  const verifier = form.get('code_verifier')
  if (code === null || clientId === null || redirectUri === null || verifier === null) return oauthError('invalid_request', 400)
  const limited = await oauthAdmissionResponse(request, options, `authorization_code:${code}`)
  if (limited !== undefined) return limited
  const claimed = await claimGrantDelivery(requireStore(options), {
    credential: { kind: 'authorization', authorizationCode: code, clientId, redirectUri, codeVerifier: verifier },
    now: currentNow(options),
  })
  if (claimed.kind === 'refused' && claimed.reason === 'expired_token') {
    const expired = await requireStore(options).getGrantByHash('authorization', await hashOAuthValue(code))
    if (expired !== null) await cancelExpiredReplacement(expired, options)
  }
  return await deliverClaimedGrant(claimed, options)
}

async function cancelExpiredReplacement(grant: AgentAccessOAuthGrant, options: OAuthApiOptions): Promise<void> {
  if (grant.replacement === undefined || isLocalE2EAuthBypassEnabled()) return
  const replacement = grant.replacement
  const cancelled = options.cancelReplacement === undefined
    ? await cancelAgentCredentialReplacement({
        principalRef: replacement.principalRef,
        successorCredentialRef: replacement.successorCredentialRef,
        successorGrantRef: replacement.successorGrantRef,
      })
    : await options.cancelReplacement(replacement)
  if (cancelled.kind !== 'completed' && cancelled.kind !== 'replayed') return
  try {
    const reason = 'Replacement delivery expired before the credential was claimed.'
    if (options.revokeProviderCredential !== undefined) {
      await options.revokeProviderCredential(cancelled.providerCredentialId, reason)
    } else {
      await clerkClient().apiKeys.revoke({ apiKeyId: cancelled.providerCredentialId, revocationReason: reason })
    }
  } catch {
    // The canonical successor is already revoked. A repeated expired-token
    // request safely retries provider cleanup without reviving it.
  }
}

async function deliverClaimedGrant(
  claimed: AgentAccessOAuthTransition<Readonly<{ grant: AgentAccessOAuthGrant; claimToken: string }>>,
  options: OAuthApiOptions,
): Promise<Response> {
  if (claimed.kind !== 'ok') return oauthTransitionError(claimed)
  const keyId = claimed.value.grant.keyId
  if (keyId === undefined) return oauthError('invalid_grant', 400)
  try {
    const secret = await (options.getSecret ?? defaultOAuthKeySecret)(keyId)
    if (claimed.value.grant.status !== 'consumed'
      && claimed.value.grant.replacement !== undefined
      && !isLocalE2EAuthBypassEnabled()) {
      const replacement = claimed.value.grant.replacement
      const promoted = options.promoteReplacement === undefined
        ? await promoteAgentCredentialReplacement({
            principalRef: replacement.principalRef,
            successorCredentialRef: replacement.successorCredentialRef,
            successorGrantRef: replacement.successorGrantRef,
          })
        : await options.promoteReplacement(replacement)
      if (promoted.kind !== 'completed' && promoted.kind !== 'replayed') throw new Error('replacement_promotion_failed')
      const reason = 'Replaced by a newer Agentic Economy credential.'
      if (options.revokeProviderCredential !== undefined) {
        await options.revokeProviderCredential(promoted.providerCredentialId, reason)
      } else {
        await clerkClient().apiKeys.revoke({ apiKeyId: promoted.providerCredentialId, revocationReason: reason })
      }
      const recorded = await (options.recordProviderRevocation ?? recordAgentProviderRevocation)({
        principalRef: replacement.principalRef,
        credentialRef: replacement.predecessorCredentialRef,
        providerCredentialId: promoted.providerCredentialId,
        correlationRef: `replacement:${replacement.successorGrantRef}`,
        outcome: 'revoked',
      })
      if (recorded.kind !== 'completed' && recorded.kind !== 'replayed') {
        throw new Error('replacement_provider_revocation_record_failed')
      }
    }
    const consumed = await completeGrantDelivery(requireStore(options), {
      grantRef: claimed.value.grant.grantRef,
      claimToken: claimed.value.claimToken,
      now: currentNow(options),
    })
    if (consumed.kind !== 'ok') return oauthTransitionError(consumed)
    return Response.json({
      access_token: secret.secret,
      token_type: 'Bearer',
      scope: claimed.value.grant.requestedScopes.join(' '),
      expires_in: claimed.value.grant.requestedAccess.expiresInSeconds,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    await resetGrantDelivery(requireStore(options), { grantRef: claimed.value.grant.grantRef, claimToken: claimed.value.claimToken })
    return oauthError('invalid_grant', 400)
  }
}

/**
 * Local-E2E-only key material registry, reachable only under
 * `isLocalE2EAuthBypassEnabled()` (which throws in production). The durable
 * half of issuance — the grant row bound to the seed-provisioned fixed
 * owner credential — still flows through the real serviceAuth'd
 * registerGrantForServer path; only the Clerk-held secret lives here, for
 * the lifetime of the dev server process.
 */
const LOCAL_E2E_OWNER_CREDENTIAL_ID = 'ak_local_e2e_owner'
const localE2EOAuthKeys = new Map<string, Readonly<{ secret: string; expiresAt: number }>>()
let localE2EOAuthGrantGeneration = 0

async function defaultOAuthKeySecret(keyId: string): Promise<{ secret: string }> {
  if (!isLocalE2EAuthBypassEnabled()) return await clerkClient().apiKeys.getSecret(keyId)
  const record = localE2EOAuthKeys.get(keyId)
  if (record === undefined || record.expiresAt <= Date.now()) throw new Error('local_e2e_agent_key_unavailable')
  return { secret: record.secret }
}

async function issueLocalE2EOAuthGrantKey(
  ownerId: string,
  grant: AgentAccessOAuthGrant,
  authorityMode: AgentAccessAuthorityMode,
  policy: AgentAccessPolicy,
): Promise<{ keyId: string }> {
  const now = Date.now()
  const expiresAt = now + grant.requestedAccess.expiresInSeconds * 1000
  let generation = localE2EOAuthGrantGeneration + 1
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const registered = await registerAgentAccessGrant({
      grantRef: grant.grantRef,
      principalId: `clerk_api_key:${LOCAL_E2E_OWNER_CREDENTIAL_ID}`,
      ownerId,
      applicationRef: AGENT_ACCESS_DEFAULT_APPLICATION_REF,
      credentialId: LOCAL_E2E_OWNER_CREDENTIAL_ID,
      environment: grant.requestedAccess.environment,
      operationAccess: 'all_admitted',
      authorityMode,
      policy: agentAccessPolicySchema.parse({
        ...policy,
        budget: { ...policy.budget, generation },
        rate: { ...policy.rate, generation },
      }),
      lifecycle: 'active',
      generation,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    })
    if (registered.kind === 'recorded' || registered.kind === 'replayed') {
      localE2EOAuthGrantGeneration = generation
      localE2EOAuthKeys.set(LOCAL_E2E_OWNER_CREDENTIAL_ID, {
        secret: `ak_secret_local_${createOpaqueOAuthValue(32)}`,
        expiresAt,
      })
      return { keyId: LOCAL_E2E_OWNER_CREDENTIAL_ID }
    }
    generation += 1
  }
  throw new Error('issuance_unavailable')
}

async function issueReplacementGrantKey(input: Readonly<{
  ownerId: string
  grant: AgentAccessOAuthGrant
  target: Extract<AgentConnectionTarget, { kind: 'replace_credential' }>
  idempotencyKey: string
  authorityMode: AgentAccessAuthorityMode
  policy: AgentAccessPolicy
}>): Promise<{ keyId: string; replacement: AgentCredentialReplacement }> {
  const api = createClerkAgentAccessKeyApi(clerkClient().apiKeys)
  const successorGrantRef = issuedAgentGrantRef(input.ownerId, input.idempotencyKey)
  const existing = (await api.list({ subject: input.ownerId, includeInvalid: false, limit: 100 })).data.find((key) => (
    !key.revoked && !key.expired && key.claims?.aeGrantRef === successorGrantRef
  ))
  let createdHere = false
  const key = existing ?? await api.create({
    name: `AE Agent replacement ${input.idempotencyKey.slice(-12)}`,
    subject: input.ownerId,
    createdBy: input.ownerId,
    scopes: [...input.grant.requestedScopes],
    secondsUntilExpiration: input.grant.requestedAccess.expiresInSeconds,
    claims: {
      aePurpose: AGENT_ACCESS_PURPOSE,
      aeGrantRef: successorGrantRef,
      aeDisplayName: input.grant.displayName,
      aeAuthorityMode: input.authorityMode,
      aeIssuanceKey: input.idempotencyKey,
      aeApplicationRef: AGENT_ACCESS_DEFAULT_APPLICATION_REF,
      aeEnvironment: input.grant.requestedAccess.environment,
      aeScopes: JSON.stringify(input.grant.requestedScopes),
      aePrincipalRef: input.target.principalRef,
      aeConnectionTarget: 'replace_credential',
    },
    description: 'Replacement credential for an existing Agentic Economy agent.',
  }).then((created) => {
    createdHere = true
    return created
  })
  if (key === undefined) throw new Error('replacement_provider_credential_missing')
  const createdAt = Date.now()
  const prepared = await prepareAgentCredentialReplacement({
    principalRef: input.target.principalRef,
    issuanceKey: input.idempotencyKey,
    grantRef: successorGrantRef,
    credentialId: key.id,
    applicationRef: AGENT_ACCESS_DEFAULT_APPLICATION_REF,
    environment: input.grant.requestedAccess.environment,
    scopes: input.grant.requestedScopes,
    authorityMode: input.authorityMode,
    policy: input.policy,
    createdAt: existing?.createdAt ?? createdAt,
    expiresAt: existing?.expiresAt ?? existing?.expiration ?? createdAt + input.grant.requestedAccess.expiresInSeconds * 1_000,
  })
  if (prepared.kind !== 'recorded' && prepared.kind !== 'replayed') {
    if (createdHere) {
      await api.revoke?.({
        apiKeyId: key.id,
        revocationReason: 'Credential replacement registration failed.',
      }).catch(() => {})
    }
    if (prepared.kind === 'conflict') throw new AgentAccessOAuthIssueRefusal('invalid_grant')
    throw new Error('replacement_registration_unavailable')
  }
  return {
    keyId: key.id,
    replacement: {
      principalRef: prepared.principalRef,
      generation: prepared.generation,
      successorCredentialRef: prepared.successorCredentialRef,
      predecessorCredentialRef: prepared.predecessorCredentialRef,
      predecessorKeyId: prepared.predecessorKeyId,
      successorGrantRef: prepared.successorGrantRef,
    },
  }
}

async function issueGrantKey(
  grant: AgentAccessOAuthGrant,
  ownerId: string,
  target: AgentConnectionTarget,
  options: OAuthApiOptions,
): Promise<{ keyId: string; replacement?: AgentCredentialReplacement }> {
  const issue: AgentAccessOAuthIssueKey = async ({ ownerId: inputOwnerId, grant: inputGrant, target: inputTarget }) => {
    const idempotencyKey = inputGrant.issuanceKey ?? `oauth-${inputGrant.grantRef.replaceAll(':', '-')}`
    const authorityMode = modeForGrant(inputGrant)
    if (authorityMode === undefined || (inputGrant.requestedAccess.environment === 'production' && authorityMode === 'full_yolo')) {
      throw new AgentAccessOAuthIssueRefusal('invalid_scope')
    }
    let policy: AgentAccessPolicy
    try {
      policy = deriveOAuthGrantPolicy(inputGrant.requestedAccess)
    } catch {
      throw new AgentAccessOAuthIssueRefusal('invalid_grant')
    }
    if (options.issueKey !== undefined) {
      return await options.issueKey({
        ownerId: inputOwnerId,
        name: inputGrant.displayName,
        idempotencyKey,
        scopes: inputGrant.requestedScopes,
        grantRef: inputGrant.grantRef,
        authorityMode,
        requestedAccess: inputGrant.requestedAccess,
        policy,
        target: inputTarget,
      })
    }
    if (isLocalE2EAuthBypassEnabled()) {
      return await issueLocalE2EOAuthGrantKey(inputOwnerId, inputGrant, authorityMode, policy)
    }
    if (inputTarget.kind === 'replace_credential') {
      return await issueReplacementGrantKey({
        ownerId: inputOwnerId,
        grant: inputGrant,
        target: inputTarget,
        idempotencyKey,
        authorityMode,
        policy,
      })
    }
    const issued = await issueAgentAccessKey({
      ownerId: inputOwnerId,
      principal: { userId: inputOwnerId },
      input: {
        name: inputGrant.displayName,
        idempotencyKey,
        scopes: inputGrant.requestedScopes,
        grantRef: issuedAgentGrantRef(inputOwnerId, idempotencyKey),
        environment: inputGrant.requestedAccess.environment,
        expiresInSeconds: inputGrant.requestedAccess.expiresInSeconds,
        ...(inputGrant.requestedAccess.maximumSpendPerInvocation === undefined ? {} : { maximumSpendPerInvocation: inputGrant.requestedAccess.maximumSpendPerInvocation }),
        ...(inputGrant.requestedAccess.maximumDailySpend === undefined ? {} : { maximumDailySpend: inputGrant.requestedAccess.maximumDailySpend }),
        ...(inputGrant.requestedAccess.maximumMonthlySpend === undefined ? {} : { maximumMonthlySpend: inputGrant.requestedAccess.maximumMonthlySpend }),
        ...(inputGrant.requestedAccess.maximumConcurrentInvocations === undefined ? {} : { maximumConcurrentInvocations: inputGrant.requestedAccess.maximumConcurrentInvocations }),
        ...(inputGrant.requestedAccess.maximumCallsPerMinute === undefined ? {} : { maximumCallsPerMinute: inputGrant.requestedAccess.maximumCallsPerMinute }),
        ...(inputGrant.requestedAccess.maximumCallsPerHour === undefined ? {} : { maximumCallsPerHour: inputGrant.requestedAccess.maximumCallsPerHour }),
      },
      policy,
      returnSecret: false,
      api: createClerkAgentAccessKeyApi(clerkClient().apiKeys),
      registerBinding: registerIssuedAgentBinding,
    })
    if (issued.kind === 'error') {
      if (issued.code === 'invalid_input') throw new AgentAccessOAuthIssueRefusal('invalid_scope')
      if (issued.code === 'idempotency_conflict') throw new AgentAccessOAuthIssueRefusal('invalid_grant')
      throw new Error(issued.code)
    }
    return { keyId: issued.keyId }
  }
  return await issue({ ownerId, grant, target })
}

function parseConnectionTarget(form: URLSearchParams): AgentConnectionTarget | undefined {
  const kind = form.get('connection_target')
  if (kind !== 'replace_credential') return undefined
  return { kind: 'replace_credential', principalRef: form.get('principal_ref') ?? '' }
}

async function consentAgentTargets(options: OAuthApiOptions, cursor: string | null): Promise<ConsentAgentTargets> {
  try {
    if (options.listAgents !== undefined) return await options.listAgents(cursor)
    const directory = await loadAgentDirectoryReadback({
      compare: readCapabilityOperationCompare,
      isOperationRef: isPublicOperationRef,
    }, cursor)
    return {
      items: directory.items.map(({ principalRef, displayName }) => ({ principalRef, displayName })),
      ...(directory.nextCursor === undefined ? {} : { nextCursor: directory.nextCursor }),
    }
  } catch {
    return { items: [], unavailable: true }
  }
}

function readAgentCursor(url: URL): string | null | undefined {
  const value = url.searchParams.get('agent_cursor')
  if (value === null || value.length === 0) return null
  return value.length <= 2_048 ? value : undefined
}

function deriveOAuthGrantPolicy(requestedAccess: AgentAccessOAuthRequestedAccess): AgentAccessPolicy {
  if (!Number.isSafeInteger(requestedAccess.expiresInSeconds)
    || requestedAccess.expiresInSeconds < AGENT_ACCESS_MIN_TTL_SECONDS
    || requestedAccess.expiresInSeconds > AGENT_ACCESS_MAX_TTL_SECONDS) {
    throw new Error('invalid_requested_access')
  }
  const controls = [
    requestedAccess.maximumConcurrentInvocations,
    requestedAccess.maximumCallsPerMinute,
    requestedAccess.maximumCallsPerHour,
  ]
  if (controls.some((value) => value !== undefined && (!Number.isSafeInteger(value) || value <= 0))) {
    throw new Error('invalid_requested_access')
  }
  const amounts = [
    requestedAccess.maximumSpendPerInvocation,
    requestedAccess.maximumDailySpend,
    requestedAccess.maximumMonthlySpend,
  ]
  const budgetCount = amounts.filter((amount) => amount !== undefined).length
  if (requestedAccess.environment === 'sandbox') {
    if (budgetCount !== 0 || controls.some((value) => value !== undefined)) throw new Error('invalid_requested_access')
    return defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 })
  }
  if (budgetCount !== 0 && budgetCount !== amounts.length) throw new Error('invalid_requested_access')
  let base: AgentAccessPolicy
  if (budgetCount === amounts.length) {
    const [maximumSpendPerInvocation, maximumDailySpend, maximumMonthlySpend] = amounts
    if (maximumSpendPerInvocation === undefined || maximumDailySpend === undefined || maximumMonthlySpend === undefined) {
      throw new Error('invalid_requested_access')
    }
    base = buildProductionAgentAccessPolicy({
      currency: maximumSpendPerInvocation.currency,
      exponent: maximumSpendPerInvocation.exponent,
      maximumSpendPerInvocation,
      maximumDailySpend,
      maximumMonthlySpend,
    })
  } else {
    base = defaultProductionAgentAccessPolicy({ currency: 'USD', exponent: 2 })
  }
  return agentAccessPolicySchema.parse({
    ...base,
    budget: {
      ...base.budget,
      ...(requestedAccess.maximumConcurrentInvocations === undefined ? {} : { maximumConcurrentInvocations: requestedAccess.maximumConcurrentInvocations }),
    },
    rate: {
      ...base.rate,
      ...(requestedAccess.maximumCallsPerMinute === undefined ? {} : { maximumCallsPerMinute: requestedAccess.maximumCallsPerMinute }),
      ...(requestedAccess.maximumCallsPerHour === undefined ? {} : { maximumCallsPerHour: requestedAccess.maximumCallsPerHour }),
    },
  })
}

async function readClient(clientId: string | null, options: OAuthApiOptions): Promise<AgentAccessOAuthClient | null> {
  if (clientId === null) return null
  return await requireStore(options).getClient(clientId)
}

async function ownerIdentity(options: OAuthApiOptions): Promise<{ isAuthenticated: boolean; userId: string | null }> {
  if (options.authenticateOwner === undefined && isLocalE2EAuthBypassEnabled()) {
    return { isAuthenticated: true, userId: LOCAL_E2E_OPERATOR_PRINCIPAL }
  }
  return options.authenticateOwner === undefined ? await auth() : await options.authenticateOwner()
}

function requireStore(options: OAuthApiOptions): AgentAccessOAuthStore {
  if (options.store === undefined) throw new Error('agent_access_oauth_state_unavailable')
  return options.store
}

function currentNow(options: OAuthApiOptions): number {
  const now = options.now
  return now === undefined ? Date.now() : now()
}
async function oauthAdmissionResponse(
  request: Request,
  options: OAuthApiOptions,
  keySuffix: string,
  kind: 'default' | 'device_poll' = 'default',
): Promise<Response | undefined> {
  const rateLimit = kind === 'device_poll'
    ? (options.devicePollRateLimit ?? options.rateLimit)
    : options.rateLimit
  if (rateLimit === undefined) return undefined
  const admission = await rateLimit({ request, keySuffix })
  if (admission.ok) return undefined
  return oauthError('rate_limited', 429, {
    'Retry-After': String(Math.max(1, Math.ceil(admission.retryAfter / 1_000))),
  })
}

function baseUrl(request: Request, options: OAuthApiOptions): string {
  const configured = options.canonicalBaseUrl
  return configured === undefined ? resolveCanonicalBaseUrl(request).baseUrl : trimTrailingSlashes(configured)
}

export function oauthChallengeResponse(request: Request, requiredScope = MARKET_OPERATIONS_INVOKE_SCOPE): Response {
  const base = resolveCanonicalBaseUrl(request).baseUrl
  return problem(
    { status: 401, kind: 'UNAUTHENTICATED', code: 'authentication_required', detail: 'Authentication required.' },
    { 'WWW-Authenticate': bearerChallenge(base, requiredScope), 'Vary': 'Authorization' },
  )
}
