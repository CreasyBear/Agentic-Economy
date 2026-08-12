import { auth, clerkClient } from '@clerk/tanstack-react-start/server'
import { readBoundedRequestJson, readBoundedRequestText } from '@/lib/server/bounded-request-body'
import type { RateLimitAdmission } from '@/lib/server/rate-limit'
import type { ProblemInput } from '@/lib/errors'
import { problem } from '@/lib/server/problem'

import { bearerChallenge, oauthProtectedResourceMetadata } from '@/lib/http/oauth-challenge'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import {
  AGENT_ACCESS_AUTHORITY_MODE_VALUES,
  CUSTOMER_REQUEST_AGENT_SCOPE,
  MARKET_OPERATIONS_INVOKE_SCOPE,
  agentAuthorityModeForScopes,
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
  denyGrant,
  normalizeRequestedScopes,
  pollDeviceGrant,
  readGrantForConsent,
  resetGrantDelivery,
  type AgentAccessOAuthClient,
  type AgentAccessOAuthErrorCode,
  type AgentAccessOAuthGrant,
  type AgentAccessOAuthIssueKey,
  type AgentAccessOAuthStore,
  type AgentAccessOAuthTransition,
} from '@/modules/agent-access/oauth-state'
import {
  AGENT_ACCESS_KEY_TTL_SECONDS,
  issueAgentAccessKey,
  type AgentAccessGrantRegistrationInput,
} from '@/modules/agent-access/agent-access'
import { defaultAgentAccessPolicy } from '@/modules/agent-access/policy'
import { registerAgentAccessGrant } from '@/modules/agent-access/policy.functions'
import {
  createClerkAgentAccessKeyApi,
  registerAgentAccessPrincipal,
} from '@/modules/agent-access/agent-access.functions'
import { assertCsrf } from '@/modules/security/public'

type OAuthApiOptions = Readonly<{
  store?: AgentAccessOAuthStore
  now?: () => number
  canonicalBaseUrl?: string
  authenticateOwner?: () => Promise<{ isAuthenticated: boolean; userId: string | null }>
  issueKey?: (input: Readonly<{ ownerId: string; name: string; idempotencyKey: string; scopes: readonly string[]; grantRef: string }>) => Promise<Readonly<{ keyId: string; secret?: string }>>
  getSecret?: (keyId: string) => Promise<{ secret: string }>
  rateLimit?: RateLimitAdmission
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
const MAX_OAUTH_FORM_BODY_BYTES = 16 * 1024
const MAX_OAUTH_JSON_BODY_BYTES = 16 * 1024
const AUTHORIZATION_CODE_GRANT_TYPE = AGENT_ACCESS_OAUTH_GRANT_TYPES[0]
const DEVICE_GRANT_TYPE = AGENT_ACCESS_OAUTH_GRANT_TYPES[1]
const PUBLIC_CLIENT_AUTH_METHOD = AGENT_ACCESS_OAUTH_TOKEN_ENDPOINT_AUTH_METHODS[0]

type OAuthFormResult =
  | Readonly<{ kind: 'ok'; value: URLSearchParams }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'too_large' }>

type OAuthJsonResult =
  | Readonly<{ kind: 'ok'; value: unknown }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'too_large' }>

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
  const result = await beginDeviceGrant(requireStore(options), {
    client,
    requestedScopes: scopeText.split(/\s+/u),
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
    : `${MARKET_OPERATIONS_INVOKE_SCOPE} ${CUSTOMER_REQUEST_AGENT_SCOPE} ${agentAuthorityScopeForMode('inspect_only')}`)
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
    return new Response(consentHtml({ grantRef: result.value.grantRef, clientName: result.value.displayName, mode, state: '' }), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    })
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
    codeChallenge: challenge,
    codeChallengeMethod: challengeMethod,
    ownerId: owner.userId,
    now: currentNow(options),
  })
  if (result.kind !== 'ok') return oauthTransitionError(result)
  const mode = modeForGrant(result.value.grant)
  if (mode === undefined) return oauthError('invalid_scope', 400)
  return new Response(consentHtml({ grantRef: result.value.grant.grantRef, clientName: result.value.grant.displayName, mode, state }), {
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
  const approved = await approveGrant(store, {
    grantRef,
    ownerId: owner.userId,
    now: currentNow(options),
    ...(authorityMode === undefined ? {} : { authorityMode }),
    issueKey: async ({ grant: sourceGrant, ownerId }) => await issueGrantKey(sourceGrant, ownerId, options),
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
  const limited = await oauthAdmissionResponse(request, options, `device_code:${deviceCode}`)
  if (limited !== undefined) return limited
  const client = await readClient(clientId, options)
  if (client === null) return oauthError('invalid_client', 401)
  const result = await pollDeviceGrant(requireStore(options), { clientId: client.clientId, deviceCode, now: currentNow(options) })
  if (result.kind === 'authorization_pending') return oauthError('authorization_pending', 400)
  if (result.kind === 'slow_down') return oauthError('slow_down', 400)
  if (result.kind !== 'ready') return oauthTransitionError(result)
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
  return await deliverClaimedGrant(claimed, options)
}

async function deliverClaimedGrant(
  claimed: AgentAccessOAuthTransition<Readonly<{ grant: AgentAccessOAuthGrant; claimToken: string }>>,
  options: OAuthApiOptions,
): Promise<Response> {
  if (claimed.kind !== 'ok') return oauthTransitionError(claimed)
  const keyId = claimed.value.grant.keyId
  if (keyId === undefined) return oauthError('invalid_grant', 400)
  try {
    const secret = await (options.getSecret ?? (async (id: string) => await clerkClient().apiKeys.getSecret(id)))(keyId)
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
      expires_in: AGENT_ACCESS_KEY_TTL_SECONDS,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    await resetGrantDelivery(requireStore(options), { grantRef: claimed.value.grant.grantRef, claimToken: claimed.value.claimToken })
    return oauthError('invalid_grant', 400)
  }
}

async function issueGrantKey(grant: AgentAccessOAuthGrant, ownerId: string, options: OAuthApiOptions): Promise<{ keyId: string }> {
  const issue: AgentAccessOAuthIssueKey = async ({ ownerId: inputOwnerId, grant: inputGrant }) => {
    const idempotencyKey = inputGrant.grantRef.replaceAll(':', '-')
    if (options.issueKey !== undefined) {
      return await options.issueKey({ ownerId: inputOwnerId, name: inputGrant.displayName, idempotencyKey, scopes: inputGrant.requestedScopes, grantRef: inputGrant.grantRef })
    }
    const issued = await issueAgentAccessKey({
      ownerId: inputOwnerId,
      principal: { userId: inputOwnerId },
      input: { name: inputGrant.displayName, idempotencyKey, scopes: inputGrant.requestedScopes, grantRef: inputGrant.grantRef },
      policy: defaultAgentAccessPolicy({ environment: 'sandbox', currency: 'USD', exponent: 2 }),
      returnSecret: false,
      api: createClerkAgentAccessKeyApi(clerkClient().apiKeys),
      registerPrincipal: registerAgentAccessPrincipal,
      registerGrant: async (grantInput: AgentAccessGrantRegistrationInput) => await registerAgentAccessGrant(grantInput),
    })
    if (issued.kind === 'error') throw new Error(issued.code)
    return { keyId: issued.keyId }
  }
  return await issue({ ownerId, grant })
}

async function readClient(clientId: string | null, options: OAuthApiOptions): Promise<AgentAccessOAuthClient | null> {
  if (clientId === null) return null
  return await requireStore(options).getClient(clientId)
}

async function ownerIdentity(options: OAuthApiOptions): Promise<{ isAuthenticated: boolean; userId: string | null }> {
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
): Promise<Response | undefined> {
  if (options.rateLimit === undefined) return undefined
  const admission = await options.rateLimit({ request, keySuffix })
  if (admission.ok) return undefined
  return oauthError('rate_limited', 429, {
    'Retry-After': String(Math.max(1, Math.ceil(admission.retryAfter / 1_000))),
  })
}

function baseUrl(request: Request, options: OAuthApiOptions): string {
  const configured = options.canonicalBaseUrl
  return configured === undefined ? resolveCanonicalBaseUrl(request).baseUrl : trimTrailingSlashes(configured)
}

async function readForm(request: Request): Promise<OAuthFormResult> {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/x-www-form-urlencoded')) return { kind: 'invalid' }
  try {
    const bounded = await readBoundedRequestText(request, MAX_OAUTH_FORM_BODY_BYTES)
    if (!bounded.ok) return { kind: 'too_large' }
    return { kind: 'ok', value: new URLSearchParams(bounded.text) }
  } catch {
    return { kind: 'invalid' }
  }
}

async function readJson(request: Request): Promise<OAuthJsonResult> {
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (mediaType !== 'application/json') return { kind: 'invalid' }
  try {
    const bounded = await readBoundedRequestJson(request, MAX_OAUTH_JSON_BODY_BYTES)
    if (!bounded.ok) return { kind: bounded.code === 'payload_too_large' ? 'too_large' : 'invalid' }
    return { kind: 'ok', value: bounded.value }
  } catch {
    return { kind: 'invalid' }
  }
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value.map((item) => item.trim()).filter((item) => item.length > 0) : []
}

function validRedirectUri(value: string): boolean {
  if (value.includes('*')) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
  } catch {
    return false
  }
}

function modeForGrant(grant: AgentAccessOAuthGrant): AgentAccessAuthorityMode | undefined {
  return agentAuthorityModeForScopes(grant.requestedScopes, { allowCustomerDefault: true })
}

function consentHtml(input: Readonly<{ grantRef: string; clientName: string; mode: AgentAccessAuthorityMode; state: string }>): string {
  const escapedName = escapeHtml(input.clientName)
  const escapedGrantRef = escapeHtml(input.grantRef)
  const escapedState = escapeHtml(input.state)
  const scope = agentAuthorityScopeForMode(input.mode)
  const permission = consentPermissionCopy(input.mode)
  return `<main data-ae-consent data-grant-ref="${escapedGrantRef}" data-client-name="${escapedName}" data-authority-mode="${input.mode}" data-environment="sandbox" data-expires-in-days="7"><h1>Connect ${escapedName} to AE</h1><p>Your assistant may ${permission.allowed}.</p><p>${permission.approval}</p><p>Environment: development. Access expires in seven days. You can revoke it at any time from your assistant access page.</p><details><summary>Technical details</summary><p data-ae-scope>Technical permission: ${escapeHtml(scope)}</p></details><form method="post" action="/oauth/authorize"><input type="hidden" name="grant_ref" value="${escapedGrantRef}"><input type="hidden" name="state" value="${escapedState}"><input type="hidden" name="authority_mode" value="${input.mode}"><button name="decision" value="approve">Approve access</button><button name="decision" value="deny">Decline</button></form></main>`
}

function consentPermissionCopy(mode: AgentAccessAuthorityMode): Readonly<{ allowed: string; approval: string }> {
  if (mode === 'inspect_only') return { allowed: 'browse and compare businesses', approval: 'Any work still waits for your approval.' }
  if (mode === 'approve_each') return { allowed: 'bring each request to you', approval: 'You approve each request before it moves forward.' }
  if (mode === 'bounded_mandate') return { allowed: 'work within the limits you set', approval: 'Anything outside those limits comes back to you for approval.' }
  return { allowed: 'carry out approved work on your behalf', approval: 'AE still asks for your approval where required.' }
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll('\'', '&#39;')
}

type OAuthErrorBody = Readonly<{ error: OAuthErrorCode; error_description: string }>

const OAUTH_ERROR_DESCRIPTIONS = AGENT_ACCESS_OAUTH_ERROR_DESCRIPTIONS

function oauthError(
  error: OAuthErrorCode,
  status: 400 | 401 | 403 | 413 | 429,
  headers: Readonly<Record<string, string>> = {},
): Response {
  const body: OAuthErrorBody = { error, error_description: OAUTH_ERROR_DESCRIPTIONS[error] }
  const retryAfter = error === 'authorization_pending'
    ? '5'
    : error === 'slow_down'
      ? '10'
      : undefined
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(retryAfter === undefined ? {} : { 'Retry-After': retryAfter }),
      ...headers,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

function oauthTransitionError(result: { kind: 'refused' | 'conflict'; reason: string }): Response {
  if (result.kind === 'conflict') return oauthError('invalid_grant', 400)
  if (result.reason === 'invalid_client') return oauthError('invalid_client', 401)
  if (result.reason === 'invalid_scope') return oauthError('invalid_scope', 400)
  if (result.reason === 'authorization_pending') return oauthError('authorization_pending', 400)
  if (result.reason === 'slow_down') return oauthError('slow_down', 400)
  if (result.reason === 'access_denied' || result.reason === 'owner_mismatch' || result.reason === 'owner_required') return oauthError('access_denied', 403)
  if (result.reason === 'expired_token') return oauthError('expired_token', 400)
  return oauthError('invalid_grant', 400)
}

export function oauthChallengeResponse(request: Request, requiredScope = MARKET_OPERATIONS_INVOKE_SCOPE): Response {
  const base = resolveCanonicalBaseUrl(request).baseUrl
  return problem(
    { status: 401, kind: 'UNAUTHENTICATED', code: 'authentication_required', detail: 'Authentication required.' },
    { 'WWW-Authenticate': bearerChallenge(base, requiredScope), 'Vary': 'Authorization' },
  )
}
