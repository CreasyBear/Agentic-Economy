import {
  CUSTOMER_REQUEST_AGENT_SCOPE,
  customerRequestAuthorityModeForScopes,
  customerRequestScopeForMode,
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

export type CustomerRequestAgentKeyApi = Readonly<{
  list: (input: { subject: string; includeInvalid: boolean; limit: number }) => Promise<{ data: readonly AgentKeyRecord[] }>
  create: (input: AgentKeyCreateInput) => Promise<{ id: string; secret?: string | undefined }>
  getSecret: (keyId: string) => Promise<{ secret: string }>
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
  returnSecret?: boolean
}>

export async function issueCustomerRequestAgentKey(input: IssueInput): Promise<CustomerRequestAgentKeyResult> {
  const ownerId = input.ownerId ?? input.principal?.userId
  if (ownerId === undefined) return { kind: 'error', code: 'missing_auth', retryable: false }
  const name = input.input.name.trim()
  const idempotencyKey = input.input.idempotencyKey.trim()
  const scopes = input.input.scopes ?? [CUSTOMER_REQUEST_AGENT_SCOPE, customerRequestScopeForMode('inspect_only')]
  const authorityMode = customerRequestAuthorityModeForScopes(scopes)
  const grantRef = input.input.grantRef?.trim() || idempotencyKey
  if (name.length < 1 || name.length > 80 || !/^[A-Za-z0-9][A-Za-z0-9 _.-]{7,127}$/u.test(idempotencyKey)
    || grantRef.length < 1 || grantRef.length > 300 || authorityMode === undefined
    || scopes.length !== 2 || !scopes.includes(CUSTOMER_REQUEST_AGENT_SCOPE)) {
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
    const secret = input.returnSecret === false ? '' : (created.secret ?? (await input.api.getSecret(created.id)).secret)
    return { kind: 'created', keyId: created.id, secret, expiresInSeconds: CUSTOMER_REQUEST_AGENT_KEY_TTL_SECONDS, authorityMode, scopes: [...scopes], grantRef }
  } catch {
    return { kind: 'error', code: 'issuance_unavailable', retryable: true }
  }
}

export function projectCustomerRequestAgentKey(record: AgentKeyRecord): CustomerRequestAgentKeyInventoryItem | undefined {
  const authorityMode = typeof record.claims?.aeAuthorityMode === 'string'
    ? customerRequestAuthorityModeForScopes([CUSTOMER_REQUEST_AGENT_SCOPE, record.claims.aeAuthorityMode])
    : customerRequestAuthorityModeForScopes(record.scopes ?? [])
  if (authorityMode === undefined) return undefined
  const displayName = typeof record.claims?.aeDisplayName === 'string' ? record.claims.aeDisplayName : record.name
  const grantRef = typeof record.claims?.aeGrantRef === 'string' ? record.claims.aeGrantRef : undefined
  return {
    keyId: record.id,
    name: displayName,
    authorityMode,
    scopes: Object.freeze([CUSTOMER_REQUEST_AGENT_SCOPE, customerRequestScopeForMode(authorityMode)]),
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
  api: { get: (keyId: string) => Promise<AgentKeyRecord>; revoke: (input: { apiKeyId: string; revocationReason: string }) => Promise<unknown> }
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
