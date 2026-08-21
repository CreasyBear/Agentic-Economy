import { canonicalDigest } from '@/modules/common/canonical-digest'

export const providerAuthority = {
  kind: 'provider_connection',
  connectionRef: 'connection:test-capability',
  providerRef: 'provider:test-capability',
} as const

export const keylessAuthority = { kind: 'keyless' } as const

export const target = {
  publicationRef: 'offering:test:lookup', revision: 1,
  bindingId: 'binding:test:http', capabilityId: 'test.lookup',
  endpointUrl: 'https://provider.example.test/capability',
  authority: providerAuthority, adapterId: 'http-json:v1',
  probeMethod: 'POST' as const,
  transportConfigJson: JSON.stringify({
    method: 'POST',
    requestTimeoutMs: 5_000,
    credential: { kind: 'bearer' },
  }),
  probeInputJson: JSON.stringify({
    protocolVersion: 'ae-capability:v1', operation: 'quote', bindingId: 'binding:test:http',
  }),
  targetDigest: canonicalDigest({
    publicationRef: 'offering:test:lookup',
    revision: 1,
    bindingId: 'binding:test:http',
    capabilityId: 'test.lookup',
    endpointUrl: 'https://provider.example.test/capability',
    authority: providerAuthority,
    adapterId: 'http-json:v1',
    configDigest: canonicalDigest({
      method: 'POST',
      requestTimeoutMs: 5_000,
      credential: { kind: 'bearer' },
    }),
  }),
}
