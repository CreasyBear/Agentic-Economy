import { auth, clerkClient } from '@clerk/tanstack-react-start/server'

import { bearerChallenge, oauthProtectedResourceMetadata } from '@/lib/http/oauth-challenge'
import {
  CUSTOMER_REQUEST_AGENT_SCOPE,
  CUSTOMER_REQUEST_AUTHORITY_MODE_VALUES,
  customerRequestScopeForMode,
  type CustomerRequestAuthorityMode,
} from '@/modules/customer-request/agent-contract'
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
import { createClerkCustomerRequestAgentKeyApi } from '@/modules/customer-request/agent-access.functions'

type OAuthApiOptions = Readonly<{
  store?: CustomerRequestAgentOAuthStore
  now?: () => number
  canonicalBaseUrl?: string
  authenticateOwner?: () => Promise<{ isAuthenticated: boolean; userId: string | null }>
  issueKey?: (input: Readonly<{ ownerId: string; name: string; idempotencyKey: string; scopes: readonly string[]; grantRef: string }>) => Promise<Readonly<{ keyId: string; secret?: string }>>
  getSecret?: (keyId: string) => Promise<{ secret: string }>
}>

export type { OAuthApiOptions }

type OAuthErrorCode = 'invalid_client' | 'invalid_scope' | 'invalid_request' | 'authorization_pending' | 'slow_down' | 'access_denied' | 'expired_token' | 'invalid_grant'
const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'
const AUTHORIZATION_CODE_GRANT_TYPE = 'authorization_code'
const PUBLIC_CLIENT_AUTH_METHOD = 'none'

export async function handleDeviceAuthorizationPost(request: Request, options: OAuthApiOptions = {}): Promise<Response> {
  const form = await readForm(request)
  if (form === undefined) return oauthError('invalid_request', 400)
  const clientId = form.get('client_id')
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
  const form = await readForm(request)
  if (form === undefined) return oauthError('invalid_request', 400)
  const grantType = form.get('grant_type')
  if (grantType === DEVICE_GRANT_TYPE) return await pollDeviceGrantRequest(form, request, options)
  if (grantType === AUTHORIZATION_CODE_GRANT_TYPE) return await exchangeAuthorizationCode(form, request, options)
  return oauthError('invalid_request', 400)
}

export async function handleOAuthRegisterPost(request: Request, options: OAuthApiOptions = {}): Promise<Response> {
  const payload = await readJson(request)
  if (payload === undefined || typeof payload !== 'object' || payload === null) return oauthError('invalid_request', 400)
  const value = payload as Record<string, unknown>
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
    const owner = await ownerIdentity(options)
    if (!owner.isAuthenticated || owner.userId === null) return Response.redirect(new URL('/sign-in', baseUrl(request, options)), 302)
    const result = await readGrantForConsent(requireStore(options), { userCode, ownerId: owner.userId, now: currentNow(options) })
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
  const client = await readClient(clientId, options)
  if (client === null || redirectUri === null || responseType !== 'code' || state === null || challenge === null || challengeMethod === null || scopeText === null) {
    return oauthError('invalid_request', 400)
  }
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
  const form = await readForm(request)
  if (form === undefined) return oauthError('invalid_request', 400)
  const owner = await ownerIdentity(options)
  const grantRef = form.get('grant_ref')
  const userCode = form.get('user_code')
  const decision = form.get('decision')
  if (!owner.isAuthenticated || owner.userId === null || (grantRef === null && userCode === null)) return oauthError('access_denied', 403)
  const store = requireStore(options)
  if (decision !== 'approve') {
    const denied = await denyGrant(store, {
      ...(grantRef === null ? {} : { grantRef }),
      ...(userCode === null ? {} : { userCode }),
      ownerId: owner.userId,
      now: currentNow(options),
    })
    if (denied.kind !== 'ok') return oauthTransitionError(denied)
    return new Response('Authorization denied. You may close this window.', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
  }
  const approved = await approveGrant(store, {
    ...(grantRef === null ? {} : { grantRef }),
    ...(userCode === null ? {} : { userCode }),
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
  const base = canonicalBaseUrl.replace(/\/+$/u, '')
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

export function oauthProtectedResourceResponse(request: Request, canonicalBaseUrl = new URL(request.url).origin): Response {
  return Response.json(oauthProtectedResourceMetadata(canonicalBaseUrl), { headers: { 'Cache-Control': 'no-store' } })
}

export function oauthAuthorizationServerResponse(request: Request, canonicalBaseUrl = new URL(request.url).origin): Response {
  return Response.json(oauthAuthorizationServerMetadata(canonicalBaseUrl), { headers: { 'Cache-Control': 'no-store' } })
}

async function pollDeviceGrantRequest(form: URLSearchParams, request: Request, options: OAuthApiOptions): Promise<Response> {
  const clientId = form.get('client_id')
  const deviceCode = form.get('device_code')
  if (clientId === null || deviceCode === null) return oauthError('invalid_request', 400)
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

function baseUrl(request: Request, options: OAuthApiOptions): string {
  const configured = options.canonicalBaseUrl
  return configured === undefined ? new URL(request.url).origin : configured.replace(/\/+$/u, '')
}

async function readForm(request: Request): Promise<URLSearchParams | undefined> {
  try {
    if (!request.headers.get('content-type')?.toLowerCase().includes('application/x-www-form-urlencoded')) return undefined
    return new URLSearchParams(await request.text())
  } catch {
    return undefined
  }
}

async function readJson(request: Request): Promise<unknown> {
  try { return await request.json() } catch { return undefined }
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
  const modeScope = grant.requestedScopes.find((scope) => scope !== CUSTOMER_REQUEST_AGENT_SCOPE)
  if (modeScope === undefined) return undefined
  return CUSTOMER_REQUEST_AUTHORITY_MODE_VALUES.find((candidate) => customerRequestScopeForMode(candidate) === modeScope)
}

function consentHtml(input: Readonly<{ grantRef: string; clientName: string; mode: CustomerRequestAuthorityMode; state: string }>): string {
  const escapedName = escapeHtml(input.clientName)
  const escapedGrantRef = escapeHtml(input.grantRef)
  const escapedState = escapeHtml(input.state)
  const scope = customerRequestScopeForMode(input.mode)
  const permission = consentPermissionCopy(input.mode)
  return `<main data-ae-consent data-client-name="${escapedName}" data-authority-mode="${input.mode}"><h1>Connect ${escapedName} to AE</h1><p>Your assistant may ${permission.allowed}.</p><p>${permission.approval}</p><p>Access expires in seven days. You can revoke it at any time from your assistant access page.</p><details><summary>Technical details</summary><p data-ae-scope>Technical permission: ${escapeHtml(scope)}</p></details><form method="post" action="/oauth/authorize"><input type="hidden" name="grant_ref" value="${escapedGrantRef}"><input type="hidden" name="state" value="${escapedState}"><button name="decision" value="approve">Approve access</button><button name="decision" value="deny">Decline</button></form></main>`
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

function oauthError(error: OAuthErrorCode, status: 400 | 401 | 403): Response {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
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
  const base = new URL(request.url).origin
  return Response.json({ kind: 'refused', reason: 'authentication_required' }, { status: 401, headers: { 'Cache-Control': 'no-store', Vary: 'Authorization', 'WWW-Authenticate': bearerChallenge(base, requiredScope) } })
}
