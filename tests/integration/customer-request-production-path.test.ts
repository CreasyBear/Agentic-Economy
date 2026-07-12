import { describe, expect, it } from 'vitest'

import { handleSandboxCapabilityRequest } from '@/lib/server/sandbox-capability-provider'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { compileCustomerRequest, createInMemoryCustomerRequestCompilationStore } from '@/modules/customer-request/compiler'
import { createKernelCustomerRequestActionRouter } from '@/modules/customer-request/kernel-router'
import { prepareCustomerRequestAction, createInMemoryCustomerRequestPreparationStore } from '@/modules/customer-request/preparation'
import { createInMemoryPreparationDisclosureStore } from '@/modules/customer-request/preparation-authority'
import { createCapabilityContractRegistry, defineCapabilityContract } from '@/modules/customer-request/public'
import { createHttpCapabilityBinding } from '@/modules/routing-kernel/http-capability-binding'
import { createNeutralRoutingKernel, type CapabilityBindingAdapter } from '@/modules/routing-kernel/application'
import { SANDBOX_OPTION_CAPABILITY_CONTRACT } from '@/modules/sandbox-supply/public'

describe('production CustomerRequest path', () => {
  it('compiles and prepares two registered business options through the neutral kernel and production provider interface', async () => {
    const contract = defineCapabilityContract(SANDBOX_OPTION_CAPABILITY_CONTRACT)
    const registry = createCapabilityContractRegistry([contract])
    const compiled = await compileCustomerRequest({
      compilationKey: 'submit:request:production:1', requestId: 'request:production:1',
      principalId: 'principal:customer:1', delegatedAgentId: 'agent:external:1',
      customerJob: 'Compare the connected sandbox options.', knownFacts: { requestContext: 'Compare the connected sandbox options.' },
      routing: { networkId: 'ae:public', currency: 'AUD', maximumSpendMinor: 2_000, optimizeFor: 'cost' },
    }, {
      interpreter: { interpreterId: 'interpreter:integration', interpret: async () => ({
        outcome: 'Comparable connected options', hardConstraints: [], preferences: [], substitutions: { allowed: false, boundaries: [] },
        completionCriterion: 'Return comparable business options.',
        completionRequirement: { evidenceRole: 'provider_offer', valueType: 'string' },
        completionEvidence: [{ actionId: 'action:compare', field: 'optionSummary' }],
        actions: [{
          actionId: 'action:compare', capabilityContractId: contract.capabilityContractId, dependsOn: [],
          input: { requestContext: { kind: 'known_fact', fact: 'requestContext' } },
        }],
      }) },
      registry, store: createInMemoryCustomerRequestCompilationStore(), now: () => 1_000,
    })
    if (compiled.kind !== 'plan_ready') throw new Error(`expected_plan_ready_${compiled.kind}`)

    const preparationStore = createInMemoryCustomerRequestPreparationStore()
    await preparationStore.putRequest(compiled.request)
    await preparationStore.putPlanRevision(compiled.planRevision)
    const observedProviderInputs: unknown[] = []
    const bindings = [
      sandboxBinding('one', 'sandbox.option.one:v1', 'sandbox:option-one', (data) => observedProviderInputs.push(data)),
      sandboxBinding('two', 'sandbox.option.two:v1', 'sandbox:option-two', (data) => observedProviderInputs.push(data)),
    ]
    let id = 0
    const kernel = createNeutralRoutingKernel({
      now: () => 2_000, executionMode: 'simulation', ids: { next: (prefix) => `${prefix}:${++id}` },
      quoteTtlMs: 60_000, bindings,
    })
    const prepared = await prepareCustomerRequestAction({
      preparationKey: 'compare:request:production:1:1', requestId: compiled.request.requestId,
      requestRevision: compiled.request.revision, planRevisionId: compiled.planRevision.planRevisionId,
      actionId: compiled.planRevision.actions[0]?.actionId ?? '',
      resolvedInput: literalPlanInput(compiled.planRevision.actions[0]?.input ?? {}),
    }, {
      store: preparationStore,
      router: createKernelCustomerRequestActionRouter(kernel, {
        resolve: async (bindingIds) => bindingIds.map((bindingId) => ({
          bindingId, nodeId: bindingId === 'sandbox.option.one:v1' ? 'sandbox:option-one' : 'sandbox:option-two',
          businessName: bindingId === 'sandbox.option.one:v1' ? 'Sandbox Option One' : 'Sandbox Option Two',
          cancellation: { kind: 'unsupported', summary: 'No effect is created.' },
        })),
      }),
      registry,
      preparationAuthorityVerifier: { verify: async () => ({ kind: 'refused', reason: 'authority_evidence_invalid' }) },
      preparationDisclosureStore: createInMemoryPreparationDisclosureStore(),
      commitProtectedProjection: (projection) => canonicalDigest(projection), now: () => 2_000, leaseMs: 30_000,
    })

    expect(prepared).toMatchObject({
      kind: 'options_prepared', candidateSet: { candidates: [
        { business: { name: 'Sandbox Option One' }, expectedCost: { amountMinor: 1_200 } },
        { business: { name: 'Sandbox Option Two' }, expectedCost: { amountMinor: 900 } },
      ] },
    })
    expect(JSON.stringify(prepared)).not.toMatch(/bindingId|nodeId|capabilityContractId|registrationHash|quoteAttemptId|allocationId/)
    expect(observedProviderInputs).toEqual([
      { requestContext: 'Compare the connected sandbox options.' },
      { requestContext: 'Compare the connected sandbox options.' },
    ])
  })

  it('keeps uncertainty resumable, reconciles it, rejects expired/refused supply, and replays duplicate preparation exactly', async () => {
    const recovering = await scenarioFixture('success', 'timeout')
    await expect(recovering.run()).resolves.toMatchObject({ kind: 'preparation_in_progress' })
    recovering.setNow(33_000)
    const recovered = await recovering.run()
    expect(recovered).toMatchObject({ kind: 'options_prepared', candidateSet: { candidates: [{}, {}] } })
    await expect(recovering.run()).resolves.toEqual(recovered)

    const unavailable = await scenarioFixture('refusal', 'expired')
    await expect(unavailable.run()).resolves.toMatchObject({ kind: 'preparation_refused', reason: 'no_connected_option' })

    const duplicate = await scenarioFixture('duplicate', 'duplicate')
    const first = await duplicate.run()
    await expect(duplicate.run()).resolves.toEqual(first)
  })
})

async function scenarioFixture(firstScenario: string, secondScenario: string) {
  const contract = defineCapabilityContract(SANDBOX_OPTION_CAPABILITY_CONTRACT)
  const registry = createCapabilityContractRegistry([contract])
  const compiled = await compileCustomerRequest({
    compilationKey: `submit:scenario:${firstScenario}:${secondScenario}`, requestId: `request:scenario:${firstScenario}:${secondScenario}`,
    principalId: 'principal:customer:1', delegatedAgentId: 'agent:external:1', customerJob: 'Compare connected sandbox options.',
    knownFacts: { requestContext: 'Compare connected sandbox options.' },
    routing: { networkId: 'ae:public', currency: 'AUD', maximumSpendMinor: 2_000, optimizeFor: 'cost' },
  }, {
    interpreter: { interpreterId: 'interpreter:scenario', interpret: async () => ({
      outcome: 'Comparable connected options', hardConstraints: [], preferences: [], substitutions: { allowed: false, boundaries: [] },
      completionCriterion: 'Return comparable business options.', completionRequirement: { evidenceRole: 'provider_offer', valueType: 'string' },
      completionEvidence: [{ actionId: 'action:compare', field: 'optionSummary' }],
      actions: [{
        actionId: 'action:compare', capabilityContractId: contract.capabilityContractId, dependsOn: [],
        input: { requestContext: { kind: 'known_fact', fact: 'requestContext' } },
      }],
    }) }, registry, store: createInMemoryCustomerRequestCompilationStore(), now: () => 1_000,
  })
  if (compiled.kind !== 'plan_ready') throw new Error(`expected_scenario_plan_${compiled.kind}`)
  const store = createInMemoryCustomerRequestPreparationStore()
  await store.putRequest(compiled.request)
  await store.putPlanRevision(compiled.planRevision)
  let now = 2_000
  let id = 0
  const timeout = async () => { throw new DOMException('Timed out', 'TimeoutError') }
  const bindings = [
    sandboxBinding('one', 'sandbox.option.one:v1', 'sandbox:option-one', () => undefined, firstScenario, firstScenario === 'timeout' ? timeout : undefined),
    sandboxBinding('two', 'sandbox.option.two:v1', 'sandbox:option-two', () => undefined, secondScenario, secondScenario === 'timeout' ? timeout : undefined),
  ]
  const kernel = createNeutralRoutingKernel({
    now: () => now, executionMode: 'simulation', ids: { next: (prefix) => `${prefix}:${++id}` }, quoteTtlMs: 60_000, bindings,
  })
  const dependencies = {
    store,
    router: createKernelCustomerRequestActionRouter(kernel, {
      resolve: async (bindingIds: readonly string[]) => bindingIds.map((bindingId) => ({
        bindingId, nodeId: bindingId === 'sandbox.option.one:v1' ? 'sandbox:option-one' : 'sandbox:option-two',
        businessName: bindingId === 'sandbox.option.one:v1' ? 'Sandbox Option One' : 'Sandbox Option Two',
        cancellation: { kind: 'unsupported' as const, summary: 'No effect is created.' },
      })),
    }),
    registry,
    preparationAuthorityVerifier: { verify: async () => ({ kind: 'refused' as const, reason: 'authority_evidence_invalid' as const }) },
    preparationDisclosureStore: createInMemoryPreparationDisclosureStore(),
    commitProtectedProjection: (projection: Readonly<Record<string, string | number | boolean>>) => canonicalDigest(projection),
    now: () => now, leaseMs: 30_000,
  }
  const command = {
    preparationKey: `compare:${compiled.request.requestId}:1`, requestId: compiled.request.requestId,
    requestRevision: compiled.request.revision, planRevisionId: compiled.planRevision.planRevisionId,
    actionId: compiled.planRevision.actions[0]?.actionId ?? '',
    resolvedInput: literalPlanInput(compiled.planRevision.actions[0]?.input ?? {}),
  }
  return {
    run: async () => await prepareCustomerRequestAction(command, dependencies),
    setNow: (value: number) => { now = value },
  }
}

function literalPlanInput(
  input: Readonly<Record<string, Readonly<{ kind: string; value?: string | number | boolean }>>>,
): Record<string, string | number | boolean> {
  const resolved: Record<string, string | number | boolean> = {}
  for (const [field, source] of Object.entries(input)) {
    if (source.kind !== 'literal' || source.value === undefined) throw new Error(`integration_plan_input_unresolved_${field}`)
    resolved[field] = source.value
  }
  return resolved
}

function sandboxBinding(
  profile: string,
  bindingId: string,
  nodeId: string,
  observeInput: (data: unknown) => void,
  scenario = 'success',
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>,
): CapabilityBindingAdapter {
  const endpointUrl = `https://ae.test/api/sandbox/capability?profile=${profile}&scenario=${scenario}`
  return createHttpCapabilityBinding({
    endpointUrl, credentialRef: 'env:AE_SANDBOX_PROVIDER_KEY',
    binding: {
      bindingId, nodeId, networkId: 'ae:public', capabilityContractId: 'sandbox.option.quote:v1', operation: 'quote',
      admission: 'admitted', conformance: 'conformant', queryTerms: ['sandbox option'],
      registrationHash: `sha256:${profile.padEnd(64, '0')}`, environment: 'https://ae.test',
      adapterFeatures: { requestCancellation: 'unsupported', quotePreparation: 'structured_authorized' },
    },
  }, {
    validateTarget: async () => true, resolveCredential: async () => 'secret', now: () => 2_000,
    send: async (outbound) => {
      const bodyText = await outbound.text()
      const body: unknown = JSON.parse(bodyText)
      if (typeof body === 'object' && body !== null && 'data' in body) observeInput(body.data)
      return await handleSandboxCapabilityRequest(new Request(endpointUrl, {
        method: 'POST', headers: outbound.headers, body: bodyText, signal: outbound.signal,
      }), { providerKey: 'secret', ...(wait === undefined ? {} : { wait }) })
    },
  })
}
