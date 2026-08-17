import {
  AGENT_ACCESS_AUTHORITY_MODE_VALUES,
  CUSTOMER_REQUEST_AGENT_SCOPE,
  MARKET_OPERATIONS_INVOKE_SCOPE,
  MARKET_SUPPLY_MANAGE_SCOPE,
  agentAuthorityModeAllows,
  agentAuthorityModeForScopes,
  agentAuthorityScopeForMode,
  isWorkTreeAgentScope,
  workTreeScopeAllowedForMode,
  type AgentAccessAuthorityMode,
} from './contract'
import type { AgentAccessPolicy } from './policy'

export const AGENT_ACCESS_KEY_TTL_SECONDS = 7 * 24 * 60 * 60
export const AGENT_ACCESS_PURPOSE = 'agent_access' as const
export const AGENT_ACCESS_DEFAULT_APPLICATION_REF = 'agentic-economy' as const
export const AGENT_ACCESS_ENVIRONMENT_VALUES = ['sandbox', 'production'] as const
export type AgentAccessEnvironment = typeof AGENT_ACCESS_ENVIRONMENT_VALUES[number]

export type AgentAccessPrincipal = Readonly<{
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: AgentAccessEnvironment
  scopes: readonly string[]
  authorityMode: AgentAccessAuthorityMode
}>

export type AgentAccessKeyResult =
  | Readonly<{ kind: 'created' | 'replayed'; keyId: string; secret: string; expiresInSeconds: number; authorityMode: AgentAccessAuthorityMode; scopes: readonly string[]; grantRef: string }>
  | Readonly<{ kind: 'error'; code: 'missing_auth' | 'invalid_input' | 'idempotency_conflict' | 'issuance_unavailable'; retryable: boolean }>

export type AgentAccessKeyInventoryItem = Readonly<{
  keyId: string
  name: string
  applicationRef: string
  environment: AgentAccessEnvironment
  authorityMode: AgentAccessAuthorityMode
  scopes: readonly string[]
  createdAt?: number
  expiresAt?: number
  revoked: boolean
  expired: boolean
  grantRef?: string
}>

export type AgentAccessKeyRevocationResult =
  | Readonly<{ kind: 'revoked' | 'already_revoked'; keyId: string }>
  | Readonly<{ kind: 'error'; code: 'missing_auth' | 'invalid_input' | 'key_not_found' | 'revocation_unavailable'; retryable: boolean }>

export type AgentAccessGrantRevocationInput = Readonly<{
  grantRef: string
  ownerId: string
  credentialId: string
  principalId: string
  updatedAt: number
}>

export type AgentAccessGrantRevocationResult =
  | Readonly<{ kind: 'revoked' | 'already_revoked'; grantRef: string; generation: number }>
  | Readonly<{ kind: 'not_found' | 'binding_mismatch'; grantRef: string }>

export type AgentAccessGrantRegistrationInput = Readonly<{
  grantRef: string
  principalId: string
  ownerId: string
  applicationRef: string
  credentialId: string
  environment: AgentAccessEnvironment
  operationAccess: 'all_admitted'
  authorityMode: AgentAccessAuthorityMode
  policy: AgentAccessPolicy
  lifecycle: 'active'
  generation: number
  createdAt: number
  updatedAt: number
  expiresAt: number
}>

export type AgentAccessGrantBinding = Readonly<{
  kind: 'recorded' | 'replayed'
  grantRef: string
  generation: number
  policyDigest: string
  lifecycle: 'active' | 'revoked' | 'expired'
  expiresAt: number
}>

export type AgentAccessGrantRegistrationResult = Readonly<{
  kind: 'recorded' | 'replayed' | 'conflict' | 'unavailable'
  grantRef?: string
  generation?: number
  policyDigest?: string
  lifecycle?: 'active' | 'revoked' | 'expired'
  expiresAt?: number
}>

export type AgentAccessPrincipalRegistrationResult = Readonly<{ kind: 'recorded' | 'conflict' | 'unavailable' }>

export type AgentAccessPrincipalRegistration = Readonly<{
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: AgentAccessEnvironment
  scopes: readonly string[]
  authorityMode: AgentAccessAuthorityMode
  grantGeneration: number
  policyDigest: string
  lifecycle: 'active' | 'revoked' | 'expired'
  expiresAt?: number
  seenAt: number
}>

export type AgentAccessKeyApi = Readonly<{
  list: (input: { subject: string; includeInvalid: boolean; limit: number }) => Promise<{ data: readonly AgentAccessKeyRecord[] }>
  create: (input: AgentAccessKeyCreateInput) => Promise<{ id: string; secret?: string | undefined }>
  getSecret: (keyId: string) => Promise<{ secret: string }>
  get?: (keyId: string) => Promise<AgentAccessKeyRecord>
  revoke?: (input: { apiKeyId: string; revocationReason: string }) => Promise<void>
}>

export type AgentAccessKeyRecord = Readonly<{
  id: string
  name: string
  subject: string
  revoked: boolean
  expired: boolean
  claims: Record<string, unknown> | null
  scopes?: readonly string[]
  createdAt?: number
  expiration?: number
  expiresAt?: number
}>

export type AgentAccessKeyCreateInput = Readonly<{
  name: string
  subject: string
  createdBy: string
  scopes: readonly string[]
  secondsUntilExpiration: number
  claims: Record<string, string>
  description: string
}>

type IssueInput = Readonly<{
  ownerId?: string
  principal: { userId: string } | undefined
  input: {
    name: string
    idempotencyKey: string
    scopes?: readonly string[]
    grantRef?: string
    applicationRef?: string
    environment?: AgentAccessEnvironment
  }
  policy: AgentAccessPolicy
  api: AgentAccessKeyApi
  registerPrincipal?: (input: AgentAccessPrincipalRegistration) => Promise<AgentAccessPrincipalRegistrationResult>
  registerGrant?: (input: AgentAccessGrantRegistrationInput) => Promise<AgentAccessGrantRegistrationResult>
  returnSecret?: boolean
}>
export async function issueAgentAccessKey(input: IssueInput): Promise<AgentAccessKeyResult> {
  const ownerId = input.ownerId ?? input.principal?.userId
  if (ownerId === undefined) return { kind: 'error', code: 'missing_auth', retryable: false }
  const name = input.input.name.trim()
  const idempotencyKey = input.input.idempotencyKey.trim()
  const rawScopes = input.input.scopes ?? [MARKET_OPERATIONS_INVOKE_SCOPE, CUSTOMER_REQUEST_AGENT_SCOPE, agentAuthorityScopeForMode('inspect_only')]
  const scopes = canonicalAgentScopes(rawScopes)
  const authorityMode = scopes === undefined ? undefined : agentAuthorityModeForScopes(scopes)
  const grantRef = input.input.grantRef?.trim() || idempotencyKey
  const applicationRef = input.input.applicationRef?.trim() || AGENT_ACCESS_DEFAULT_APPLICATION_REF
  const environment = input.input.environment ?? 'sandbox'
  if (name.length < 1 || name.length > 80 || !/^[A-Za-z0-9][A-Za-z0-9 _.-]{7,127}$/u.test(idempotencyKey)
    || grantRef.length < 1 || grantRef.length > 300 || applicationRef.length < 1 || applicationRef.length > 200
    || authorityMode === undefined || scopes === undefined) {
    return { kind: 'error', code: 'invalid_input', retryable: false }
  }
  try {
    const existing = (await input.api.list({ subject: ownerId, includeInvalid: false, limit: 100 })).data.find((key) => !key.revoked && !key.expired
      && key.claims?.aePurpose === AGENT_ACCESS_PURPOSE
      && (key.claims.aeGrantRef === grantRef || key.claims.aeIssuanceKey === idempotencyKey))
    if (existing !== undefined) {
      if (existing.claims?.aeDisplayName !== name
        || existing.claims.aeAuthorityMode !== authorityMode
        || existing.claims.aeApplicationRef !== applicationRef
        || existing.claims.aeEnvironment !== environment
        || existing.claims.aeGrantRef !== grantRef
        || existing.scopes === undefined
        || existing.scopes.length !== scopes.length
        || existing.scopes.some((scope) => !scopes.includes(scope))) {
        return { kind: 'error', code: 'idempotency_conflict', retryable: false }
      }
      const binding = await bindAgentPrincipal(input, existing.id, ownerId, scopes, authorityMode, applicationRef, environment, existing.expiresAt ?? existing.expiration, grantRef, existing.createdAt)
      if (binding === null) {
        await rollbackAgentKey(input.api, existing.id)
        return { kind: 'error', code: 'issuance_unavailable', retryable: true }
      }
      const secret = input.returnSecret === false ? '' : (await input.api.getSecret(existing.id)).secret
      return { kind: 'replayed', keyId: existing.id, secret, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS, authorityMode, scopes: [...scopes], grantRef: binding.grantRef }
    }
    const created = await input.api.create({
      name: `AE Agent ${idempotencyKey.slice(-16)}`,
      subject: ownerId,
      createdBy: ownerId,
      scopes: [...scopes],
      secondsUntilExpiration: AGENT_ACCESS_KEY_TTL_SECONDS,
      claims: {
        aePurpose: AGENT_ACCESS_PURPOSE,
        aeGrantRef: grantRef,
        aeDisplayName: name,
        aeAuthorityMode: authorityMode,
        aeIssuanceKey: idempotencyKey,
        aeApplicationRef: applicationRef,
        aeEnvironment: environment,
      },
      description: 'Use Agentic Economy Market Operations with this assistant.',
    })
    const createdAt = Date.now()
    const expiresAt = createdAt + AGENT_ACCESS_KEY_TTL_SECONDS * 1000
    const binding = await bindAgentPrincipal(input, created.id, ownerId, scopes, authorityMode, applicationRef, environment, expiresAt, grantRef, createdAt)
    if (binding === null) {
      await rollbackAgentKey(input.api, created.id)
      return { kind: 'error', code: 'issuance_unavailable', retryable: true }
    }
    try {
      const secret = input.returnSecret === false ? '' : (created.secret ?? (await input.api.getSecret(created.id)).secret)
      return { kind: 'created', keyId: created.id, secret, expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS, authorityMode, scopes: [...scopes], grantRef: binding.grantRef }
    } catch (error) {
      await rollbackAgentKey(input.api, created.id)
      throw error
    }
  } catch {
    return { kind: 'error', code: 'issuance_unavailable', retryable: true }
  }
}

async function bindAgentPrincipal(
  input: IssueInput,
  keyId: string,
  ownerId: string,
  scopes: readonly string[],
  authorityMode: AgentAccessAuthorityMode,
  applicationRef: string,
  environment: AgentAccessEnvironment,
  expiresAt: number | undefined,
  grantRef: string,
  createdAt: number | undefined,
): Promise<AgentAccessGrantBinding | null> {
  if (input.registerGrant === undefined || input.registerPrincipal === undefined || expiresAt === undefined) return null
  try {
    const grant = await input.registerGrant({
      grantRef,
      principalId: `clerk_api_key:${keyId}`,
      ownerId,
      applicationRef,
      credentialId: keyId,
      environment,
      operationAccess: 'all_admitted',
      authorityMode,
      policy: input.policy,
      lifecycle: 'active',
      generation: 1,
      createdAt: createdAt ?? Date.now(),
      updatedAt: Date.now(),
      expiresAt,
    })
    if (grant.kind !== 'recorded' && grant.kind !== 'replayed'
      || typeof grant.grantRef !== 'string'
      || typeof grant.generation !== 'number'
      || typeof grant.policyDigest !== 'string'
      || grant.lifecycle === undefined
      || typeof grant.expiresAt !== 'number') return null
    const result = await input.registerPrincipal({
      principalId: `clerk_api_key:${keyId}`,
      ownerId,
      credentialId: keyId,
      applicationRef,
      environment,
      scopes: [...scopes],
      authorityMode,
      grantGeneration: grant.generation,
      policyDigest: grant.policyDigest,
      lifecycle: grant.lifecycle,
      expiresAt: grant.expiresAt,
      seenAt: Date.now(),
    })
    return result.kind === 'recorded'
      ? {
        kind: grant.kind,
        grantRef: grant.grantRef,
        generation: grant.generation,
        policyDigest: grant.policyDigest,
        lifecycle: grant.lifecycle,
        expiresAt: grant.expiresAt,
      }
      : null
  } catch {
    return null
  }
}

async function rollbackAgentKey(api: AgentAccessKeyApi, keyId: string): Promise<void> {
  if (api.revoke === undefined) return
  try {
    await api.revoke({ apiKeyId: keyId, revocationReason: 'Source principal binding failed.' })
  } catch {
    // Best effort rollback: the issuance still fails closed.
  }
}
export function projectAgentAccessKey(record: AgentAccessKeyRecord): AgentAccessKeyInventoryItem | undefined {
  if (record.claims?.aePurpose !== AGENT_ACCESS_PURPOSE
    || record.scopes === undefined
    || (!record.scopes.includes(MARKET_OPERATIONS_INVOKE_SCOPE)
      && !record.scopes.includes(MARKET_SUPPLY_MANAGE_SCOPE))) return undefined
  const scopes = canonicalAgentScopes(record.scopes)
  const authorityMode = scopes === undefined ? undefined : agentAuthorityModeForScopes(scopes)
  const claimMode = record.claims.aeAuthorityMode
  const displayName = record.claims.aeDisplayName
  const grantRef = record.claims.aeGrantRef
  const applicationRef = record.claims.aeApplicationRef
  const environment = record.claims.aeEnvironment
  if (scopes === undefined
    || authorityMode === undefined
    || claimMode !== authorityMode
    || typeof displayName !== 'string'
    || displayName.trim().length === 0
    || typeof grantRef !== 'string'
    || grantRef.trim().length === 0
    || typeof applicationRef !== 'string'
    || applicationRef.trim().length === 0
    || (environment !== 'sandbox' && environment !== 'production')) return undefined
  return {
    keyId: record.id,
    name: displayName,
    applicationRef,
    environment,
    authorityMode,
    scopes: Object.freeze([...scopes]),
    ...(record.createdAt === undefined ? {} : { createdAt: record.createdAt }),
    ...(record.expiresAt === undefined && record.expiration === undefined ? {} : { expiresAt: record.expiresAt ?? record.expiration }),
    revoked: record.revoked,
    expired: record.expired,
    ...(grantRef === undefined ? {} : { grantRef }),
  }
}
export async function listAgentAccessKeys(input: Readonly<{
  principal: { userId: string } | undefined
  api: Pick<AgentAccessKeyApi, 'list'>
}>): Promise<readonly AgentAccessKeyInventoryItem[]> {
  if (input.principal === undefined) return []
  try {
    const records = await input.api.list({ subject: input.principal.userId, includeInvalid: true, limit: 100 })
    return records.data.flatMap((record) => {
      const projected = projectAgentAccessKey(record)
      return projected === undefined ? [] : [projected]
    })
  } catch {
    return []
  }
}

export async function revokeAgentAccessKey(input: Readonly<{
  principal: { userId: string } | undefined
  keyId: string
  api: { get: (keyId: string) => Promise<AgentAccessKeyRecord>; revoke: (input: { apiKeyId: string; revocationReason: string }) => Promise<void> }
  revokeGrant: (input: AgentAccessGrantRevocationInput) => Promise<AgentAccessGrantRevocationResult>
}>): Promise<AgentAccessKeyRevocationResult> {
  if (input.principal === undefined) return { kind: 'error', code: 'missing_auth', retryable: false }
  if (!/^ak_[A-Za-z0-9_]{4,}$/u.test(input.keyId) && !/^key_[A-Za-z0-9_]{4,}$/u.test(input.keyId)) return { kind: 'error', code: 'invalid_input', retryable: false }
  try {
    const key = await input.api.get(input.keyId)
    const claims = key.claims
    if (key.subject !== input.principal.userId || claims?.aePurpose !== AGENT_ACCESS_PURPOSE) return { kind: 'error', code: 'key_not_found', retryable: false }
    const grantRef = claims?.aeGrantRef
    if (typeof grantRef !== 'string' || grantRef.trim().length === 0) return { kind: 'error', code: 'key_not_found', retryable: false }
    const durable = await input.revokeGrant({
      grantRef,
      ownerId: input.principal.userId,
      credentialId: key.id,
      principalId: `clerk_api_key:${key.id}`,
      updatedAt: Date.now(),
    })
    if (durable.kind !== 'revoked' && durable.kind !== 'already_revoked') {
      return { kind: 'error', code: 'revocation_unavailable', retryable: true }
    }
    if (key.revoked) return { kind: 'already_revoked', keyId: key.id }
    await input.api.revoke({ apiKeyId: key.id, revocationReason: 'Revoked by the AE owner' })
    return { kind: 'revoked', keyId: key.id }
  } catch {
    return { kind: 'error', code: 'revocation_unavailable', retryable: true }
  }
}

function canonicalAgentScopes(scopes: readonly string[]): readonly string[] | undefined {
  if (scopes.length === 0 || new Set(scopes).size !== scopes.length) return undefined
  const hasSupplyScope = scopes.includes(MARKET_SUPPLY_MANAGE_SCOPE)
  const withGatewayScope = scopes.includes(MARKET_OPERATIONS_INVOKE_SCOPE) || hasSupplyScope
    ? [...scopes]
    : [MARKET_OPERATIONS_INVOKE_SCOPE, ...scopes]
  const authorityMode = agentAuthorityModeForScopes(withGatewayScope)
  if (authorityMode === undefined) return undefined
  const modeScope = withGatewayScope.includes(CUSTOMER_REQUEST_AGENT_SCOPE) ? agentAuthorityScopeForMode(authorityMode) : undefined
  const extras = withGatewayScope.filter((scope) => scope !== MARKET_OPERATIONS_INVOKE_SCOPE
    && scope !== MARKET_SUPPLY_MANAGE_SCOPE
    && scope !== CUSTOMER_REQUEST_AGENT_SCOPE && scope !== modeScope)
  if (extras.some((scope) => !isWorkTreeAgentScope(scope) || !workTreeScopeAllowedForMode(scope, authorityMode))) return undefined
  return [
    ...(withGatewayScope.includes(MARKET_OPERATIONS_INVOKE_SCOPE) ? [MARKET_OPERATIONS_INVOKE_SCOPE] : []),
    ...(withGatewayScope.includes(MARKET_SUPPLY_MANAGE_SCOPE) ? [MARKET_SUPPLY_MANAGE_SCOPE] : []),
    ...(withGatewayScope.includes(CUSTOMER_REQUEST_AGENT_SCOPE) ? [CUSTOMER_REQUEST_AGENT_SCOPE, modeScope as string] : []),
    ...extras.sort(),
  ]
}

export {
  AGENT_ACCESS_AUTHORITY_MODE_VALUES,
  CUSTOMER_REQUEST_AGENT_SCOPE,
  MARKET_OPERATIONS_INVOKE_SCOPE,
  MARKET_SUPPLY_MANAGE_SCOPE,
  agentAuthorityModeAllows,
  agentAuthorityModeForScopes,
  agentAuthorityScopeForMode,
}
export type { AgentAccessAuthorityMode }
