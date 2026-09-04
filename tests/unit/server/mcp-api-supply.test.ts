import {
  authenticateWithScopes,
  postMcp,
  readMcpBody,
} from './mcp-api-harness'
import { describe, expect, it, vi } from 'vitest'

function connectionServiceStubs() {
  return {
    sourcePreview: vi.fn(),
    connectionList: vi.fn(),
    connectionDetail: vi.fn(),
    connectionConnect: vi.fn(),
    connectionReconnect: vi.fn(),
    connectionRevoke: vi.fn(),
    offboardingStatus: vi.fn(),
  }
}

describe('MCP host adapter supply', () => {
  it('dispatches a publication artifact above 64 KiB below the MCP body cap', async () => {
    const publicationSourceBytes = 262_144
    const publicationSource = {
      kind: 'agent_plugin',
      pluginJson: { payload: 'x'.repeat(publicationSourceBytes) },
      mcpJson: {},
      environment: 'sandbox',
    }
    const body = {
      jsonrpc: '2.0',
      id: 'large-publication',
      method: 'tools/call',
      params: {
        name: 'ae_supply_publish',
        arguments: {
          businessRef: 'business:test',
          source: publicationSource,
          candidateRef: `sha256:${'1'.repeat(64)}`,
          expectedSourceDigest: `sha256:${'2'.repeat(64)}`,
          presentation: { name: 'Lookup', description: 'Looks up one reference.', category: 'Research' },
          consequences: { effects: [], dataUse: [], evidence: [] },
          pricing: { kind: 'free' },
          environment: 'sandbox',
          idempotencyKey: 'large-publication-key',
          attestation: { authorisedToPublish: true, informationAccurate: true, publishAfterSuccessfulValidation: true },
        },
      },
    }
    const encoder = new TextEncoder()
    const sourceBytes = encoder.encode(publicationSource.pluginJson.payload).byteLength
    const requestBytes = encoder.encode(JSON.stringify(body)).byteLength
    expect(sourceBytes).toBe(262_144)
    expect(requestBytes).toBeGreaterThan(64 * 1024)
    expect(requestBytes).toBeLessThan(320 * 1024)

    const supplyService = {
      operationsList: vi.fn(),
      status: vi.fn(),
      publish: vi.fn().mockResolvedValue({ kind: 'refused', reason: 'boundary_probe' }),
      withdraw: vi.fn(),
      recheck: vi.fn(),
      republish: vi.fn(),
      earnings: vi.fn(),
      ...connectionServiceStubs(),
    }
    const response = await postMcp(body, {
      authenticate: authenticateWithScopes(['market_supply:manage']),
      supplyManagementService: supplyService,
    }, {
      authorization: 'Bearer supply-boundary',
    })

    expect(response.status).toBe(200)
    const result = await readMcpBody(response)
    expect(supplyService.publish).toHaveBeenCalledOnce()
    expect(result.result).toMatchObject({
      structuredContent: { result: { kind: 'refused', reason: 'boundary_probe' } },
    })
  })

  it('rejects an operation-only principal from calling a supplier action without invoking its service', async () => {
    const supplyService = {
      operationsList: vi.fn(),
      status: vi.fn(),
      publish: vi.fn(),
      withdraw: vi.fn(),
      recheck: vi.fn(),
      republish: vi.fn(),
      earnings: vi.fn().mockResolvedValue({ kind: 'not_found' }),
      ...connectionServiceStubs(),
    }
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 'operation-only-supply-call',
      method: 'tools/call',
      params: {
        name: 'ae_supply_earnings',
        arguments: { currency: 'USD' },
      },
    }, {
      authenticate: authenticateWithScopes(['market_operations:invoke']),
      supplyManagementService: supplyService,
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({
      status: 403,
      kind: 'PERMISSION_DENIED',
      code: 'scope_required',
    })
    expect(supplyService.earnings).not.toHaveBeenCalled()
  })

  it('rejects an anonymous principal from calling a supplier action without invoking its service', async () => {
    const supplyService = {
      operationsList: vi.fn(),
      status: vi.fn(),
      publish: vi.fn(),
      withdraw: vi.fn(),
      recheck: vi.fn(),
      republish: vi.fn(),
      earnings: vi.fn().mockResolvedValue({ kind: 'not_found' }),
      ...connectionServiceStubs(),
    }
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 'anonymous-supply-call',
      method: 'tools/call',
      params: {
        name: 'ae_supply_earnings',
        arguments: { currency: 'USD' },
      },
    }, {
      authenticate: async () => ({
        isAuthenticated: false,
        tokenType: null,
        id: null,
        subject: null,
        scopes: null,
      }),
      supplyManagementService: supplyService,
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      status: 401,
      kind: 'UNAUTHENTICATED',
      code: 'authentication_required',
    })
    expect(supplyService.earnings).not.toHaveBeenCalled()
  })

  it('dispatches a supplier action for a supply-only principal', async () => {
    const supplyService = {
      operationsList: vi.fn(),
      status: vi.fn(),
      publish: vi.fn(),
      withdraw: vi.fn(),
      recheck: vi.fn(),
      republish: vi.fn(),
      earnings: vi.fn().mockResolvedValue({ kind: 'not_found' }),
      ...connectionServiceStubs(),
    }
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 'supply-only-supply-call',
      method: 'tools/call',
      params: {
        name: 'ae_supply_earnings',
        arguments: { currency: 'USD' },
      },
    }, {
      authenticate: authenticateWithScopes(['market_supply:manage']),
      supplyManagementService: supplyService,
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect((body.result?.structuredContent as { result?: unknown } | undefined)?.result).toEqual({ kind: 'not_found' })
    expect(supplyService.earnings).toHaveBeenCalledOnce()
    expect(supplyService.earnings).toHaveBeenCalledWith(expect.objectContaining({
      input: { currency: 'USD' },
      principal: expect.objectContaining({
        credentialId: 'key:test',
        scopes: ['market_supply:manage'],
      }),
    }))
  })

  it('dispatches provider connection inspection for a supply-only principal', async () => {
    const supplyService = {
      operationsList: vi.fn(),
      status: vi.fn(),
      publish: vi.fn(),
      withdraw: vi.fn(),
      recheck: vi.fn(),
      republish: vi.fn(),
      earnings: vi.fn(),
      ...connectionServiceStubs(),
    }
    supplyService.connectionDetail.mockResolvedValue({ kind: 'not_found' })
    const response = await postMcp({
      jsonrpc: '2.0',
      id: 'supplier-connection-detail',
      method: 'tools/call',
      params: {
        name: 'ae_supply_connection_detail',
        arguments: { connectionRef: 'connection:x402:one' },
      },
    }, {
      authenticate: authenticateWithScopes(['market_supply:manage']),
      supplyManagementService: supplyService,
    }, {
      authorization: 'Bearer supply-only',
    })

    expect(response.status).toBe(200)
    const body = await readMcpBody(response)
    expect((body.result?.structuredContent as { result?: unknown } | undefined)?.result).toEqual({ kind: 'not_found' })
    expect(supplyService.connectionDetail).toHaveBeenCalledWith(expect.objectContaining({
      input: { connectionRef: 'connection:x402:one' },
    }))
  })

  it('fails Package 5 action writes closed in production without hiding read actions', async () => {
    const supplyService = {
      operationsList: vi.fn().mockResolvedValue({ kind: 'not_found' }),
      status: vi.fn(), publish: vi.fn(),
      withdraw: vi.fn().mockResolvedValue({ kind: 'refused', reason: 'must-not-run' }),
      recheck: vi.fn(), republish: vi.fn(), earnings: vi.fn(),
      ...connectionServiceStubs(),
    }
    const options = {
      authenticate: authenticateWithScopes(['market_supply:manage']),
      supplyManagementService: supplyService,
      rolloutEnvironment: { NODE_ENV: 'production' },
    }
    const writeResponse = await postMcp({
      jsonrpc: '2.0', id: 'disabled-supply-write', method: 'tools/call',
      params: {
        name: 'ae_supply_withdraw',
        arguments: {
          businessId: 'business:one', offeringRef: 'offering:one', offeringRevision: 1,
          offeringSourceHash: 'source:one', publicationRef: 'publication:one', publicationRevision: 1,
          idempotencyKey: 'withdraw:one',
        },
      },
    }, options, { authorization: 'Bearer supply-only' })

    expect(writeResponse.status).toBe(200)
    expect((await readMcpBody(writeResponse)).result).toMatchObject({
      isError: true,
      structuredContent: { kind: 'UNAVAILABLE', code: 'package5_writes_disabled', retryable: false },
    })
    expect(supplyService.withdraw).not.toHaveBeenCalled()

    const readResponse = await postMcp({
      jsonrpc: '2.0', id: 'available-supply-read', method: 'tools/call',
      params: { name: 'ae_supply_operations_list', arguments: { businessRef: 'business:one', limit: 50 } },
    }, options, { authorization: 'Bearer supply-only' })

    expect(readResponse.status).toBe(200)
    expect((await readMcpBody(readResponse)).result).toMatchObject({
      structuredContent: { result: { kind: 'not_found' } },
    })
    expect(supplyService.operationsList).toHaveBeenCalledOnce()
  })
})
