import type { HostedCustomerRequestJourneyInput } from './types'
import { assertProductionBaseUrl } from './runtime'
import { proveAnonymousRefusal, proveDiscovery } from './discovery'

export async function verifyHostedCustomerRequestFrontDoor(input: Readonly<{
  baseUrl: string
  deploymentProtectionBypass?: string
  fetch?: typeof globalThis.fetch
}>): Promise<void> {
  assertProductionBaseUrl(input.baseUrl)
  const shared = {
    ...input,
    agentApiKey: '', expectedRevision: '', expectedDeploymentId: '',
    agent: { name: '', version: '' }, scenario: { request: '', facts: {}, messages: [] },
    sandbox: true as const,
    verifyRelease: async () => ({ kind: 'verified' as const, revision: '', deploymentId: '' }),
  } satisfies HostedCustomerRequestJourneyInput
  await proveDiscovery(shared)
  await proveAnonymousRefusal(shared)
}
