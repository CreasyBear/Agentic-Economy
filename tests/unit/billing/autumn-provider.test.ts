import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAutumnHttpProvider } from '@/modules/billing/internal/provider-readback'

type AutumnRequest = {
  path: string
  authorization: string | null
  apiVersion: string | null
  body: Record<string, unknown>
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('Autumn HTTP provider', () => {
  it('creates the customer before starting billing attach', async () => {
    const server = await startAutumnServer()
    try {
      const provider = createAutumnHttpProvider({
        secretKey: 'am_sk_test_local',
        apiBaseUrl: server.baseUrl,
        apiVersion: '2.3.0',
      })

      const readback = await provider.attach({
        customerId: 'ae_business_owner',
        planId: 'paid_activation_monthly',
        successUrl: 'http://127.0.0.1:3200/owner/billing/return/op_123',
        metadata: { ae_operation_id: 'op_123' },
      })

      expect(readback.paymentUrl).toBe('https://checkout.stripe.test/session')
      expect(server.requests.map((request) => request.path)).toEqual([
        '/v1/customers',
        '/v1/billing.attach',
      ])
      expect(server.requests[0]).toMatchObject({
        authorization: 'Bearer am_sk_test_local',
        apiVersion: '2.3.0',
        body: {
          id: 'ae_business_owner',
          name: 'ae_business_owner',
          metadata: { ae_operation_id: 'op_123' },
        },
      })
      expect(server.requests[1]).toMatchObject({
        authorization: 'Bearer am_sk_test_local',
        apiVersion: '2.3.0',
        body: {
          customer_id: 'ae_business_owner',
          plan_id: 'paid_activation_monthly',
          success_url: 'http://127.0.0.1:3200/owner/billing/return/op_123',
          redirect_mode: 'always',
          metadata: { ae_operation_id: 'op_123' },
        },
      })
    } finally {
      await server.close()
    }
  })

  it('fails closed for a non-allowlisted Autumn API host in production', () => {
    vi.stubEnv('NODE_ENV', 'production')

    expect(() => createAutumnHttpProvider({
      secretKey: 'am_sk_test_local',
      apiBaseUrl: 'https://autumn.attacker.test',
    })).toThrow(/host is not allowed/)
  })

  it('accepts the Autumn production API host in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const requests: string[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      requests.push(String(input))
      return new Response(JSON.stringify({
        id: 'ae_business_owner',
        subscriptions: [],
        purchases: [],
        invoices: [],
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })

    const provider = createAutumnHttpProvider({
      secretKey: 'am_sk_test_local',
      apiBaseUrl: 'https://api.useautumn.com',
    })

    await expect(provider.getCustomer('ae_business_owner')).resolves.toMatchObject({
      customerId: 'ae_business_owner',
      subscriptions: [],
      purchases: [],
      invoices: [],
    })
    expect(requests).toEqual(['https://api.useautumn.com/v1/customers.get'])
  })

  it('permits a localhost Autumn API override outside production', () => {
    vi.stubEnv('NODE_ENV', 'test')

    expect(() => createAutumnHttpProvider({
      secretKey: 'am_sk_test_local',
      apiBaseUrl: 'http://localhost:32001',
    })).not.toThrow()
  })
})

async function startAutumnServer() {
  const requests: AutumnRequest[] = []
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const body = await readJsonBody(request)
    const path = request.url ?? '/'
    requests.push({
      path,
      authorization: request.headers.authorization ?? null,
      apiVersion: Array.isArray(request.headers['x-api-version'])
        ? request.headers['x-api-version'][0] ?? null
        : request.headers['x-api-version'] ?? null,
      body,
    })

    if (path === '/v1/customers') {
      writeJson(response, { id: body.id, name: body.name })
      return
    }

    if (path === '/v1/billing.attach') {
      writeJson(response, {
        customer_id: body.customer_id,
        payment_url: 'https://checkout.stripe.test/session',
      })
      return
    }

    writeJson(response, { error: 'unexpected_path' }, 404)
  })

  const listening = Promise.withResolvers<void>()
  server.once('error', listening.reject)
  server.listen(0, '127.0.0.1', listening.resolve)
  await listening.promise

  const address = server.address() as AddressInfo
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: async () => {
      const closed = Promise.withResolvers<void>()
      server.close((error) => {
        if (error === undefined) {
          closed.resolve()
          return
        }
        closed.reject(error)
      })
      await closed.promise
    },
  }
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = ''
  for await (const chunk of request) {
    raw += String(chunk)
  }
  return JSON.parse(raw) as Record<string, unknown>
}

function writeJson(response: ServerResponse, body: Record<string, unknown>, status = 200): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

