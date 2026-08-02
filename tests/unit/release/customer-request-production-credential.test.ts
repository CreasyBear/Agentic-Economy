import { describe, expect, it, vi } from 'vitest'

import {
  type RuntimeSelectedClerkCredentials,
  withRuntimeSelectedClerkCredentials,
  withTemporaryClerkAcceptanceCredentials,
  withTemporaryClerkApiKey,
  withTemporaryClerkUserSession,
} from '../../../tools/release/customer-request-production-credential'

const RUNTIME_SCOPES = [
  'customer_requests:create',
  'customer_requests:approve_each',
  'work_trees:create',
  'work_trees:inspect',
  'work_trees:apply',
  'work_trees:decide',
] as const

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
      scopes: ['customer_requests:create'],
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
  it('selects a stable eligible Clerk candidate independent of API order and issues distinct pairs', async () => {
    const users = [
      { id: 'user_zeta', banned: false, locked: false },
      { id: 'user_disabled', disabled: true },
      { id: 'user_alpha', banned: false, locked: false },
      { id: 'user_locked', locked: true },
    ]
    const firstFetch = runtimeFetch(users)
    const first = await captureRuntimeCredentials(firstFetch, 'stable-seed')
    const secondFetch = runtimeFetch([...users].reverse())
    const second = await captureRuntimeCredentials(secondFetch, 'stable-seed')

    expect(second.selection).toEqual(first.selection)
    expect(first.selection).toMatchObject({
      seed: 'stable-seed',
      candidateCount: 2,
      selectedSubjectDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    })
    expect(first.creation.agentApiKey).not.toBe(first.readback.agentApiKey)
    expect(first.creation.agentKeyId).not.toBe(first.readback.agentKeyId)
    expect(JSON.stringify(first.selection)).not.toContain('user_')
    expect(JSON.stringify(first.selection)).not.toContain('session_token_')
    expect(JSON.stringify(first.selection)).not.toContain('api_secret_')
    expect(runtimeRevokeUrls(firstFetch)).toEqual([
      'https://api.clerk.com/v1/sessions/session_2/revoke',
      'https://api.clerk.com/v1/api_keys/key_2/revoke',
      'https://api.clerk.com/v1/sessions/session_1/revoke',
      'https://api.clerk.com/v1/api_keys/key_1/revoke',
    ])
    expect(firstFetch.mock.calls.filter(([url]) => String(url).endsWith('/api_keys')).map(([, init]) => {
      return JSON.parse(String(init?.body)).scopes
    })).toEqual([[...RUNTIME_SCOPES].sort(), [...RUNTIME_SCOPES].sort()])
  })

  it('generates a safe selection seed when none is supplied', async () => {
    const result = await captureRuntimeCredentials(runtimeFetch([{ id: 'user_runtime' }]))
    expect(result.selection.seed).toMatch(/^[0-9a-f-]{36}$/u)
    expect(result.selection.candidateCount).toBe(1)
  })

  it('refuses empty or ineligible runtime candidate sets without creating credentials', async () => {
    const fetch = runtimeFetch([
      { id: '', banned: false, locked: false },
      { id: 'user_banned', banned: true },
      { id: 'user_locked', locked: true },
      { id: 'user_disabled', disabled: true },
      { id: 'user_status_disabled', status: 'disabled' },
    ])

    await expect(captureRuntimeCredentials(fetch)).rejects.toThrow('clerk_candidate_selection_empty')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('fails closed when Clerk violates the bounded candidate response', async () => {
    const fetch = runtimeFetch(Array.from({ length: 101 }, (_, index) => ({ id: `user_${index}` })))

    await expect(captureRuntimeCredentials(fetch)).rejects.toThrow('clerk_candidate_list_bound_exceeded')
    expect(String(fetch.mock.calls[1]?.[0])).toContain('limit=100')
    expect(String(fetch.mock.calls[1]?.[0])).toContain('order_by=created_at')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('aggregates callback and every LIFO revocation failure', async () => {
    const fetch = runtimeFetch([{ id: 'user_runtime' }], {
      '/sessions/session_2/revoke': 503,
      '/api_keys/key_2/revoke': 502,
      '/sessions/session_1/revoke': 501,
      '/api_keys/key_1/revoke': 500,
    })

    await expect(withRuntimeSelectedClerkCredentials(runtimeInput(fetch), async () => {
      throw new Error('runtime journey failed')
    })).rejects.toSatisfy((error: unknown) => error instanceof AggregateError
      && error.errors.length === 5
      && error.errors[0] instanceof Error
      && error.errors[0].message === 'runtime journey failed'
      && error.errors.slice(1).every((item) => item instanceof Error
        && item.message.startsWith('clerk_temporary_')))
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

function runtimeInput(
  fetch: typeof globalThis.fetch,
  selectionSeed?: string,
): {
  clerkSecretKey: string
  clerkInstanceId: string
  scopes: readonly string[]
  keyNamePrefix: string
  sessionLifetimeSeconds: number
  fetch: typeof globalThis.fetch
  selectionSeed?: string
} {
  return {
    clerkSecretKey: 'sk_runtime_test',
    clerkInstanceId: 'ins_expected',
    scopes: RUNTIME_SCOPES,
    keyNamePrefix: 'T51 runtime test',
    sessionLifetimeSeconds: 600,
    fetch,
    ...(selectionSeed === undefined ? {} : { selectionSeed }),
  }
}

async function captureRuntimeCredentials(
  fetch: typeof globalThis.fetch,
  selectionSeed?: string,
): Promise<RuntimeSelectedClerkCredentials> {
  let captured: RuntimeSelectedClerkCredentials | undefined
  await withRuntimeSelectedClerkCredentials(runtimeInput(fetch, selectionSeed), async (credentials) => {
    captured = credentials
  })
  if (captured === undefined) throw new Error('runtime test callback did not receive credentials')
  return captured
}

function runtimeFetch(
  users: readonly unknown[],
  revocationStatuses: Readonly<Record<string, number>> = {},
) {
  let keyCount = 0
  let sessionCount = 0
  let tokenCount = 0
  return vi.fn<typeof globalThis.fetch>(async (input) => {
    const url = String(input)
    if (url.endsWith('/instance')) return Response.json({ id: 'ins_expected', environment_type: 'development' })
    if (url.includes('/users?')) return Response.json(users)
    if (url.endsWith('/api_keys')) {
      keyCount += 1
      return Response.json({ id: `key_${keyCount}`, secret: `api_secret_${keyCount}` })
    }
    if (url.endsWith('/sessions')) {
      sessionCount += 1
      return Response.json({ id: `session_${sessionCount}`, status: 'active' })
    }
    if (url.endsWith('/tokens')) {
      tokenCount += 1
      return Response.json({ jwt: `session_token_${tokenCount}` })
    }
    const status = Object.entries(revocationStatuses).find(([fragment]) => url.includes(fragment))?.[1] ?? 200
    return Response.json({ revoked: status < 300 }, { status })
  })
}

function runtimeRevokeUrls(fetch: { mock: { calls: readonly (readonly unknown[])[] } }): string[] {
  return fetch.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.endsWith('/revoke'))
}
