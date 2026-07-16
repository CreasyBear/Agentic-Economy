const CUSTOMER_REQUEST_SCOPE = 'customer_requests:create'
const KEY_LIFETIME_SECONDS = 7 * 24 * 60 * 60
const PURPOSE = 'customer_request_agent'

export type CustomerRequestAgentKeyResult =
  | { kind: 'created' | 'replayed'; keyId: string; secret: string; expiresInSeconds: number }
  | { kind: 'error'; code: 'missing_auth' | 'invalid_input' | 'idempotency_conflict' | 'issuance_unavailable'; retryable: boolean }

export type CustomerRequestAgentKeyRevocationResult =
  | { kind: 'revoked' | 'already_revoked'; keyId: string }
  | { kind: 'error'; code: 'missing_auth' | 'invalid_input' | 'key_not_found' | 'revocation_unavailable'; retryable: boolean }

type AgentKeyApi = Readonly<{
  list: (input: { subject: string; includeInvalid: boolean; limit: number }) => Promise<{ data: readonly AgentKeyRecord[] }>
  create: (input: AgentKeyCreateInput) => Promise<{ id: string; secret?: string | undefined }>
  getSecret: (keyId: string) => Promise<{ secret: string }>
}>

type AgentKeyRecord = Readonly<{
  id: string
  name: string
  subject: string
  revoked: boolean
  expired: boolean
  claims: Record<string, unknown> | null
}>

type AgentKeyCreateInput = Readonly<{
  name: string
  subject: string
  createdBy: string
  scopes: readonly string[]
  secondsUntilExpiration: number
  claims: Record<string, string>
  description: string
}>

export async function issueCustomerRequestAgentKey(input: Readonly<{
  principal: { userId: string } | undefined
  input: { name: string; idempotencyKey: string }
  api: AgentKeyApi
}>): Promise<CustomerRequestAgentKeyResult> {
  if (input.principal === undefined) return { kind: 'error', code: 'missing_auth', retryable: false }
  const name = input.input.name.trim()
  const idempotencyKey = input.input.idempotencyKey.trim()
  if (name.length < 1 || name.length > 80 || !/^[A-Za-z0-9][A-Za-z0-9 _.-]{7,127}$/u.test(idempotencyKey)) {
    return { kind: 'error', code: 'invalid_input', retryable: false }
  }

  try {
    const existing = (await input.api.list({
      subject: input.principal.userId,
      includeInvalid: false,
      limit: 100,
    })).data.find((key) => !key.revoked && !key.expired
      && key.claims?.aePurpose === PURPOSE
      && key.claims.aeIssuanceKey === idempotencyKey)
    if (existing !== undefined) {
      if (existing.name !== name) return { kind: 'error', code: 'idempotency_conflict', retryable: false }
      const { secret } = await input.api.getSecret(existing.id)
      return { kind: 'replayed', keyId: existing.id, secret, expiresInSeconds: KEY_LIFETIME_SECONDS }
    }

    const created = await input.api.create({
      name,
      subject: input.principal.userId,
      createdBy: input.principal.userId,
      scopes: [CUSTOMER_REQUEST_SCOPE],
      secondsUntilExpiration: KEY_LIFETIME_SECONDS,
      claims: { aePurpose: PURPOSE, aeIssuanceKey: idempotencyKey },
      description: 'Use Agentic Economy Customer Requests with this assistant.',
    })
    const secret = created.secret ?? (await input.api.getSecret(created.id)).secret
    return { kind: 'created', keyId: created.id, secret, expiresInSeconds: KEY_LIFETIME_SECONDS }
  } catch {
    return { kind: 'error', code: 'issuance_unavailable', retryable: true }
  }
}

export async function revokeCustomerRequestAgentKey(input: Readonly<{
  principal: { userId: string } | undefined
  keyId: string
  api: {
    get: (keyId: string) => Promise<AgentKeyRecord>
    revoke: (input: { apiKeyId: string; revocationReason: string }) => Promise<unknown>
  }
}>): Promise<CustomerRequestAgentKeyRevocationResult> {
  if (input.principal === undefined) return { kind: 'error', code: 'missing_auth', retryable: false }
  if (!/^ak_[A-Za-z0-9]{8,}$/u.test(input.keyId)) {
    return { kind: 'error', code: 'invalid_input', retryable: false }
  }
  try {
    const key = await input.api.get(input.keyId)
    if (key.subject !== input.principal.userId || key.claims?.aePurpose !== PURPOSE) {
      return { kind: 'error', code: 'key_not_found', retryable: false }
    }
    if (key.revoked) return { kind: 'already_revoked', keyId: key.id }
    await input.api.revoke({ apiKeyId: key.id, revocationReason: 'Revoked by the AE customer' })
    return { kind: 'revoked', keyId: key.id }
  } catch {
    return { kind: 'error', code: 'revocation_unavailable', retryable: true }
  }
}
