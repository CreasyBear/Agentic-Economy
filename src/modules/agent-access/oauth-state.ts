import { customAlphabet } from 'nanoid'
import { sanitizeTelemetryError } from '@/lib/observability/private-route-safety'

import { base64Codec } from '@/modules/common/base64-codec'
import type { ExactAmount } from '@/modules/money/public'

import {
  AGENT_ACCESS_AUTHORITY_MODE_VALUES,
  CUSTOMER_REQUEST_AGENT_SCOPE,
  MARKET_OPERATIONS_INVOKE_SCOPE,
  MARKET_SUPPLY_MANAGE_SCOPE,
  agentAuthorityModeAllows,
  agentAuthorityModeForScopes,
  agentAuthorityScopeForMode,
  type AgentAccessAuthorityMode,
} from './contract'
import {
  AGENT_ACCESS_KEY_TTL_SECONDS,
  type AgentAccessEnvironment,
} from './agent-access'

export const AGENT_ACCESS_GRANT_TTL_SECONDS = 600
export const AGENT_ACCESS_AUTHORIZATION_CODE_TTL_SECONDS = 60
export const AGENT_ACCESS_POLL_INTERVAL_SECONDS = 5
export const AGENT_ACCESS_OAUTH_PATHS = Object.freeze({
  authorizationServerMetadata: '/.well-known/oauth-authorization-server',
  protectedResourceMetadata: '/.well-known/oauth-protected-resource',
  authorize: '/oauth/authorize',
  register: '/oauth/register',
  deviceAuthorization: '/oauth/device_authorization',
  deviceVerification: '/agent-access/authorize',
  token: '/oauth/token',
} as const)

export const AGENT_ACCESS_OAUTH_GRANT_TYPES = Object.freeze([
  'authorization_code',
  'urn:ietf:params:oauth:grant-type:device_code',
] as const)
export const AGENT_ACCESS_OAUTH_RESPONSE_TYPES = Object.freeze(['code'] as const)
export const AGENT_ACCESS_OAUTH_TOKEN_ENDPOINT_AUTH_METHODS = Object.freeze(['none'] as const)
export const AGENT_ACCESS_OAUTH_CODE_CHALLENGE_METHODS = Object.freeze(['S256'] as const)
export const AGENT_ACCESS_OAUTH_ERROR_VALUES = Object.freeze([
  'invalid_client',
  'invalid_scope',
  'invalid_request',
  'authorization_pending',
  'slow_down',
  'access_denied',
  'expired_token',
  'invalid_grant',
  'server_error',
  'rate_limited',
] as const)
export type AgentAccessOAuthErrorCode = typeof AGENT_ACCESS_OAUTH_ERROR_VALUES[number]
export const AGENT_ACCESS_OAUTH_ERROR_DESCRIPTIONS: Readonly<Record<AgentAccessOAuthErrorCode, string>> = Object.freeze({
  invalid_client: 'The OAuth client is invalid.',
  invalid_scope: 'The requested scope is invalid.',
  invalid_request: 'The OAuth request is invalid.',
  authorization_pending: 'Authorization is still pending.',
  slow_down: 'Authorization is still pending; wait longer before polling again.',
  access_denied: 'The resource owner denied the request.',
  expired_token: 'The device or authorization code expired.',
  invalid_grant: 'The authorization grant is invalid or expired.',
  server_error: 'The authorization server is temporarily unavailable.',
  rate_limited: 'Too many OAuth requests; retry later.',
})

export type AgentAccessOAuthFlow = 'device_code' | 'authorization_code'
export type AgentAccessOAuthGrantStatus = 'pending' | 'approved' | 'denied' | 'delivery_claimed' | 'consumed' | 'expired'
export type AgentAccessOAuthRequestedAccess = Readonly<{
  environment: AgentAccessEnvironment
  maximumSpendPerInvocation?: ExactAmount
  maximumDailySpend?: ExactAmount
  maximumMonthlySpend?: ExactAmount
  maximumConcurrentInvocations?: number
  maximumCallsPerMinute?: number
  maximumCallsPerHour?: number
  expiresInSeconds: number
}>

export type AgentAccessOAuthGrant = Readonly<{
  grantRef: string
  flow: AgentAccessOAuthFlow
  clientId: string
  redirectUri?: string
  requestedScopes: readonly string[]
  requestedAccess: AgentAccessOAuthRequestedAccess
  codeChallenge?: string
  codeChallengeMethod?: 'S256'
  deviceCodeHash?: string
  userCodeHash?: string
  authorizationCodeHash?: string
  status: AgentAccessOAuthGrantStatus
  ownerId?: string
  keyId?: string
  createdAt: number
  expiresAt: number
  approvedAt?: number
  consumedAt?: number
  nextPollAt?: number
  deliveryClaimToken?: string
  displayName: string
  denialReason?: 'access_denied'
}>

export type AgentAccessOAuthClient = Readonly<{
  clientId: string
  clientName: string
  redirectUris: readonly string[]
  grantTypes: readonly ('authorization_code' | 'urn:ietf:params:oauth:grant-type:device_code')[]
  tokenEndpointAuthMethod: 'none'
  createdAt: number
  lastUsedAt?: number
}>

export type AgentAccessOAuthStore = Readonly<{
  insertGrant: (grant: AgentAccessOAuthGrant) => Promise<void>
  getGrantByHash: (kind: 'device' | 'user' | 'authorization', hash: string) => Promise<AgentAccessOAuthGrant | null>
  getGrantByRef: (grantRef: string) => Promise<AgentAccessOAuthGrant | null>
  updateGrant: (grantRef: string, expectedStatus: AgentAccessOAuthGrantStatus, patch: Partial<AgentAccessOAuthGrant>) => Promise<AgentAccessOAuthGrant | null>
  insertClient: (client: AgentAccessOAuthClient) => Promise<void>
  getClient: (clientId: string) => Promise<AgentAccessOAuthClient | null>
}>

export type AgentAccessOAuthRefusalReason =
  | 'invalid_client'
  | 'invalid_scope'
  | 'invalid_grant'
  | 'invalid_pkce'
  | 'invalid_redirect_uri'
  | 'authorization_pending'
  | 'slow_down'
  | 'access_denied'
  | 'expired_token'
  | 'owner_mismatch'
  | 'owner_required'
  | 'missing_key'
  | 'issuance_unavailable'
  | 'delivery_claim_mismatch'

export type AgentAccessOAuthConflictReason =
  | 'concurrent_transition'
  | 'already_approved'
  | 'already_denied'
  | 'delivery_claim_lost'

export type AgentAccessOAuthRefusal = Readonly<{ kind: 'refused'; reason: AgentAccessOAuthRefusalReason }>
export type AgentAccessOAuthConflict = Readonly<{ kind: 'conflict'; reason: AgentAccessOAuthConflictReason }>
export type AgentAccessOAuthTransition<T> =
  | Readonly<{ kind: 'ok'; value: T }>
  | AgentAccessOAuthRefusal
  | AgentAccessOAuthConflict

export class AgentAccessOAuthIssueRefusal extends Error {
  readonly reason: 'invalid_grant' | 'invalid_scope'

  constructor(reason: 'invalid_grant' | 'invalid_scope') {
    super(reason)
    this.name = 'AgentAccessOAuthIssueRefusal'
    this.reason = reason
  }
}

export type AgentAccessOAuthIssueKey = (input: Readonly<{
  ownerId: string
  grant: AgentAccessOAuthGrant
}>) => Promise<Readonly<{ keyId: string }>>

export type AgentAccessOAuthCreatedDeviceGrant = Readonly<{
  grant: AgentAccessOAuthGrant
  deviceCode: string
  userCode: string
  expiresIn: number
  interval: number
}>

export type AgentAccessOAuthCreatedAuthorizationGrant = Readonly<{
  grant: AgentAccessOAuthGrant
  authorizationCode?: never
  expiresIn: number
}>

export function requestedScopesForMode(mode: AgentAccessAuthorityMode): readonly string[] {
  return [MARKET_OPERATIONS_INVOKE_SCOPE, agentAuthorityScopeForMode(mode)]
}

export function normalizeRequestedScopes(scopeText: string | null | undefined): Readonly<{
  mode: AgentAccessAuthorityMode
  scopes: readonly string[]
  profile: 'market' | 'supplier'
}> | undefined {
  if (scopeText === null || scopeText === undefined) return undefined
  const rawScopes = scopeText.split(/\s+/u).filter((scope) => scope.length > 0)
  if (rawScopes.length === 0 || new Set(rawScopes).size !== rawScopes.length) return undefined
  if (rawScopes.length === 1 && rawScopes[0] === MARKET_SUPPLY_MANAGE_SCOPE) {
    return { mode: 'bounded_mandate', scopes: [MARKET_SUPPLY_MANAGE_SCOPE], profile: 'supplier' }
  }
  const scopes = rawScopes.includes(MARKET_OPERATIONS_INVOKE_SCOPE)
    ? rawScopes
    : [MARKET_OPERATIONS_INVOKE_SCOPE, ...rawScopes]
  if (scopes.includes(CUSTOMER_REQUEST_AGENT_SCOPE)) return undefined
  const mode = agentAuthorityModeForScopes(scopes)
  if (mode === undefined) return undefined
  const modeScope = agentAuthorityScopeForMode(mode)
  const extras = scopes.filter((scope) => scope !== MARKET_OPERATIONS_INVOKE_SCOPE && scope !== modeScope)
  if (extras.length > 0) return undefined
  return { mode, scopes: requestedScopesForMode(mode), profile: 'market' }
}

export async function hashOAuthValue(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return base64Codec.toBase64Url(new Uint8Array(bytes))
}

export function createOpaqueOAuthValue(bytes = 32): string {
  const value = new Uint8Array(bytes)
  crypto.getRandomValues(value)
  return base64Codec.toBase64Url(value)
}

const userCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const generateUserCode = customAlphabet(userCodeAlphabet, 8)

export function createUserCode(): string {
  const value = generateUserCode()
  return `${value.slice(0, 4)}-${value.slice(4)}`
}

export async function beginDeviceGrant(
  store: AgentAccessOAuthStore,
  input: Readonly<{
    client: AgentAccessOAuthClient
    requestedScopes: readonly string[]
    requestedAccess?: AgentAccessOAuthRequestedAccess
    now: number
  }>,
): Promise<AgentAccessOAuthTransition<AgentAccessOAuthCreatedDeviceGrant>> {
  if (!input.client.grantTypes.includes('urn:ietf:params:oauth:grant-type:device_code')) return { kind: 'refused', reason: 'invalid_client' }
  const scopes = normalizeRequestedScopes(input.requestedScopes.join(' '))
  if (scopes === undefined) return { kind: 'refused', reason: 'invalid_scope' }
  const deviceCode = createOpaqueOAuthValue()
  const userCode = createUserCode()
  const grant: AgentAccessOAuthGrant = {
    grantRef: `device:${createOpaqueOAuthValue(18)}`,
    flow: 'device_code',
    clientId: input.client.clientId,
    requestedScopes: [...scopes.scopes],
    requestedAccess: input.requestedAccess ?? {
      environment: 'sandbox',
      expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS,
    },
    deviceCodeHash: await hashOAuthValue(deviceCode),
    userCodeHash: await hashOAuthValue(userCode),
    status: 'pending',
    createdAt: input.now,
    expiresAt: input.now + AGENT_ACCESS_GRANT_TTL_SECONDS * 1000,
    nextPollAt: input.now,
    displayName: input.client.clientName,
  }
  await store.insertGrant(grant)
  return { kind: 'ok', value: { grant, deviceCode, userCode, expiresIn: AGENT_ACCESS_GRANT_TTL_SECONDS, interval: AGENT_ACCESS_POLL_INTERVAL_SECONDS } }
}

export async function beginAuthorizationCodeGrant(
  store: AgentAccessOAuthStore,
  input: Readonly<{
    client: AgentAccessOAuthClient
    redirectUri: string
    requestedScopes: readonly string[]
    requestedAccess?: AgentAccessOAuthRequestedAccess
    codeChallenge: string
    codeChallengeMethod: string
    ownerId: string
    now: number
  }>,
): Promise<AgentAccessOAuthTransition<Readonly<{ grant: AgentAccessOAuthGrant; expiresIn: number }>>> {
  if (!input.client.grantTypes.includes('authorization_code')) return { kind: 'refused', reason: 'invalid_client' }
  if (!input.client.redirectUris.includes(input.redirectUri)) return { kind: 'refused', reason: 'invalid_redirect_uri' }
  if (input.codeChallenge.trim().length === 0 || input.codeChallengeMethod !== 'S256') return { kind: 'refused', reason: 'invalid_pkce' }
  if (input.ownerId.trim().length === 0) return { kind: 'refused', reason: 'owner_required' }
  const scopes = normalizeRequestedScopes(input.requestedScopes.join(' '))
  if (scopes === undefined) return { kind: 'refused', reason: 'invalid_scope' }
  const grant: AgentAccessOAuthGrant = {
    grantRef: `authorization:${createOpaqueOAuthValue(18)}`,
    flow: 'authorization_code',
    clientId: input.client.clientId,
    redirectUri: input.redirectUri,
    requestedScopes: [...scopes.scopes],
    requestedAccess: input.requestedAccess ?? {
      environment: 'sandbox',
      expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS,
    },
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: 'S256',
    status: 'pending',
    ownerId: input.ownerId,
    createdAt: input.now,
    expiresAt: input.now + AGENT_ACCESS_AUTHORIZATION_CODE_TTL_SECONDS * 1000,
    displayName: input.client.clientName,
  }
  await store.insertGrant(grant)
  return { kind: 'ok', value: { grant, expiresIn: AGENT_ACCESS_AUTHORIZATION_CODE_TTL_SECONDS } }
}

export async function readGrantForConsent(
  store: AgentAccessOAuthStore,
  input: Readonly<{ userCode: string; ownerId: string; now: number }>,
): Promise<AgentAccessOAuthTransition<AgentAccessOAuthGrant>> {
  const grant = await store.getGrantByHash('user', await hashOAuthValue(input.userCode))
  const valid = pendingGrant(grant, input.now)
  if (valid.kind !== 'ok') return valid
  if (input.ownerId.trim().length === 0) return { kind: 'refused', reason: 'owner_required' }
  if (valid.value.ownerId !== undefined && valid.value.ownerId !== input.ownerId) return { kind: 'refused', reason: 'owner_mismatch' }
  return valid
}

export async function approveGrant(
  store: AgentAccessOAuthStore,
  input: Readonly<{
    grantRef?: string
    userCode?: string
    ownerId: string
    now: number
    issueKey: AgentAccessOAuthIssueKey
    authorityMode?: AgentAccessAuthorityMode
  }>,
): Promise<AgentAccessOAuthTransition<Readonly<{ grant: AgentAccessOAuthGrant; authorizationCode?: string }>>> {
  const grant = await findGrant(store, input)
  const valid = pendingGrant(grant, input.now)
  if (valid.kind !== 'ok') return valid
  if (input.ownerId.trim().length === 0) return { kind: 'refused', reason: 'owner_required' }
  if (valid.value.ownerId !== undefined && valid.value.ownerId !== input.ownerId) return { kind: 'refused', reason: 'owner_mismatch' }
  const requested = normalizeRequestedScopes(valid.value.requestedScopes.join(' '))
  if (requested === undefined) return { kind: 'refused', reason: 'invalid_scope' }
  const selectedMode = input.authorityMode ?? requested.mode
  if (!AGENT_ACCESS_AUTHORITY_MODE_VALUES.includes(selectedMode)
    || !agentAuthorityModeAllows(requested.mode, selectedMode)) return { kind: 'refused', reason: 'invalid_scope' }
  if (requested.profile === 'supplier' && selectedMode !== 'bounded_mandate') {
    return { kind: 'refused', reason: 'invalid_scope' }
  }
  const approvedScopes = requested.profile === 'supplier'
    ? requested.scopes
    : requestedScopesForMode(selectedMode)
  let issued: Readonly<{ keyId: string }>
  try {
    issued = await input.issueKey({ ownerId: input.ownerId, grant: { ...valid.value, requestedScopes: approvedScopes } })
  } catch (error) {
    if (error instanceof AgentAccessOAuthIssueRefusal) return { kind: 'refused', reason: error.reason }
    console.error('[agent-access-oauth] issueKey failed', sanitizeTelemetryError(error))
    return { kind: 'refused', reason: 'issuance_unavailable' }
  }
  if (issued.keyId.trim().length === 0) return { kind: 'refused', reason: 'missing_key' }
  const authorizationCode = valid.value.flow === 'authorization_code' ? createOpaqueOAuthValue() : undefined
  const patch: Partial<AgentAccessOAuthGrant> = {
    status: 'approved',
    ownerId: input.ownerId,
    keyId: issued.keyId,
    requestedScopes: [...approvedScopes],
    approvedAt: input.now,
    ...(authorizationCode === undefined ? {} : { authorizationCodeHash: await hashOAuthValue(authorizationCode) }),
  }
  const updated = await store.updateGrant(valid.value.grantRef, 'pending', patch)
  if (updated === null) return { kind: 'conflict', reason: 'concurrent_transition' }
  return { kind: 'ok', value: { grant: updated, ...(authorizationCode === undefined ? {} : { authorizationCode }) } }
}

export async function denyGrant(
  store: AgentAccessOAuthStore,
  input: Readonly<{ grantRef?: string; userCode?: string; ownerId: string; now: number }>,
): Promise<AgentAccessOAuthTransition<AgentAccessOAuthGrant>> {
  const grant = await findGrant(store, input)
  const valid = pendingGrant(grant, input.now)
  if (valid.kind !== 'ok') return valid
  if (input.ownerId.trim().length === 0) return { kind: 'refused', reason: 'owner_required' }
  if (valid.value.ownerId !== undefined && valid.value.ownerId !== input.ownerId) return { kind: 'refused', reason: 'owner_mismatch' }
  const updated = await store.updateGrant(valid.value.grantRef, 'pending', { status: 'denied', denialReason: 'access_denied' })
  if (updated === null) return { kind: 'conflict', reason: 'concurrent_transition' }
  return { kind: 'ok', value: updated }
}

export type AgentAccessOAuthPollResult =
  | Readonly<{ kind: 'authorization_pending' }>
  | Readonly<{ kind: 'slow_down' }>
  | Readonly<{ kind: 'ready'; grant: AgentAccessOAuthGrant }>
  | AgentAccessOAuthRefusal
  | AgentAccessOAuthConflict

export async function pollDeviceGrant(
  store: AgentAccessOAuthStore,
  input: Readonly<{ clientId: string; deviceCode: string; now: number }>,
): Promise<AgentAccessOAuthPollResult> {
  const grant = await store.getGrantByHash('device', await hashOAuthValue(input.deviceCode))
  if (grant === null || grant.flow !== 'device_code' || grant.clientId !== input.clientId) return { kind: 'refused', reason: 'invalid_grant' }
  if (grant.expiresAt <= input.now || grant.status === 'expired') {
    if (grant.status === 'pending') await store.updateGrant(grant.grantRef, 'pending', { status: 'expired' })
    return { kind: 'refused', reason: 'expired_token' }
  }
  if (grant.status === 'denied') return { kind: 'refused', reason: 'access_denied' }
  if (grant.status === 'consumed' || grant.status === 'delivery_claimed') return { kind: 'refused', reason: 'invalid_grant' }
  if (grant.status === 'approved') return { kind: 'ready', grant }
  const tooSoon = grant.nextPollAt !== undefined && input.now < grant.nextPollAt
  const updated = await store.updateGrant(grant.grantRef, 'pending', { nextPollAt: input.now + AGENT_ACCESS_POLL_INTERVAL_SECONDS * 1000 })
  if (updated === null) return { kind: 'conflict', reason: 'concurrent_transition' }
  return tooSoon ? { kind: 'slow_down' } : { kind: 'authorization_pending' }
}

export type AgentAccessOAuthDeliveryCredential =
  | Readonly<{ kind: 'device'; grantRef: string; clientId: string }>
  | Readonly<{ kind: 'authorization'; authorizationCode: string; clientId: string; redirectUri: string; codeVerifier: string }>

export async function claimGrantDelivery(
  store: AgentAccessOAuthStore,
  input: Readonly<{ credential: AgentAccessOAuthDeliveryCredential; now: number }>,
): Promise<AgentAccessOAuthTransition<Readonly<{ grant: AgentAccessOAuthGrant; claimToken: string }>>> {
  let grant: AgentAccessOAuthGrant | null
  if (input.credential.kind === 'device') {
    grant = await store.getGrantByRef(input.credential.grantRef)
    if (grant === null || grant.flow !== 'device_code' || grant.clientId !== input.credential.clientId) return { kind: 'refused', reason: 'invalid_grant' }
  } else {
    grant = await store.getGrantByHash('authorization', await hashOAuthValue(input.credential.authorizationCode))
    if (grant === null || grant.flow !== 'authorization_code' || grant.clientId !== input.credential.clientId || grant.redirectUri !== input.credential.redirectUri) return { kind: 'refused', reason: 'invalid_grant' }
    if (grant.codeChallengeMethod !== 'S256' || grant.codeChallenge === undefined || await hashOAuthValue(input.credential.codeVerifier) !== grant.codeChallenge) return { kind: 'refused', reason: 'invalid_pkce' }
  }
  if (grant.expiresAt <= input.now || grant.status === 'expired') return { kind: 'refused', reason: 'expired_token' }
  if (grant.status !== 'approved') return { kind: 'refused', reason: grant.status === 'denied' ? 'access_denied' : 'invalid_grant' }
  if (grant.keyId === undefined) return { kind: 'refused', reason: 'missing_key' }
  const claimToken = createOpaqueOAuthValue(18)
  const claimed = await store.updateGrant(grant.grantRef, 'approved', { status: 'delivery_claimed', deliveryClaimToken: claimToken })
  if (claimed === null) return { kind: 'conflict', reason: 'delivery_claim_lost' }
  return { kind: 'ok', value: { grant: claimed, claimToken } }
}

export async function completeGrantDelivery(
  store: AgentAccessOAuthStore,
  input: Readonly<{ grantRef: string; claimToken: string; now: number }>,
): Promise<AgentAccessOAuthTransition<AgentAccessOAuthGrant>> {
  const grant = await store.getGrantByRef(input.grantRef)
  if (grant === null || grant.status !== 'delivery_claimed' || grant.deliveryClaimToken !== input.claimToken) return { kind: 'refused', reason: 'delivery_claim_mismatch' }
  const completed = await store.updateGrant(grant.grantRef, 'delivery_claimed', { status: 'consumed', consumedAt: input.now })
  if (completed === null) return { kind: 'conflict', reason: 'delivery_claim_lost' }
  return { kind: 'ok', value: completed }
}

export async function resetGrantDelivery(
  store: AgentAccessOAuthStore,
  input: Readonly<{ grantRef: string; claimToken: string }>,
): Promise<AgentAccessOAuthTransition<AgentAccessOAuthGrant>> {
  const grant = await store.getGrantByRef(input.grantRef)
  if (grant === null || grant.status !== 'delivery_claimed' || grant.deliveryClaimToken !== input.claimToken) return { kind: 'refused', reason: 'delivery_claim_mismatch' }
  const reset = await store.updateGrant(grant.grantRef, 'delivery_claimed', { status: 'approved' })
  if (reset === null) return { kind: 'conflict', reason: 'delivery_claim_lost' }
  return { kind: 'ok', value: reset }
}

async function findGrant(
  store: AgentAccessOAuthStore,
  input: Readonly<{ grantRef?: string; userCode?: string }>,
): Promise<AgentAccessOAuthGrant | null> {
  if (input.grantRef !== undefined) return await store.getGrantByRef(input.grantRef)
  if (input.userCode !== undefined) return await store.getGrantByHash('user', await hashOAuthValue(input.userCode))
  return null
}

function pendingGrant(grant: AgentAccessOAuthGrant | null, now: number): AgentAccessOAuthTransition<AgentAccessOAuthGrant> {
  if (grant === null) return { kind: 'refused', reason: 'invalid_grant' }
  if (grant.expiresAt <= now || grant.status === 'expired') return { kind: 'refused', reason: 'expired_token' }
  if (grant.status === 'denied') return { kind: 'refused', reason: 'access_denied' }
  if (grant.status === 'consumed') return { kind: 'refused', reason: 'invalid_grant' }
  if (grant.status !== 'pending') return { kind: 'conflict', reason: grant.status === 'approved' ? 'already_approved' : 'concurrent_transition' }
  return { kind: 'ok', value: grant }
}
