import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { RouteTransportInvocation } from '@/modules/capability-supply/route-transport-runtime'

export type ProviderInvocation = Extract<
  RouteTransportInvocation,
  Readonly<{ binding: Readonly<{ authority: Readonly<{ kind: 'provider_connection' }> }> }>
>

export function createTestProviderInvocation(overrides: {
  endpointUrl?: string
  connectionRef?: string
  providerRef?: string
  attemptRef?: string
  callRef?: string
  toolRef?: string
  inputJson?: string
  adapterId?: string
  configJson?: string
  now?: number
  effectGeneration?: number
} = {}): ProviderInvocation {
  const now = overrides.now ?? 2_000_000_000_000
  const config = {
    method: 'POST' as const,
    requestTimeoutMs: 5_000,
    credential: { kind: 'bearer' as const },
  }
  const configJson = overrides.configJson ?? JSON.stringify(config)
  return {
    binding: {
      adapterId: overrides.adapterId ?? 'http-json:v1',
      endpointUrl: overrides.endpointUrl ?? 'https://provider.example/run',
      authority: {
        kind: 'provider_connection',
        connectionRef: overrides.connectionRef ?? 'connection:test',
        providerRef: overrides.providerRef ?? 'provider:test',
      },
      configJson,
      configDigest: canonicalDigest(JSON.parse(configJson)),
    },
    authority: {
      attemptRef: overrides.attemptRef ?? 'attempt:test',
      effectGeneration: overrides.effectGeneration ?? 1,
      operationKeyDigest: `sha256:${'3'.repeat(64)}`,
      mandateDigest: `sha256:${'4'.repeat(64)}`,
      grantDigest: `sha256:${'5'.repeat(64)}`,
      capabilityContractDigest: `sha256:${'6'.repeat(64)}`,
      maximumSpend: { currency: 'USD', units: '0', exponent: 2 },
      expiresAt: now + 120_000,
      callIdentity: { keyId: 'route-calls:test', signature: 'hmac-sha256:test' },
      authorityGeneration: 7,
      authorityDigest: `sha256:${'7'.repeat(64)}`,
      leaseRef: 'lease:test',
      callRef: overrides.callRef ?? 'call:test',
      toolRef: overrides.toolRef ?? 'tool:test',
      grantedScopes: ['provider:invoke'],
      grantedResources: [overrides.toolRef ?? 'tool:test'],
      readinessValidUntil: now + 120_000,
      readinessDigest: `sha256:${'8'.repeat(64)}`,
    },
    inputJson: overrides.inputJson ?? JSON.stringify({ destination: 'PER' }),
  }
}
