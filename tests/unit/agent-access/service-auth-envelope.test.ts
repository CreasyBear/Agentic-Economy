import { describe, expect, it } from 'vitest'

import {
  createCustomerRequestServiceAssertion,
  toStableHashValue,
  verifyCustomerRequestServiceAssertion,
} from '@/modules/agent-access/service-auth-envelope'
import type { StableHashValue } from '@/modules/common/stable-hash'

describe('CustomerRequest service assertion', () => {
  const key = 'service-key-with-at-least-thirty-two-bytes'
  const principal = { principalId: 'clerk_api_key:ak_1', ownerId: 'user_1', credentialId: 'ak_1', scopes: ['customer_requests:create'] }
  const command = { requestId: 'request:1', customerJob: 'Find an option' }

  it('binds a short-lived signature to operation, command and verified agent principal', async () => {
    const assertion = await createCustomerRequestServiceAssertion({ key, operation: 'submit', command, principal, issuedAt: 1_000 })
    await expect(verifyCustomerRequestServiceAssertion({ key, operation: 'submit', command, assertion, now: 2_000 })).resolves.toBe(true)
    await expect(verifyCustomerRequestServiceAssertion({ key, operation: 'resume', command, assertion, now: 2_000 })).resolves.toBe(false)
    await expect(verifyCustomerRequestServiceAssertion({ key, operation: 'submit', command: { ...command, customerJob: 'Changed' }, assertion, now: 2_000 })).resolves.toBe(false)
    expect(JSON.stringify(assertion)).not.toContain(key)
  })

  it('rejects stale and modified principal assertions', async () => {
    const assertion = await createCustomerRequestServiceAssertion({ key, operation: 'submit', command, principal, issuedAt: 1_000 })
    await expect(verifyCustomerRequestServiceAssertion({ key, operation: 'submit', command, assertion, now: 32_000 })).resolves.toBe(false)
    await expect(verifyCustomerRequestServiceAssertion({
      key, operation: 'submit', command, assertion: { ...assertion, credentialId: 'ak_other' }, now: 2_000,
    })).resolves.toBe(false)
  })

  it('admits bounded JSON commands and fails closed for non-JSON values', () => {
    const command = { requestId: 'request:1', options: ['fast', null] }
    const stableCommand: StableHashValue = toStableHashValue(command)
    expect(stableCommand).toEqual(command)
    expect(() => toStableHashValue({ requestId: undefined })).toThrow('canonical_digest_value_invalid')
    expect(() => toStableHashValue(new Date())).toThrow('canonical_digest_value_invalid')
  })
})
