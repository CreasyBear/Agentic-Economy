import { describe, expect, it } from 'vitest'

import {
  compileCustomerRequest,
  createInMemoryCustomerRequestCompilationStore,
  type CustomerRequestInterpreter,
} from '@/modules/customer-request/compiler'
import {
  createCapabilityContractRegistry,
  defineCapabilityContract,
} from '@/modules/customer-request/public'

describe('compile a CustomerRequest into a registered PlanRevision', () => {
  it('starts from a customer job and known facts without exposing protocol to the caller', async () => {
    const interpreter = fixedInterpreter({
      outcome: 'A tracked shipping label ready to print',
      hardConstraints: [
        { field: 'deliveryDeadline', label: 'Arrive by Friday', value: '2026-07-17' },
        { field: 'trackingRequired', label: 'Tracking required', value: true },
      ],
      preferences: [{ field: 'price', label: 'Prefer lower total price', value: 'lowest_total_price', priority: 1 }],
      substitutions: { allowed: false, boundaries: [] },
      completionCriterion: 'Return a printable label and tracking number.',
      completionRequirement: { evidenceRole: 'result_artifact', valueType: 'url' },
      completionEvidence: [{ actionId: 'action:purchase', field: 'labelUrl' }],
      actions: [
        {
          actionId: 'action:quote', capabilityContractId: 'shipping.rate.query:v1', dependsOn: [],
          input: {
            destinationPostcode: { kind: 'known_fact', fact: 'destinationPostcode' },
            parcelWeightGrams: { kind: 'known_fact', fact: 'parcelWeightGrams' },
            deliveryDeadline: { kind: 'known_fact', fact: 'deliveryDeadline' },
            trackingRequired: { kind: 'known_fact', fact: 'trackingRequired' },
          },
        },
        {
          actionId: 'action:purchase', capabilityContractId: 'shipping.label.purchase:v1', dependsOn: ['action:quote'],
          input: {
            offerRef: { kind: 'action_output', actionId: 'action:quote', field: 'offerRef' },
            recipientAddress: { kind: 'known_fact', fact: 'recipientAddress' },
          },
        },
      ],
    })
    const result = await compileCustomerRequest(command(), dependencies(interpreter))

    expect(result).toMatchObject({
      kind: 'plan_ready',
      request: {
        intent: 'Compare tracked courier options for this parcel and buy the label I approve.',
        revision: 1,
      },
      understanding: {
        outcome: 'A tracked shipping label ready to print',
        substitutions: { allowed: false },
      },
      planRevision: {
        requestRevision: 1,
        proposedByAgentId: 'agent:external:1',
        proposalProvenance: { kind: 'agent_interpretation', interpreterId: 'interpreter:test' },
        actions: [
          {
            capabilityContractId: 'shipping.rate.query:v1',
            input: {
              destinationPostcode: { kind: 'literal', value: '6000' },
              parcelWeightGrams: { kind: 'literal', value: 1_200 },
              deliveryDeadline: { kind: 'literal', value: '2026-07-17' },
              trackingRequired: { kind: 'literal', value: true },
            },
          },
          {
            capabilityContractId: 'shipping.label.purchase:v1',
            providerAffinity: { kind: 'offer_issuer', sourceActionId: 'action:quote' },
          },
        ],
      },
    })
    expect(interpreter.calls).toHaveLength(1)
    expect(interpreter.calls[0]).toMatchObject({
      customerJob: 'Compare tracked courier options for this parcel and buy the label I approve.',
      knownFacts: { destinationPostcode: '6000', parcelWeightGrams: 1_200 },
      capabilities: [
        { capabilityContractId: 'shipping.label.purchase:v1', name: 'Purchase shipping label' },
        { capabilityContractId: 'shipping.rate.express.query:v1', name: 'Query express shipping rates' },
        { capabilityContractId: 'shipping.rate.query:v1', name: 'Query shipping rates' },
      ],
    })
    expect(interpreter.calls[0]).not.toHaveProperty('approvalGrant')
    expect(interpreter.calls[0]).not.toHaveProperty('providerBindings')
    expect(interpreter.calls[0]).not.toHaveProperty('knownFacts.recipientAddress')
  })

  it('asks only for missing required registered inputs instead of inventing a Plan', async () => {
    const interpreter = fixedInterpreter({
      outcome: 'A tracked shipping label ready to print', hardConstraints: [], preferences: [],
      substitutions: { allowed: false, boundaries: [] },
      completionCriterion: 'Return a printable label and tracking number.',
      completionRequirement: { evidenceRole: 'provider_offer', valueType: 'provider_offer_ref' },
      completionEvidence: [{ actionId: 'action:quote', field: 'offerRef' }],
      actions: [{
        actionId: 'action:quote', capabilityContractId: 'shipping.rate.query:v1', dependsOn: [],
        input: {
          destinationPostcode: { kind: 'known_fact', fact: 'destinationPostcode' },
          parcelWeightGrams: { kind: 'known_fact', fact: 'parcelWeightGrams' },
        },
      }],
    })
    const input = command()
    const result = await compileCustomerRequest({
      ...input,
      knownFacts: { destinationPostcode: '6000' },
    }, dependencies(interpreter))

    expect(result).toEqual(expect.objectContaining({
      kind: 'needs_information',
      missingInformation: [{
        field: 'parcelWeightGrams',
        customerLabel: 'Parcel weight in grams',
        reason: 'required_for_registered_capability',
      }],
    }))
    expect(result).not.toHaveProperty('planRevision')
  })

  it('defers commitment-only information until the customer has options to review', async () => {
    const interpreter = fixedInterpreter({
      outcome: 'A tracked shipping label ready to print', hardConstraints: [], preferences: [],
      substitutions: { allowed: false, boundaries: [] },
      completionCriterion: 'Return a printable label and tracking number.',
      completionRequirement: { evidenceRole: 'result_artifact', valueType: 'url' },
      completionEvidence: [{ actionId: 'action:purchase', field: 'labelUrl' }],
      actions: [
        {
          actionId: 'action:quote', capabilityContractId: 'shipping.rate.query:v1', dependsOn: [],
          input: {
            destinationPostcode: { kind: 'known_fact', fact: 'destinationPostcode' },
            parcelWeightGrams: { kind: 'known_fact', fact: 'parcelWeightGrams' },
          },
        },
        {
          actionId: 'action:purchase', capabilityContractId: 'shipping.label.purchase:v1', dependsOn: ['action:quote'],
          input: { offerRef: { kind: 'action_output', actionId: 'action:quote', field: 'offerRef' } },
        },
      ],
    })
    const input = command()
    const result = await compileCustomerRequest({
      ...input,
      knownFacts: { destinationPostcode: '6000', parcelWeightGrams: 1_200 },
    }, dependencies(interpreter))

    expect(result).toMatchObject({
      kind: 'plan_ready',
      planRevision: {
        actions: [
          { actionId: 'action:quote' },
          { actionId: 'action:purchase', input: { recipientAddress: { kind: 'customer_fact', fact: 'recipientAddress' } } },
        ],
      },
    })
  })

  it('returns a decision-changing ambiguity question only when it is grounded in registered capabilities', async () => {
    const interpreter = fixedInterpreter({
      kind: 'ambiguous',
      field: 'serviceSpeed',
      customerLabel: 'Standard or express?',
      candidateCapabilityContractIds: ['shipping.rate.query:v1', 'shipping.rate.express.query:v1'],
    })

    const result = await compileCustomerRequest(command(), dependencies(interpreter))

    expect(result).toMatchObject({
      kind: 'needs_information',
      request: { compilationState: 'needs_information' },
      missingInformation: [{
        field: 'serviceSpeed',
        customerLabel: 'Standard or express?',
        reason: 'disambiguates_registered_capabilities',
        candidateCapabilityContractIds: ['shipping.rate.express.query:v1', 'shipping.rate.query:v1'],
      }],
    })
  })

  it('never asks an ambiguity question whose answer is already known', async () => {
    const interpreter = fixedInterpreter({
      kind: 'ambiguous', field: 'serviceSpeed', customerLabel: 'Standard or express?',
      candidateCapabilityContractIds: ['shipping.rate.query:v1', 'shipping.rate.express.query:v1'],
    })
    const input = command()
    const result = await compileCustomerRequest({
      ...input, knownFacts: { ...input.knownFacts, serviceSpeed: 'express' },
    }, dependencies(interpreter))

    expect(result).toMatchObject({ kind: 'unsupported', reason: 'unsafe_proposal' })
  })

  it('rejects overlapping applicability sets that do not resolve the candidate set', async () => {
    const interpreter = fixedInterpreter({
      kind: 'ambiguous', field: 'serviceSpeed', customerLabel: 'Standard or express?',
      candidateCapabilityContractIds: ['shipping.rate.a:v1', 'shipping.rate.b:v1'],
    })
    const registry = ambiguityRegistry(['standard', 'express'], ['express'])

    const result = await compileCustomerRequest(
      command(), dependencies(interpreter, createInMemoryCustomerRequestCompilationStore(), registry),
    )

    expect(result).toMatchObject({ kind: 'unsupported', reason: 'unsafe_proposal' })
  })

  it('rejects a structurally valid Plan that cannot establish a claimed hard constraint', async () => {
    const interpreter = fixedInterpreter({
      ...quoteProposal(),
      hardConstraints: [{ field: 'restaurantNoiseLevel', label: 'Must be quiet', value: 'quiet' }],
    })

    const result = await compileCustomerRequest(command(), dependencies(interpreter))

    expect(result).toMatchObject({ kind: 'unsupported', reason: 'unsafe_proposal', request: { compilationState: 'unsupported' } })
  })

  it('rejects a known hard constraint that the proposed action silently omits', async () => {
    const interpreter = fixedInterpreter({
      ...quoteProposal(),
      hardConstraints: [{ field: 'trackingRequired', label: 'Tracking required', value: true }],
    })

    const result = await compileCustomerRequest(command(), dependencies(interpreter))

    expect(result).toMatchObject({ kind: 'unsupported', reason: 'unsafe_proposal' })
  })

  it('rejects a preference that cannot influence registered options or the routing objective', async () => {
    const interpreter = fixedInterpreter({
      ...quoteProposal(),
      preferences: [{ field: 'restaurantNoiseLevel', label: 'Prefer quiet', value: 'quiet', priority: 1 }],
    })

    const result = await compileCustomerRequest(command(), dependencies(interpreter))

    expect(result).toMatchObject({ kind: 'unsupported', reason: 'unsafe_proposal' })
  })

  it('rejects a routing preference whose requested direction contradicts the routing objective', async () => {
    const interpreter = fixedInterpreter({
      ...quoteProposal(),
      preferences: [{ field: 'price', label: 'Prefer premium pricing', value: 'highest_price', priority: 1 }],
    })

    const result = await compileCustomerRequest(command(), dependencies(interpreter))

    expect(result).toMatchObject({ kind: 'unsupported', reason: 'unsafe_proposal' })
  })

  it('requires allowed substitutions to have registered safety boundaries', async () => {
    const unbounded = fixedInterpreter({
      ...quoteProposal(), substitutions: { allowed: true, boundaries: [] },
    })
    await expect(compileCustomerRequest(command(), dependencies(unbounded))).resolves.toMatchObject({
      kind: 'unsupported', reason: 'unsafe_proposal',
    })

    const bounded = fixedInterpreter({
      ...quoteProposal(), substitutions: { allowed: true, boundaries: ['destinationPostcode'] },
    })
    await expect(compileCustomerRequest(command(), dependencies(bounded))).resolves.toMatchObject({ kind: 'plan_ready' })
  })

  it('rejects a future deadline that no registered action binds', async () => {
    const interpreter = fixedInterpreter({ ...quoteProposal(), deadline: 2_000 })

    const result = await compileCustomerRequest(command(), dependencies(interpreter))

    expect(result).toMatchObject({ kind: 'unsupported', reason: 'unsafe_proposal' })
  })

  it('rejects a Plan whose registered outputs cannot prove the completion criterion', async () => {
    const interpreter = fixedInterpreter({
      ...quoteProposal(),
      completionCriterion: 'Return a printable shipping label.',
      completionRequirement: { evidenceRole: 'result_artifact', valueType: 'url' },
      completionEvidence: [{ actionId: 'action:quote', field: 'labelUrl' }],
    })

    const result = await compileCustomerRequest(command(), dependencies(interpreter))

    expect(result).toMatchObject({ kind: 'unsupported', reason: 'unsafe_proposal' })
  })

  it('rejects unregistered capabilities and model-authored authority without calling a provider', async () => {
    const unregistered = fixedInterpreter({
      outcome: 'A label', hardConstraints: [], preferences: [], substitutions: { allowed: true, boundaries: [] },
      completionCriterion: 'Return a label.',
      completionRequirement: { evidenceRole: 'result_artifact', valueType: 'url' },
      completionEvidence: [{ actionId: 'action:buy', field: 'labelUrl' }],
      actions: [{ actionId: 'action:buy', capabilityContractId: 'prompt.injected.purchase:v1', dependsOn: [], input: {} }],
    })
    const unsupported = await compileCustomerRequest(command(), dependencies(unregistered))
    expect(unsupported).toMatchObject({ kind: 'unsupported', reason: 'no_registered_capability' })

    const authorityInjection = fixedInterpreter({
      outcome: 'A label', hardConstraints: [], preferences: [], substitutions: { allowed: true, boundaries: [] },
      completionCriterion: 'Return a label.',
      actions: [],
      approvalGrant: { approved: true },
    })
    const unsafe = await compileCustomerRequest(command(), dependencies(authorityInjection))
    expect(unsafe).toMatchObject({ kind: 'unsupported', reason: 'unsafe_proposal' })
  })

  it('uses Request compare-and-swap so one stale revision writer loses', async () => {
    const store = createInMemoryCustomerRequestCompilationStore()
    const interpreter = quoteInterpreter()
    const first = await compileCustomerRequest(command(), dependencies(interpreter, store))
    expect(first).toMatchObject({ kind: 'plan_ready', request: { revision: 1 } })

    const revision = { ...command(), expectedRevision: 1, customerJob: 'Compare tracked express labels and buy the one I approve.' }
    const changed = await Promise.all([
      compileCustomerRequest({ ...revision, compilationKey: 'compile:revision:a' }, dependencies(interpreter, store)),
      compileCustomerRequest({ ...revision, compilationKey: 'compile:revision:b' }, dependencies(interpreter, store)),
    ])

    expect(changed.filter((result) => result.kind === 'plan_ready')).toHaveLength(1)
    expect(changed.filter((result) => result.kind === 'revision_conflict')).toHaveLength(1)
    expect(await store.getRequest('request:shipping:1')).toMatchObject({ revision: 2 })
    expect(await store.getRequestRevision('request:shipping:1', 1)).toMatchObject({ revision: 1 })
    expect(await store.getRequestRevision('request:shipping:1', 2)).toMatchObject({ revision: 2 })
  })

  it('replays the persisted compilation without invoking a nondeterministic interpreter again', async () => {
    const store = createInMemoryCustomerRequestCompilationStore()
    let calls = 0
    const interpreter: CustomerRequestInterpreter = {
      interpreterId: 'interpreter:flapping',
      interpret: async () => {
        calls += 1
        return calls === 1 ? quoteProposal() : { approvalGrant: { approved: true } }
      },
    }

    const first = await compileCustomerRequest(command(), dependencies(interpreter, store))
    const replay = await compileCustomerRequest(command(), dependencies(interpreter, store))

    expect(first).toMatchObject({ kind: 'plan_ready' })
    expect(replay).toEqual(first)
    expect(calls).toBe(1)
  })

  it('cannot transfer Request ownership during a revision', async () => {
    const store = createInMemoryCustomerRequestCompilationStore()
    const interpreter = quoteInterpreter()
    await compileCustomerRequest(command(), dependencies(interpreter, store))

    const result = await compileCustomerRequest({
      ...command(), compilationKey: 'compile:ownership-transfer', expectedRevision: 1,
      principalId: 'principal:attacker',
    }, dependencies(interpreter, store))

    expect(result).toEqual({ kind: 'identity_conflict', requestId: 'request:shipping:1' })
    expect(await store.getRequest('request:shipping:1')).toMatchObject({ principalId: 'principal:customer:1', revision: 1 })
  })
})

function command() {
  return {
    compilationKey: 'compile:shipping:1',
    requestId: 'request:shipping:1', principalId: 'principal:customer:1', delegatedAgentId: 'agent:external:1',
    customerJob: 'Compare tracked courier options for this parcel and buy the label I approve.',
    knownFacts: {
      destinationPostcode: '6000', parcelWeightGrams: 1_200,
      recipientAddress: '10 Example Street, Perth WA 6000',
      deliveryDeadline: '2026-07-17', trackingRequired: true,
    },
    routing: { networkId: 'network:au-first', currency: 'AUD', maximumSpendMinor: 2_500, optimizeFor: 'cost' as const },
  }
}

function dependencies(
  interpreter: CustomerRequestInterpreter,
  store = createInMemoryCustomerRequestCompilationStore(),
  registry = shippingRegistry(),
) {
  return { interpreter, registry, store, now: () => 1_000 }
}

function fixedInterpreter(proposal: unknown) {
  const calls: Parameters<CustomerRequestInterpreter['interpret']>[0][] = []
  return {
    calls,
    interpreterId: 'interpreter:test',
    interpret: async (input: Parameters<CustomerRequestInterpreter['interpret']>[0]) => {
      calls.push(input)
      return proposal
    },
  }
}

function quoteInterpreter() {
  return fixedInterpreter(quoteProposal())
}

function quoteProposal() {
  return {
    outcome: 'Comparable tracked shipping options', hardConstraints: [], preferences: [],
    substitutions: { allowed: false, boundaries: [] }, completionCriterion: 'Return comparable quotes.',
    completionRequirement: { evidenceRole: 'provider_offer', valueType: 'provider_offer_ref' },
    completionEvidence: [{ actionId: 'action:quote', field: 'offerRef' }],
    actions: [{
      actionId: 'action:quote', capabilityContractId: 'shipping.rate.query:v1', dependsOn: [],
      input: {
        destinationPostcode: { kind: 'known_fact', fact: 'destinationPostcode' },
        parcelWeightGrams: { kind: 'known_fact', fact: 'parcelWeightGrams' },
      },
    }],
  }
}

function shippingRegistry() {
  return createCapabilityContractRegistry([
    defineCapabilityContract({
      capabilityContractId: 'shipping.rate.query:v1', name: 'Query shipping rates', operation: 'query',
      input: {
        destinationPostcode: field('string', 'Destination postcode'),
        parcelWeightGrams: field('integer', 'Parcel weight in grams'),
        deliveryDeadline: { ...field('string', 'Delivery deadline'), required: false },
        trackingRequired: { ...field('boolean', 'Tracking required'), required: false },
        serviceSpeed: { ...field('string', 'Service speed'), required: false },
      },
      output: { offerRef: { ...field('provider_offer_ref', 'Provider offer'), evidenceRole: 'provider_offer' } },
      applicability: [{ field: 'serviceSpeed', acceptedValues: ['standard'] }],
      consequence: { commitment: 'none', spend: 'none', reversibility: 'not_applicable', approval: 'none' },
    }),
    defineCapabilityContract({
      capabilityContractId: 'shipping.rate.express.query:v1', name: 'Query express shipping rates', operation: 'query',
      input: { serviceSpeed: { ...field('string', 'Service speed'), required: false } },
      output: { offerRef: { ...field('provider_offer_ref', 'Provider offer'), evidenceRole: 'provider_offer' } },
      applicability: [{ field: 'serviceSpeed', acceptedValues: ['express'] }],
      consequence: { commitment: 'none', spend: 'none', reversibility: 'not_applicable', approval: 'none' },
    }),
    defineCapabilityContract({
      capabilityContractId: 'shipping.label.purchase:v1', name: 'Purchase shipping label', operation: 'purchase',
      input: {
        offerRef: field('provider_offer_ref', 'Provider offer'),
        recipientAddress: field('string', 'Recipient address'),
      },
      output: { labelUrl: { ...field('url', 'Shipping label'), evidenceRole: 'result_artifact' } },
      consequence: { commitment: 'purchase', spend: 'quoted', reversibility: 'conditional', approval: 'explicit' },
      providerAffinity: { kind: 'offer_issuer', inputField: 'offerRef' },
    }),
  ])
}

function ambiguityRegistry(firstValues: readonly string[], secondValues: readonly string[]) {
  const contract = (capabilityContractId: string, acceptedValues: readonly string[]) => defineCapabilityContract({
    capabilityContractId, name: capabilityContractId, operation: 'query',
    input: { serviceSpeed: field('string', 'Service speed') },
    output: { offerRef: { ...field('provider_offer_ref', 'Provider offer'), evidenceRole: 'provider_offer' } },
    applicability: [{ field: 'serviceSpeed', acceptedValues }],
    consequence: { commitment: 'none', spend: 'none', reversibility: 'not_applicable', approval: 'none' },
  })
  return createCapabilityContractRegistry([
    contract('shipping.rate.a:v1', firstValues), contract('shipping.rate.b:v1', secondValues),
  ])
}

function field(valueType: 'string' | 'integer' | 'boolean' | 'url' | 'provider_offer_ref', customerLabel: string) {
  return { valueType, customerLabel, required: true } as const
}
