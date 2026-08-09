import { auth, clerkClient } from '@clerk/tanstack-react-start/server'
import { readBoundedRequestJson, readBoundedRequestText } from '@/lib/server/bounded-request-body'
import type { RateLimitAdmission } from '@/lib/server/rate-limit'
import type { ProblemInput } from '@/lib/errors'
import { problem } from '@/lib/server/problem'

import { bearerChallenge, oauthProtectedResourceMetadata } from '@/lib/http/oauth-challenge'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import {
  CUSTOMER_REQUEST_AGENT_SCOPE,
  customerRequestAuthorityModeForScopes,
  customerRequestScopeForMode,
  type CustomerRequestAuthorityMode,
} from '@/modules/customer-request/agent-contract'
import { isRecord } from '@/modules/common/is-record'
import {
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
  type CustomerRequestAgentOAuthClient,
  type CustomerRequestAgentOAuthGrant,
  type CustomerRequestAgentOAuthIssueKey,
  type CustomerRequestAgentOAuthStore,
  type CustomerRequestAgentOAuthTransition,
} from '@/modules/customer-request/oauth-state'
import {
  CUSTOMER_REQUEST_AGENT_KEY_TTL_SECONDS,
  issueCustomerRequestAgentKey,
} from '@/modules/customer-request/agent-access'
import {
  createClerkCustomerRequestAgentKeyApi,
  registerCustomerRequestAgentPrincipal,
} from '@/modules/customer-request/agent-access.functions'
import { assertCsrf } from '@/modules/security/public'

type OAuthApiOptions = Readonly<{
  store?: CustomerRequestAgentOAuthStore
  now?: () => number
  canonicalBaseUrl?: string
  authenticateOwner?: () => Promise<{ isAuthenticated: boolean; userId: string | null }>
  issueKey?: (input: Readonly<{ ownerId: string; name: string; idempotencyKey: string; scopes: readonly string[]; grantRef: string }>) => Promise<Readonly<{ keyId: string; secret?: string }>>
  getSecret?: (keyId: string) => Promise<{ secret: string }>
  rateLimit?: RateLimitAdmission
}>

export type { OAuthApiOptions }

type OAuthErrorCode = 'invalid_client' | 'invalid_scope' | 'invalid_request' | 'authorization_pending' | 'slow_down' | 'access_denied' | 'expired_token' | 'invalid_grant' | 'rate_limited'
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
const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'
const AUTHORIZATION_CODE_GRANT_TYPE = 'authorization_code'
const PUBLIC_CLIENT_AUTH_METHOD = 'none'

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
    verification_uri: `${baseUrl(request, options)}/agent-access/authorize?user_code=${encodeURIComponent(result.value.userCode)}`,
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
  const authMethod = value.token_endpoint_auth_method
  if (clientName.length < 1 || clientName.length > 120 || redirectUris.length === 0 || redirectUris.some((uri) => !validRedirectUri(uri))
    || responseTypes.length !== 1 || responseTypes[0] !== 'code'
    || grantTypes.some((grant) => grant !== AUTHORIZATION_CODE_GRANT_TYPE && grant !== DEVICE_GRANT_TYPE)
    || grantTypes.length === 0 || authMethod !== PUBLIC_CLIENT_AUTH_METHOD) {
    return oauthError('invalid_client', 400)
  }
  const requestedScopes = normalizeRequestedScopes(typeof value.scope === 'string' ? value.scope : `${CUSTOMER_REQUEST_AGENT_SCOPE} ${customerRequestScopeForMode('inspect_only')}`)
  if (requestedScopes === undefined) return oauthError('invalid_scope', 400)
  const createdAt = currentNow(options)
  const client: CustomerRequestAgentOAuthClient = {
    clientId: `ae_${createOpaqueOAuthValue(18)}`,
    clientName,
    redirectUris,
    grantTypes: grantTypes as CustomerRequestAgentOAuthClient['grantTypes'],
    tokenEndpointAuthMethod: 'none',
    createdAt,
  }
  await requireStore(options).insertClient(client)
  return Response.json({
    client_id: client.clientId,
    client_id_issued_at: Math.floor(client.createdAt / 1000),
    client_name: client.clientName,
    redirect_uris: client.redirectUris,
    grant_types: client.grantTypes,
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
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
    let result: CustomerRequestAgentOAuthTransition<CustomerRequestAgentOAuthGrant>
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
  let client: CustomerRequestAgentOAuthClient | null
  try {
    client = await readClient(clientId, options)
  } catch {
    return oauthAuthorizationUnavailableResponse()
  }
  if (client === null || redirectUri === null || responseType !== 'code' || state === null || challenge === null || challengeMethod === null || scopeText === null) {
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
  const approved = await approveGrant(store, {
    grantRef,
    ownerId: owner.userId,
    now: currentNow(options),
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
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    device_authorization_endpoint: `${base}/oauth/device_authorization`,
    grant_types_supported: [AUTHORIZATION_CODE_GRANT_TYPE, DEVICE_GRANT_TYPE],
    response_types_supported: ['code'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
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
  claimed: CustomerRequestAgentOAuthTransition<Readonly<{ grant: CustomerRequestAgentOAuthGrant; claimToken: string }>>,
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
      expires_in: CUSTOMER_REQUEST_AGENT_KEY_TTL_SECONDS,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    await resetGrantDelivery(requireStore(options), { grantRef: claimed.value.grant.grantRef, claimToken: claimed.value.claimToken })
    return oauthError('invalid_grant', 400)
  }
}

async function issueGrantKey(grant: CustomerRequestAgentOAuthGrant, ownerId: string, options: OAuthApiOptions): Promise<{ keyId: string }> {
  const issue: CustomerRequestAgentOAuthIssueKey = async ({ ownerId: inputOwnerId, grant: inputGrant }) => {
    const idempotencyKey = inputGrant.grantRef.replaceAll(':', '-')
    if (options.issueKey !== undefined) {
      return await options.issueKey({ ownerId: inputOwnerId, name: inputGrant.displayName, idempotencyKey, scopes: inputGrant.requestedScopes, grantRef: inputGrant.grantRef })
    }
    const issued = await issueCustomerRequestAgentKey({
      ownerId: inputOwnerId,
      principal: { userId: inputOwnerId },
      input: { name: inputGrant.displayName, idempotencyKey, scopes: inputGrant.requestedScopes, grantRef: inputGrant.grantRef },
      returnSecret: false,
      api: createClerkCustomerRequestAgentKeyApi(clerkClient().apiKeys),
      registerPrincipal: registerCustomerRequestAgentPrincipal,
    })
    if (issued.kind === 'error') throw new Error(issued.code)
    return { keyId: issued.keyId }
  }
  return await issue({ ownerId, grant })
}

async function readClient(clientId: string | null, options: OAuthApiOptions): Promise<CustomerRequestAgentOAuthClient | null> {
  if (clientId === null) return null
  return await requireStore(options).getClient(clientId)
}

async function ownerIdentity(options: OAuthApiOptions): Promise<{ isAuthenticated: boolean; userId: string | null }> {
  return options.authenticateOwner === undefined ? await auth() : await options.authenticateOwner()
}

function requireStore(options: OAuthApiOptions): CustomerRequestAgentOAuthStore {
  if (options.store === undefined) throw new Error('customer_request_oauth_state_unavailable')
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

function modeForGrant(grant: CustomerRequestAgentOAuthGrant): CustomerRequestAuthorityMode | undefined {
  return customerRequestAuthorityModeForScopes(grant.requestedScopes)
}

function consentHtml(input: Readonly<{ grantRef: string; clientName: string; mode: CustomerRequestAuthorityMode; state: string }>): string {
  const escapedName = escapeHtml(input.clientName)
  const escapedGrantRef = escapeHtml(input.grantRef)
  const escapedState = escapeHtml(input.state)
  const scope = customerRequestScopeForMode(input.mode)
  const permission = consentPermissionCopy(input.mode)
  return `<main data-ae-consent data-grant-ref="${escapedGrantRef}" data-client-name="${escapedName}" data-authority-mode="${input.mode}"><h1>Connect ${escapedName} to AE</h1><p>Your assistant may ${permission.allowed}.</p><p>${permission.approval}</p><p>Access expires in seven days. You can revoke it at any time from your assistant access page.</p><details><summary>Technical details</summary><p data-ae-scope>Technical permission: ${escapeHtml(scope)}</p></details><form method="post" action="/oauth/authorize"><input type="hidden" name="grant_ref" value="${escapedGrantRef}"><input type="hidden" name="state" value="${escapedState}"><button name="decision" value="approve">Approve access</button><button name="decision" value="deny">Decline</button></form></main>`
}

function consentPermissionCopy(mode: CustomerRequestAuthorityMode): Readonly<{ allowed: string; approval: string }> {
  if (mode === 'inspect_only') return { allowed: 'browse and compare businesses', approval: 'Any work still waits for your approval.' }
  if (mode === 'approve_each') return { allowed: 'bring each request to you', approval: 'You approve each request before it moves forward.' }
  if (mode === 'bounded_mandate') return { allowed: 'work within the limits you set', approval: 'Anything outside those limits comes back to you for approval.' }
  return { allowed: 'carry out approved work on your behalf', approval: 'AE still asks for your approval where required.' }
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll('\'', '&#39;')
}

type OAuthErrorBody = Readonly<{ error: OAuthErrorCode; error_description: string }>

const OAUTH_ERROR_DESCRIPTIONS: Readonly<Record<OAuthErrorCode, string>> = {
  invalid_client: 'The OAuth client is invalid.',
  invalid_scope: 'The requested scope is invalid.',
  invalid_request: 'The OAuth request is invalid.',
  authorization_pending: 'Authorization is still pending.',
  slow_down: 'Authorization is still pending; wait longer before polling again.',
  access_denied: 'The resource owner denied the request.',
  expired_token: 'The device or authorization code expired.',
  invalid_grant: 'The authorization grant is invalid or expired.',
  rate_limited: 'Too many OAuth requests; retry later.',
}

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

export function oauthChallengeResponse(request: Request, requiredScope = CUSTOMER_REQUEST_AGENT_SCOPE): Response {
  const base = resolveCanonicalBaseUrl(request).baseUrl
  return problem(
    { status: 401, kind: 'UNAUTHENTICATED', code: 'authentication_required', detail: 'Authentication required.' },
    { 'WWW-Authenticate': bearerChallenge(base, requiredScope), 'Vary': 'Authorization' },
  )
}
