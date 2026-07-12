import { describe, expect, it } from 'vitest'

import { handleSandboxCapabilityRequest } from '@/lib/server/sandbox-capability-provider'
import { createHttpCapabilityBinding } from '@/modules/routing-kernel/http-capability-binding'

describe('sandbox capability provider', () => {
  it('returns profile-specific structured options through one protocol handler', async () => {
    const one = await call('one', 'sandbox.option.one:v1')
    const two = await call('two', 'sandbox.option.two:v1')

    expect(one.status).toBe(200)
    expect(two.status).toBe(200)
    await expect(one.json()).resolves.toMatchObject({ issuerBindingId: 'sandbox.option.one:v1', expectedCost: { amountMinor: 1_200 } })
    await expect(two.json()).resolves.toMatchObject({ issuerBindingId: 'sandbox.option.two:v1', expectedCost: { amountMinor: 900 } })
  })

  it('refuses missing credentials and never commits a real-world effect', async () => {
    const unauthorized = await handleSandboxCapabilityRequest(new Request('https://ae.test/api/sandbox/capability?profile=one', {
      method: 'POST', body: JSON.stringify({}),
    }), { providerKey: 'secret' })
    expect(unauthorized.status).toBe(401)

    const execution = await handleSandboxCapabilityRequest(request('one', {
      operation: 'execute', bindingId: 'sandbox.option.one:v1', capabilityContractId: 'sandbox.option.quote:v1',
    }), { providerKey: 'secret', now: () => 1_000 })
    await expect(execution.json()).resolves.toMatchObject({ kind: 'effect_not_committed', reason: 'sandbox_provider_never_creates_real_world_effects' })
  })

  it('makes provider selection a registration concern behind one binding interface', async () => {
    const one = binding('one', 'sandbox.option.one:v1', 'sandbox:option-one')
    const two = binding('two', 'sandbox.option.two:v1', 'sandbox:option-two')
    const results = await Promise.all([one, two].map(async (candidate) => await candidate.quoteStructured?.({
      quoteAttemptId: 'attempt:1', allocationId: `allocation:${candidate.binding.bindingId}`,
      recipient: { bindingId: candidate.binding.bindingId, nodeId: candidate.binding.nodeId },
      capabilityContractId: candidate.binding.capabilityContractId, capabilityContractVersion: 'v1',
      registrationHash: candidate.binding.registrationHash ?? '', environment: candidate.binding.environment ?? '', data: { requestContext: 'Compare options' },
    })))

    expect(results.map((result) => result?.kind)).toEqual(['quoted', 'quoted'])
    const quoted = results.filter((result) => result?.kind === 'quoted')
    expect(quoted.sort((left, right) => left.expectedCost.amountMinor - right.expectedCost.amountMinor)[0]?.issuerBindingId).toBe('sandbox.option.two:v1')
  })
})

function binding(profile: string, bindingId: string, nodeId: string) {
  const endpointUrl = `https://ae.test/api/sandbox/capability?profile=${profile}`
  return createHttpCapabilityBinding({
    endpointUrl, credentialRef: 'env:AE_SANDBOX_PROVIDER_KEY',
    binding: {
      bindingId, nodeId, networkId: 'ae:public', capabilityContractId: 'sandbox.option.quote:v1', operation: 'quote',
      admission: 'admitted', conformance: 'conformant', queryTerms: ['sandbox option'], registrationHash: `sha256:${profile.padEnd(64, '0')}`,
      environment: 'https://ae.test', adapterFeatures: { requestCancellation: 'unsupported', quotePreparation: 'structured_authorized' },
    },
  }, {
    validateTarget: async () => true,
    resolveCredential: async () => 'secret',
    now: () => 1_000,
    send: async (outbound) => await handleSandboxCapabilityRequest(new Request(endpointUrl, {
      method: 'POST', headers: outbound.headers, body: await outbound.text(),
    }), { providerKey: 'secret', now: () => 1_000 }),
  })
}

async function call(profile: string, bindingId: string): Promise<Response> {
  return await handleSandboxCapabilityRequest(request(profile, {
    operation: 'structured_quote', bindingId, capabilityContractId: 'sandbox.option.quote:v1',
    capabilityContractVersion: 'v1', registrationHash: 'sha256:registration', environment: 'https://ae.test',
  }), { providerKey: 'secret', now: () => 1_000 })
}

function request(profile: string, body: Record<string, unknown>): Request {
  return new Request(`https://ae.test/api/sandbox/capability?profile=${profile}`, {
    method: 'POST', headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
    body: JSON.stringify({ protocolVersion: 'ae-capability:v1', ...body }),
  })
}
