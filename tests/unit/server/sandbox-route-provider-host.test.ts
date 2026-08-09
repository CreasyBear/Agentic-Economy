import { once } from 'node:events'

import { afterEach, describe, expect, it } from 'vitest'

import { createSandboxRouteProviderServer } from '@/lib/server/sandbox-route-provider-host'

describe('sandbox route provider host', () => {
  const servers: Array<ReturnType<typeof createSandboxRouteProviderServer>> = []

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(async (server) => {
      server.close()
      await once(server, 'close')
    }))
  })

  it('hosts one authenticated provider discovery and invocation origin', async () => {
    const server = createSandboxRouteProviderServer({
      routeKey: 'resolver',
      providerKey: 'test-provider-key',
    })
    servers.push(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('provider test server address unavailable')
    const origin = `http://127.0.0.1:${address.port}`
    const path = '/api/sandbox/providers/route-resolver'

    const discovery = await fetch(`${origin}${path}`)
    expect(discovery.status).toBe(200)
    await expect(discovery.json()).resolves.toMatchObject({
      business: { name: 'Sandbox Route Resolver' },
      operation: { endpoint: `${origin}${path}` },
    })

    const unauthenticated = await fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request: 'Resolve a labelled test service' }),
    })
    expect(unauthenticated.status).toBe(401)
    expect(unauthenticated.headers.get('content-type')).toBe('application/problem+json')
    expect(unauthenticated.headers.get('www-authenticate')).toBe('Bearer')
    expect(unauthenticated.headers.get('vary')).toBe('Authorization')
    const unauthenticatedBody = await unauthenticated.json() as Record<string, unknown>
    expect(unauthenticatedBody).toMatchObject({
      status: 401,
      kind: 'UNAUTHENTICATED',
      code: 'authentication_required',
      detail: 'authentication_required',
    })
    expect(JSON.stringify(unauthenticatedBody)).not.toContain('test-provider-key')

    const unseenOperationKeyDigest = `sha256:${'a'.repeat(64)}`
    const cancellation = await fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-provider-key', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cancellationRequestRef: 'cancel:audit',
        attemptRef: 'attempt:audit',
        operationKeyDigest: unseenOperationKeyDigest,
      }),
    })
    expect(cancellation.status).toBe(409)
    expect(cancellation.headers.get('content-type')).toBe('application/problem+json')
    await expect(cancellation.json()).resolves.toMatchObject({
      status: 409,
      kind: 'ALREADY_EXISTS',
      code: 'sandbox_operation_not_observed',
      detail: 'sandbox_operation_not_observed',
    })

    const invoked = await fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-provider-key', 'Content-Type': 'application/json' },
      body: JSON.stringify({ request: 'Resolve a labelled test service' }),
    })
    expect(invoked.status).toBe(200)
    await expect(invoked.json()).resolves.toMatchObject({
      serviceReference: expect.stringMatching(/^sandbox-service:/u),
    })

    await expect(fetch(`${origin}/api/sandbox/providers/route-quoter`)).resolves.toMatchObject({ status: 404 })
  })

  it('publishes the externally forwarded HTTPS endpoint in discovery', async () => {
    const server = createSandboxRouteProviderServer({
      routeKey: 'resolver',
      providerKey: 'test-provider-key',
    })
    servers.push(server)
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('provider test server address unavailable')

    const response = await fetch(`http://127.0.0.1:${address.port}/api/sandbox/providers/route-resolver`, {
      headers: {
        'X-Forwarded-Host': 'resolver.test.example',
        'X-Forwarded-Proto': 'https',
      },
    })
    await expect(response.json()).resolves.toMatchObject({
      operation: {
        endpoint: 'https://resolver.test.example/api/sandbox/providers/route-resolver',
      },
    })
  })
})
