import { describe, expect, it } from 'vitest'

import { admitRegisteredTransport } from '@/modules/capability-supply/public'

describe('capability supply transport adapter registry', () => {
  it('refuses unknown adapters before configuration can be persisted', () => {
    expect(admitRegisteredTransport({
      adapterId: 'unknown:v1',
      endpointUrl: 'https://example.test/capability',
      credentialRef: 'env:CAPABILITY_KEY',
      continuation: { kind: 'single_response', evidenceRefs: ['evidence:response'] },
      cancellation: { kind: 'unsupported', evidenceRefs: ['evidence:cancellation'] },
      config: {},
    })).toEqual({ kind: 'refused', reason: 'adapter_not_registered' })
  })

  it('lets the registered HTTP adapter validate and canonically encode its own configuration', () => {
    const admitted = admitRegisteredTransport({
      adapterId: 'http-json:v1',
      endpointUrl: 'https://example.test/capability',
      credentialRef: 'env:CAPABILITY_KEY',
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

  it('admits an optional same-origin reconciliation exchange without provider vocabulary', () => {
    expect(admitRegisteredTransport({
      adapterId: 'http-json:v1',
      endpointUrl: 'https://example.test/capability',
      credentialRef: 'env:CAPABILITY_KEY',
      continuation: { kind: 'single_response', evidenceRefs: ['evidence:response'] },
      cancellation: { kind: 'unsupported', evidenceRefs: ['evidence:cancellation'] },
      config: {
        method: 'POST', requestTimeoutMs: 5_000,
        reconciliation: { path: '/ae/reconcile', requestTimeoutMs: 3_000 },
      },
    })).toMatchObject({ kind: 'admitted', transport: { adapterId: 'http-json:v1' } })
  })

  it('rejects undeclared nested adapter configuration fields', () => {
    expect(admitRegisteredTransport({
      adapterId: 'http-json:v1',
      endpointUrl: 'https://example.test/capability',
      credentialRef: 'env:CAPABILITY_KEY',
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
      credentialRef: 'env:CAPABILITY_KEY',
      continuation: { kind: 'single_response' as const, evidenceRefs: ['evidence:response'] },
      cancellation: { kind: 'unsupported' as const, evidenceRefs: ['evidence:cancellation'] },
      config: { method: 'POST', requestTimeoutMs: 5_000 },
    }
    expect(admitRegisteredTransport({ ...base, endpointUrl: 'http://example.test/capability' }))
      .toEqual({ kind: 'refused', reason: 'adapter_config_invalid' })
    expect(admitRegisteredTransport({ ...base, credentialRef: 'secret-in-source' }))
      .toEqual({ kind: 'refused', reason: 'adapter_config_invalid' })
    expect(admitRegisteredTransport({ ...base, config: { ...base.config, businessType: 'shipping' } }))
      .toEqual({ kind: 'refused', reason: 'adapter_config_invalid' })
    expect(admitRegisteredTransport({ ...base, config: { method: 'POST', requestTimeoutMs: 5_000, padding: 'x'.repeat(70_000) } }))
      .toEqual({ kind: 'refused', reason: 'adapter_config_too_large' })
    expect(admitRegisteredTransport({
      ...base,
      continuation: { kind: 'adapter_managed', evidenceRefs: ['evidence:continuation'] },
    })).toEqual({ kind: 'refused', reason: 'adapter_config_invalid' })
    expect(admitRegisteredTransport({
      ...base,
      cancellation: { kind: 'adapter_managed', evidenceRefs: ['evidence:cancellation'] },
    })).toEqual({ kind: 'refused', reason: 'adapter_config_invalid' })
  })
})
