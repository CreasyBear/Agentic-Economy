import { describe, expect, it, vi } from 'vitest'

import {
  AGENT_ACCESS_DEFAULT_APPLICATION_REF,
  AGENT_ACCESS_KEY_TTL_SECONDS,
  CUSTOMER_REQUEST_AGENT_SCOPE,
  MARKET_OPERATIONS_INVOKE_SCOPE,
  MARKET_SUPPLY_MANAGE_SCOPE,
  issueAgentAccessKey,
  listAgentAccessKeys,
  projectAgentAccessKey,
  revokeAgentAccessKey,
} from '../../src/modules/agent-access/agent-access'
import { CUSTOMER_REQUEST_INSPECT_ONLY_SCOPE } from '../../src/modules/agent-access/contract'
import { defaultAgentAccessPolicy } from '../../src/modules/agent-access/policy'

const policy = defaultAgentAccessPolicy({ environment: 'sandbox', currency: 'USD', exponent: 2 })
const scopes = [
  MARKET_OPERATIONS_INVOKE_SCOPE,
  CUSTOMER_REQUEST_AGENT_SCOPE,
  CUSTOMER_REQUEST_INSPECT_ONLY_SCOPE,
] as const
const canonicalClaims = {
  aePurpose: 'agent_access',
  aeGrantRef: 'setup-12345678',
  aeDisplayName: 'My assistant',
  aeAuthorityMode: 'inspect_only',
  aeIssuanceKey: 'setup-12345678',
  aeApplicationRef: AGENT_ACCESS_DEFAULT_APPLICATION_REF,
  aeEnvironment: 'sandbox',
}

function existingKey(overrides: Record<string, unknown> = {}) {
  return {
    id: 'key_123',
    name: 'My assistant',
    subject: 'owner_123',
    revoked: false,
    expired: false,
    scopes,
    claims: canonicalClaims,
    expiresAt: 2_000,
    ...overrides,
  }
}

describe('agent access', () => {
  it('projects a supply-only key with the bounded supply authority', () => {
    const projected = projectAgentAccessKey(existingKey({
      scopes: [MARKET_SUPPLY_MANAGE_SCOPE],
      claims: { ...canonicalClaims, aeAuthorityMode: 'bounded_mandate' },
    }))
    expect(projected).toMatchObject({
      scopes: [MARKET_SUPPLY_MANAGE_SCOPE],
      authorityMode: 'bounded_mandate',
    })
  })
  it('issues a supply-only key without adding the default operation scope', async () => {
    const result = await issueAgentAccessKey({
      principal: { userId: 'owner_123' },
      input: { name: 'Supply key', idempotencyKey: 'supply-12345678', scopes: [MARKET_SUPPLY_MANAGE_SCOPE] },
      policy,
      api: {
        create: vi.fn().mockResolvedValue({ id: 'supply_key', secret: 'supply_secret', revoked: false, expired: false }),
        getSecret: vi.fn().mockResolvedValue({ secret: 'supply_secret' }),
        list: vi.fn().mockResolvedValue({ data: [] }),
      },
      registerGrant: vi.fn().mockResolvedValue({
        kind: 'recorded' as const,
        grantRef: 'supply-12345678',
        generation: 1,
        policyDigest: 'policy:supply-12345678',
        lifecycle: 'active' as const,
        expiresAt: 2_000,
      }),
      registerPrincipal: vi.fn().mockResolvedValue({ kind: 'recorded' as const }),
    })
    expect(result).toMatchObject({
      kind: 'created',
      authorityMode: 'bounded_mandate',
      scopes: [MARKET_SUPPLY_MANAGE_SCOPE],
    })
  })
  it('issues and exactly replays one canonical market-operations key', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'key_123', secret: 'ae_test_secret', revoked: false, expired: false })
    const getSecret = vi.fn().mockResolvedValue({ secret: 'ae_test_secret' })
    const list = vi.fn()
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [existingKey()] })
    const registerGrant = vi.fn().mockResolvedValue({
      kind: 'recorded' as const,
      grantRef: 'setup-12345678',
      generation: 1,
      policyDigest: 'policy:setup-12345678',
      lifecycle: 'active' as const,
      expiresAt: 2_000,
    })
    const registerPrincipal = vi.fn().mockResolvedValue({ kind: 'recorded' as const })
    const api = { create, getSecret, list }

    const first = await issueAgentAccessKey({
      principal: { userId: 'owner_123' },
      input: { name: 'My assistant', idempotencyKey: 'setup-12345678' },
      policy,
      api,
      registerGrant,
      registerPrincipal,
    })
    const replay = await issueAgentAccessKey({
      principal: { userId: 'owner_123' },
      input: { name: 'My assistant', idempotencyKey: 'setup-12345678' },
      policy,
      api,
      registerGrant,
      registerPrincipal,
    })

    expect(first).toEqual({
      kind: 'created',
      keyId: 'key_123',
      secret: 'ae_test_secret',
      expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS,
      authorityMode: 'inspect_only',
      scopes,
      grantRef: 'setup-12345678',
    })
    expect(replay).toEqual({
      kind: 'replayed',
      keyId: 'key_123',
      secret: 'ae_test_secret',
      expiresInSeconds: AGENT_ACCESS_KEY_TTL_SECONDS,
      authorityMode: 'inspect_only',
      scopes,
      grantRef: 'setup-12345678',
    })
    expect(create).toHaveBeenCalledOnce()
    expect(registerGrant).toHaveBeenCalledTimes(2)
    expect(registerPrincipal).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'AE Agent setup-12345678',
      subject: 'owner_123',
      createdBy: 'owner_123',
      scopes,
      claims: {
        ...canonicalClaims,
      },
      description: 'Use Agentic Economy Market Operations with this assistant.',
    }))
    expect(registerGrant).toHaveBeenCalledWith(expect.objectContaining({
      grantRef: 'setup-12345678',
      principalId: 'clerk_api_key:key_123',
      ownerId: 'owner_123',
      applicationRef: AGENT_ACCESS_DEFAULT_APPLICATION_REF,
      credentialId: 'key_123',
      environment: 'sandbox',
      operationAccess: 'all_admitted',
      authorityMode: 'inspect_only',
      policy,
      lifecycle: 'active',
      generation: 1,
    }))
    expect(registerPrincipal).toHaveBeenCalledWith(expect.objectContaining({
      principalId: 'clerk_api_key:key_123',
      ownerId: 'owner_123',
      credentialId: 'key_123',
      applicationRef: AGENT_ACCESS_DEFAULT_APPLICATION_REF,
      environment: 'sandbox',
      scopes,
      authorityMode: 'inspect_only',
      grantGeneration: 1,
      policyDigest: 'policy:setup-12345678',
      lifecycle: 'active',
    }))
    expect(getSecret).toHaveBeenCalledWith('key_123')
  })

  it('requires both durable grant and principal registration, then rolls back the Clerk key on failure', async () => {
    const revoke = vi.fn().mockResolvedValue(undefined)
    const registerGrant = vi.fn().mockResolvedValue({
      kind: 'recorded' as const,
      grantRef: 'fresh-12345678',
      generation: 1,
      policyDigest: 'policy:fresh',
      lifecycle: 'active' as const,
      expiresAt: 2_000,
    })
    const registerPrincipal = vi.fn().mockResolvedValue({ kind: 'unavailable' as const })
    const result = await issueAgentAccessKey({
      principal: { userId: 'owner_fresh' },
      input: { name: 'Fresh assistant', idempotencyKey: 'fresh-12345678' },
      policy,
      api: {
        create: vi.fn().mockResolvedValue({ id: 'key_fresh', secret: 'secret_fresh' }),
        getSecret: vi.fn(),
        list: vi.fn().mockResolvedValue({ data: [] }),
        revoke,
      },
      registerGrant,
      registerPrincipal,
    })

    expect(result).toEqual({ kind: 'error', code: 'issuance_unavailable', retryable: true })
    expect(registerGrant).toHaveBeenCalledOnce()
    expect(registerPrincipal).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledWith({ apiKeyId: 'key_fresh', revocationReason: 'Source principal binding failed.' })
  })

  it('fails closed without an authenticated owner or durable registration callbacks', async () => {
    await expect(issueAgentAccessKey({
      principal: undefined,
      input: { name: 'My assistant', idempotencyKey: 'setup-12345678' },
      policy,
      api: { create: vi.fn(), getSecret: vi.fn(), list: vi.fn() },
    })).resolves.toEqual({ kind: 'error', code: 'missing_auth', retryable: false })

    const result = await issueAgentAccessKey({
      principal: { userId: 'owner_123' },
      input: { name: 'My assistant', idempotencyKey: 'setup-12345678' },
      policy,
      api: {
        create: vi.fn().mockResolvedValue({ id: 'key_123', secret: 'secret' }),
        getSecret: vi.fn(),
        list: vi.fn().mockResolvedValue({ data: [] }),
      },
    })
    expect(result).toEqual({ kind: 'error', code: 'issuance_unavailable', retryable: true })
  })

  it('rejects a changed material payload under the same idempotency key', async () => {
    const create = vi.fn()
    const getSecret = vi.fn()
    const result = await issueAgentAccessKey({
      principal: { userId: 'owner_123' },
      input: { name: 'Changed assistant', idempotencyKey: 'setup-12345678' },
      policy,
      api: {
        create,
        getSecret,
        list: vi.fn().mockResolvedValue({ data: [existingKey()] }),
      },
      registerGrant: vi.fn(),
      registerPrincipal: vi.fn(),
    })

    expect(result).toEqual({ kind: 'error', code: 'idempotency_conflict', retryable: false })
    expect(create).not.toHaveBeenCalled()
    expect(getSecret).not.toHaveBeenCalled()
  })

  it('projects only canonical gateway keys and has no legacy fallback', () => {
    const record = existingKey({ createdAt: 100, expiresAt: 200 })
    expect(projectAgentAccessKey(record)).toEqual({
      keyId: 'key_123',
      name: 'My assistant',
      applicationRef: AGENT_ACCESS_DEFAULT_APPLICATION_REF,
      environment: 'sandbox',
      authorityMode: 'inspect_only',
      scopes,
      createdAt: 100,
      expiresAt: 200,
      revoked: false,
      expired: false,
      grantRef: 'setup-12345678',
    })

    expect(projectAgentAccessKey({
      ...record,
      scopes: [CUSTOMER_REQUEST_AGENT_SCOPE, CUSTOMER_REQUEST_INSPECT_ONLY_SCOPE],
    })).toBeUndefined()
    expect(projectAgentAccessKey({
      ...record,
      claims: {
        aePurpose: 'agent_access',
        aeGrantRef: 'setup-12345678',
        aeDisplayName: 'My assistant',
        aeAuthorityMode: 'inspect_only',
        aeIssuanceKey: 'setup-12345678',
        aeEnvironment: 'sandbox',
      },
    })).toBeUndefined()
    expect(projectAgentAccessKey({
      ...record,
      claims: { ...canonicalClaims, aePurpose: 'customer_request_agent' },
    })).toBeUndefined()
  })
  it('lists canonical owner keys through the invalid-inclusive Clerk list', async () => {
    const list = vi.fn().mockResolvedValue({
      data: [
        existingKey({ id: 'key_active' }),
        existingKey({ id: 'key_legacy', claims: { ...canonicalClaims, aePurpose: 'customer_request_agent' } }),
      ],
    })

    await expect(listAgentAccessKeys({ principal: { userId: 'owner_123' }, api: { list } })).resolves.toEqual([{
      keyId: 'key_active',
      name: 'My assistant',
      applicationRef: AGENT_ACCESS_DEFAULT_APPLICATION_REF,
      environment: 'sandbox',
      authorityMode: 'inspect_only',
      scopes,
      expiresAt: 2_000,
      revoked: false,
      expired: false,
      grantRef: 'setup-12345678',
    }])
    expect(list).toHaveBeenCalledWith({ subject: 'owner_123', includeInvalid: true, limit: 100 })

    await expect(listAgentAccessKeys({ principal: undefined, api: { list } })).resolves.toEqual([])
  })
  it('fails closed before Clerk when durable binding verification fails', async () => {
    const order: string[] = []
    const revokeGrant = vi.fn(async () => {
      order.push('durable')
      return { kind: 'binding_mismatch' as const, grantRef: 'setup-12345678' }
    })
    const revoke = vi.fn(async () => {
      order.push('clerk')
    })

    await expect(revokeAgentAccessKey({
      principal: { userId: 'owner_123' },
      keyId: 'key_1234',
      api: { get: vi.fn().mockResolvedValue(existingKey({ id: 'key_1234' })), revoke },
      revokeGrant,
    })).resolves.toEqual({ kind: 'error', code: 'revocation_unavailable', retryable: true })
    expect(revokeGrant).toHaveBeenCalledWith(expect.objectContaining({
      grantRef: 'setup-12345678',
      ownerId: 'owner_123',
      credentialId: 'key_1234',
      principalId: 'clerk_api_key:key_1234',
    }))
    expect(order).toEqual(['durable'])
    expect(revoke).not.toHaveBeenCalled()
  })

  it('allows Clerk revocation after durable revoke or replay', async () => {
    const order: string[] = []
    const revoke = vi.fn(async () => {
      order.push('clerk')
    })
    const revokeGrant = vi.fn(async () => {
      order.push('durable')
      return { kind: 'already_revoked' as const, grantRef: 'setup-12345678', generation: 3 }
    })

    await expect(revokeAgentAccessKey({
      principal: { userId: 'owner_123' },
      keyId: 'key_1234',
      api: { get: vi.fn().mockResolvedValue(existingKey({ id: 'key_1234' })), revoke },
      revokeGrant,
    })).resolves.toEqual({ kind: 'revoked', keyId: 'key_1234' })
    expect(order).toEqual(['durable', 'clerk'])
  })

  it('keeps durable revocation retryable when Clerk fails afterward', async () => {
    const order: string[] = []
    const revokeGrant = vi.fn(async () => {
      order.push('durable')
      return { kind: 'revoked' as const, grantRef: 'setup-12345678', generation: 1 }
    })
    const revoke = vi.fn(async () => {
      order.push('clerk')
      throw new Error('clerk_unavailable')
    })

    await expect(revokeAgentAccessKey({
      principal: { userId: 'owner_123' },
      keyId: 'key_1234',
      api: { get: vi.fn().mockResolvedValue(existingKey({ id: 'key_1234' })), revoke },
      revokeGrant,
    })).resolves.toEqual({ kind: 'error', code: 'revocation_unavailable', retryable: true })
    expect(order).toEqual(['durable', 'clerk'])
  })

  it('requires a non-empty durable grant reference before either revoke port', async () => {
    const revokeGrant = vi.fn()
    const revoke = vi.fn()
    await expect(revokeAgentAccessKey({
      principal: { userId: 'owner_123' },
      keyId: 'key_1234',
      api: {
        get: vi.fn().mockResolvedValue(existingKey({ id: 'key_1234', claims: { ...canonicalClaims, aeGrantRef: ' ' } })),
        revoke,
      },
      revokeGrant,
    })).resolves.toEqual({ kind: 'error', code: 'key_not_found', retryable: false })
    expect(revokeGrant).not.toHaveBeenCalled()
    expect(revoke).not.toHaveBeenCalled()
  })
})
