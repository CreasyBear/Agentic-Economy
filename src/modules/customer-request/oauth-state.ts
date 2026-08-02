import { customAlphabet } from 'nanoid'

import { base64Codec } from '@/modules/common/base64-codec'

import {
  CUSTOMER_REQUEST_AGENT_SCOPE,
  CUSTOMER_REQUEST_AUTHORITY_MODE_VALUES,
  customerRequestAuthorityModeForScopes,
  customerRequestScopeForMode,
  isWorkTreeAgentScope,
  workTreeScopeAllowedForMode,
  type CustomerRequestAuthorityMode,
} from './agent-contract'

export const CUSTOMER_REQUEST_AGENT_GRANT_TTL_SECONDS = 600
export const CUSTOMER_REQUEST_AGENT_AUTHORIZATION_CODE_TTL_SECONDS = 60
export const CUSTOMER_REQUEST_AGENT_POLL_INTERVAL_SECONDS = 5

export type CustomerRequestAgentOAuthFlow = 'device_code' | 'authorization_code'
export type CustomerRequestAgentOAuthGrantStatus = 'pending' | 'approved' | 'denied' | 'delivery_claimed' | 'consumed' | 'expired'

export type CustomerRequestAgentOAuthGrant = Readonly<{
  grantRef: string
  flow: CustomerRequestAgentOAuthFlow
  clientId: string
  redirectUri?: string
  requestedScopes: readonly string[]
  codeChallenge?: string
  codeChallengeMethod?: 'S256'
  deviceCodeHash?: string
  userCodeHash?: string
  authorizationCodeHash?: string
  status: CustomerRequestAgentOAuthGrantStatus
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

export type CustomerRequestAgentOAuthClient = Readonly<{
  clientId: string
  clientName: string
  redirectUris: readonly string[]
  grantTypes: readonly ('authorization_code' | 'urn:ietf:params:oauth:grant-type:device_code')[]
  tokenEndpointAuthMethod: 'none'
  createdAt: number
  lastUsedAt?: number
}>

export type CustomerRequestAgentOAuthStore = Readonly<{
  insertGrant: (grant: CustomerRequestAgentOAuthGrant) => Promise<void>
  getGrantByHash: (kind: 'device' | 'user' | 'authorization', hash: string) => Promise<CustomerRequestAgentOAuthGrant | null>
  getGrantByRef: (grantRef: string) => Promise<CustomerRequestAgentOAuthGrant | null>
  updateGrant: (grantRef: string, expectedStatus: CustomerRequestAgentOAuthGrantStatus, patch: Partial<CustomerRequestAgentOAuthGrant>) => Promise<CustomerRequestAgentOAuthGrant | null>
  insertClient: (client: CustomerRequestAgentOAuthClient) => Promise<void>
  getClient: (clientId: string) => Promise<CustomerRequestAgentOAuthClient | null>
}>

export type CustomerRequestAgentOAuthRefusalReason =
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

export type CustomerRequestAgentOAuthConflictReason =
  | 'concurrent_transition'
  | 'already_approved'
  | 'already_denied'
  | 'delivery_claim_lost'

export type CustomerRequestAgentOAuthRefusal = Readonly<{
  kind: 'refused'
  reason: CustomerRequestAgentOAuthRefusalReason
}>

export type CustomerRequestAgentOAuthConflict = Readonly<{
  kind: 'conflict'
  reason: CustomerRequestAgentOAuthConflictReason
}>

export type CustomerRequestAgentOAuthTransition<T> =
  | Readonly<{ kind: 'ok'; value: T }>
  | CustomerRequestAgentOAuthRefusal
  | CustomerRequestAgentOAuthConflict

export type CustomerRequestAgentOAuthIssueKey = (input: Readonly<{
  ownerId: string
  grant: CustomerRequestAgentOAuthGrant
}>) => Promise<Readonly<{ keyId: string }>>

export type CustomerRequestAgentOAuthCreatedDeviceGrant = Readonly<{
  grant: CustomerRequestAgentOAuthGrant
  deviceCode: string
  userCode: string
  expiresIn: number
  interval: number
}>

export type CustomerRequestAgentOAuthCreatedAuthorizationGrant = Readonly<{
  grant: CustomerRequestAgentOAuthGrant
  authorizationCode?: never
  expiresIn: number
}>

export function requestedScopesForMode(
  mode: CustomerRequestAuthorityMode,
  additionalScopes: readonly string[] = [],
): readonly string[] {
  const extras = [...new Set(additionalScopes)]
    .filter((scope): scope is string => isWorkTreeAgentScope(scope))
    .sort()
  return [CUSTOMER_REQUEST_AGENT_SCOPE, customerRequestScopeForMode(mode), ...extras]
}

export function normalizeRequestedScopes(scopeText: string | null | undefined): Readonly<{
  mode: CustomerRequestAuthorityMode
  scopes: readonly string[]
}> | undefined {
  if (scopeText === null || scopeText === undefined) return undefined
  const scopes = scopeText.split(/\s+/u).filter((scope) => scope.length > 0)
  if (scopes.length < 2 || !scopes.includes(CUSTOMER_REQUEST_AGENT_SCOPE) || new Set(scopes).size !== scopes.length) return undefined
  const mode = customerRequestAuthorityModeForScopes(scopes)
  if (mode === undefined) return undefined
  const modeScope = customerRequestScopeForMode(mode)
  const extras = scopes.filter((scope) => scope !== CUSTOMER_REQUEST_AGENT_SCOPE && scope !== modeScope)
  if (extras.some((scope) => !isWorkTreeAgentScope(scope) || !workTreeScopeAllowedForMode(scope, mode))) return undefined
  return { mode, scopes: requestedScopesForMode(mode, extras) }
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
  store: CustomerRequestAgentOAuthStore,
  input: Readonly<{
    client: CustomerRequestAgentOAuthClient
    requestedScopes: readonly string[]
    now: number
  }>,
): Promise<CustomerRequestAgentOAuthTransition<CustomerRequestAgentOAuthCreatedDeviceGrant>> {
  if (!input.client.grantTypes.includes('urn:ietf:params:oauth:grant-type:device_code')) return { kind: 'refused', reason: 'invalid_client' }
  const scopes = normalizeRequestedScopes(input.requestedScopes.join(' '))
  if (scopes === undefined) return { kind: 'refused', reason: 'invalid_scope' }
  const deviceCode = createOpaqueOAuthValue()
  const userCode = createUserCode()
  const grant: CustomerRequestAgentOAuthGrant = {
    grantRef: `device:${createOpaqueOAuthValue(18)}`,
    flow: 'device_code',
    clientId: input.client.clientId,
    requestedScopes: [...scopes.scopes],
    deviceCodeHash: await hashOAuthValue(deviceCode),
    userCodeHash: await hashOAuthValue(userCode),
    status: 'pending',
    createdAt: input.now,
    expiresAt: input.now + CUSTOMER_REQUEST_AGENT_GRANT_TTL_SECONDS * 1000,
    nextPollAt: input.now,
    displayName: input.client.clientName,
  }
  await store.insertGrant(grant)
  return { kind: 'ok', value: {
    grant,
    deviceCode,
    userCode,
    expiresIn: CUSTOMER_REQUEST_AGENT_GRANT_TTL_SECONDS,
    interval: CUSTOMER_REQUEST_AGENT_POLL_INTERVAL_SECONDS,
  } }
}

export async function beginAuthorizationCodeGrant(
  store: CustomerRequestAgentOAuthStore,
  input: Readonly<{
    client: CustomerRequestAgentOAuthClient
    redirectUri: string
    requestedScopes: readonly string[]
    codeChallenge: string
    codeChallengeMethod: string
    ownerId: string
    now: number
  }>,
): Promise<CustomerRequestAgentOAuthTransition<Readonly<{ grant: CustomerRequestAgentOAuthGrant; expiresIn: number }>>> {
  if (!input.client.grantTypes.includes('authorization_code')) return { kind: 'refused', reason: 'invalid_client' }
  if (!input.client.redirectUris.includes(input.redirectUri)) return { kind: 'refused', reason: 'invalid_redirect_uri' }
  if (input.codeChallenge.trim().length === 0 || input.codeChallengeMethod !== 'S256') return { kind: 'refused', reason: 'invalid_pkce' }
  if (input.ownerId.trim().length === 0) return { kind: 'refused', reason: 'owner_required' }
  const scopes = normalizeRequestedScopes(input.requestedScopes.join(' '))
  if (scopes === undefined) return { kind: 'refused', reason: 'invalid_scope' }
  const grant: CustomerRequestAgentOAuthGrant = {
    grantRef: `authorization:${createOpaqueOAuthValue(18)}`,
    flow: 'authorization_code',
    clientId: input.client.clientId,
    redirectUri: input.redirectUri,
    requestedScopes: [...scopes.scopes],
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: 'S256',
    status: 'pending',
    ownerId: input.ownerId,
    createdAt: input.now,
    expiresAt: input.now + CUSTOMER_REQUEST_AGENT_AUTHORIZATION_CODE_TTL_SECONDS * 1000,
    displayName: input.client.clientName,
  }
  await store.insertGrant(grant)
  return { kind: 'ok', value: { grant, expiresIn: CUSTOMER_REQUEST_AGENT_AUTHORIZATION_CODE_TTL_SECONDS } }
}

export async function readGrantForConsent(
  store: CustomerRequestAgentOAuthStore,
  input: Readonly<{ userCode: string; ownerId: string; now: number }>,
): Promise<CustomerRequestAgentOAuthTransition<CustomerRequestAgentOAuthGrant>> {
  const grant = await store.getGrantByHash('user', await hashOAuthValue(input.userCode))
  const valid = pendingGrant(grant, input.now)
  if (valid.kind !== 'ok') return valid
  if (input.ownerId.trim().length === 0) return { kind: 'refused', reason: 'owner_required' }
  if (valid.value.ownerId !== undefined && valid.value.ownerId !== input.ownerId) return { kind: 'refused', reason: 'owner_mismatch' }
  return valid
}

export async function approveGrant(
  store: CustomerRequestAgentOAuthStore,
  input: Readonly<{
    grantRef?: string
    userCode?: string
    ownerId: string
    now: number
    issueKey: CustomerRequestAgentOAuthIssueKey
  }>,
): Promise<CustomerRequestAgentOAuthTransition<Readonly<{ grant: CustomerRequestAgentOAuthGrant; authorizationCode?: string }>>> {
  const grant = await findGrant(store, input)
  const valid = pendingGrant(grant, input.now)
  if (valid.kind !== 'ok') return valid
  if (input.ownerId.trim().length === 0) return { kind: 'refused', reason: 'owner_required' }
  if (valid.value.ownerId !== undefined && valid.value.ownerId !== input.ownerId) return { kind: 'refused', reason: 'owner_mismatch' }
  let issued: Readonly<{ keyId: string }>
  try {
    issued = await input.issueKey({ ownerId: input.ownerId, grant: valid.value })
  } catch {
    return { kind: 'refused', reason: 'issuance_unavailable' }
  }
  if (issued.keyId.trim().length === 0) return { kind: 'refused', reason: 'missing_key' }
  const authorizationCode = valid.value.flow === 'authorization_code' ? createOpaqueOAuthValue() : undefined
  const patch: Partial<CustomerRequestAgentOAuthGrant> = {
    status: 'approved',
    ownerId: input.ownerId,
    keyId: issued.keyId,
    approvedAt: input.now,
    ...(authorizationCode === undefined ? {} : { authorizationCodeHash: await hashOAuthValue(authorizationCode) }),
  }
  const updated = await store.updateGrant(valid.value.grantRef, 'pending', patch)
  if (updated === null) return { kind: 'conflict', reason: 'concurrent_transition' }
  return { kind: 'ok', value: {
    grant: updated,
    ...(authorizationCode === undefined ? {} : { authorizationCode }),
  } }
}

export async function denyGrant(
  store: CustomerRequestAgentOAuthStore,
  input: Readonly<{ grantRef?: string; userCode?: string; ownerId: string; now: number }>,
): Promise<CustomerRequestAgentOAuthTransition<CustomerRequestAgentOAuthGrant>> {
  const grant = await findGrant(store, input)
  const valid = pendingGrant(grant, input.now)
  if (valid.kind !== 'ok') return valid
  if (input.ownerId.trim().length === 0) return { kind: 'refused', reason: 'owner_required' }
  if (valid.value.ownerId !== undefined && valid.value.ownerId !== input.ownerId) return { kind: 'refused', reason: 'owner_mismatch' }
  const updated = await store.updateGrant(valid.value.grantRef, 'pending', { status: 'denied', denialReason: 'access_denied' })
  if (updated === null) return { kind: 'conflict', reason: 'concurrent_transition' }
  return { kind: 'ok', value: updated }
}

export type CustomerRequestAgentOAuthPollResult =
  | Readonly<{ kind: 'authorization_pending' }>
  | Readonly<{ kind: 'slow_down' }>
  | Readonly<{ kind: 'ready'; grant: CustomerRequestAgentOAuthGrant }>
  | CustomerRequestAgentOAuthRefusal
  | CustomerRequestAgentOAuthConflict

export async function pollDeviceGrant(
  store: CustomerRequestAgentOAuthStore,
  input: Readonly<{ clientId: string; deviceCode: string; now: number }>,
): Promise<CustomerRequestAgentOAuthPollResult> {
  const grant = await store.getGrantByHash('device', await hashOAuthValue(input.deviceCode))
  if (grant === null || grant.flow !== 'device_code' || grant.clientId !== input.clientId) return { kind: 'refused', reason: 'invalid_grant' }
  if (grant.expiresAt <= input.now || grant.status === 'expired') {
    if (grant.status === 'pending') await store.updateGrant(grant.grantRef, 'pending', { status: 'expired' })
    return { kind: 'refused', reason: 'expired_token' }
  }
  if (grant.status === 'denied') return { kind: 'refused', reason: 'access_denied' }
  if (grant.status === 'consumed') return { kind: 'refused', reason: 'invalid_grant' }
  if (grant.status === 'delivery_claimed') return { kind: 'refused', reason: 'invalid_grant' }
  if (grant.status === 'approved') return { kind: 'ready', grant }
  const tooSoon = grant.nextPollAt !== undefined && input.now < grant.nextPollAt
  const updated = await store.updateGrant(grant.grantRef, 'pending', {
    nextPollAt: input.now + CUSTOMER_REQUEST_AGENT_POLL_INTERVAL_SECONDS * 1000,
  })
  if (updated === null) return { kind: 'conflict', reason: 'concurrent_transition' }
  return tooSoon ? { kind: 'slow_down' } : { kind: 'authorization_pending' }
}

export type CustomerRequestAgentOAuthDeliveryCredential =
  | Readonly<{ kind: 'device'; grantRef: string; clientId: string }>
  | Readonly<{ kind: 'authorization'; authorizationCode: string; clientId: string; redirectUri: string; codeVerifier: string }>

export async function claimGrantDelivery(
  store: CustomerRequestAgentOAuthStore,
  input: Readonly<{ credential: CustomerRequestAgentOAuthDeliveryCredential; now: number }>,
): Promise<CustomerRequestAgentOAuthTransition<Readonly<{ grant: CustomerRequestAgentOAuthGrant; claimToken: string }>>> {
  let grant: CustomerRequestAgentOAuthGrant | null
  if (input.credential.kind === 'device') {
    grant = await store.getGrantByRef(input.credential.grantRef)
    if (grant === null || grant.flow !== 'device_code' || grant.clientId !== input.credential.clientId) return { kind: 'refused', reason: 'invalid_grant' }
  } else {
    grant = await store.getGrantByHash('authorization', await hashOAuthValue(input.credential.authorizationCode))
    if (grant === null || grant.flow !== 'authorization_code' || grant.clientId !== input.credential.clientId
      || grant.redirectUri !== input.credential.redirectUri) return { kind: 'refused', reason: 'invalid_grant' }
    if (grant.codeChallengeMethod !== 'S256' || grant.codeChallenge === undefined
      || await hashOAuthValue(input.credential.codeVerifier) !== grant.codeChallenge) return { kind: 'refused', reason: 'invalid_pkce' }
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
  store: CustomerRequestAgentOAuthStore,
  input: Readonly<{ grantRef: string; claimToken: string; now: number }>,
): Promise<CustomerRequestAgentOAuthTransition<CustomerRequestAgentOAuthGrant>> {
  const grant = await store.getGrantByRef(input.grantRef)
  if (grant === null || grant.status !== 'delivery_claimed' || grant.deliveryClaimToken !== input.claimToken) return { kind: 'refused', reason: 'delivery_claim_mismatch' }
  const completed = await store.updateGrant(grant.grantRef, 'delivery_claimed', { status: 'consumed', consumedAt: input.now })
  if (completed === null) return { kind: 'conflict', reason: 'delivery_claim_lost' }
  return { kind: 'ok', value: completed }
}

export async function resetGrantDelivery(
  store: CustomerRequestAgentOAuthStore,
  input: Readonly<{ grantRef: string; claimToken: string }>,
): Promise<CustomerRequestAgentOAuthTransition<CustomerRequestAgentOAuthGrant>> {
  const grant = await store.getGrantByRef(input.grantRef)
  if (grant === null || grant.status !== 'delivery_claimed' || grant.deliveryClaimToken !== input.claimToken) return { kind: 'refused', reason: 'delivery_claim_mismatch' }
  const reset = await store.updateGrant(grant.grantRef, 'delivery_claimed', { status: 'approved' })
  if (reset === null) return { kind: 'conflict', reason: 'delivery_claim_lost' }
  return { kind: 'ok', value: reset }
}

async function findGrant(
  store: CustomerRequestAgentOAuthStore,
  input: Readonly<{ grantRef?: string; userCode?: string }>,
): Promise<CustomerRequestAgentOAuthGrant | null> {
  if (input.grantRef !== undefined) return await store.getGrantByRef(input.grantRef)
  if (input.userCode !== undefined) return await store.getGrantByHash('user', await hashOAuthValue(input.userCode))
  return null
}

function pendingGrant(grant: CustomerRequestAgentOAuthGrant | null, now: number): CustomerRequestAgentOAuthTransition<CustomerRequestAgentOAuthGrant> {
  if (grant === null) return { kind: 'refused', reason: 'invalid_grant' }
  if (grant.expiresAt <= now || grant.status === 'expired') return { kind: 'refused', reason: 'expired_token' }
  if (grant.status === 'denied') return { kind: 'refused', reason: 'access_denied' }
  if (grant.status === 'consumed') return { kind: 'refused', reason: 'invalid_grant' }
  if (grant.status !== 'pending') return { kind: 'conflict', reason: grant.status === 'approved' ? 'already_approved' : 'concurrent_transition' }
  return { kind: 'ok', value: grant }
}


