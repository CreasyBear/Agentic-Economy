import { AGENT_ACCESS_OAUTH_AUTHORIZATION_SCOPES, oauthProtectedResourceMetadata } from '@/lib/http/oauth-challenge'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { authRefusalProblem } from '@/lib/server/agent-access-auth'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import { isRecord } from '@/modules/common/is-record'
import {
  AGENT_ACCESS_OAUTH_CODE_CHALLENGE_METHODS,
  AGENT_ACCESS_OAUTH_ERROR_DESCRIPTIONS,
  AGENT_ACCESS_OAUTH_ERROR_VALUES,
  AGENT_ACCESS_OAUTH_GRANT_TYPES,
  AGENT_ACCESS_OAUTH_PATHS,
  AGENT_ACCESS_OAUTH_RESPONSE_TYPES,
  AGENT_ACCESS_OAUTH_TOKEN_ENDPOINT_AUTH_METHODS,
  AGENT_ACCESS_OAUTH_SAFE_MCP_SCOPES,
  beginAuthorizationCodeGrant,
  beginDeviceGrant,
  createOpaqueOAuthValue,
  normalizeRequestedScopes,
  type AgentAccessOAuthClient,
  type AgentAccessOAuthErrorCode,
} from '@/modules/agent-access/oauth-state'
import { degrade } from '@/lib/observability/degrade'
import {
  authorizationRequestScopeError,
  defaultOAuthScopeText,
  locatedConsentResponse,
  readAgentCursor,
} from './agent-access-oauth/consent-security'
import {
  AUTHORIZATION_CODE_GRANT_TYPE,
  DEVICE_GRANT_TYPE,
  PUBLIC_CLIENT_AUTH_METHOD,
  arrayOfStrings,
  oauthError,
  oauthTransitionError,
  parseAuthorizationDetails,
  readForm,
  readJson,
  validRedirectUri,
  modeForGrant,
} from './agent-access-oauth/protocol'
import {
  baseUrl,
  currentNow,
  oauthAdmissionResponse,
  ownerIdentity,
  readClient,
  redirectTo,
  requireStore,
  oauthAuthorizationUnavailableResponse,
  type OAuthApiOptions,
} from './agent-access-oauth/runtime'
import {
  exchangeAuthorizationCode,
  exchangeRefreshToken,
  pollDeviceGrantRequest,
} from './agent-access-oauth/token-family'

export type { OAuthApiOptions } from './agent-access-oauth/runtime'

export { oauthAuthorizationUnavailableResponse } from './agent-access-oauth/runtime'

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

export { handleOAuthConsentPost } from './agent-access-oauth/consent-security'
export { handleOAuthRevokePost } from './agent-access-oauth/token-family'

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
  const scopeText = form.get('scope') ?? AGENT_ACCESS_OAUTH_SAFE_MCP_SCOPES.slice(0, -1).join(' ')
  const authorizationDetails = parseAuthorizationDetails(form.get('authorization_details'))
  if (authorizationDetails.kind === 'invalid') return oauthError('invalid_request', 400)
  const requestedAccess = authorizationDetails.kind === 'ok' ? authorizationDetails.requestedAccess : undefined
  const normalizedScopes = normalizeRequestedScopes(scopeText)
  if (requestedAccess !== undefined && (normalizedScopes?.mode === 'unrestricted_test_only'
    || (normalizedScopes?.profile === 'provider' && requestedAccess.toolAccess !== 'all_admitted'))) {
    return oauthError('invalid_request', 400)
  }
  const result = await beginDeviceGrant(requireStore(options), {
    environment: deploymentPaymentEnvironment(process.env),
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
  if (grantType === 'refresh_token') return await exchangeRefreshToken(form, request, options)
  return oauthError('invalid_request', 400)
}

export async function handleOAuthRegisterPost(request: Request, options: OAuthApiOptions = {}): Promise<Response> {
  const payload = await readJson(request)
  if (payload.kind === 'too_large') return oauthError('invalid_request', 413)
  if (payload.kind !== 'ok') return oauthError('invalid_request', 400)
  const value = payload.value
  if (value === null || typeof value !== 'object') return oauthError('invalid_request', 400)
  if (Array.isArray(value)) return oauthError('invalid_client_metadata', 400, {}, 'Client metadata must be an object.')
  if (!isRecord(value)) return oauthError('invalid_request', 400)
  const limited = await oauthAdmissionResponse(request, options, 'registration')
  if (limited !== undefined) return limited
  const clientName = typeof value.client_name === 'string' ? value.client_name.trim() : ''
  const redirectUris = arrayOfStrings(value.redirect_uris)
  const grantTypes = arrayOfStrings(value.grant_types)
  const responseTypes = arrayOfStrings(value.response_types)
  const authorizationCodeRequested = grantTypes.includes(AUTHORIZATION_CODE_GRANT_TYPE)
  const refreshRequested = grantTypes.includes('refresh_token')
  const responseTypesValid = authorizationCodeRequested
    ? responseTypes.length === AGENT_ACCESS_OAUTH_RESPONSE_TYPES.length && responseTypes[0] === AGENT_ACCESS_OAUTH_RESPONSE_TYPES[0]
    : responseTypes.length === 0
  const authMethod = value.token_endpoint_auth_method
  if (redirectUris.length === 0 || redirectUris.some((uri) => !validRedirectUri(uri))) {
    return oauthError('invalid_redirect_uri', 400, {}, 'redirect_uris must contain at least one valid redirect URI.')
  }
  if (clientName.length < 1 || clientName.length > 120) {
    return oauthError('invalid_client_metadata', 400, {}, 'client_name must be between 1 and 120 characters.')
  }
  if (!responseTypesValid) return oauthError('invalid_client_metadata', 400, {}, 'response_types must match the requested grant_types.')
  if (refreshRequested && !authorizationCodeRequested
    || grantTypes.some((grant) => grant !== AUTHORIZATION_CODE_GRANT_TYPE && grant !== DEVICE_GRANT_TYPE && grant !== 'refresh_token')
    || grantTypes.length === 0) {
    return oauthError('invalid_client_metadata', 400, {}, 'grant_types must contain a supported grant type.')
  }
  if (authMethod !== PUBLIC_CLIENT_AUTH_METHOD) {
    return oauthError('invalid_client_metadata', 400, {}, 'token_endpoint_auth_method must be none.')
  }
  const requestedScopes = normalizeRequestedScopes(typeof value.scope === 'string'
    ? value.scope
    : defaultOAuthScopeText(grantTypes.includes('refresh_token')))
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
    scope: [...requestedScopes.scopes, ...(requestedScopes.offlineAccess ? ['offline_access'] : [])].join(' '),
  }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}

export async function handleOAuthAuthorizeGet(request: Request, options: OAuthApiOptions = {}): Promise<Response> {
  const url = new URL(request.url)
  const agentCursor = readAgentCursor(url)
  if (agentCursor === undefined) return oauthError('invalid_request', 400)
  const userCode = url.searchParams.get('user_code')
  const grantRef = url.searchParams.get('grant_ref')
  if (userCode !== null && grantRef !== null) return oauthError('invalid_request', 400)
  if (userCode !== null || grantRef !== null) {
    return await locatedConsentResponse(request, options, agentCursor, userCode, grantRef)
  }
  const clientId = url.searchParams.get('client_id')
  const redirectUri = url.searchParams.get('redirect_uri')
  const state = url.searchParams.get('state')
  const responseType = url.searchParams.get('response_type')
  const challenge = url.searchParams.get('code_challenge')
  const challengeMethod = url.searchParams.get('code_challenge_method')
  const requestedScopeText = url.searchParams.get('scope')
  let client: AgentAccessOAuthClient | null
  try {
    client = await readClient(clientId, options)
  } catch (cause) {
    return degrade(cause, oauthAuthorizationUnavailableResponse(), { site: 'handleOAuthAuthorizeGet', reason: 'source_unavailable' })
  }
  if (client === null || redirectUri === null || responseType !== AGENT_ACCESS_OAUTH_RESPONSE_TYPES[0] || state === null || challenge === null || challengeMethod === null) {
    return oauthError('invalid_request', 400)
  }
  const scopeText = requestedScopeText ?? defaultOAuthScopeText(client.grantTypes.includes('refresh_token'))
  const authorizationDetails = parseAuthorizationDetails(url.searchParams.get('authorization_details'))
  if (authorizationDetails.kind === 'invalid') return oauthError('invalid_request', 400)
  const requestedAccess = authorizationDetails.kind === 'ok' ? authorizationDetails.requestedAccess : undefined
  const normalizedScopes = normalizeRequestedScopes(scopeText)
  const scopeError = authorizationRequestScopeError(client, normalizedScopes, requestedAccess)
  if (scopeError !== undefined) return oauthError(scopeError, 400)
  const limited = await oauthAdmissionResponse(request, options, `authorization:${clientId ?? 'missing'}`)
  if (limited !== undefined) return limited
  const owner = await ownerIdentity(options)
  if (!owner.isAuthenticated || owner.userId === null) {
    const login = new URL('/sign-in', baseUrl(request, options))
    login.searchParams.set('redirect', `${url.pathname}${url.search}`)
    return redirectTo(login)
  }
  const result = await beginAuthorizationCodeGrant(requireStore(options), {
    environment: deploymentPaymentEnvironment(process.env),
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
  const gate = new URL(AGENT_ACCESS_OAUTH_PATHS.deviceVerification, baseUrl(request, options))
  gate.searchParams.set('grant_ref', result.value.grant.grantRef)
  gate.searchParams.set('state', state)
  return redirectTo(gate)
}

export function oauthAuthorizationServerMetadata(canonicalBaseUrl: string): Readonly<Record<string, unknown>> {
  const base = trimTrailingSlashes(canonicalBaseUrl)
  return {
    issuer: base,
    authorization_endpoint: `${base}${AGENT_ACCESS_OAUTH_PATHS.authorize}`,
    token_endpoint: `${base}${AGENT_ACCESS_OAUTH_PATHS.token}`,
    registration_endpoint: `${base}${AGENT_ACCESS_OAUTH_PATHS.register}`,
    device_authorization_endpoint: `${base}${AGENT_ACCESS_OAUTH_PATHS.deviceAuthorization}`,
    revocation_endpoint: `${base}${AGENT_ACCESS_OAUTH_PATHS.revoke}`,
    grant_types_supported: [...AGENT_ACCESS_OAUTH_GRANT_TYPES],
    response_types_supported: [...AGENT_ACCESS_OAUTH_RESPONSE_TYPES],
    token_endpoint_auth_methods_supported: [...AGENT_ACCESS_OAUTH_TOKEN_ENDPOINT_AUTH_METHODS],
    code_challenge_methods_supported: [...AGENT_ACCESS_OAUTH_CODE_CHALLENGE_METHODS],
    scopes_supported: [...AGENT_ACCESS_OAUTH_AUTHORIZATION_SCOPES],
  }
}

export function oauthProtectedResourceResponse(request: Request, canonicalBaseUrl = resolveCanonicalBaseUrl(request).baseUrl): Response {
  return Response.json(oauthProtectedResourceMetadata(canonicalBaseUrl), { headers: { 'Cache-Control': 'no-store' } })
}

export function oauthAuthorizationServerResponse(request: Request, canonicalBaseUrl = resolveCanonicalBaseUrl(request).baseUrl): Response {
  return Response.json(oauthAuthorizationServerMetadata(canonicalBaseUrl), { headers: { 'Cache-Control': 'no-store' } })
}

export function oauthChallengeResponse(request: Request, requiredScope?: string): Response {
  return authRefusalProblem(request, { kind: 'refused', status: 401, reason: 'authentication_required' }, requiredScope)
}
