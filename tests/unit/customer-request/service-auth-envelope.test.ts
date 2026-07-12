import { describe, expect, it } from 'vitest'

import { createCustomerRequestServiceAssertion, verifyCustomerRequestServiceAssertion } from '@/modules/customer-request/service-auth-envelope'

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
})
