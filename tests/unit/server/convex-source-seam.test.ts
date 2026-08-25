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

    const first = await createAuthenticatedConvexClient({ env: { CONVEX_URL: convexUrl }, authObject })
    const second = await createAuthenticatedConvexClient({ env: { CONVEX_URL: convexUrl }, authObject })

    expect(first).not.toBe(second)
    expect(first.url).toBe(convexUrl)
    expect(second.url).toBe(convexUrl)
  })

  it('offers a reusable authenticated mutation caller for server functions', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetch: typeof globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} })
      return new Response(JSON.stringify({ status: 'success', value: 'stored' }))
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

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(`${convexUrl}/api/mutation`)
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: 'Bearer owner.jwt' })
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      path: 'test:mutation',
      args: [{ value: 'publish' }],
    })
  })

  it('exposes authenticated and public source transports behind one small interface', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetch: typeof globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} })
      return new Response(JSON.stringify({ status: 'success', value: 'stored' }))
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

    expect(calls.map((call) => call.url)).toEqual([`${convexUrl}/api/query`, `${convexUrl}/api/mutation`])
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: 'Bearer owner.jwt' })
    expect(calls[1]?.init.headers).not.toMatchObject({ Authorization: expect.any(String) })
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
      return new Response(JSON.stringify({ status: 'success', value: 'authenticated-source' }))
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
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: 'Bearer owner.jwt' })
  })

  it('keeps the untyped source API available without generated Convex API output', () => {
    expect(sourceConvexApi).toBeTruthy()
  })
})
