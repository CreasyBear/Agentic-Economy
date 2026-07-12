import { describe, expect, it } from 'vitest'

import { handleRoutingKernelDescriptorRequest } from '@/modules/routing-kernel/descriptor'

describe('routing kernel descriptor', () => {
  it('publishes the canonical operations through HTTP and MCP without provider internals', async () => {
    const response = handleRoutingKernelDescriptorRequest(new Request('https://routing.example/.well-known/ae-routing.json'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300, must-revalidate')
    await expect(response.json()).resolves.toEqual({
      schemaVersion: 'ae-routing-descriptor:v1',
      protocolVersion: 'ae-routing:v1',
      name: 'Agentic Economy Routing Kernel',
      projections: {
        http: {
          operations: [
            { id: 'route', method: 'POST', url: 'https://routing.example/v1/route' },
            { id: 'authorize', method: 'POST', url: 'https://routing.example/v1/authorize' },
            { id: 'execute', method: 'POST', url: 'https://routing.example/v1/execute' },
            { id: 'reconcile', method: 'POST', url: 'https://routing.example/v1/reconcile' },
            { id: 'inspect', method: 'POST', url: 'https://routing.example/v1/inspect' },
            { id: 'cancel', method: 'POST', url: 'https://routing.example/v1/cancel' },
          ],
        },
        mcp: {
          transport: 'streamable-http',
          protocolVersion: '2025-06-18',
          url: 'https://routing.example/mcp',
          tools: ['ae.route', 'ae.authorize', 'ae.execute', 'ae.reconcile', 'ae.inspect', 'ae.cancel'],
        },
      },
      callerAuthentication: {
        profile: 'web-bot-auth',
        signatureAgentDirectoryWellKnownPath: '/.well-known/http-message-signatures-directory',
        grantRequired: true,
      },
      executionAuthorization: {
        routeAuthorizationRequired: true,
        boundToQuoteDigest: true,
        idempotencyKeyRequired: true,
        incidentCanary: {
          purpose: 'incident_canary', recoveryGrantRequired: true,
          requestDigestProfile: 'canonical-authority-digest:execution-request:v1',
          requestDigestFields: ['quoteId', 'quoteDigest', 'authorizationRef', 'executionPurpose', 'canaryRecoveryGrantId', 'data'],
          exactPlanBinding: true,
        },
      },
    })
    expect(JSON.stringify(await handleRoutingKernelDescriptorRequest(new Request('https://routing.example/.well-known/ae-routing.json')).json())).not.toMatch(/bindingId|provider|credential|graph/i)
  })

  it('rejects non-GET methods', () => {
    const response = handleRoutingKernelDescriptorRequest(new Request('https://routing.example/.well-known/ae-routing.json', { method: 'POST' }))
    expect(response.status).toBe(405)
    expect(response.headers.get('Allow')).toBe('GET')
  })
})
