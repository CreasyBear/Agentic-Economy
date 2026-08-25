import { vi } from 'vitest'
import type { ActionInvocationOrigin, InvocationActor } from '@/modules/action-invocation'

vi.mock('@/modules/registry/registry.functions', () => ({
  readPublicOfferingRegistryBusinessDetail: vi.fn(),
  readPublicOfferingRegistryPage: vi.fn(),
  readPublicOfferingRegistrySearchPage: vi.fn(),
}))

export const actor: InvocationActor = {
  callerRef: 'mock:caller:cold-agent',
  principalRef: 'mock:principal:owner',
}
export const origins: readonly ActionInvocationOrigin[] = [
  { kind: 'request_owned', requestRef: 'mock:request:durable', revision: 7 },
  { kind: 'standalone', ...actor },
]
export const input = {
  target: {
    businessId: 'mock:business:durable',
    serviceId: 'mock:service:quote',
    capabilityKind: 'quote_request' as const,
  },
  body: 'RAW BODY MUST REMAIN SOURCE OWNED',
  contact: { email: 'raw-contact@example.test' },
  expectedDigest: `sha256:${'b'.repeat(64)}`,
  operationKey: 'mock:source:inquiry:durable',
}
