import { describe, expect, it, vi } from 'vitest'

import {
  AGENT_ACCESS_DEFAULT_APPLICATION_REF,
  AGENT_ACCESS_KEY_TTL_SECONDS,
  CUSTOMER_REQUEST_AGENT_SCOPE,
  MARKET_OPERATIONS_INVOKE_SCOPE,
  MARKET_SUPPLY_MANAGE_SCOPE,
  issueAgentAccessKey,
  agentAccessOperationSelectionDigest,
  listAgentAccessKeys,
  projectAgentAccessKey,
} from '../../src/modules/agent-access/agent-access'
import { CUSTOMER_REQUEST_BOUNDED_MANDATE_SCOPE, CUSTOMER_REQUEST_INSPECT_ONLY_SCOPE } from '../../src/modules/agent-access/contract'
import { defaultSandboxAgentAccessPolicy } from '../../src/modules/agent-access/sandbox-policy'
import { buildProductionAgentAccessPolicy } from '../../src/modules/agent-access/production-policy'
import { issuedAgentCanonicalRefs } from '../../src/modules/agent-access/issued-agent-binding'
import { createLocalE2EAgentAccessKeyApi } from '../../src/lib/server/local-e2e-agent-key'
import { LOCAL_E2E_OPERATOR_PRINCIPAL } from '../../src/lib/server/local-e2e-bypass'

const policy = defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 })
const scopes = [
  MARKET_OPERATIONS_INVOKE_SCOPE,
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
  aeScopes: JSON.stringify(scopes),
  aeOperationSelectionDigest: agentAccessOperationSelectionDigest({ operationAccess: 'all_admitted', operationRefs: [] }),
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
const recordedBinding = (grantRef: string, policyDigest = `policy:${grantRef}`) => ({
  kind: 'recorded' as const,
  grantRef,
  generation: 1,
  policyDigest,
  lifecycle: 'active' as const,
  expiresAt: 2_000,
})

describe('agent access', () => {
  it('keeps agent identity stable while credential generations remain distinct', () => {
    const first = issuedAgentCanonicalRefs({
      ownerAccountRef: 'act_owner',
      issuanceKey: 'agent-install-12345678',
      credentialId: 'key_first',
      generation: 1,
      grantRef: 'grt_first',
    })
    const replacement = issuedAgentCanonicalRefs({
      ownerAccountRef: 'act_owner',
      issuanceKey: 'agent-install-12345678',
      credentialId: 'key_second',
      generation: 2,
      grantRef: 'grt_second',
    })

    expect(replacement.principalRef).toBe(first.principalRef)
    expect(replacement.membershipRef).toBe(first.membershipRef)
    expect(replacement.bindingRef).not.toBe(first.bindingRef)
    expect(replacement.credentialRef).not.toBe(first.credentialRef)
    expect(replacement.delegationUuid).not.toBe(first.delegationUuid)
  })

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
      registerBinding: vi.fn().mockResolvedValue(recordedBinding('supply-12345678')),
    })
    expect(result).toMatchObject({
      kind: 'created',
      authorityMode: 'bounded_mandate',
      scopes: [MARKET_SUPPLY_MANAGE_SCOPE],
    })
  })
  it('refuses to mint customer_requests:create on a new key', async () => {
    const result = await issueAgentAccessKey({
      principal: { userId: 'owner_123' },
      input: {
        name: 'Legacy create key',
        idempotencyKey: 'create-12345678',
        scopes: [MARKET_OPERATIONS_INVOKE_SCOPE, CUSTOMER_REQUEST_AGENT_SCOPE, CUSTOMER_REQUEST_INSPECT_ONLY_SCOPE],
      },
      policy,
      api: {
        create: vi.fn(),
        getSecret: vi.fn(),
        list: vi.fn().mockResolvedValue({ data: [] }),
      },
      registerBinding: vi.fn(),
    })
    expect(result).toEqual({ kind: 'error', code: 'invalid_input', retryable: false })
  })
  it('issues a market invoke key with a bounded mandate and no customer-request create scope', async () => {
    const result = await issueAgentAccessKey({
      principal: { userId: 'owner_123' },
      input: {
        name: 'CLI key',
        idempotencyKey: 'cli-12345678',
        scopes: [MARKET_OPERATIONS_INVOKE_SCOPE, CUSTOMER_REQUEST_BOUNDED_MANDATE_SCOPE],
      },
      policy,
      api: {
        create: vi.fn().mockResolvedValue({ id: 'cli_key', secret: 'cli_secret', revoked: false, expired: false }),
        getSecret: vi.fn().mockResolvedValue({ secret: 'cli_secret' }),
        list: vi.fn().mockResolvedValue({ data: [] }),
      },
      registerBinding: vi.fn().mockResolvedValue(recordedBinding('cli-12345678')),
    })
    expect(result).toMatchObject({
      kind: 'created',
      authorityMode: 'bounded_mandate',
      scopes: [MARKET_OPERATIONS_INVOKE_SCOPE, CUSTOMER_REQUEST_BOUNDED_MANDATE_SCOPE],
    })
  })
  it('issues and exactly replays one canonical market-operations key', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'key_123', secret: 'ae_test_secret', revoked: false, expired: false })
    const getSecret = vi.fn().mockResolvedValue({ secret: 'ae_test_secret' })
    const list = vi.fn()
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [existingKey()] })
    const registerBinding = vi.fn().mockResolvedValue(recordedBinding('setup-12345678'))
    const api = { create, getSecret, list }

    const first = await issueAgentAccessKey({
      principal: { userId: 'owner_123' },
      input: { name: 'My assistant', idempotencyKey: 'setup-12345678' },
      policy,
      api,
      registerBinding,
    })
    const replay = await issueAgentAccessKey({
      principal: { userId: 'owner_123' },
      input: { name: 'My assistant', idempotencyKey: 'setup-12345678' },
      policy,
      api,
      registerBinding,
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
    expect(registerBinding).toHaveBeenCalledTimes(2)
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
    expect(registerBinding).toHaveBeenCalledWith(expect.objectContaining({
      issuanceKey: 'setup-12345678',
      grantRef: 'setup-12345678',
      credentialId: 'key_123',
      displayName: 'My assistant',
      applicationRef: AGENT_ACCESS_DEFAULT_APPLICATION_REF,
      environment: 'sandbox',
      scopes,
      authorityMode: 'inspect_only',
      policy,
    }))
    expect(getSecret).toHaveBeenCalledWith('key_123')
  })

  it('uses the local E2E key adapter through canonical binding and distinct issuances', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', 'true')
    const api = createLocalE2EAgentAccessKeyApi()
    const registerBinding = vi.fn(async (binding: Parameters<Parameters<typeof issueAgentAccessKey>[0]['registerBinding']>[0]) => ({
      ...recordedBinding(binding.grantRef),
      expiresAt: binding.expiresAt,
    }))
    const issue = async (idempotencyKey: string, grantRef: string, name: string) => await issueAgentAccessKey({
      ownerId: LOCAL_E2E_OPERATOR_PRINCIPAL,
      principal: { userId: LOCAL_E2E_OPERATOR_PRINCIPAL },
      input: {
        name,
        idempotencyKey,
        grantRef,
        scopes,
        environment: 'sandbox',
        expiresInSeconds: 60,
      },
      policy,
      api,
      registerBinding,
      returnSecret: false,
    })

    try {
      const first = await issue('local-canonical-first-12345678', 'grt_local_canonical_first', 'Local canonical first')
      const replay = await issue('local-canonical-first-12345678', 'grt_local_canonical_first', 'Local canonical first')
      const second = await issue('local-canonical-second-12345678', 'grt_local_canonical_second', 'Local canonical second')

      expect(first).toMatchObject({ kind: 'created', grantRef: 'grt_local_canonical_first' })
      expect(replay).toMatchObject({ kind: 'replayed', keyId: first.kind === 'error' ? '' : first.keyId })
      expect(second).toMatchObject({ kind: 'created', grantRef: 'grt_local_canonical_second' })
      if (first.kind === 'error' || second.kind === 'error') throw new Error('local issuance failed')
      expect(second.keyId).not.toBe(first.keyId)
      expect(registerBinding).toHaveBeenCalledTimes(3)
      expect(registerBinding).toHaveBeenNthCalledWith(1, expect.objectContaining({
        issuanceKey: 'local-canonical-first-12345678',
        grantRef: 'grt_local_canonical_first',
        credentialId: first.keyId,
        displayName: 'Local canonical first',
        applicationRef: AGENT_ACCESS_DEFAULT_APPLICATION_REF,
        environment: 'sandbox',
        scopes,
        authorityMode: 'inspect_only',
        operationAccess: 'all_admitted',
        operationRefs: [],
        policy,
      }))
    } finally {
      vi.useRealTimers()
      vi.unstubAllEnvs()
    }
  })

  it('binds Clerk replay to one compact canonical Operation-selection digest', async () => {
    const operationRefs = [`operation:v1:${'a'.repeat(64)}`, `operation:v1:${'b'.repeat(64)}`]
    const selectedPolicy = { ...policy, operationAccess: 'selected_operations' as const, operationRefs }
    const create = vi.fn().mockResolvedValue({ id: 'key_selected', secret: 'selected_secret' })
    const registerBinding = vi.fn().mockResolvedValue(recordedBinding('selected-12345678'))
    const input = {
      name: 'Selected assistant', idempotencyKey: 'selected-12345678',
      operationAccess: 'selected_operations' as const, operationRefs: [...operationRefs].reverse(),
    }
    await expect(issueAgentAccessKey({
      principal: { userId: 'owner_123' }, input, policy: selectedPolicy,
      api: { create, getSecret: vi.fn().mockResolvedValue({ secret: 'selected_secret' }), list: vi.fn().mockResolvedValue({ data: [] }) },
      registerBinding,
    })).resolves.toMatchObject({ kind: 'created' })
    const claims = create.mock.calls[0]?.[0]?.claims as Record<string, string>
    expect(claims.aeOperationSelectionDigest).toBe(agentAccessOperationSelectionDigest(selectedPolicy))
    expect(JSON.stringify(claims)).not.toContain(operationRefs[0])
    expect(JSON.stringify(claims)).not.toContain(operationRefs[1])

    const existing = existingKey({
      id: 'key_selected',
      claims: { ...canonicalClaims, ...claims, aeDisplayName: input.name, aeIssuanceKey: input.idempotencyKey, aeGrantRef: input.idempotencyKey },
    })
    await expect(issueAgentAccessKey({
      principal: { userId: 'owner_123' }, input, policy: selectedPolicy,
      api: { create: vi.fn(), getSecret: vi.fn().mockResolvedValue({ secret: 'selected_secret' }), list: vi.fn().mockResolvedValue({ data: [existing] }) },
      registerBinding,
    })).resolves.toMatchObject({ kind: 'replayed' })
    const narrowedPolicy = { ...policy, operationAccess: 'selected_operations' as const, operationRefs: [operationRefs[0]!] }
    await expect(issueAgentAccessKey({
      principal: { userId: 'owner_123' },
      input: { ...input, operationRefs: [operationRefs[0]!] },
      policy: narrowedPolicy,
      api: { create: vi.fn(), getSecret: vi.fn(), list: vi.fn().mockResolvedValue({ data: [existing] }) },
      registerBinding,
    })).resolves.toEqual({ kind: 'error', code: 'idempotency_conflict', retryable: false })
  })

  it('binds a fresh key through one atomic owner-authorized registration', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'key_atomic', secret: 'atomic_secret' })
    const registerBinding = vi.fn().mockResolvedValue({
      kind: 'recorded' as const,
      grantRef: 'atomic-12345678',
      generation: 1,
      policyDigest: 'policy:atomic-12345678',
      lifecycle: 'active' as const,
      expiresAt: 2_000,
    })

    const result = await issueAgentAccessKey({
      principal: { userId: 'owner_123' },
      input: { name: 'Atomic assistant', idempotencyKey: 'atomic-12345678' },
      policy,
      api: {
        create,
        getSecret: vi.fn(),
        list: vi.fn().mockResolvedValue({ data: [] }),
      },
      registerBinding,
    })

    expect(result).toMatchObject({
      kind: 'created',
      keyId: 'key_atomic',
      grantRef: 'atomic-12345678',
    })
    expect(registerBinding).toHaveBeenCalledOnce()
    expect(registerBinding).toHaveBeenCalledWith(expect.objectContaining({
      credentialId: 'key_atomic',
      displayName: 'Atomic assistant',
      scopes,
    }))
  })

  it('passes bounded production material and expiry to Clerk and conflicts on changed replay material', async () => {
    const productionPolicy = buildProductionAgentAccessPolicy({
      currency: 'USD',
      exponent: 2,
      maximumSpendPerInvocation: { currency: 'USD', units: '100', exponent: 2 },
      maximumDailySpend: { currency: 'USD', units: '500', exponent: 2 },
      maximumMonthlySpend: { currency: 'USD', units: '2000', exponent: 2 },
    })
    const create = vi.fn().mockResolvedValue({ id: 'production_key', secret: 'production_secret' })
    const registerBinding = vi.fn().mockResolvedValue(recordedBinding('production-12345678', 'policy:production'))
    const input = {
      name: 'Production assistant',
      idempotencyKey: 'production-12345678',
      scopes: [MARKET_OPERATIONS_INVOKE_SCOPE, CUSTOMER_REQUEST_BOUNDED_MANDATE_SCOPE],
      environment: 'production' as const,
      maximumSpendPerInvocation: { currency: 'USD', units: '100', exponent: 2 },
      maximumDailySpend: { currency: 'USD', units: '500', exponent: 2 },
      maximumMonthlySpend: { currency: 'USD', units: '2000', exponent: 2 },
      expiresInSeconds: 3_600,
    }
    const result = await issueAgentAccessKey({
      principal: { userId: 'owner_123' },
      input,
      policy: productionPolicy,
      api: { create, getSecret: vi.fn().mockResolvedValue({ secret: 'production_secret' }), list: vi.fn().mockResolvedValue({ data: [] }) },
      registerBinding,
    })
    expect(result).toMatchObject({ kind: 'created', expiresInSeconds: 3_600, authorityMode: 'bounded_mandate' })
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      secondsUntilExpiration: 3_600,
      claims: expect.objectContaining({
        aeEnvironment: 'production',
        aeExpiresInSeconds: '3600',
        aeMaximumSpendPerInvocation: 'USD:100:2',
        aeMaximumDailySpend: 'USD:500:2',
        aeMaximumMonthlySpend: 'USD:2000:2',
      }),
    }))

    const existingClaims = {
      ...canonicalClaims,
      aeEnvironment: 'production',
      aeAuthorityMode: 'bounded_mandate',
      aeGrantRef: 'production-12345678',
      aeIssuanceKey: 'production-12345678',
      aeDisplayName: 'Production assistant',
      aeExpiresInSeconds: '3600',
      aeMaximumSpendPerInvocation: 'USD:100:2',
      aeMaximumDailySpend: 'USD:500:2',
      aeMaximumMonthlySpend: 'USD:2000:2',
      aeScopes: JSON.stringify(input.scopes),
    }
    const conflict = await issueAgentAccessKey({
      principal: { userId: 'owner_123' },
      input: { ...input, expiresInSeconds: 7_200 },
      policy: productionPolicy,
      api: {
        create: vi.fn(),
        getSecret: vi.fn(),
        list: vi.fn().mockResolvedValue({ data: [existingKey({ claims: existingClaims, scopes: input.scopes, expiresAt: 4_000_000 })] }),
      },
      registerBinding: vi.fn(),
    })
    expect(conflict).toEqual({ kind: 'error', code: 'idempotency_conflict', retryable: false })
  })

  it('rejects production full_yolo before creating a Clerk key', async () => {
    const create = vi.fn()
    const result = await issueAgentAccessKey({
      principal: { userId: 'owner_123' },
      input: {
        name: 'Unsafe production key',
        idempotencyKey: 'unsafe-12345678',
        scopes: [MARKET_OPERATIONS_INVOKE_SCOPE, 'customer_requests:full_yolo'],
        environment: 'production',
      },
      policy: defaultSandboxAgentAccessPolicy({ currency: 'USD', exponent: 2 }),
      api: { create, getSecret: vi.fn(), list: vi.fn() },
      registerBinding: vi.fn(),
    })
    expect(result).toEqual({ kind: 'error', code: 'invalid_input', retryable: false })
    expect(create).not.toHaveBeenCalled()
  })

  it('rolls back the Clerk key when atomic durable binding fails', async () => {
    const revoke = vi.fn().mockResolvedValue(undefined)
    const registerBinding = vi.fn().mockResolvedValue({ kind: 'unavailable' as const })
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
      registerBinding,
    })

    expect(result).toEqual({
      kind: 'error',
      code: 'issuance_unavailable',
      retryable: true,
      reconciliation: 'provider_credential_revoked',
    })
    expect(registerBinding).toHaveBeenCalledOnce()
    expect(revoke).toHaveBeenCalledWith({ apiKeyId: 'key_fresh', revocationReason: 'Source principal binding failed.' })
  })

  it('never revokes a pre-existing credential when replay registration is temporarily unavailable', async () => {
    const revoke = vi.fn()
    const result = await issueAgentAccessKey({
      principal: { userId: 'owner_123' },
      input: { name: 'My assistant', idempotencyKey: 'setup-12345678' },
      policy,
      api: {
        create: vi.fn(),
        getSecret: vi.fn(),
        list: vi.fn().mockResolvedValue({ data: [existingKey()] }),
        revoke,
      },
      registerBinding: vi.fn().mockResolvedValue({ kind: 'unavailable' as const }),
    })

    expect(result).toEqual({ kind: 'error', code: 'issuance_unavailable', retryable: true })
    expect(revoke).not.toHaveBeenCalled()
  })

  it('fails closed without an authenticated owner', async () => {
    await expect(issueAgentAccessKey({
      principal: undefined,
      input: { name: 'My assistant', idempotencyKey: 'setup-12345678' },
      policy,
      api: { create: vi.fn(), getSecret: vi.fn(), list: vi.fn() },
      registerBinding: vi.fn(),
    })).resolves.toEqual({ kind: 'error', code: 'missing_auth', retryable: false })
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
      registerBinding: vi.fn(),
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
      scopes: [MARKET_OPERATIONS_INVOKE_SCOPE, CUSTOMER_REQUEST_AGENT_SCOPE, CUSTOMER_REQUEST_INSPECT_ONLY_SCOPE],
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
})
