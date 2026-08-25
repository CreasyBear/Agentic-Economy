import { describe, expect, it, vi } from 'vitest'

import {
  InfisicalCloudSecretStore,
  SecretPlane,
  SecretPlaneError,
  secretGeneration,
  secretRef,
  withEphemeralSecretMaterial,
  type OidcIdentityTokenProvider,
  type SecretGenerationCreation,
  type SecretGenerationValidator,
  type SecretMaterialLease,
  type SecretPointer,
  type SecretPointerAdvanceRequest,
  type SecretPointerStore,
} from '../../../src/modules/secrets/public'

const REF = secretRef('sec_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
const ACTIVE_GENERATION = secretGeneration('sgn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
const GENERATION = secretGeneration('sgn_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
const FRESH_GENERATION = secretGeneration('sgn_cccccccccccccccccccccccccccccccc')
const TARGET = Object.freeze({ secretRef: REF, generation: GENERATION })
const CANARY = 'vault-canary-never-observable'

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function createHarness(responder?: (request: Request) => Response | Promise<Response>) {
  let now = 10_000
  const requests: Request[] = []
  const identity: OidcIdentityTokenProvider = {
    getIdentityToken: vi.fn(async () => ({ jwt: 'signed-workload-assertion', expiresAt: now + 60_000 })),
  }
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    requests.push(request)
    if (responder !== undefined) return await responder(request)
    if (request.url.endsWith('/api/v1/auth/oidc-auth/login')) {
      return json({ accessToken: 'short-lived-access', expiresIn: 120, accessTokenMaxTTL: 120, tokenType: 'Bearer' })
    }
    if (request.method === 'GET') {
      return json({
        secret: {
          secretKey: `${REF}--${GENERATION}`,
          secretValue: CANARY,
          environment: 'production',
          workspace: 'customer-connectors',
        },
      })
    }
    return json({
      secret: {
        id: 'created-secret-id',
        version: 1,
        secretKey: `${REF}--${GENERATION}`,
        environment: 'production',
        workspace: 'customer-connectors',
      },
    })
  })
  const store = new InfisicalCloudSecretStore({
    baseUrl: 'https://us.infisical.com',
    projectId: 'customer-connectors',
    environment: 'production',
    secretPath: '/agentic-economy',
    machineIdentityId: 'machine-identity',
    organizationSlug: 'agentic-economy',
    identityTokenProvider: identity,
    fetch: fetcher as typeof fetch,
    now: () => now,
  })
  return { store, identity, fetcher, requests, advance: (milliseconds: number) => (now += milliseconds) }
}

describe('InfisicalCloudSecretStore', () => {
  it('exchanges an OIDC assertion for a short-lived token and performs real v4 secret HTTP operations', async () => {
    const context = createHarness()
    let matched = false
    let creation: SecretGenerationCreation | undefined

    await withEphemeralSecretMaterial(new TextEncoder().encode(CANARY), async (material) => {
      creation = await context.store.createGeneration(TARGET, material)
    })
    await context.store.withSecret(TARGET, async (lease) => {
      expect(lease.byteLength).toBe(CANARY.length)
      await lease.useBytes(async (bytes) => {
        matched = new TextDecoder().decode(bytes) === CANARY
      })
    })
    expect(creation?.kind).toBe('created')
    if (creation?.kind !== 'created') throw new Error('expected created generation')
    await creation.discard()

    expect(matched).toBe(true)
    expect(context.identity.getIdentityToken).toHaveBeenCalledTimes(1)
    expect(context.requests).toHaveLength(4)

    const login = context.requests[0]!
    expect(login.method).toBe('POST')
    expect(login.redirect).toBe('error')
    expect(await login.clone().json()).toEqual({
      identityId: 'machine-identity',
      jwt: 'signed-workload-assertion',
      organizationSlug: 'agentic-economy',
    })

    const create = context.requests[1]!
    expect(create.method).toBe('POST')
    expect(create.redirect).toBe('error')
    expect(create.headers.get('authorization')).toBe('Bearer short-lived-access')
    expect(create.signal).toBeInstanceOf(AbortSignal)
    expect(new URL(create.url).pathname).toBe(`/api/v4/secrets/${REF}--${GENERATION}`)
    expect(await create.clone().json()).toEqual({
      projectId: 'customer-connectors',
      environment: 'production',
      secretValue: CANARY,
      secretPath: '/agentic-economy',
      type: 'shared',
      skipMultilineEncoding: true,
    })

    const read = context.requests[2]!
    expect(read.method).toBe('GET')
    expect(read.redirect).toBe('error')
    expect(Object.fromEntries(new URL(read.url).searchParams)).toEqual({
      projectId: 'customer-connectors',
      environment: 'production',
      secretPath: '/agentic-economy',
      type: 'shared',
      viewSecretValue: 'true',
      expandSecretReferences: 'false',
    })

    const remove = context.requests[3]!
    expect(remove.method).toBe('DELETE')
    expect(remove.redirect).toBe('error')
    expect(await remove.clone().json()).toEqual({
      projectId: 'customer-connectors',
      environment: 'production',
      secretPath: '/agentic-economy',
      type: 'shared',
    })
  })

  it('refreshes expired access tokens and invalidates rejected tokens without exposing provider bodies', async () => {
    let loginCount = 0
    const context = createHarness(async (request) => {
      if (request.url.endsWith('/api/v1/auth/oidc-auth/login')) {
        loginCount += 1
        return json({ accessToken: `access-${loginCount}`, expiresIn: 60, accessTokenMaxTTL: 60, tokenType: 'Bearer' })
      }
      if (request.headers.get('authorization') === 'Bearer access-2') {
        return new Response(`denied ${CANARY}`, { status: 401 })
      }
      return json({ secret: { secretKey: `${REF}--${GENERATION}`, secretValue: CANARY, environment: 'production', workspace: 'customer-connectors' } })
    })

    await context.store.withSecret(TARGET, async () => undefined)
    context.advance(56_000)
    await expect(context.store.withSecret(TARGET, async () => undefined)).rejects.toMatchObject({
      code: 'secret_store_authentication_failed',
      message: 'Secret storage authentication failed.',
    })
    await context.store.withSecret(TARGET, async () => undefined)

    expect(loginCount).toBe(3)
    await expect(context.store.withSecret(TARGET, async () => {
      throw new Error(CANARY)
    })).rejects.not.toSatisfy((error: unknown) => JSON.stringify(error).includes(CANARY))
  })

  it('expires escaped leases and clears their in-memory bytes after the callback', async () => {
    const context = createHarness()
    let escaped: SecretMaterialLease | undefined
    let escapedBytes: Uint8Array | undefined
    let matchedInsideScope = false
    let callbackReturn: unknown = 'not-called'
    await context.store.withSecret(TARGET, async (lease) => {
      escaped = lease
      callbackReturn = await lease.useBytes(async (bytes) => {
        escapedBytes = bytes
        matchedInsideScope = new TextDecoder().decode(bytes) === CANARY
        return bytes as never
      })
    })

    expect(matchedInsideScope).toBe(true)
    expect(callbackReturn).toBeUndefined()
    expect(escapedBytes).toBeDefined()
    expect(escapedBytes?.every((byte) => byte === 0)).toBe(true)
    expect(() => escaped?.byteLength).toThrowError('Secret material is no longer available.')
    await expect(escaped?.useBytes(async () => undefined)).rejects.toMatchObject({ code: 'secret_lease_expired' })
  })

  it('rejects unsafe or incomplete configuration without consulting environment projections', () => {
    const identityTokenProvider: OidcIdentityTokenProvider = {
      getIdentityToken: async () => ({ jwt: 'jwt', expiresAt: Date.now() + 10_000 }),
    }
    const valid = {
      baseUrl: 'https://us.infisical.com',
      projectId: 'project',
      environment: 'prod',
      secretPath: '/',
      machineIdentityId: 'identity',
      identityTokenProvider,
      fetch: vi.fn() as unknown as typeof fetch,
      now: () => 0,
    }
    for (const baseUrl of ['http://us.infisical.com', 'https://user@us.infisical.com', 'https://user:pass@us.infisical.com']) {
      expect(() => new InfisicalCloudSecretStore({ ...valid, baseUrl })).toThrowError('Infisical Cloud base URL must be an HTTPS origin')
    }
    for (const field of ['projectId', 'environment', 'secretPath', 'machineIdentityId', 'organizationSlug'] as const) {
      expect(() => new InfisicalCloudSecretStore({ ...valid, [field]: ' ' })).toThrowError(`${field} must not be empty`)
    }
    expect(() => new InfisicalCloudSecretStore({ ...valid, tokenRefreshSkewMs: -1 })).toThrowError('Infisical Cloud token lifetime configuration is invalid')
    expect(() => new InfisicalCloudSecretStore({ ...valid, maximumAccessTokenTtlMs: 0 })).toThrowError('Infisical Cloud token lifetime configuration is invalid')
    expect(() => new InfisicalCloudSecretStore({ ...valid, requestTimeoutMs: 0 })).toThrowError('Infisical Cloud token lifetime configuration is invalid')
    for (const tokenRefreshSkewMs of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new InfisicalCloudSecretStore({ ...valid, tokenRefreshSkewMs })).toThrowError('Infisical Cloud token lifetime configuration is invalid')
    }
    for (const maximumAccessTokenTtlMs of [Number.NaN, Number.POSITIVE_INFINITY, 7_200_001]) {
      expect(() => new InfisicalCloudSecretStore({ ...valid, maximumAccessTokenTtlMs })).toThrowError('Infisical Cloud token lifetime configuration is invalid')
    }
    for (const requestTimeoutMs of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new InfisicalCloudSecretStore({ ...valid, requestTimeoutMs })).toThrowError('Infisical Cloud token lifetime configuration is invalid')
    }

    expect(() => new InfisicalCloudSecretStore({
      baseUrl: 'https://us.infisical.com/path-is-normalized',
      projectId: 'project',
      environment: 'prod',
      secretPath: '/',
      machineIdentityId: 'identity',
      identityTokenProvider,
    })).not.toThrow()
  })

  it('fails closed and redacts every identity, login and vault provider outage body', async () => {
    const identityFailure = createHarness()
    vi.mocked(identityFailure.identity.getIdentityToken).mockRejectedValueOnce(new Error(CANARY))
    await expect(identityFailure.store.withSecret(TARGET, async () => undefined)).rejects.toEqual(
      new SecretPlaneError('secret_store_authentication_failed'),
    )

    const loginNetwork = createHarness(async () => {
      throw new Error(CANARY)
    })
    await expect(loginNetwork.store.withSecret(TARGET, async () => undefined)).rejects.toEqual(
      new SecretPlaneError('secret_store_authentication_failed'),
    )

    const loginDenied = createHarness(async () => new Response(CANARY, { status: 403 }))
    await expect(loginDenied.store.withSecret(TARGET, async () => undefined)).rejects.toEqual(
      new SecretPlaneError('secret_store_authentication_failed'),
    )

    for (const failure of ['network', 'status'] as const) {
      const context = createHarness(async (request) => {
        if (request.url.endsWith('/api/v1/auth/oidc-auth/login')) {
          return json({ accessToken: 'access', expiresIn: 60, accessTokenMaxTTL: 60, tokenType: 'Bearer' })
        }
        if (failure === 'network') throw new Error(CANARY)
        return new Response(CANARY, { status: 500 })
      })
      await expect(context.store.withSecret(TARGET, async () => undefined)).rejects.toSatisfy((error: unknown) => {
        return error instanceof SecretPlaneError &&
          error.code === 'secret_store_unavailable' &&
          !JSON.stringify(error).includes(CANARY)
      })
    }
  })

  it('rejects expired or malformed OIDC assertions before sending them to Infisical', async () => {
    const invalidTokens: unknown[] = [
      { jwt: 42, expiresAt: 100_000 },
      { jwt: '', expiresAt: 100_000 },
      { jwt: 'jwt', expiresAt: Number.NaN },
      { jwt: 'jwt', expiresAt: 15_000 },
    ]
    for (const token of invalidTokens) {
      const context = createHarness()
      vi.mocked(context.identity.getIdentityToken).mockResolvedValueOnce(token as never)
      await expect(context.store.withSecret(TARGET, async () => undefined)).rejects.toEqual(
        new SecretPlaneError('secret_store_authentication_failed'),
      )
      expect(context.fetcher).not.toHaveBeenCalled()
    }
  })

  it('rejects malformed, overlong and incorrectly typed Infisical access tokens', async () => {
    const invalidPayloads: unknown[] = [
      null,
      { accessToken: 1, expiresIn: 60, accessTokenMaxTTL: 60, tokenType: 'Bearer' },
      { accessToken: '', expiresIn: 60, accessTokenMaxTTL: 60, tokenType: 'Bearer' },
      { accessToken: 'access token\nleak', expiresIn: 60, accessTokenMaxTTL: 60, tokenType: 'Bearer' },
      { accessToken: 'access', expiresIn: 60, accessTokenMaxTTL: 60, tokenType: 'bearer' },
      { accessToken: 'access', expiresIn: '60', accessTokenMaxTTL: 60, tokenType: 'Bearer' },
      { accessToken: 'access', expiresIn: Number.NaN, accessTokenMaxTTL: 60, tokenType: 'Bearer' },
      { accessToken: 'access', expiresIn: 5, accessTokenMaxTTL: 60, tokenType: 'Bearer' },
      { accessToken: 'access', expiresIn: 7_201, accessTokenMaxTTL: 7_201, tokenType: 'Bearer' },
      { accessToken: 'access', expiresIn: 60, accessTokenMaxTTL: '60', tokenType: 'Bearer' },
      { accessToken: 'access', expiresIn: 60, accessTokenMaxTTL: Number.NaN, tokenType: 'Bearer' },
      { accessToken: 'access', expiresIn: 60, accessTokenMaxTTL: 59, tokenType: 'Bearer' },
    ]
    for (const payload of invalidPayloads) {
      const context = createHarness(async () => ({
        ok: true,
        status: 200,
        json: async () => payload,
      } as Response))
      await expect(context.store.withSecret(TARGET, async () => undefined)).rejects.toEqual(
        new SecretPlaneError('secret_store_authentication_failed'),
      )
    }

    const invalidJson = createHarness(async () => new Response('{', { status: 200 }))
    await expect(invalidJson.store.withSecret(TARGET, async () => undefined)).rejects.toEqual(
      new SecretPlaneError('secret_store_authentication_failed'),
    )
  })

  it('rejects every malformed secret response without exposing provider material', async () => {
    const invalidSecrets: unknown[] = [
      null,
      { secret: [] },
      { secret: { secretKey: 'wrong', environment: 'production', workspace: 'customer-connectors', secretValue: CANARY } },
      { secret: { secretKey: `${REF}--${GENERATION}`, environment: 'wrong', workspace: 'customer-connectors', secretValue: CANARY } },
      { secret: { secretKey: `${REF}--${GENERATION}`, environment: 'production', workspace: 'wrong', secretValue: CANARY } },
      { secret: { secretKey: `${REF}--${GENERATION}`, environment: 'production', workspace: 'customer-connectors', secretValue: 42 } },
    ]
    for (const payload of invalidSecrets) {
      const context = createHarness(async (request) => {
        if (request.url.endsWith('/api/v1/auth/oidc-auth/login')) {
          return json({ accessToken: 'access', expiresIn: 60, accessTokenMaxTTL: 60, tokenType: 'Bearer' })
        }
        return { ok: true, status: 200, json: async () => payload } as Response
      })
      await expect(context.store.withSecret(TARGET, async () => undefined)).rejects.toSatisfy((error: unknown) => {
        return error instanceof SecretPlaneError &&
          error.code === 'secret_store_invalid_response' &&
          !JSON.stringify(error).includes(CANARY)
      })
    }

    const invalidJson = createHarness(async (request) => request.url.endsWith('/api/v1/auth/oidc-auth/login')
      ? json({ accessToken: 'access', expiresIn: 60, accessTokenMaxTTL: 60, tokenType: 'Bearer' })
      : new Response('{', { status: 200 }))
    await expect(invalidJson.store.withSecret(TARGET, async () => undefined)).rejects.toEqual(
      new SecretPlaneError('secret_store_invalid_response'),
    )
  })

  it('preserves fixed lease failures, sanitizes consumers, and rejects unreadable material sources', async () => {
    const context = createHarness()
    await expect(context.store.withSecret(TARGET, async () => {
      throw new SecretPlaneError('secret_lease_expired')
    })).rejects.toEqual(new SecretPlaneError('secret_lease_expired'))
    await expect(context.store.withSecret(TARGET, async () => {
      throw new Error(CANARY)
    })).rejects.toEqual(new SecretPlaneError('secret_operation_failed'))

    await expect(context.store.createGeneration(TARGET, {
      byteLength: 1,
      useBytes: async () => {
        throw new Error(CANARY)
      },
    })).rejects.toEqual(new SecretPlaneError('invalid_secret_material'))
    await expect(context.store.createGeneration(TARGET, {
      byteLength: 1,
      useBytes: async () => {
        throw new SecretPlaneError('secret_lease_expired')
      },
    })).rejects.toEqual(new SecretPlaneError('secret_lease_expired'))
    await expect(context.store.createGeneration(TARGET, {
      byteLength: 0,
      useBytes: async () => undefined,
    })).rejects.toEqual(new SecretPlaneError('secret_store_invalid_response'))
  })

  it('deduplicates concurrent token acquisition and fails both in-flight requests closed on 401/403', async () => {
    let resolveLogin: ((response: Response) => void) | undefined
    const loginResponse = new Promise<Response>((resolve) => {
      resolveLogin = resolve
    })
    let protectedCount = 0
    const context = createHarness(async (request) => {
      if (request.url.endsWith('/api/v1/auth/oidc-auth/login')) return await loginResponse
      protectedCount += 1
      return new Response(CANARY, { status: protectedCount === 1 ? 401 : 403 })
    })

    const first = context.store.withSecret(TARGET, async () => undefined)
    const second = context.store.withSecret(TARGET, async () => undefined)
    await vi.waitFor(() => expect(context.identity.getIdentityToken).toHaveBeenCalledTimes(1))
    resolveLogin?.(json({ accessToken: 'shared', expiresIn: 60, accessTokenMaxTTL: 60, tokenType: 'Bearer' }))
    const results = await Promise.allSettled([first, second])
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected'])
    expect(context.identity.getIdentityToken).toHaveBeenCalledTimes(1)
  })

  it('omits organization scope when absent and accepts explicit zero refresh skew', async () => {
    let loginBody: unknown
    const store = new InfisicalCloudSecretStore({
      baseUrl: 'https://us.infisical.com',
      projectId: 'customer-connectors',
      environment: 'production',
      secretPath: '/',
      machineIdentityId: 'machine',
      identityTokenProvider: { getIdentityToken: async () => ({ jwt: 'jwt', expiresAt: 100_000 }) },
      fetch: vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const request = new Request(input, init)
        if (request.url.endsWith('/api/v1/auth/oidc-auth/login')) {
          loginBody = await request.json()
          return json({ accessToken: 'access', expiresIn: 1, accessTokenMaxTTL: 1, tokenType: 'Bearer' })
        }
        return json({ secret: { secretKey: `${REF}--${GENERATION}`, secretValue: CANARY, environment: 'production', workspace: 'customer-connectors' } })
      }) as typeof fetch,
      now: () => 0,
      tokenRefreshSkewMs: 0,
      maximumAccessTokenTtlMs: 1_000,
    })
    await store.withSecret(TARGET, async () => undefined)
    expect(loginBody).toEqual({ identityId: 'machine', jwt: 'jwt' })
  })

  it('bounds a hung Infisical login and fails closed without admitting a vault callback', async () => {
    const store = new InfisicalCloudSecretStore({
      baseUrl: 'https://us.infisical.com',
      projectId: 'customer-connectors',
      environment: 'production',
      secretPath: '/',
      machineIdentityId: 'machine',
      identityTokenProvider: { getIdentityToken: async () => ({ jwt: 'jwt', expiresAt: 100_000 }) },
      fetch: vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        await new Promise<void>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error(CANARY)), { once: true })
        })
        throw new Error('unreachable')
      }) as typeof fetch,
      now: () => 0,
      requestTimeoutMs: 1,
    })
    let admitted = false
    await expect(store.withSecret(TARGET, async () => {
      admitted = true
    })).rejects.toEqual(new SecretPlaneError('secret_store_authentication_failed'))
    expect(admitted).toBe(false)
  })

  it('fails closed on cross-origin redirects without forwarding OIDC assertions or secret writes', async () => {
    const loginRedirect = createHarness(async () => new Response(CANARY, {
      status: 302,
      headers: { location: 'https://attacker.invalid/oidc' },
    }))
    await expect(loginRedirect.store.withSecret(TARGET, async () => undefined)).rejects.toEqual(
      new SecretPlaneError('secret_store_authentication_failed'),
    )
    expect(loginRedirect.requests).toHaveLength(1)
    expect(loginRedirect.requests[0]?.redirect).toBe('error')

    const vaultRedirect = createHarness(async (request) => {
      if (request.url.endsWith('/api/v1/auth/oidc-auth/login')) {
        return json({ accessToken: 'access', expiresIn: 60, accessTokenMaxTTL: 60, tokenType: 'Bearer' })
      }
      return new Response(CANARY, {
        status: 307,
        headers: { location: 'https://attacker.invalid/vault' },
      })
    })
    await expect(withEphemeralSecretMaterial(new TextEncoder().encode(CANARY), async (material) => {
      await vaultRedirect.store.createGeneration(TARGET, material)
    })).rejects.toEqual(new SecretPlaneError('secret_store_unavailable'))
    expect(vaultRedirect.requests).toHaveLength(2)
    expect(vaultRedirect.requests[1]?.redirect).toBe('error')
  })

  it('times out ignored identity acquisition, clears the shared promise, and recovers on retry', async () => {
    let attempts = 0
    const identityTokenProvider: OidcIdentityTokenProvider = {
      getIdentityToken: async () => {
        attempts += 1
        if (attempts === 1) return await new Promise(() => undefined)
        return { jwt: 'retry-jwt', expiresAt: 100_000 }
      },
    }
    const store = new InfisicalCloudSecretStore({
      baseUrl: 'https://us.infisical.com',
      projectId: 'customer-connectors',
      environment: 'production',
      secretPath: '/',
      machineIdentityId: 'machine',
      identityTokenProvider,
      fetch: vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const request = new Request(input, init)
        if (request.url.endsWith('/api/v1/auth/oidc-auth/login')) {
          return json({ accessToken: 'recovered', expiresIn: 60, accessTokenMaxTTL: 60, tokenType: 'Bearer' })
        }
        return json({ secret: { secretKey: `${REF}--${GENERATION}`, secretValue: CANARY, environment: 'production', workspace: 'customer-connectors' } })
      }) as typeof fetch,
      now: () => 0,
      requestTimeoutMs: 1,
    })

    await expect(store.withSecret(TARGET, async () => undefined)).rejects.toEqual(
      new SecretPlaneError('secret_store_authentication_failed'),
    )
    let matched = false
    await store.withSecret(TARGET, async (lease) => {
      await lease.useBytes(async (bytes) => {
        matched = new TextDecoder().decode(bytes) === CANARY
      })
    })
    expect(matched).toBe(true)
    expect(attempts).toBe(2)
  })

  it('reports an existing generation without issuing deletion authority', async () => {
    const context = createHarness(async (request) => {
      if (request.url.endsWith('/api/v1/auth/oidc-auth/login')) {
        return json({ accessToken: 'access', expiresIn: 60, accessTokenMaxTTL: 60, tokenType: 'Bearer' })
      }
      return new Response(CANARY, { status: 409 })
    })
    let creation: SecretGenerationCreation | undefined
    await withEphemeralSecretMaterial(new TextEncoder().encode('replacement'), async (material) => {
      creation = await context.store.createGeneration(TARGET, material)
    })
    expect(creation).toEqual({ kind: 'already-exists' })
    expect(context.requests.map((request) => request.method)).toEqual(['POST', 'POST'])
  })

  it('recognizes only the exact Infisical v4 BadRequest duplicate response', async () => {
    const duplicate = createHarness(async (request) => {
      if (request.url.endsWith('/api/v1/auth/oidc-auth/login')) {
        return json({ accessToken: 'access', expiresIn: 60, accessTokenMaxTTL: 60, tokenType: 'Bearer' })
      }
      return json({ statusCode: 400, error: 'BadRequest', message: 'Secret already exists' }, 400)
    })
    let creation: SecretGenerationCreation | undefined
    await withEphemeralSecretMaterial(new TextEncoder().encode('replacement'), async (material) => {
      creation = await duplicate.store.createGeneration(TARGET, material)
    })
    expect(creation).toEqual({ kind: 'already-exists' })
    expect(duplicate.requests.map((request) => request.method)).toEqual(['POST', 'POST'])

    for (const body of [
      { statusCode: 400, error: 'Bad Request', message: 'Secret already exists' },
      { statusCode: 400, error: 'Bad Request', message: `Secret already exists: ${CANARY}` },
      { statusCode: 400, error: 'Validation Error', message: 'Secret already exists' },
      { statusCode: 409, error: 'Bad Request', message: 'Secret already exists' },
    ]) {
      const arbitraryBadRequest = createHarness(async (request) => {
        if (request.url.endsWith('/api/v1/auth/oidc-auth/login')) {
          return json({ accessToken: 'access', expiresIn: 60, accessTokenMaxTTL: 60, tokenType: 'Bearer' })
        }
        return json(body, 400)
      })
      await expect(withEphemeralSecretMaterial(new TextEncoder().encode('replacement'), async (material) => {
        await arbitraryBadRequest.store.createGeneration(TARGET, material)
      })).rejects.toSatisfy((error: unknown) => error instanceof SecretPlaneError &&
        error.code === 'secret_store_unavailable' &&
        !JSON.stringify(error).includes(CANARY))
      expect(arbitraryBadRequest.requests.map((request) => request.method)).toEqual(['POST', 'POST'])
    }

    for (const makeResponse of [
      () => new Response('Secret already exists', { status: 400 }),
      () => new Response('{', { status: 400, headers: { 'content-type': 'application/json' } }),
    ]) {
      const unprovenBadRequest = createHarness(async (request) => {
        if (request.url.endsWith('/api/v1/auth/oidc-auth/login')) {
          return json({ accessToken: 'access', expiresIn: 60, accessTokenMaxTTL: 60, tokenType: 'Bearer' })
        }
        return makeResponse()
      })
      await expect(withEphemeralSecretMaterial(new TextEncoder().encode('replacement'), async (material) => {
        await unprovenBadRequest.store.createGeneration(TARGET, material)
      })).rejects.toEqual(new SecretPlaneError('secret_store_unavailable'))
      expect(unprovenBadRequest.requests.map((request) => request.method)).toEqual(['POST', 'POST'])
    }
  })

  it('grants discard authority only when a 2xx response proves the exact created generation', async () => {
    const invalidCreatedResponses: unknown[] = [
      { approval: { id: 'pending-approval' } },
      { secret: { id: 'secret-id', version: 1, secretKey: 'wrong', environment: 'production', workspace: 'customer-connectors' } },
      { secret: { id: 'secret-id', version: 1, secretKey: `${REF}--${GENERATION}`, environment: 'wrong', workspace: 'customer-connectors' } },
      { secret: { id: 'secret-id', version: 1, secretKey: `${REF}--${GENERATION}`, environment: 'production', workspace: 'wrong' } },
      { secret: { id: '', version: 1, secretKey: `${REF}--${GENERATION}`, environment: 'production', workspace: 'customer-connectors' } },
      { secret: { id: ' ', version: 1, secretKey: `${REF}--${GENERATION}`, environment: 'production', workspace: 'customer-connectors' } },
      { secret: { id: 'secret-id', version: '1', secretKey: `${REF}--${GENERATION}`, environment: 'production', workspace: 'customer-connectors' } },
      { secret: { id: 'secret-id', version: 0, secretKey: `${REF}--${GENERATION}`, environment: 'production', workspace: 'customer-connectors' } },
    ]
    for (const payload of invalidCreatedResponses) {
      const context = createHarness(async (request) => {
        if (request.url.endsWith('/api/v1/auth/oidc-auth/login')) {
          return json({ accessToken: 'access', expiresIn: 60, accessTokenMaxTTL: 60, tokenType: 'Bearer' })
        }
        return json(payload)
      })
      await expect(withEphemeralSecretMaterial(new TextEncoder().encode('replacement'), async (material) => {
        await context.store.createGeneration(TARGET, material)
      })).rejects.toEqual(new SecretPlaneError('secret_store_invalid_response'))
      expect(context.requests.map((request) => request.method)).toEqual(['POST', 'POST'])
    }
  })

  it('retries a real Infisical 400 collision through the plane without deleting the orphan', async () => {
    let pointer: SecretPointer = Object.freeze({ secretRef: REF, activeGeneration: ACTIVE_GENERATION, revision: 4 })
    const pointerStore: SecretPointerStore = {
      getActive: async () => pointer,
      advanceActive: async (request: SecretPointerAdvanceRequest) => {
        pointer = Object.freeze({ secretRef: request.secretRef, activeGeneration: request.newGeneration, revision: 5 })
      },
    }
    const validator: SecretGenerationValidator = {
      validate: async (_target, lease) => {
        let valid = false
        await lease.useBytes(async (bytes) => {
          valid = new TextDecoder().decode(bytes) === CANARY
        })
        return valid
      },
    }
    const context = createHarness(async (request) => {
      if (request.url.endsWith('/api/v1/auth/oidc-auth/login')) {
        return json({ accessToken: 'access', expiresIn: 60, accessTokenMaxTTL: 60, tokenType: 'Bearer' })
      }
      const name = decodeURIComponent(new URL(request.url).pathname.split('/').at(-1) ?? '')
      if (request.method === 'POST' && name.endsWith(GENERATION)) {
        return json({ statusCode: 400, error: 'BadRequest', message: 'Secret already exists' }, 400)
      }
      if (request.method === 'POST') {
        return json({ secret: { id: 'fresh-id', version: 1, secretKey: name, environment: 'production', workspace: 'customer-connectors' } })
      }
      return json({ secret: { secretKey: name, secretValue: CANARY, environment: 'production', workspace: 'customer-connectors' } })
    })
    const generations = [GENERATION, FRESH_GENERATION]
    const plane = new SecretPlane({
      store: context.store,
      pointerStore,
      validator,
      randomUuid: () => generations.shift()?.slice(4) ?? 'dddddddddddddddddddddddddddddddd',
    })

    const result = await plane.rotate({ secretRef: REF }, {
      withMaterial: async (operation) => await withEphemeralSecretMaterial(
        new TextEncoder().encode('replacement'),
        operation,
      ),
    })

    expect(result.activeGeneration).toBe(FRESH_GENERATION)
    expect(pointer.activeGeneration).toBe(FRESH_GENERATION)
    expect(context.requests.map((request) => request.method)).toEqual(['POST', 'POST', 'POST', 'GET'])
  })

  it('fails an approval-pending create closed through the plane without issuing DELETE authority', async () => {
    const pointer: SecretPointer = Object.freeze({ secretRef: REF, activeGeneration: ACTIVE_GENERATION, revision: 4 })
    const pointerStore: SecretPointerStore = {
      getActive: async () => pointer,
      advanceActive: vi.fn(async () => undefined),
    }
    const context = createHarness(async (request) => request.url.endsWith('/api/v1/auth/oidc-auth/login')
      ? json({ accessToken: 'access', expiresIn: 60, accessTokenMaxTTL: 60, tokenType: 'Bearer' })
      : json({ approval: { id: 'pending-approval' } }))
    const plane = new SecretPlane({
      store: context.store,
      pointerStore,
      validator: { validate: vi.fn(async () => true) },
      randomUuid: () => GENERATION.slice(4),
    })

    await expect(plane.rotate({ secretRef: REF }, {
      withMaterial: async (operation) => await withEphemeralSecretMaterial(
        new TextEncoder().encode('replacement'),
        operation,
      ),
    })).rejects.toEqual(new SecretPlaneError('secret_store_unavailable'))
    expect(pointerStore.advanceActive).not.toHaveBeenCalled()
    expect(context.requests.map((request) => request.method)).toEqual(['POST', 'POST'])
  })
})
