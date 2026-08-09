import { describe, expect, it } from 'vitest'

import { admitRegisteredTransport } from '@/modules/capability-supply/public'
const providerAuthority = {
  kind: 'provider_connection',
  connectionRef: 'connection:capability',
  providerRef: 'provider:capability',
} as const
const keylessAuthority = { kind: 'keyless' } as const


describe('capability supply transport adapter registry', () => {
  it('refuses unknown adapters before configuration can be persisted', () => {
    expect(admitRegisteredTransport({
      adapterId: 'unknown:v1',
      endpointUrl: 'https://example.test/capability',
      authority: providerAuthority,
      continuation: { kind: 'single_response', evidenceRefs: ['evidence:response'] },
      cancellation: { kind: 'unsupported', evidenceRefs: ['evidence:cancellation'] },
      config: {},
    })).toEqual({ kind: 'refused', reason: 'adapter_not_registered' })
  })

  it('lets the registered HTTP adapter validate and canonically encode its own configuration', () => {
    const admitted = admitRegisteredTransport({
      adapterId: 'http-json:v1',
      endpointUrl: 'https://example.test/capability',
      authority: providerAuthority,
      continuation: { kind: 'single_response', evidenceRefs: ['evidence:response'] },
      cancellation: { kind: 'unsupported', evidenceRefs: ['evidence:cancellation'] },
      config: { requestTimeoutMs: 5_000, method: 'POST' },
    })
    expect(admitted).toMatchObject({
      kind: 'admitted',
      transport: {
        adapterId: 'http-json:v1',
        configJson: '{"method":"POST","requestTimeoutMs":5000}',
        configDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      },
    })
  })

  it('admits explicit keyless authority only for transports that need no payment credential', () => {
    const http = admitRegisteredTransport({
      adapterId: 'http-json:v1',
      endpointUrl: 'https://example.test/capability',
      authority: keylessAuthority,
      continuation: { kind: 'single_response', evidenceRefs: ['evidence:response'] },
      cancellation: { kind: 'unsupported', evidenceRefs: ['evidence:cancellation'] },
      config: { requestTimeoutMs: 5_000, method: 'POST' },
    })
    expect(http).toMatchObject({ kind: 'admitted', transport: { adapterId: 'http-json:v1' } })

    expect(admitRegisteredTransport({
      adapterId: 'mcp-jsonrpc:v1',
      endpointUrl: 'https://example.test/mcp',
      authority: keylessAuthority,
      continuation: { kind: 'single_response', evidenceRefs: ['evidence:response'] },
      cancellation: { kind: 'unsupported', evidenceRefs: ['evidence:cancellation'] },
      config: { protocolVersion: '2025-06-18', toolName: 'lookup', requestTimeoutMs: 5_000 },
    })).toMatchObject({ kind: 'admitted', transport: { adapterId: 'mcp-jsonrpc:v1' } })

    expect(admitRegisteredTransport({
      adapterId: 'x402-fetch:v2',
      endpointUrl: 'https://example.test/paid',
      authority: keylessAuthority,
      continuation: { kind: 'single_response', evidenceRefs: ['evidence:response'] },
      cancellation: { kind: 'unsupported', evidenceRefs: ['evidence:cancellation'] },
      config: {
        method: 'POST', requestTimeoutMs: 5_000, scheme: 'exact', network: 'eip155:84532',
        currency: 'USD', routeAmountExponent: 2, assetAmountExponent: 6,
        asset: '0x0000000000000000000000000000000000000001',
        payTo: '0x0000000000000000000000000000000000000002',
      },
    })).toEqual({ kind: 'refused', reason: 'adapter_config_invalid' })
  })

  it('admits closed GET query mappings but keeps cancellation and reconciliation POST-only', () => {
    const base = {
      adapterId: 'http-json:v1',
      endpointUrl: 'https://example.test/capability',
      authority: providerAuthority,
      continuation: { kind: 'single_response' as const, evidenceRefs: ['evidence:response'] },
      cancellation: { kind: 'unsupported' as const, evidenceRefs: ['evidence:cancellation'] },
    }
    expect(admitRegisteredTransport({
      ...base,
      config: {
        method: 'GET', requestTimeoutMs: 5_000,
        query: [{ inputPointer: '/symbol', parameter: 'symbol' }],
      },
    })).toMatchObject({ kind: 'admitted', transport: { adapterId: 'http-json:v1' } })
    expect(admitRegisteredTransport({
      ...base,
      config: { method: 'GET', requestTimeoutMs: 5_000 },
    })).toEqual({ kind: 'refused', reason: 'adapter_config_invalid' })
    expect(admitRegisteredTransport({
      ...base,
      config: {
        method: 'GET', requestTimeoutMs: 5_000,
        query: [{ inputPointer: '/symbol', parameter: 'symbol' }],
        reconciliation: { path: '/reconcile', requestTimeoutMs: 1_000 },
      },
    })).toEqual({ kind: 'refused', reason: 'adapter_config_invalid' })
  })

  it('admits an optional same-origin reconciliation exchange without provider vocabulary', () => {
    expect(admitRegisteredTransport({
      adapterId: 'http-json:v1',
      endpointUrl: 'https://example.test/capability',
      authority: providerAuthority,
      continuation: { kind: 'single_response', evidenceRefs: ['evidence:response'] },
      cancellation: { kind: 'unsupported', evidenceRefs: ['evidence:cancellation'] },
      config: {
        method: 'POST', requestTimeoutMs: 5_000,
        reconciliation: { path: '/ae/reconcile', requestTimeoutMs: 3_000 },
      },
    })).toMatchObject({ kind: 'admitted', transport: { adapterId: 'http-json:v1' } })
  })

  it('admits adapter-managed cancellation only with a bounded same-origin cancellation exchange', () => {
    expect(admitRegisteredTransport({
      adapterId: 'http-json:v1',
      endpointUrl: 'https://example.test/capability',
      authority: providerAuthority,
      continuation: { kind: 'single_response', evidenceRefs: ['evidence:response'] },
      cancellation: { kind: 'adapter_managed', evidenceRefs: ['evidence:cancellation'] },
      config: {
        method: 'POST', requestTimeoutMs: 5_000,
        cancellation: { path: '/ae/cancel', requestTimeoutMs: 3_000 },
      },
    })).toMatchObject({
      kind: 'admitted',
      transport: {
        adapterId: 'http-json:v1',
        configJson: '{"cancellation":{"path":"/ae/cancel","requestTimeoutMs":3000},"method":"POST","requestTimeoutMs":5000}',
      },
    })
  })

  it('rejects adapter-managed cancellation without an exact cancellation exchange', () => {
    const base = {
      adapterId: 'http-json:v1',
      endpointUrl: 'https://example.test/capability',
      authority: providerAuthority,
      continuation: { kind: 'single_response' as const, evidenceRefs: ['evidence:response'] },
      cancellation: { kind: 'adapter_managed' as const, evidenceRefs: ['evidence:cancellation'] },
    }
    expect(admitRegisteredTransport({
      ...base,
      config: { method: 'POST', requestTimeoutMs: 5_000 },
    })).toEqual({ kind: 'refused', reason: 'adapter_config_invalid' })
    expect(admitRegisteredTransport({
      ...base,
      config: {
        method: 'POST', requestTimeoutMs: 5_000,
        cancellation: { path: 'https://other.example/cancel', requestTimeoutMs: 3_000 },
      },
    })).toEqual({ kind: 'refused', reason: 'adapter_config_invalid' })
    expect(admitRegisteredTransport({
      ...base,
      config: {
        method: 'POST', requestTimeoutMs: 5_000,
        cancellation: { path: '//other.example/cancel', requestTimeoutMs: 3_000 },
      },
    })).toEqual({ kind: 'refused', reason: 'adapter_config_invalid' })
  })

  it('rejects undeclared nested adapter configuration fields', () => {
    expect(admitRegisteredTransport({
      adapterId: 'http-json:v1',
      endpointUrl: 'https://example.test/capability',
      authority: providerAuthority,
      continuation: { kind: 'single_response', evidenceRefs: ['evidence:response'] },
      cancellation: { kind: 'unsupported', evidenceRefs: ['evidence:cancellation'] },
      config: {
        method: 'POST', requestTimeoutMs: 5_000,
        reconciliation: { path: '/ae/reconcile', requestTimeoutMs: 3_000, undeclared: true },
      },
    })).toEqual({ kind: 'refused', reason: 'adapter_config_invalid' })
  })

  it('refuses insecure endpoints, non-environment credentials, extra config and oversized values', () => {
    const base = {
      adapterId: 'http-json:v1',
      endpointUrl: 'https://example.test/capability',
      authority: providerAuthority,
      continuation: { kind: 'single_response' as const, evidenceRefs: ['evidence:response'] },
      cancellation: { kind: 'unsupported' as const, evidenceRefs: ['evidence:cancellation'] },
      config: { method: 'POST', requestTimeoutMs: 5_000 },
    }
    expect(admitRegisteredTransport({ ...base, endpointUrl: 'http://example.test/capability' }))
      .toEqual({ kind: 'refused', reason: 'adapter_config_invalid' })
    expect(admitRegisteredTransport({
      ...base,
      authority: { ...providerAuthority, connectionRef: 'invalid authority' },
    }))
      .toEqual({ kind: 'refused', reason: 'adapter_config_invalid' })
    expect(admitRegisteredTransport({ ...base, config: { ...base.config, businessType: 'shipping' } }))
      .toEqual({ kind: 'refused', reason: 'adapter_config_invalid' })
    expect(admitRegisteredTransport({ ...base, config: { method: 'POST', requestTimeoutMs: 5_000, padding: 'x'.repeat(70_000) } }))
      .toEqual({ kind: 'refused', reason: 'adapter_config_too_large' })
    expect(admitRegisteredTransport({
      ...base,
      continuation: { kind: 'adapter_managed', evidenceRefs: ['evidence:continuation'] },
    })).toEqual({ kind: 'refused', reason: 'adapter_config_invalid' })
  })

  it('admits x402 as a bounded payment transport without changing the capability contract', () => {
    expect(admitRegisteredTransport({
      adapterId: 'x402-fetch:v2',
      endpointUrl: 'https://example.test/paid-capability',
      authority: providerAuthority,
      continuation: { kind: 'single_response', evidenceRefs: ['evidence:response'] },
      cancellation: { kind: 'unsupported', evidenceRefs: ['evidence:cancellation'] },
      config: {
        method: 'POST', requestTimeoutMs: 5_000, scheme: 'exact', network: 'eip155:84532',
        currency: 'USD', routeAmountExponent: 2, assetAmountExponent: 6,
        asset: '0x0000000000000000000000000000000000000001',
        payTo: '0x0000000000000000000000000000000000000002',
      },
    })).toMatchObject({
      kind: 'admitted', transport: { adapterId: 'x402-fetch:v2' },
    })
  })
})
