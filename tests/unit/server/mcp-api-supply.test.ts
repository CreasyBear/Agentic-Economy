import {
  authenticateWithScopes,
  postMcp,
  readMcpBody,
} from './mcp-api-harness'
import { describe, expect, it, vi } from 'vitest'

describe('MCP host adapter supply', () => {
  it('dispatches a publication artifact above 64 KiB below the MCP body cap', async () => {
    const publicationSourceBytes = 262_144
    const publicationSource = {
      kind: 'openapi_http',
      documentJson: 'x'.repeat(publicationSourceBytes),
    }
    const body = {
      jsonrpc: '2.0',
      id: 'large-publication',
      method: 'tools/call',
      params: {
        name: 'ae_supply_publish',
        arguments: {
          version: 'supply-publication:v1',
          businessId: 'business:test',
          offeringRef: 'offering:test',
          offeringRevision: 1,
          offeringSourceHash: 'hash:test',
          source: publicationSource,
          evidenceRefs: ['evidence:test'],
          idempotencyKey: 'large-publication-key',
        },
      },
    }
    const encoder = new TextEncoder()
    const sourceBytes = encoder.encode(publicationSource.documentJson).byteLength
    const requestBytes = encoder.encode(JSON.stringify(body)).byteLength
    expect(sourceBytes).toBe(262_144)
    expect(requestBytes).toBeGreaterThan(64 * 1024)
    expect(requestBytes).toBeLessThan(320 * 1024)

    const supplyService = {
      publish: vi.fn().mockResolvedValue({ kind: 'refused', reason: 'boundary_probe' }),
      withdraw: vi.fn(),
      earnings: vi.fn(),
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
      publish: vi.fn(),
      withdraw: vi.fn(),
      earnings: vi.fn().mockResolvedValue({ kind: 'not_found' }),
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
      publish: vi.fn(),
      withdraw: vi.fn(),
      earnings: vi.fn().mockResolvedValue({ kind: 'not_found' }),
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
      publish: vi.fn(),
      withdraw: vi.fn(),
      earnings: vi.fn().mockResolvedValue({ kind: 'not_found' }),
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
})
