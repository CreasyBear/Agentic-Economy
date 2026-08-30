import { describe, expect, it } from 'vitest'

import {
  ConvexSourceError,
  callPublicSourceAction,
  callPublicSourceQuery,
  callSourceMutation,
  createAuthenticatedConvexClient,
  createAuthenticatedSourceTransport,
  createPublicSourceTransport,
  readRequiredConvexAuthToken,
  readRequiredConvexUrl,
  setPublicSourceTransportForTests,
  sourceConvexApi,
  sourceMutation,
  sourceQuery,
  sourceAction,
} from '@/lib/server/convex-source'

import { convexUrl } from './server-seams-harness'

describe('server Convex source seam', () => {
  it('requires a Convex URL from server env', () => {
    expect(() => readRequiredConvexUrl({})).toThrow(ConvexSourceError)
    expect(() => readRequiredConvexUrl({})).toThrow(expect.objectContaining({ code: 'missing_convex_url', status: 500 }))
  })

  it('uses the existing public Convex URL only as a non-secret fallback', () => {
    expect(readRequiredConvexUrl({ VITE_CONVEX_URL: ` ${convexUrl} ` })).toBe(convexUrl)
  })

  it('requires an authenticated Clerk session and Convex token', async () => {
    await expect(
      readRequiredConvexAuthToken({ isAuthenticated: false, getToken: async () => null })
    ).rejects.toMatchObject({ code: 'missing_auth', status: 401 })

    await expect(
      readRequiredConvexAuthToken({ isAuthenticated: true, getToken: async () => ' ' })
    ).rejects.toMatchObject({ code: 'missing_auth', status: 401 })
  })

  it('creates a fresh credentialed Convex client for each owner request', async () => {
    const authObject = { isAuthenticated: true, getToken: async () => 'owner.jwt' }
    const calls: { url: string; init: RequestInit }[] = []
    const fetch: typeof globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} })
      return new Response(JSON.stringify({ status: 'success', value: true }))
    }

    const first = await createAuthenticatedConvexClient({ env: { CONVEX_URL: convexUrl }, authObject, fetch })
    const second = await createAuthenticatedConvexClient({ env: { CONVEX_URL: convexUrl }, authObject, fetch })

    expect(first).not.toBe(second)
    expect(first.url).toBe(convexUrl)
    expect(second.url).toBe(convexUrl)
    expect(calls).toHaveLength(2)
    expect(calls.map(({ init }) => JSON.parse(String(init.body)))).toEqual([
      { path: 'interactiveAuthority:materializeCurrentInteractiveAuthority', args: [{}], format: 'convex_encoded_json' },
      { path: 'interactiveAuthority:materializeCurrentInteractiveAuthority', args: [{}], format: 'convex_encoded_json' },
    ])
  })

  it('fails closed before an authenticated source call when canonical expiry cannot be armed', async () => {
    const calls: { path: string }[] = []
    const fetch: typeof globalThis.fetch = async (_input, init) => {
      const path = JSON.parse(String(init?.body)).path as string
      calls.push({ path })
      return new Response(JSON.stringify({ status: 'success', value: false }))
    }

    await expect(callSourceMutation(
      sourceMutation<Record<string, never>, string>('test:must-not-run'),
      {},
      {
        env: { CONVEX_URL: convexUrl },
        authObject: { isAuthenticated: true, getToken: async () => 'owner.jwt' },
        fetch,
      },
    )).rejects.toMatchObject({ code: 'missing_auth', status: 401 })
    expect(calls).toEqual([{ path: 'interactiveAuthority:materializeCurrentInteractiveAuthority' }])
  })

  it('fails closed before an authenticated source call when expiry arming is unavailable', async () => {
    const calls: { path: string }[] = []
    const fetch: typeof globalThis.fetch = async (_input, init) => {
      const path = JSON.parse(String(init?.body)).path as string
      calls.push({ path })
      throw new Error('source unavailable')
    }

    await expect(callSourceMutation(
      sourceMutation<Record<string, never>, string>('test:must-not-run'),
      {},
      {
        env: { CONVEX_URL: convexUrl },
        authObject: { isAuthenticated: true, getToken: async () => 'owner.jwt' },
        fetch,
      },
    )).rejects.toMatchObject({ code: 'missing_auth', status: 503 })
    expect(calls).toEqual([{ path: 'interactiveAuthority:materializeCurrentInteractiveAuthority' }])
  })

  it('offers a reusable authenticated mutation caller for server functions', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetch: typeof globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} })
      const path = JSON.parse(String(init?.body)).path as string
      return new Response(JSON.stringify({
        status: 'success',
        value: path === 'interactiveAuthority:materializeCurrentInteractiveAuthority' ? true : 'stored',
      }))
    }

    await expect(
      callSourceMutation(
        sourceMutation<{ value: string }, string>('test:mutation'),
        { value: 'publish' },
        {
          env: { CONVEX_URL: convexUrl },
          authObject: { isAuthenticated: true, getToken: async () => 'owner.jwt' },
          fetch,
        }
      )
    ).resolves.toBe('stored')

    expect(calls).toHaveLength(2)
    expect(calls[0]?.url).toBe(`${convexUrl}/api/mutation`)
    expect(calls[1]?.url).toBe(`${convexUrl}/api/mutation`)
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: 'Bearer owner.jwt' })
    expect(calls[1]?.init.headers).toMatchObject({ Authorization: 'Bearer owner.jwt' })
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      path: 'interactiveAuthority:materializeCurrentInteractiveAuthority',
      args: [{}],
    })
    expect(JSON.parse(String(calls[1]?.init.body))).toMatchObject({
      path: 'test:mutation',
      args: [{ value: 'publish' }],
    })
  })

  it('exposes authenticated and public source transports behind one small interface', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetch: typeof globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} })
      const path = JSON.parse(String(init?.body)).path as string
      return new Response(JSON.stringify({
        status: 'success',
        value: path === 'interactiveAuthority:materializeCurrentInteractiveAuthority' ? true : 'stored',
      }))
    }
    const authenticated = await createAuthenticatedSourceTransport({
      env: { CONVEX_URL: convexUrl },
      authObject: { isAuthenticated: true, getToken: async () => 'owner.jwt' },
      fetch,
    })
    const publicTransport = createPublicSourceTransport({ env: { CONVEX_URL: convexUrl }, fetch })

    await expect(authenticated.query(sourceQuery<Record<string, never>, string>('test:query'), {})).resolves.toBe(
      'stored'
    )
    await expect(
      publicTransport.mutation(sourceMutation<{ value: string }, string>('test:publicMutation'), { value: 'publish' })
    ).resolves.toBe('stored')

    expect(calls.map((call) => call.url)).toEqual([
      `${convexUrl}/api/mutation`,
      `${convexUrl}/api/query`,
      `${convexUrl}/api/mutation`,
    ])
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: 'Bearer owner.jwt' })
    expect(calls[1]?.init.headers).toMatchObject({ Authorization: 'Bearer owner.jwt' })
    expect(calls[2]?.init.headers).not.toMatchObject({ Authorization: expect.any(String) })
  })

  it('calls a public Convex action without manufacturing end-user JWT identity', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetch: typeof globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} })
      return new Response(JSON.stringify({ status: 'success', value: { kind: 'request' } }))
    }
    await expect(callPublicSourceAction(
      sourceAction<{ serviceAuth: { signature: string } }, { kind: string }>('customerRequestApplication:resume'),
      { serviceAuth: { signature: 'command-bound' } }, { env: { CONVEX_URL: convexUrl }, fetch },
    )).resolves.toEqual({ kind: 'request' })
    expect(calls[0]?.url).toBe(`${convexUrl}/api/action`)
    expect(calls[0]?.init.headers).not.toMatchObject({ Authorization: expect.any(String) })
  })

  it('keeps the configured public test source port separate from authenticated owner calls', async () => {
    const publicTransport = createPublicSourceTransport({
      env: { CONVEX_URL: convexUrl },
      fetch: async () => new Response(JSON.stringify({ status: 'success', value: 'public-source' })),
    })
    const restorePublicSource = setPublicSourceTransportForTests(publicTransport)

    try {
      await expect(
        callPublicSourceQuery(sourceQuery<Record<string, never>, string>('test:public-query'), {}),
      ).resolves.toBe('public-source')
    } finally {
      restorePublicSource()
    }

    const calls: { url: string; init: RequestInit }[] = []
    const fetch: typeof globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} })
      const path = JSON.parse(String(init?.body)).path as string
      return new Response(JSON.stringify({
        status: 'success',
        value: path === 'interactiveAuthority:materializeCurrentInteractiveAuthority'
          ? true
          : 'authenticated-source',
      }))
    }

    await expect(
      callSourceMutation(
        sourceMutation<{ value: string }, string>('test:authenticated-mutation'),
        { value: 'owner-write' },
        {
          env: { CONVEX_URL: convexUrl },
          authObject: { isAuthenticated: true, getToken: async () => 'owner.jwt' },
          fetch,
        },
      ),
    ).resolves.toBe('authenticated-source')
    expect(calls).toHaveLength(2)
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      path: 'interactiveAuthority:materializeCurrentInteractiveAuthority',
    })
    expect(calls[1]?.init.headers).toMatchObject({ Authorization: 'Bearer owner.jwt' })
  })

  it('keeps the untyped source API available without generated Convex API output', () => {
    expect(sourceConvexApi).toBeTruthy()
  })
})
