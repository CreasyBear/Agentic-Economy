import { describe, expect, it, vi } from 'vitest'

import {
  withTemporaryClerkAcceptanceCredentials,
  withTemporaryClerkApiKey,
  withTemporaryClerkUserSession,
} from '../../../tools/release/customer-request-production-credential'

describe('production cold-agent credential', () => {
  it('issues and revokes a temporary session for an exact verified business test identity', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'ins_expected', environment_type: 'development' }))
      .mockResolvedValueOnce(Response.json({
        ...acceptanceUser(),
        id: 'user_business',
        email_addresses: [{
          id: 'email_primary',
          email_address: 'business@example.com',
          verification: { status: 'verified' },
        }],
      }))
      .mockResolvedValueOnce(Response.json({ id: 'sess_business', status: 'active' }))
      .mockResolvedValueOnce(Response.json({ jwt: 'business_session_jwt' }))
      .mockResolvedValueOnce(Response.json({ id: 'sess_business', status: 'revoked' }))
    const run = vi.fn(async (_sessionToken: string) => undefined)

    await expect(withTemporaryClerkUserSession({
      clerkSecretKey: 'sk_test_server',
      expectedInstanceId: 'ins_expected',
      subject: 'user_business',
      expectedPrimaryEmail: 'business@example.com',
      fetch,
      run,
    })).resolves.toBeUndefined()

    expect(run).toHaveBeenCalledExactlyOnceWith('business_session_jwt')
    expect(fetch.mock.calls[4]?.[0]).toBe('https://api.clerk.com/v1/sessions/sess_business/revoke')
  })

  it('revokes a created business session when token issuance fails', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'ins_expected', environment_type: 'development' }))
      .mockResolvedValueOnce(Response.json({
        ...acceptanceUser(),
        id: 'user_business',
        email_addresses: [{
          id: 'email_primary',
          email_address: 'business@example.com',
          verification: { status: 'verified' },
        }],
      }))
      .mockResolvedValueOnce(Response.json({ id: 'sess_business', status: 'active' }))
      .mockResolvedValueOnce(Response.json({ error: 'token unavailable' }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ id: 'sess_business', status: 'revoked' }))

    await expect(withTemporaryClerkUserSession({
      clerkSecretKey: 'sk_test_server',
      expectedInstanceId: 'ins_expected',
      subject: 'user_business',
      expectedPrimaryEmail: 'business@example.com',
      fetch,
      run: async () => undefined,
    })).rejects.toThrow('clerk_temporary_session_token_failed:503')

    expect(fetch.mock.calls[4]?.[0]).toBe('https://api.clerk.com/v1/sessions/sess_business/revoke')
  })

  it('creates independent agent and customer credentials and revokes both after the journey', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'ins_expected', environment_type: 'development' }))
      .mockResolvedValueOnce(Response.json(acceptanceUser()))
      .mockResolvedValueOnce(Response.json({ id: 'apikey_temporary', secret: 'ak_temporary_secret' }))
      .mockResolvedValueOnce(Response.json({ id: 'sess_temporary', status: 'active' }))
      .mockResolvedValueOnce(Response.json({ jwt: 'customer_session_jwt' }))
      .mockResolvedValueOnce(Response.json({ id: 'sess_temporary', status: 'revoked' }))
      .mockResolvedValueOnce(Response.json({ id: 'apikey_temporary', revoked: true }))
    const run = vi.fn(async (credentials: Readonly<{
      agentApiKey: string
      issueCustomerSessionToken: () => Promise<string>
    }>) => {
      expect(fetch).toHaveBeenCalledTimes(3)
      expect(await credentials.issueCustomerSessionToken()).toBe('customer_session_jwt')
    })

    await expect(withTemporaryClerkAcceptanceCredentials({
      clerkSecretKey: 'sk_test_server', expectedInstanceId: 'ins_expected', subject: 'user_acceptance', fetch, run,
    })).resolves.toBeUndefined()

    expect(run).toHaveBeenCalledOnce()
    expect(run.mock.calls[0]?.[0].agentApiKey).toBe('ak_temporary_secret')
    expect(fetch.mock.calls[3]?.[0]).toBe('https://api.clerk.com/v1/sessions')
    expect(fetch.mock.calls[4]?.[0]).toBe('https://api.clerk.com/v1/sessions/sess_temporary/tokens')
    expect(fetch.mock.calls[5]?.[0]).toBe('https://api.clerk.com/v1/sessions/sess_temporary/revoke')
    expect(fetch.mock.calls[6]?.[0]).toBe('https://api.clerk.com/v1/api_keys/apikey_temporary/revoke')
  })

  it('revokes both credentials when Clerk returns a created session with malformed metadata', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'ins_expected', environment_type: 'development' }))
      .mockResolvedValueOnce(Response.json(acceptanceUser()))
      .mockResolvedValueOnce(Response.json({ id: 'apikey_temporary', secret: 'ak_temporary_secret' }))
      .mockResolvedValueOnce(Response.json({ id: 'sess_temporary' }))
      .mockResolvedValueOnce(Response.json({ id: 'sess_temporary', status: 'revoked' }))
      .mockResolvedValueOnce(Response.json({ id: 'apikey_temporary', revoked: true }))

    await expect(withTemporaryClerkAcceptanceCredentials({
      clerkSecretKey: 'sk_test_server', expectedInstanceId: 'ins_expected', subject: 'user_acceptance', fetch,
      run: async ({ issueCustomerSessionToken }) => { await issueCustomerSessionToken() },
    })).rejects.toThrow()

    expect(fetch.mock.calls[4]?.[0]).toBe('https://api.clerk.com/v1/sessions/sess_temporary/revoke')
    expect(fetch.mock.calls[5]?.[0]).toBe('https://api.clerk.com/v1/api_keys/apikey_temporary/revoke')
  })

  it('validates the Clerk instance, creates one scoped temporary key, runs the journey, and revokes it', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'ins_expected', environment_type: 'development' }))
      .mockResolvedValueOnce(Response.json(acceptanceUser()))
      .mockResolvedValueOnce(Response.json({ id: 'apikey_temporary', secret: 'ak_temporary_secret' }))
      .mockResolvedValueOnce(Response.json({ id: 'apikey_temporary', revoked: true }))
    const run = vi.fn(async (_apiKey: string, _identity: Readonly<{ credentialId: string }>) => undefined)

    await expect(withTemporaryClerkApiKey({
      clerkSecretKey: 'sk_test_server', expectedInstanceId: 'ins_expected', subject: 'user_acceptance', fetch, run,
    })).resolves.toBeUndefined()

    expect(run).toHaveBeenCalledExactlyOnceWith('ak_temporary_secret', {
      credentialId: 'apikey_temporary',
    })
    expect(fetch.mock.calls[2]?.[1]).toMatchObject({
      method: 'POST',
      body: expect.stringContaining('customer_requests:create'),
    })
    expect(JSON.parse(String(fetch.mock.calls[2]?.[1]?.body))).toMatchObject({
      name: expect.stringMatching(/^AE production cold-agent acceptance [0-9a-f-]{36}$/),
    })
    expect(String(fetch.mock.calls[2]?.[1]?.body)).not.toContain('created_by')
    expect(fetch.mock.calls[3]?.[0]).toBe('https://api.clerk.com/v1/api_keys/apikey_temporary/revoke')
  })

  it('issues exactly the additional scopes required by a bounded acceptance journey', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'ins_expected', environment_type: 'development' }))
      .mockResolvedValueOnce(Response.json(acceptanceUser()))
      .mockResolvedValueOnce(Response.json({ id: 'apikey_temporary', secret: 'ak_temporary_secret' }))
      .mockResolvedValueOnce(Response.json({ id: 'apikey_temporary', revoked: true }))

    await expect(withTemporaryClerkApiKey({
      clerkSecretKey: 'sk_test_server',
      expectedInstanceId: 'ins_expected',
      subject: 'user_acceptance',
      scopes: ['customer_requests:create', 'customer_requests:standing_authority'],
      fetch,
      run: async () => undefined,
    })).resolves.toBeUndefined()

    expect(JSON.parse(String(fetch.mock.calls[2]?.[1]?.body))).toMatchObject({
      scopes: ['customer_requests:create', 'customer_requests:standing_authority'],
    })
  })

  it('issues a paid-operation key with only its required scope and no Customer Request authority', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'ins_expected', environment_type: 'development' }))
      .mockResolvedValueOnce(Response.json(acceptanceUser()))
      .mockResolvedValueOnce(Response.json({ id: 'apikey_paid', secret: 'ak_paid_secret' }))
      .mockResolvedValueOnce(Response.json({ id: 'apikey_paid', revoked: true }))

    await expect(withTemporaryClerkApiKey({
      clerkSecretKey: 'sk_test_server',
      expectedInstanceId: 'ins_expected',
      subject: 'user_acceptance',
      requiredScope: 'paid_operation:invoke',
      scopes: ['paid_operation:invoke', 'paid_operation:invoke'],
      fetch,
      run: async () => undefined,
    })).resolves.toBeUndefined()

    expect(JSON.parse(String(fetch.mock.calls[2]?.[1]?.body))).toMatchObject({
      scopes: ['paid_operation:invoke'],
    })
    expect(String(fetch.mock.calls[2]?.[1]?.body)).not.toContain('customer_requests:')
    expect(fetch.mock.calls[3]?.[0]).toBe('https://api.clerk.com/v1/api_keys/apikey_paid/revoke')
  })

  it('rejects broad, unrelated, malformed, or oversized paid-operation scope escalation', async () => {
    const invalidScopeSets = [
      ['paid_operation:invoke', 'customer_requests:create'],
      ['paid_operation:invoke', 'paid_operation:admin'],
      ['paid_operation:*'],
      ['paid_operation:invoke', ...Array.from({ length: 32 }, (_, index) => `other_${index}:read`)],
    ] as const

    for (const scopes of invalidScopeSets) {
      const fetch = vi.fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(Response.json({ id: 'ins_expected', environment_type: 'development' }))
        .mockResolvedValueOnce(Response.json(acceptanceUser()))

      await expect(withTemporaryClerkApiKey({
        clerkSecretKey: 'sk_test_server',
        expectedInstanceId: 'ins_expected',
        subject: 'user_acceptance',
        requiredScope: 'paid_operation:invoke',
        scopes,
        fetch,
        run: async () => undefined,
      })).rejects.toThrow('temporary_agent_key_scopes_invalid')
      expect(fetch).toHaveBeenCalledTimes(2)
    }
  })

  it('rejects an unsupported required scope before creating a temporary key', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ id: 'ins_expected', environment_type: 'development' }))
      .mockResolvedValueOnce(Response.json(acceptanceUser()))

    await expect(withTemporaryClerkApiKey({
      clerkSecretKey: 'sk_test_server',
      expectedInstanceId: 'ins_expected',
      subject: 'user_acceptance',
      requiredScope: 'administration:write',
      scopes: ['administration:write'],
      fetch,
      run: async () => undefined,
    })).rejects.toThrow('temporary_agent_key_scopes_invalid')
    expect(fetch).toHaveBeenCalledTimes(2)
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
