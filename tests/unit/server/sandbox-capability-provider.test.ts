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

  it('accepts and exactly echoes the registered current binding identity', async () => {
    const response = await call('one', 'binding:sandbox-option-one:http-json:v4')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      issuerBindingId: 'binding:sandbox-option-one:http-json:v4',
      expectedCost: { amountMinor: 1_200 },
    })
  })

  it('returns the registered current provider option envelope for preparation egress', async () => {
    const response = await handleSandboxCapabilityRequest(
      preparationRequest('https://ae.test/api/sandbox/capability?profile=one&binding=v4'),
      { providerKey: 'secret' },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      format: 'ae.provider-option:v1',
      operationRef: 'preparation-egress:test-v3',
      contractRef: { capabilityId: 'sandbox.reference.lookup', version: 3 },
      offeringId: 'offering:sandbox-option-one:reference-lookup:v3',
      bindingId: 'binding:sandbox-option-one:http-json:v4',
      assertionRef: expect.stringMatching(/^sandbox-option:/),
      output: { optionSummary: 'Sandbox Option One — sandbox verification only' },
    })
  })

  it('supports the legacy and corrected binding endpoints during an ordered deployment', async () => {
    const legacy = await handleSandboxCapabilityRequest(
      preparationRequest('https://ae.test/api/sandbox/capability?profile=one'),
      { providerKey: 'secret' },
    )
    const corrected = await handleSandboxCapabilityRequest(
      preparationRequest('https://ae.test/api/sandbox/capability?profile=one&binding=v2'),
      { providerKey: 'secret' },
    )
    const prior = await handleSandboxCapabilityRequest(
      preparationRequest('https://ae.test/api/sandbox/capability?profile=one&binding=v3'),
      { providerKey: 'secret' },
    )
    const current = await handleSandboxCapabilityRequest(
      preparationRequest('https://ae.test/api/sandbox/capability?profile=one&binding=v4'),
      { providerKey: 'secret' },
    )

    await expect(legacy.json()).resolves.toMatchObject({ bindingId: 'binding:sandbox-option-one:http-json' })
    await expect(corrected.json()).resolves.toMatchObject({ bindingId: 'binding:sandbox-option-one:http-json:v2' })
    await expect(prior.json()).resolves.toMatchObject({ bindingId: 'binding:sandbox-option-one:http-json:v3' })
    await expect(current.json()).resolves.toMatchObject({ bindingId: 'binding:sandbox-option-one:http-json:v4' })
  })

  it('composes two independently registered route capabilities through typed outputs', async () => {
    const resolved = await handleSandboxCapabilityRequest(new Request(
      'https://ae.test/api/sandbox/capability?route=resolver', {
        method: 'POST', headers: { Authorization: 'Bearer secret' },
        body: JSON.stringify({ request: 'Resolve this labelled sandbox service' }),
      },
    ), { providerKey: 'secret' })
    expect(resolved.status).toBe(200)
    const resolvedBody = await resolved.json() as { serviceReference: string }
    expect(resolvedBody.serviceReference).toMatch(/^sandbox-service:/)
    expect(resolved.headers.get('Provider-Receipt')).toMatch(/^sandbox-resolver:/)

    const quoted = await handleSandboxCapabilityRequest(new Request(
      'https://ae.test/api/sandbox/capability?route=quoter', {
        method: 'POST', headers: { Authorization: 'Bearer secret' },
        body: JSON.stringify({ serviceReference: resolvedBody.serviceReference }),
      },
    ), { providerKey: 'secret' })
    expect(quoted.status).toBe(200)
    await expect(quoted.json()).resolves.toMatchObject({ quoteReference: expect.stringMatching(/^sandbox-quote:/) })
    expect(quoted.headers.get('Provider-Receipt')).toMatch(/^sandbox-quoter:/)
  })

  it('refuses missing credentials and never commits a real-world effect', async () => {
    const unauthorized = await handleSandboxCapabilityRequest(new Request('https://ae.test/api/sandbox/capability?profile=one', {
      method: 'POST', body: JSON.stringify({}),
    }), { providerKey: 'secret' })
    expect(unauthorized.status).toBe(401)

    const execution = await handleSandboxCapabilityRequest(request('one', {
      operation: 'execute', bindingId: 'sandbox.option.one:v1', capabilityContractId: 'sandbox.option.quote:v1',
    }), { providerKey: 'secret' })
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

  it('exercises deterministic refusal, expiry, timeout and reconciliation through the production adapter', async () => {
    const input = structuredInput('sandbox.option.one:v1', 'sandbox:option-one')
    await expect(binding('one', 'sandbox.option.one:v1', 'sandbox:option-one', 'refusal').quoteStructured?.(input)).resolves.toEqual({
      kind: 'refused', reason: 'sandbox_deterministic_refusal',
    })
    await expect(binding('one', 'sandbox.option.one:v1', 'sandbox:option-one', 'expired').quoteStructured?.(input)).resolves.toMatchObject({
      kind: 'quoted', providerQuoteExpiresAt: 1,
    })
    const timed = binding('one', 'sandbox.option.one:v1', 'sandbox:option-one', 'timeout', async () => {
      throw new DOMException('Timed out', 'TimeoutError')
    })
    await expect(timed.quoteStructured?.(input)).resolves.toEqual({ kind: 'uncertain', reason: 'provider_quote_timeout' })
    const { data: _data, ...reconcileInput } = input
    await expect(timed.reconcileStructuredQuote?.(reconcileInput)).resolves.toMatchObject({
      kind: 'quoted', issuerBindingId: 'sandbox.option.one:v1',
    })
  })

  it('returns materially identical responses for an identical duplicate command', async () => {
    const body = {
      operation: 'structured_quote', bindingId: 'sandbox.option.one:v1', capabilityContractId: 'sandbox.option.quote:v1',
      capabilityContractVersion: 'v1', registrationHash: 'sha256:registration', environment: 'https://ae.test',
      quoteAttemptId: 'attempt:duplicate', allocationId: 'allocation:duplicate',
    }
    const first = await handleSandboxCapabilityRequest(request('one', body, 'duplicate'), { providerKey: 'secret' })
    const replay = await handleSandboxCapabilityRequest(request('one', body, 'duplicate'), { providerKey: 'secret' })
    expect(await replay.json()).toEqual(await first.json())
  })
})

function binding(
  profile: string,
  bindingId: string,
  nodeId: string,
  scenario = 'success',
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>,
) {
  const endpointUrl = `https://ae.test/api/sandbox/capability?profile=${profile}&scenario=${scenario}`
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
    }), { providerKey: 'secret', ...(wait === undefined ? {} : { wait }) }),
  })
}

async function call(profile: string, bindingId: string): Promise<Response> {
  return await handleSandboxCapabilityRequest(request(profile, {
    operation: 'structured_quote', bindingId, capabilityContractId: 'sandbox.option.quote:v1',
    capabilityContractVersion: 'v1', registrationHash: 'sha256:registration', environment: 'https://ae.test',
  }), { providerKey: 'secret' })
}

function request(profile: string, body: Record<string, unknown>, scenario = 'success'): Request {
  return new Request(`https://ae.test/api/sandbox/capability?profile=${profile}&scenario=${scenario}`, {
    method: 'POST', headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
    body: JSON.stringify({ protocolVersion: 'ae-capability:v1', ...body }),
  })
}

function preparationRequest(url: string): Request {
  return new Request(url, {
    method: 'POST', headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      protocol: 'ae.preparation-egress:v1', operationRef: 'preparation-egress:test-v3',
      contractRef: {
        capabilityId: 'sandbox.reference.lookup', version: 3,
        contractDigest: 'sha256:' + 'a'.repeat(64),
      },
      selectionKey: 'ae_selection:test', semanticDigest: 'sha256:' + 'b'.repeat(64),
      facts: [{ inputPointer: '/requestContext', value: 'Compare sandbox options' }],
    }),
  })
}

function structuredInput(bindingId: string, nodeId: string) {
  return {
    quoteAttemptId: 'attempt:scenario', allocationId: 'allocation:scenario', recipient: { bindingId, nodeId },
    capabilityContractId: 'sandbox.option.quote:v1', capabilityContractVersion: 'v1',
    registrationHash: `sha256:${'one'.padEnd(64, '0')}`, environment: 'https://ae.test', data: { requestContext: 'Compare options' },
  }
}
