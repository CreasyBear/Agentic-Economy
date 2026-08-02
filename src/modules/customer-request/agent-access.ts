import {
  CUSTOMER_REQUEST_AGENT_SCOPE,
  customerRequestAuthorityModeForScopes,
  customerRequestScopeForMode,
  isWorkTreeAgentScope,
  workTreeScopeAllowedForMode,
  type CustomerRequestAuthorityMode,
} from './agent-contract'

export const CUSTOMER_REQUEST_AGENT_KEY_TTL_SECONDS = 7 * 24 * 60 * 60
const PURPOSE = 'customer_request_agent'

export type CustomerRequestAgentKeyResult =
  | { kind: 'created' | 'replayed'; keyId: string; secret: string; expiresInSeconds: number; authorityMode: CustomerRequestAuthorityMode; scopes: readonly string[]; grantRef: string }
  | { kind: 'error'; code: 'missing_auth' | 'invalid_input' | 'idempotency_conflict' | 'issuance_unavailable'; retryable: boolean }

export type CustomerRequestAgentKeyInventoryItem = Readonly<{
  keyId: string
  name: string
  authorityMode: CustomerRequestAuthorityMode
  scopes: readonly string[]
  createdAt?: number
  expiresAt?: number
  revoked: boolean
  expired: boolean
  grantRef?: string
}>

export type CustomerRequestAgentKeyRevocationResult =
  | { kind: 'revoked' | 'already_revoked'; keyId: string }
  | { kind: 'error'; code: 'missing_auth' | 'invalid_input' | 'key_not_found' | 'revocation_unavailable'; retryable: boolean }

export type CustomerRequestAgentPrincipalRegistration = Readonly<{
  principalId: string
  credentialId: string
  scopes: readonly string[]
  seenAt: number
}>
export type CustomerRequestAgentPrincipalRegistrationResult = Readonly<{
  kind: 'recorded' | 'conflict' | 'unavailable'
}>
export type CustomerRequestAgentKeyApi = Readonly<{
  list: (input: { subject: string; includeInvalid: boolean; limit: number }) => Promise<{ data: readonly AgentKeyRecord[] }>
  create: (input: AgentKeyCreateInput) => Promise<{ id: string; secret?: string | undefined }>
  getSecret: (keyId: string) => Promise<{ secret: string }>
  revoke?: (input: { apiKeyId: string; revocationReason: string }) => Promise<void>
}>
type AgentKeyApi = CustomerRequestAgentKeyApi

export type AgentKeyRecord = Readonly<{
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

export type AgentKeyCreateInput = Readonly<{
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
  }
  api: AgentKeyApi
  registerPrincipal?: (
    input: CustomerRequestAgentPrincipalRegistration
  ) => Promise<CustomerRequestAgentPrincipalRegistrationResult>
  returnSecret?: boolean
}>

export async function issueCustomerRequestAgentKey(input: IssueInput): Promise<CustomerRequestAgentKeyResult> {
  const ownerId = input.ownerId ?? input.principal?.userId
  if (ownerId === undefined) return { kind: 'error', code: 'missing_auth', retryable: false }
  const name = input.input.name.trim()
  const idempotencyKey = input.input.idempotencyKey.trim()
  const rawScopes = input.input.scopes ?? [CUSTOMER_REQUEST_AGENT_SCOPE, customerRequestScopeForMode('inspect_only')]
  const scopes = canonicalAgentScopes(rawScopes)
  const authorityMode = scopes === undefined ? undefined : customerRequestAuthorityModeForScopes(scopes)
  const grantRef = input.input.grantRef?.trim() || idempotencyKey
  if (name.length < 1 || name.length > 80 || !/^[A-Za-z0-9][A-Za-z0-9 _.-]{7,127}$/u.test(idempotencyKey)
    || grantRef.length < 1 || grantRef.length > 300 || authorityMode === undefined || scopes === undefined) {
    return { kind: 'error', code: 'invalid_input', retryable: false }
  }
  try {
    const existing = (await input.api.list({ subject: ownerId, includeInvalid: false, limit: 100 })).data.find((key) => !key.revoked && !key.expired
      && key.claims?.aePurpose === PURPOSE
      && (key.claims.aeGrantRef === grantRef || key.claims.aeIssuanceKey === idempotencyKey))
    if (existing !== undefined) {
      if (existing.claims?.aeDisplayName !== name || (existing.claims.aeAuthorityMode !== undefined && existing.claims.aeAuthorityMode !== authorityMode)) {
        return { kind: 'error', code: 'idempotency_conflict', retryable: false }
      }
      if (!await bindAgentPrincipal(input, existing.id, scopes)) {
        await rollbackAgentKey(input.api, existing.id)
        return { kind: 'error', code: 'issuance_unavailable', retryable: true }
      }
      const secret = input.returnSecret === false ? '' : (await input.api.getSecret(existing.id)).secret
      return { kind: 'replayed', keyId: existing.id, secret, expiresInSeconds: CUSTOMER_REQUEST_AGENT_KEY_TTL_SECONDS, authorityMode, scopes: [...scopes], grantRef }
    }
    const created = await input.api.create({
      name: `AE Customer Request ${idempotencyKey.slice(-16)}`,
      subject: ownerId,
      createdBy: ownerId,
      scopes: [...scopes],
      secondsUntilExpiration: CUSTOMER_REQUEST_AGENT_KEY_TTL_SECONDS,
      claims: {
        aePurpose: PURPOSE,
        aeGrantRef: grantRef,
        aeDisplayName: name,
        aeAuthorityMode: authorityMode,
        aeIssuanceKey: idempotencyKey,
      },
      description: 'Use Agentic Economy Customer Requests with this assistant.',
    })
    if (!await bindAgentPrincipal(input, created.id, scopes)) {
      await rollbackAgentKey(input.api, created.id)
      return { kind: 'error', code: 'issuance_unavailable', retryable: true }
    }
    try {
      const secret = input.returnSecret === false ? '' : (created.secret ?? (await input.api.getSecret(created.id)).secret)
      return { kind: 'created', keyId: created.id, secret, expiresInSeconds: CUSTOMER_REQUEST_AGENT_KEY_TTL_SECONDS, authorityMode, scopes: [...scopes], grantRef }
    } catch (error) {
      await rollbackAgentKey(input.api, created.id)
      throw error
    }
  } catch {
    return { kind: 'error', code: 'issuance_unavailable', retryable: true }
  }
}

async function bindAgentPrincipal(input: IssueInput, keyId: string, scopes: readonly string[]): Promise<boolean> {
  if (input.registerPrincipal === undefined) return true
  try {
    const result = await input.registerPrincipal({
      principalId: `clerk_api_key:${keyId}`,
      credentialId: keyId,
      scopes: [...scopes],
      seenAt: Date.now(),
    })
    return result.kind === 'recorded'
  } catch {
    return false
  }
}

async function rollbackAgentKey(api: AgentKeyApi, keyId: string): Promise<void> {
  if (api.revoke === undefined) return
  try {
    await api.revoke({ apiKeyId: keyId, revocationReason: 'Source principal binding failed.' })
  } catch {
    // Best effort rollback: the issuance still fails closed.
  }
}

export function projectCustomerRequestAgentKey(record: AgentKeyRecord): CustomerRequestAgentKeyInventoryItem | undefined {
  const fallbackModeScope = typeof record.claims?.aeAuthorityMode === 'string' ? record.claims.aeAuthorityMode : customerRequestScopeForMode('inspect_only')
  const scopes = canonicalAgentScopes(record.scopes ?? [CUSTOMER_REQUEST_AGENT_SCOPE, fallbackModeScope])
  const authorityMode = scopes === undefined ? undefined : customerRequestAuthorityModeForScopes(scopes)
  if (authorityMode === undefined || scopes === undefined) return undefined
  const displayName = typeof record.claims?.aeDisplayName === 'string' ? record.claims.aeDisplayName : record.name
  const grantRef = typeof record.claims?.aeGrantRef === 'string' ? record.claims.aeGrantRef : undefined
  return {
    keyId: record.id,
    name: displayName,
    authorityMode,
    scopes: Object.freeze([...scopes]),
    ...(record.createdAt === undefined ? {} : { createdAt: record.createdAt }),
    ...(record.expiresAt === undefined && record.expiration === undefined ? {} : { expiresAt: record.expiresAt ?? record.expiration }),
    revoked: record.revoked,
    expired: record.expired,
    ...(grantRef === undefined ? {} : { grantRef }),
  }
}

export async function listCustomerRequestAgentKeys(input: Readonly<{
  principal: { userId: string } | undefined
  api: Pick<AgentKeyApi, 'list'>
}>): Promise<readonly CustomerRequestAgentKeyInventoryItem[]> {
  if (input.principal === undefined) return []
  const records = (await input.api.list({ subject: input.principal.userId, includeInvalid: true, limit: 100 })).data
  return records.map(projectCustomerRequestAgentKey).filter((item): item is CustomerRequestAgentKeyInventoryItem => item !== undefined)
}

export async function revokeCustomerRequestAgentKey(input: Readonly<{
  principal: { userId: string } | undefined
  keyId: string
  api: { get: (keyId: string) => Promise<AgentKeyRecord>; revoke: (input: { apiKeyId: string; revocationReason: string }) => Promise<void> }
}>): Promise<CustomerRequestAgentKeyRevocationResult> {
  if (input.principal === undefined) return { kind: 'error', code: 'missing_auth', retryable: false }
  if (!/^ak_[A-Za-z0-9_]{4,}$/u.test(input.keyId) && !/^key_[A-Za-z0-9_]{4,}$/u.test(input.keyId)) return { kind: 'error', code: 'invalid_input', retryable: false }
  try {
    const key = await input.api.get(input.keyId)
    if (key.subject !== input.principal.userId || key.claims?.aePurpose !== PURPOSE) return { kind: 'error', code: 'key_not_found', retryable: false }
    if (key.revoked) return { kind: 'already_revoked', keyId: key.id }
    await input.api.revoke({ apiKeyId: key.id, revocationReason: 'Revoked by the AE customer' })
    return { kind: 'revoked', keyId: key.id }
  } catch {
    return { kind: 'error', code: 'revocation_unavailable', retryable: true }
  }
}

function canonicalAgentScopes(scopes: readonly string[]): readonly string[] | undefined {
  if (scopes.length < 2 || !scopes.includes(CUSTOMER_REQUEST_AGENT_SCOPE) || new Set(scopes).size !== scopes.length) return undefined
  const authorityMode = customerRequestAuthorityModeForScopes(scopes)
  if (authorityMode === undefined) return undefined
  const modeScope = customerRequestScopeForMode(authorityMode)
  const extras = scopes.filter((scope) => scope !== CUSTOMER_REQUEST_AGENT_SCOPE && scope !== modeScope)
  if (extras.some((scope) => !isWorkTreeAgentScope(scope) || !workTreeScopeAllowedForMode(scope, authorityMode))) return undefined
  return [CUSTOMER_REQUEST_AGENT_SCOPE, modeScope, ...extras.sort()]
}
