import { describe, expect, it, vi } from 'vitest'

import { issueCustomerRequestAgentKey, revokeCustomerRequestAgentKey } from '../../src/modules/customer-request/agent-access'

describe('customer request agent access', () => {
  it('derives subject, creator, scope, expiry, and replay identity on the server', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'key_123', secret: 'ae_test_secret', revoked: false, expired: false })
    const getSecret = vi.fn().mockResolvedValue({ secret: 'ae_test_secret' })
    const list = vi.fn()
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{
        id: 'key_123', name: 'My assistant', subject: 'user_123', revoked: false, expired: false,
        claims: { aePurpose: 'customer_request_agent', aeIssuanceKey: 'setup-12345678' },
      }] })

    const first = await issueCustomerRequestAgentKey({
      principal: { userId: 'user_123' },
      input: { name: 'My assistant', idempotencyKey: 'setup-12345678' },
      api: { create, getSecret, list },
    })
    const replay = await issueCustomerRequestAgentKey({
      principal: { userId: 'user_123' },
      input: { name: 'My assistant', idempotencyKey: 'setup-12345678' },
      api: { create, getSecret, list },
    })

    expect(first).toEqual({ kind: 'created', keyId: 'key_123', secret: 'ae_test_secret', expiresInSeconds: 604_800 })
    expect(replay).toEqual({ kind: 'replayed', keyId: 'key_123', secret: 'ae_test_secret', expiresInSeconds: 604_800 })
    expect(create).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledWith({
      name: 'My assistant', subject: 'user_123', createdBy: 'user_123',
      scopes: ['customer_requests:create'], secondsUntilExpiration: 604_800,
      claims: { aePurpose: 'customer_request_agent', aeIssuanceKey: 'setup-12345678' },
      description: 'Use Agentic Economy Customer Requests with this assistant.',
    })
    expect(getSecret).toHaveBeenCalledWith('key_123')
  })

  it('fails closed without an authenticated user', async () => {
    const result = await issueCustomerRequestAgentKey({
      principal: undefined,
      input: { name: 'My assistant', idempotencyKey: 'setup-12345678' },
      api: { create: vi.fn(), getSecret: vi.fn(), list: vi.fn() },
    })
    expect(result).toEqual({ kind: 'error', code: 'missing_auth', retryable: false })
  })

  it('rejects caller-controlled scope-like or malformed setup data', async () => {
    const api = { create: vi.fn(), getSecret: vi.fn(), list: vi.fn() }
    await expect(issueCustomerRequestAgentKey({
      principal: { userId: 'user_123' },
      input: { name: '  ', idempotencyKey: 'short' },
      api,
    })).resolves.toEqual({ kind: 'error', code: 'invalid_input', retryable: false })
    expect(api.create).not.toHaveBeenCalled()
  })

  it('refuses a changed payload under the same idempotency key', async () => {
    const api = {
      create: vi.fn(), getSecret: vi.fn(),
      list: vi.fn().mockResolvedValue({ data: [{
        id: 'key_123', name: 'First assistant', subject: 'user_123', revoked: false, expired: false,
        claims: { aePurpose: 'customer_request_agent', aeIssuanceKey: 'setup-12345678' },
      }] }),
    }
    await expect(issueCustomerRequestAgentKey({
      principal: { userId: 'user_123' },
      input: { name: 'Changed assistant', idempotencyKey: 'setup-12345678' },
      api,
    })).resolves.toEqual({ kind: 'error', code: 'idempotency_conflict', retryable: false })
    expect(api.create).not.toHaveBeenCalled()
    expect(api.getSecret).not.toHaveBeenCalled()
  })

  it('revokes only a key owned by the authenticated customer and replays safely', async () => {
    const revoke = vi.fn().mockResolvedValue({})
    const get = vi.fn()
      .mockResolvedValueOnce({ id: 'ak_12345678', name: 'My assistant', subject: 'user_123', revoked: false, expired: false, claims: { aePurpose: 'customer_request_agent' } })
      .mockResolvedValueOnce({ id: 'ak_12345678', name: 'My assistant', subject: 'user_123', revoked: true, expired: false, claims: { aePurpose: 'customer_request_agent' } })
    await expect(revokeCustomerRequestAgentKey({ principal: { userId: 'user_123' }, keyId: 'ak_12345678', api: { get, revoke } }))
      .resolves.toEqual({ kind: 'revoked', keyId: 'ak_12345678' })
    await expect(revokeCustomerRequestAgentKey({ principal: { userId: 'user_123' }, keyId: 'ak_12345678', api: { get, revoke } }))
      .resolves.toEqual({ kind: 'already_revoked', keyId: 'ak_12345678' })
    expect(revoke).toHaveBeenCalledOnce()
  })

  it('does not disclose or revoke another customer key', async () => {
    const revoke = vi.fn()
    const get = vi.fn().mockResolvedValue({ id: 'ak_12345678', name: 'Other', subject: 'user_other', revoked: false, expired: false, claims: { aePurpose: 'customer_request_agent' } })
    await expect(revokeCustomerRequestAgentKey({ principal: { userId: 'user_123' }, keyId: 'ak_12345678', api: { get, revoke } }))
      .resolves.toEqual({ kind: 'error', code: 'key_not_found', retryable: false })
    expect(revoke).not.toHaveBeenCalled()
  })
})
