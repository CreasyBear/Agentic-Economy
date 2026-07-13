import { describe, expect, it, vi } from 'vitest'

import { withTemporaryClerkApiKey } from '../../../tools/release/customer-request-production-credential'

describe('production cold-agent credential', () => {
  it('validates the Clerk instance, creates one scoped temporary key, runs the journey, and revokes it', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'ins_expected', environment_type: 'development' }))
      .mockResolvedValueOnce(Response.json(acceptanceUser()))
      .mockResolvedValueOnce(Response.json({ id: 'apikey_temporary', secret: 'ak_temporary_secret' }))
      .mockResolvedValueOnce(Response.json({ id: 'apikey_temporary', revoked: true }))
    const run = vi.fn(async (_apiKey: string) => undefined)

    await expect(withTemporaryClerkApiKey({
      clerkSecretKey: 'sk_test_server', expectedInstanceId: 'ins_expected', subject: 'user_acceptance', fetch, run,
    })).resolves.toBeUndefined()

    expect(run).toHaveBeenCalledExactlyOnceWith('ak_temporary_secret')
    expect(fetch.mock.calls[2]?.[1]).toMatchObject({
      method: 'POST',
      body: expect.stringContaining('customer_requests:create'),
    })
    expect(String(fetch.mock.calls[2]?.[1]?.body)).not.toContain('created_by')
    expect(fetch.mock.calls[3]?.[0]).toBe('https://api.clerk.com/v1/api_keys/apikey_temporary/revoke')
  })

  it('preserves the journey failure when revocation also fails', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'ins_expected', environment_type: 'production' }))
      .mockResolvedValueOnce(Response.json(acceptanceUser()))
      .mockResolvedValueOnce(Response.json({ id: 'apikey_temporary', secret: 'ak_temporary_secret' }))
      .mockRejectedValueOnce(new Error('revocation network failure'))

    await expect(withTemporaryClerkApiKey({
      clerkSecretKey: 'sk_live_server', expectedInstanceId: 'ins_expected', subject: 'user_acceptance', fetch,
      run: async () => { throw new Error('cold journey failed') },
    })).rejects.toSatisfy((error: unknown) => error instanceof AggregateError
      && error.errors.some((item) => item instanceof Error && item.message === 'cold journey failed')
      && error.errors.some((item) => item instanceof Error && item.message === 'clerk_temporary_api_key_revocation_failed'))
  })

  it('revokes a created key when Clerk omits its secret from the response', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'ins_expected', environment_type: 'production' }))
      .mockResolvedValueOnce(Response.json(acceptanceUser()))
      .mockResolvedValueOnce(Response.json({ id: 'apikey_temporary' }))
      .mockResolvedValueOnce(Response.json({ id: 'apikey_temporary', revoked: true }))

    await expect(withTemporaryClerkApiKey({
      clerkSecretKey: 'sk_live_server', expectedInstanceId: 'ins_expected', subject: 'user_acceptance', fetch,
      run: async () => undefined,
    })).rejects.toThrow()
    expect(fetch.mock.calls[3]?.[0]).toBe('https://api.clerk.com/v1/api_keys/apikey_temporary/revoke')
  })

  it('refuses an active user that is not the pinned acceptance principal', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'ins_expected', environment_type: 'production' }))
      .mockResolvedValueOnce(Response.json({
        ...acceptanceUser(),
        email_addresses: [{
          id: 'email_primary', email_address: 'another-user@example.com', verification: { status: 'verified' },
        }],
      }))

    await expect(withTemporaryClerkApiKey({
      clerkSecretKey: 'sk_live_server', expectedInstanceId: 'ins_expected', subject: 'user_acceptance', fetch,
      run: async () => undefined,
    })).rejects.toThrow('clerk_acceptance_subject_not_admitted')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('refuses the pinned primary email until Clerk marks it verified', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'ins_expected', environment_type: 'production' }))
      .mockResolvedValueOnce(Response.json({
        ...acceptanceUser(),
        email_addresses: [{
          id: 'email_primary', email_address: 'joel@agentic-economy.ai', verification: { status: 'unverified' },
        }],
      }))

    await expect(withTemporaryClerkApiKey({
      clerkSecretKey: 'sk_live_server', expectedInstanceId: 'ins_expected', subject: 'user_acceptance', fetch,
      run: async () => undefined,
    })).rejects.toThrow('clerk_acceptance_subject_not_admitted')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

function acceptanceUser() {
  return {
    id: 'user_acceptance', banned: false, locked: false,
    primary_email_address_id: 'email_primary',
    email_addresses: [{
      id: 'email_primary', email_address: 'joel@agentic-economy.ai', verification: { status: 'verified' },
    }],
  }
}
