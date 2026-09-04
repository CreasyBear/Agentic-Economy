import { describe, expect, it, vi } from 'vitest'

import { handleSupplyActionPost } from '@/lib/server/supply-action-api'
import type { SupplyManagementService } from '@/modules/capability-supply/supply-actions'

const authenticate = async (scopes: readonly string[] = ['market_supply:manage']) => ({
  isAuthenticated: true as const,
  tokenType: 'api_key' as const,
  id: 'key_supply',
  subject: 'user_supply',
  scopes,
})

function service(overrides: Partial<SupplyManagementService> = {}): SupplyManagementService {
  return {
    sourcePreview: vi.fn().mockResolvedValue({ kind: 'action_required', requiredAction: {
      action: 'supply.source.preview', blockedCapabilities: ['supply.publish'], cta: null,
      ctaLabel: 'Check source', description: 'Check source.', iconUrl: null,
      status: 'required', title: 'Source unavailable',
    } }),
    status: vi.fn().mockResolvedValue({ kind: 'not_found' }),
    publish: vi.fn().mockResolvedValue({ kind: 'refused', reason: 'unused' }),
    withdraw: vi.fn().mockResolvedValue({ kind: 'refused', reason: 'unused' }),
    recheck: vi.fn().mockResolvedValue({ kind: 'refused', reason: 'unused' }),
    republish: vi.fn().mockResolvedValue({ kind: 'refused', reason: 'unused' }),
    earnings: vi.fn().mockResolvedValue({ kind: 'not_found' }),
    connectionList: vi.fn().mockResolvedValue({ kind: 'not_found' }),
    connectionDetail: vi.fn().mockResolvedValue({ kind: 'not_found' }),
    connectionConnect: vi.fn().mockResolvedValue({ kind: 'refused', reason: 'unused' }),
    connectionReconnect: vi.fn().mockResolvedValue({ kind: 'refused', reason: 'unused' }),
    connectionRevoke: vi.fn().mockResolvedValue({ kind: 'refused', reason: 'unused' }),
    offboardingStatus: vi.fn().mockResolvedValue({ kind: 'not_found' }),
    ...overrides,
  }
}

const resolvePrincipal = async () => ({
  principalId: 'prn_00000000000040008000000000000044',
  ownerId: 'acc_00000000000040008000000000000044',
  credentialId: 'key_supply',
  applicationRef: 'agentic-economy',
  environment: 'sandbox' as const,
  scopes: ['market_supply:manage'],
  authorityMode: 'bounded_mandate' as const,
})

describe('supplier action HTTP adapter', () => {
  it('dispatches native source preview through the same authenticated read boundary', async () => {
    const sourcePreview = vi.fn().mockResolvedValue({
      kind: 'ready',
      sourceDigest: `sha256:${'1'.repeat(64)}`,
      sourceRevision: `openapi:sha256:${'1'.repeat(64)}`,
      provenance: {
        sourceKind: 'openapi',
        sourceUrl: 'https://provider.example/openapi.yaml',
        authority: 'unverified_public',
      },
      authentication: [{ kind: 'public' }],
      candidates: [],
    })
    const response = await handleSupplyActionPost(
      new Request('https://ae.example/api/v1/supply/sources/preview', {
        method: 'POST',
        headers: { Authorization: 'Bearer hidden-supplier-secret' },
        body: JSON.stringify({
          kind: 'openapi',
          definitionUrl: 'https://provider.example/openapi.yaml',
          environment: 'sandbox',
        }),
      }),
      'sourcePreview',
      { authenticate, resolvePrincipal, supplyManagementService: service({ sourcePreview }) },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toMatchObject({
      kind: 'ready',
      provenance: { sourceKind: 'openapi' },
    })
    expect(sourcePreview).toHaveBeenCalledOnce()
  })

  it('authenticates, validates, and dispatches through the canonical status action', async () => {
    const status = vi.fn().mockResolvedValue({ kind: 'not_found' })
    const response = await handleSupplyActionPost(
      new Request('https://ae.example/api/v1/supply/status', {
        method: 'POST',
        headers: { Authorization: 'Bearer hidden-supplier-secret' },
        body: JSON.stringify({ businessRef: 'business:one' }),
      }),
      'status',
      { authenticate, resolvePrincipal, supplyManagementService: service({ status }) },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-ae-request-id')).toBeTruthy()
    await expect(response.json()).resolves.toEqual({ kind: 'not_found' })
    expect(status).toHaveBeenCalledWith(expect.objectContaining({
      input: { businessRef: 'business:one' },
      principal: expect.objectContaining({ scopes: ['market_supply:manage'] }),
    }))
  })

  it('refuses buyer-only credentials without invoking supplier lifecycle', async () => {
    const status = vi.fn()
    const response = await handleSupplyActionPost(
      new Request('https://ae.example/api/v1/supply/status', {
        method: 'POST',
        headers: { Authorization: 'Bearer buyer-only' },
        body: JSON.stringify({ businessRef: 'business:one' }),
      }),
      'status',
      { authenticate: async () => await authenticate(['market_operations:invoke']), supplyManagementService: service({ status }) },
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('www-authenticate')).toContain('market_supply:manage')
    await expect(response.json()).resolves.toMatchObject({ kind: 'PERMISSION_DENIED', code: 'scope_required' })
    expect(status).not.toHaveBeenCalled()
  })

  it('returns a bounded invalid-request problem before dispatch', async () => {
    const status = vi.fn()
    const response = await handleSupplyActionPost(
      new Request('https://ae.example/api/v1/supply/status', {
        method: 'POST',
        headers: { Authorization: 'Bearer hidden' },
        body: JSON.stringify({ businessRef: '', leakedExtra: true }),
      }),
      'status',
      { authenticate, resolvePrincipal, supplyManagementService: service({ status }) },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ kind: 'INVALID_ARGUMENT', code: 'invalid_request' })
    expect(status).not.toHaveBeenCalled()
  })

  it('dispatches provider connection detail through the same supplier authentication boundary', async () => {
    const connectionDetail = vi.fn().mockResolvedValue({ kind: 'not_found' })
    const response = await handleSupplyActionPost(
      new Request('https://ae.example/api/v1/supply/connections/detail', {
        method: 'POST',
        headers: { Authorization: 'Bearer hidden-supplier-secret' },
        body: JSON.stringify({ connectionRef: 'connection:x402:one' }),
      }),
      'connectionDetail',
      { authenticate, resolvePrincipal, supplyManagementService: service({ connectionDetail }) },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ kind: 'not_found' })
    expect(connectionDetail).toHaveBeenCalledWith(expect.objectContaining({
      input: { connectionRef: 'connection:x402:one' },
      principal: expect.objectContaining({ scopes: ['market_supply:manage'] }),
    }))
  })
})
