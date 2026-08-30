import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runSupplyCommand } from '../../../tools/ae/commands/supply'
import { runConnectCommand } from '../../../tools/ae/commands/connect'
import type { CliOptions } from '../../../tools/ae/lib/args'
import { readStoredConnection, removeStoredConnection, storeConnection } from '../../../tools/ae/lib/config'
import { CliFailure } from '../../../tools/ae/lib/output'

let directory = ''
const baseOptions: CliOptions = {
  baseUrl: 'https://market.example',
  json: true,
  help: false,
  allowWrite: false,
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ae-cli-supply-'))
  process.env.AE_CONFIG_DIR = directory
  delete process.env.AE_API_KEY
  delete process.env.AE_API_KEY_ORIGIN
  storeConnection({ baseUrl: baseOptions.baseUrl, accessToken: 'hidden-supplier-secret', scope: 'market_supply:manage' })
})

afterEach(() => {
  delete process.env.AE_CONFIG_DIR
  delete process.env.AE_API_KEY
  delete process.env.AE_API_KEY_ORIGIN
  rmSync(directory, { recursive: true, force: true })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AE CLI supplier Operation lifecycle', () => {
  it('requests and stores a separate supplier credential without replacing buyer access', async () => {
    removeStoredConnection(baseOptions.baseUrl, 'supplier')
    storeConnection({ baseUrl: baseOptions.baseUrl, accessToken: 'buyer-secret', scope: 'market_operations:invoke customer_requests:bounded_mandate' })
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ client_id: 'supplier-client' }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({
        device_code: 'supplier-device',
        user_code: 'SUPP-LIER',
        verification_uri: 'https://market.example/agent-access/authorize?user_code=SUPP-LIER',
        expires_in: 600,
        interval: 1,
      }))
      .mockResolvedValueOnce(Response.json({
        access_token: 'new-supplier-secret',
        token_type: 'Bearer',
        scope: 'market_supply:manage',
      }))
      .mockResolvedValueOnce(Response.json({ kind: 'not_found' }))
    vi.stubGlobal('fetch', fetch)
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runConnectCommand([], { ...baseOptions, supplier: true })

    const registration = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)) as Record<string, unknown>
    expect(registration).toMatchObject({ client_name: 'Agentic Economy Supplier CLI', scope: 'market_supply:manage' })
    expect(String(fetch.mock.calls[1]?.[1]?.body)).toContain('scope=market_supply%3Amanage')
    expect(String(fetch.mock.calls[3]?.[0])).toBe('https://market.example/api/v1/supply/earnings')
    expect(readStoredConnection(baseOptions.baseUrl, 'market')?.accessToken).toBe('buyer-secret')
    expect(readStoredConnection(baseOptions.baseUrl, 'supplier')?.accessToken).toBe('new-supplier-secret')
    expect(JSON.parse(write.mock.calls.map(([value]) => String(value)).join(''))).toMatchObject({
      kind: 'connected',
      profile: 'supplier',
      scope: 'market_supply:manage',
    })
  })

  it('reads exact lifecycle status through the canonical action route', async () => {
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://market.example/api/v1/supply/status')
      expect(init?.method).toBe('POST')
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer hidden-supplier-secret')
      expect(JSON.parse(String(init?.body))).toEqual({ businessId: 'business:one', offeringRef: 'offering:one' })
      return Response.json({
        kind: 'available',
        businessId: 'business:one',
        business: { name: 'Supplier', slug: 'supplier' },
        operations: [{
          offeringRef: 'offering:one',
          revision: 1,
          name: 'Lookup',
          summary: 'Look something up.',
          catalogStatus: 'published',
          lifecycle: { state: 'active', reasons: [] },
          readiness: { outcome: 'healthy' },
          live: { available: true },
          currentStep: 'test',
          stepStates: { describe: 'completed', admission: 'completed', readiness: 'completed', test: 'completed' },
          publication: { publicationRef: 'publication:one', publicationRevision: 1, operationRef: 'operation:one', state: 'current' },
        }],
        activityTruncated: false,
      })
    })
    vi.stubGlobal('fetch', fetch)
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runSupplyCommand(['status', 'business:one', 'offering:one'], baseOptions)

    expect(fetch).toHaveBeenCalledOnce()
    const output = write.mock.calls.map(([value]) => String(value)).join('')
    expect(JSON.parse(output)).toMatchObject({ kind: 'available', operations: [{ offeringRef: 'offering:one' }] })
    expect(output).not.toContain('hidden-supplier-secret')
  })

  it('adds one explicit idempotency key to maintenance material', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        publicationRef: 'publication:one',
        idempotencyKey: 'stable-recheck-key',
      })
      return Response.json({
        kind: 'refreshed',
        publicationRef: 'publication:one',
        revision: 1,
        disposition: 'current',
        lifecycle: { state: 'inactive', reasons: ['health_unobserved'] },
      })
    })
    vi.stubGlobal('fetch', fetch)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const input = JSON.stringify({
      businessId: 'business:one',
      offeringRef: 'offering:one',
      offeringRevision: 1,
      offeringSourceHash: 'source:one',
      publicationRef: 'publication:one',
      publicationRevision: 1,
    })

    await runSupplyCommand(['recheck'], { ...baseOptions, input, idempotencyKey: 'stable-recheck-key' })

    expect(fetch).toHaveBeenCalledOnce()
  })

  it('refuses conflicting retry identities before any network call', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    await expect(runSupplyCommand(['withdraw'], {
      ...baseOptions,
      idempotencyKey: 'command-key-two',
      input: JSON.stringify({ idempotencyKey: 'command-key-one' }),
    })).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'supply-idempotency-key-mismatch',
    } satisfies Partial<CliFailure>)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('lists provider connections and preserves their exact lifecycle identity', async () => {
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://market.example/api/v1/supply/connections/list')
      expect(JSON.parse(String(init?.body))).toEqual({
        businessId: 'business:one',
        lifecycle: 'cleanup_required',
        limit: 100,
      })
      return Response.json({
        kind: 'available',
        businessId: 'business:one',
        connections: [{
          connectionRef: 'connection:x402:one',
          businessId: 'business:one',
          providerRef: 'provider:x402:provider.example',
          providerAccountRef: 'x402:https://provider.example/pay',
          adapterId: 'x402:v1',
          grantedScopes: ['x402:pay'],
          grantedResources: ['https://provider.example/pay'],
          authorityGeneration: 3,
          authorityDigest: 'sha256:authority',
          lifecycle: 'cleanup_required',
          available: false,
          credentialConfigured: false,
          observedAt: 10,
          reasonCode: 'cleanup_failed',
          evidenceRefs: [],
          createdAt: 1,
          updatedAt: 10,
        }],
      })
    })
    vi.stubGlobal('fetch', fetch)
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runSupplyCommand(['connections', 'business:one', 'cleanup_required'], baseOptions)

    expect(JSON.parse(write.mock.calls.map(([value]) => String(value)).join(''))).toMatchObject({
      connections: [{ connectionRef: 'connection:x402:one', lifecycle: 'cleanup_required', authorityGeneration: 3 }],
    })
  })

  it('reconnects using exact concurrency facts and one explicit retry identity', async () => {
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://market.example/api/v1/supply/connections/reconnect')
      expect(JSON.parse(String(init?.body))).toEqual({
        connectionRef: 'connection:x402:one',
        expectedAuthorityGeneration: 3,
        expectedAuthorityDigest: 'sha256:authority',
        evidenceRefs: [],
        idempotencyKey: 'stable-reconnect-key',
      })
      return Response.json({ kind: 'refused', reason: 'invalid_generation' })
    })
    vi.stubGlobal('fetch', fetch)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runSupplyCommand(['reconnect'], {
      ...baseOptions,
      idempotencyKey: 'stable-reconnect-key',
      input: JSON.stringify({
        connectionRef: 'connection:x402:one',
        expectedAuthorityGeneration: 3,
        expectedAuthorityDigest: 'sha256:authority',
        evidenceRefs: [],
      }),
    })

    expect(fetch).toHaveBeenCalledOnce()
  })
})
