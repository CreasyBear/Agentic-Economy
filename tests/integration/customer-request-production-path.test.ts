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

describe('production CustomerRequest path', () => {
  it('compiles and prepares two registered business options through the neutral kernel and production provider interface', async () => {
    const contract = defineCapabilityContract({
      capabilityContractId: 'sandbox.option.quote:v1', name: 'Prepare a sandbox option', operation: 'quote',
      preparation: { purpose: 'sandbox_option_comparison', customerLabel: 'Compare sandbox options' },
      input: { requestContext: {
        valueType: 'string', customerLabel: 'Request details', required: false, decisionRelevance: 'option_selection',
        disclosure: { classification: 'public', phase: 'preparation', recipient: 'candidate_provider', purposes: ['sandbox_option_comparison'] },
      } },
      output: { optionSummary: { valueType: 'string', customerLabel: 'Option', required: true, decisionRelevance: 'option_selection', evidenceRole: 'provider_offer' } },
      consequence: { commitment: 'none', spend: 'quoted', reversibility: 'not_applicable', approval: 'explicit' },
    })
    const registry = createCapabilityContractRegistry([contract])
    const compiled = await compileCustomerRequest({
      compilationKey: 'submit:request:production:1', requestId: 'request:production:1',
      principalId: 'principal:customer:1', delegatedAgentId: 'agent:external:1',
      customerJob: 'Compare the connected sandbox options.', knownFacts: {},
      routing: { networkId: 'ae:public', currency: 'AUD', maximumSpendMinor: 2_000, optimizeFor: 'cost' },
    }, {
      interpreter: { interpreterId: 'interpreter:integration', interpret: async () => ({
        outcome: 'Comparable connected options', hardConstraints: [], preferences: [], substitutions: { allowed: false, boundaries: [] },
        completionCriterion: 'Return comparable business options.',
        completionRequirement: { evidenceRole: 'provider_offer', valueType: 'string' },
        completionEvidence: [{ actionId: 'action:compare', field: 'optionSummary' }],
        actions: [{ actionId: 'action:compare', capabilityContractId: contract.capabilityContractId, dependsOn: [], input: {} }],
      }) },
      registry, store: createInMemoryCustomerRequestCompilationStore(), now: () => 1_000,
    })
    if (compiled.kind !== 'plan_ready') throw new Error(`expected_plan_ready_${compiled.kind}`)

    const preparationStore = createInMemoryCustomerRequestPreparationStore()
    await preparationStore.putRequest(compiled.request)
    await preparationStore.putPlanRevision(compiled.planRevision)
    const bindings = [
      sandboxBinding('one', 'sandbox.option.one:v1', 'sandbox:option-one'),
      sandboxBinding('two', 'sandbox.option.two:v1', 'sandbox:option-two'),
    ]
    let id = 0
    const kernel = createNeutralRoutingKernel({
      now: () => 2_000, executionMode: 'simulation', ids: { next: (prefix) => `${prefix}:${++id}` },
      quoteTtlMs: 60_000, bindings,
    })
    const prepared = await prepareCustomerRequestAction({
      preparationKey: 'compare:request:production:1:1', requestId: compiled.request.requestId,
      requestRevision: compiled.request.revision, planRevisionId: compiled.planRevision.planRevisionId,
      actionId: compiled.planRevision.actions[0]?.actionId ?? '', resolvedInput: {},
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
  })
})

function sandboxBinding(profile: string, bindingId: string, nodeId: string): CapabilityBindingAdapter {
  const endpointUrl = `https://ae.test/api/sandbox/capability?profile=${profile}`
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
    send: async (outbound) => await handleSandboxCapabilityRequest(new Request(endpointUrl, {
      method: 'POST', headers: outbound.headers, body: await outbound.text(),
    }), { providerKey: 'secret', now: () => 2_000 }),
  })
}
