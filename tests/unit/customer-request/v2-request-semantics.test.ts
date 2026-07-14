import { describe, expect, it, vi } from 'vitest'

import {
  defineCapabilityContract,
  isBoundedJsonValue,
  openCapabilityDecisionModel,
  projectCapabilityInputValueSchema,
} from '@/modules/capability-contract/public'
import {
  discoverRequestEvaluationCandidates,
  evaluateCustomerRequestSnapshot,
  requestRegistrySnapshotDigest,
  type RegisteredSupplyPrice,
} from '@/modules/customer-request/evaluation'
import { compileCustomerRequest } from '@/modules/customer-request/compiler'
import {
  bindCustomerCapabilityDescriptor,
  createJsonCustomerRequestSemanticInterpreter,
  deriveCustomerDecisionPreference,
} from '@/modules/customer-request/semantic-interpreter'
import { capabilityContractV2 } from '@/../tests/fixtures/capability-contract-v2'

describe('V2 Request semantics', () => {
  it('gives the interpreter only opaque keys and customer descriptors, then binds structured values server-side', async () => {
    const model = decisionModelWithCommitment()
    const requestInput = requiredInput(model, 'request')
    const generateJson = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        kind: 'capability_candidates',
        selections: [{
          selectionKey: model.selectionKey,
          facts: [{ inputKey: requestInput.key, value: { topic: 'market data' } }],
        }],
      }),
    })
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:test', transport: { generateJson }, timeoutMs: 1_000,
      maximumPayloadBytes: 64_000, maximumResponseBytes: 8_000,
    })

    const proposal = await interpreter.propose({
      customerJob: 'Find market data about routing.',
      capabilities: [bindCustomerCapabilityDescriptor({
        contractRef: model.contractRef,
        selectionKey: model.selectionKey,
        name: 'Search data',
        description: 'Returns matching data.',
        inputs: model.inputs,
        valueSchemas: inputValueSchemas(model, structuredInputSchema()),
        evidence: model.evidence.map(({ label, purpose, schemaIdentity }) => ({ label, purpose, schemaIdentity })),
      })],
    })

    expect(proposal).toMatchObject({
      kind: 'capability_candidates',
      selections: [{
        selectionKey: model.selectionKey,
        facts: [{
          contractRef: model.contractRef,
          inputKey: requestInput.key,
          inputPointer: requestInput.inputPointer,
          value: { topic: 'market data' },
        }],
      }],
    })
    const sent = JSON.stringify(generateJson.mock.calls[0])
    expect(sent).not.toContain(model.contractRef.capabilityId)
    expect(sent).not.toContain(model.contractRef.contractDigest)
    expect(sent).not.toMatch(/"version"|"inputPointer"|"evidenceId"|"operation"|"provider/i)
    const sentRequestInput = generateJson.mock.calls[0]?.[0].payload.capabilities[0]?.inputs.find((input: { inputKey: string }) => (
      input.inputKey === requestInput.key
    ))
    expect(sentRequestInput).toMatchObject({
      inputKey: requestInput.key,
      valueSchema: {
        type: 'object',
        properties: { topic: { type: 'string', minLength: 1 } },
        required: ['topic'],
        additionalProperties: false,
      },
    })
  })

  it('preserves divergent model outputs even when both normalize to the same empty selection set', async () => {
    const model = decisionModelWithCommitment()
    const generateJson = vi.fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({
          kind: 'capability_candidates',
          selections: [{ selectionKey: 'unknown:first', facts: [] }],
        }),
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          kind: 'capability_candidates',
          selections: [{ selectionKey: 'unknown:second', facts: [] }],
        }),
      })
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:divergence', transport: { generateJson }, timeoutMs: 1_000,
      maximumPayloadBytes: 64_000, maximumResponseBytes: 8_000,
    })
    const capabilities = [bindCustomerCapabilityDescriptor({
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      name: 'Search data',
      description: 'Returns matching data.',
      inputs: model.inputs,
      valueSchemas: inputValueSchemas(model, structuredInputSchema()),
      evidence: model.evidence.map(({ label, purpose, schemaIdentity }) => ({ label, purpose, schemaIdentity })),
    })]

    const first = await interpreter.propose({ customerJob: 'Find market data.', capabilities })
    const second = await interpreter.propose({ customerJob: 'Find market data.', capabilities })

    expect(first).toMatchObject({ kind: 'capability_candidates', selections: [] })
    expect(second).toMatchObject({ kind: 'capability_candidates', selections: [] })
    if (first.interpretationEvidence === undefined || second.interpretationEvidence === undefined) {
      throw new Error('model interpretation evidence missing')
    }
    expect(first.interpretationEvidence.inputDigest).toBe(second.interpretationEvidence.inputDigest)
    expect(first.interpretationEvidence.outputDigest).not.toBe(second.interpretationEvidence.outputDigest)
  })

  it('derives option viability from the V2 model without requiring commitment-only input', () => {
    const model = decisionModelWithCommitment()
    const requestInput = requiredInput(model, 'request')
    const evaluation = evaluateCustomerRequestSnapshot({
      requestId: 'request:v2', requestRevision: 1, intent: 'Find data',
      facts: [{
        contractRef: model.contractRef,
        selectionKey: model.selectionKey,
        inputKey: requestInput.key,
        inputPointer: requestInput.inputPointer,
        schemaIdentity: requestInput.schemaIdentity,
        value: { topic: 'routing' },
        source: { kind: 'customer', assertionRef: 'assertion:request' },
      }],
      registrySnapshotDigest: 'sha256:graph',
      candidates: [{
        businessId: 'business:one', offeringId: 'offering:one', bindingId: 'binding:one', model,
        offeringRegistrationHash: 'sha256:offering', bindingRegistrationHash: 'sha256:binding',
      }],
    })

    expect(evaluation.posture).toBe('progress_available')
    expect(evaluation.candidates[0]).toMatchObject({
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      semanticDigest: model.semanticDigest,
      viability: { kind: 'viable' },
    })
    expect(evaluation.nextRequirement).toBeUndefined()
  })

  it('refuses an expanded descriptor payload before calling the model transport', async () => {
    const model = decisionModelWithCommitment()
    const generateJson = vi.fn()
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:bounded-payload', transport: { generateJson }, timeoutMs: 1_000,
      maximumPayloadBytes: 1, maximumResponseBytes: 8_000,
    })

    await expect(interpreter.propose({
      customerJob: 'Find market data.',
      capabilities: [bindCustomerCapabilityDescriptor({
        contractRef: model.contractRef,
        selectionKey: model.selectionKey,
        name: 'Search data',
        description: 'Returns matching data.',
        inputs: model.inputs,
        valueSchemas: inputValueSchemas(model, structuredInputSchema()),
        evidence: model.evidence.map(({ label, purpose, schemaIdentity }) => ({ label, purpose, schemaIdentity })),
      })],
    })).rejects.toThrow('customer_request_semantic_interpretation_payload_too_large')
    expect(generateJson).not.toHaveBeenCalled()
  })

  it('uses the capability-owned projection to disclose missing preparation input before collection', () => {
    const model = openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2({
      inputSchema: structuredInputSchema(),
      customerAnnotations: structuredAnnotations(),
      dataUse: [
        {
          effectId: 'request_release', inputPointer: '/request', classification: 'personal', phase: 'preparation',
          recipient: { kind: 'candidate_binding' }, purposes: ['prepare_customer_options'],
        },
        {
          effectId: 'approval_release', inputPointer: '/approval', classification: 'credential', phase: 'preparation',
          recipient: { kind: 'candidate_binding' }, purposes: ['confirm_customer_authority'],
        },
      ],
      effects: structuredEffects(),
    })))
    const requestInput = requiredInput(model, 'request')

    const evaluation = evaluateCustomerRequestSnapshot({
      requestId: 'request:disclosure', requestRevision: 1, intent: 'Find data',
      facts: [{
        contractRef: model.contractRef,
        selectionKey: model.selectionKey,
        inputKey: requestInput.key,
        inputPointer: requestInput.inputPointer,
        schemaIdentity: requestInput.schemaIdentity,
        value: { topic: 'routing' },
        source: { kind: 'customer', assertionRef: 'assertion:request' },
      }],
      registrySnapshotDigest: 'sha256:graph',
      candidates: [{
        businessId: 'business:one', offeringId: 'offering:one', bindingId: 'binding:one', model,
        offeringRegistrationHash: 'sha256:offering', bindingRegistrationHash: 'sha256:binding',
      }],
    })

    expect(evaluation.preparationDisclosure).toEqual({
      maximumRecipients: 1,
      purposes: ['confirm_customer_authority', 'prepare_customer_options'],
      categories: [
        expect.objectContaining({ label: 'Approval', classification: 'credential' }),
        expect.objectContaining({ label: 'What to find', classification: 'personal' }),
      ],
    })
  })

  it('matches and hashes eligible supply by the complete exact contract reference', () => {
    const first = decisionModelWithCommitment()
    const second = openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2({
      version: 2,
      inputSchema: structuredInputSchema(),
      customerAnnotations: structuredAnnotations(),
      dataUse: structuredDataUse(),
      effects: structuredEffects(),
    })))
    const bindings = [
      supply('binding:first', first),
      supply('binding:second', second),
    ]

    expect(discoverRequestEvaluationCandidates({
      selectedCapabilities: [{ selectionKey: first.selectionKey, contractRef: first.contractRef }],
      bindings,
      resolveModel: (ref) => ref.contractDigest === first.contractRef.contractDigest ? first : second,
    }).map(({ bindingId }) => bindingId)).toEqual(['binding:first'])
    expect(requestRegistrySnapshotDigest(bindings)).not.toBe(requestRegistrySnapshotDigest([
      { ...bindings[0]!, contractRef: second.contractRef }, bindings[1]!,
    ]))
  })

  it('derives completion only from registered completion evidence on the exact contract', () => {
    const model = decisionModelWithCommitment()
    const completion = model.evidence.find((evidence) => evidence.purpose === 'completion')
    expect(completion).toBeDefined()

    const evaluation = evaluateCustomerRequestSnapshot({
      requestId: 'request:completion', requestRevision: 1, intent: 'Find data', facts: [],
      registrySnapshotDigest: 'sha256:graph', candidates: [],
      proposedActions: [{
        actionId: 'action:one', contractRef: model.contractRef,
        selectionKey: model.selectionKey, semanticDigest: model.semanticDigest, dependsOn: [], inputs: [],
        inputMappings: [],
      }],
      resolveModel: () => model,
    })

    expect(evaluation.completionRequirements).toEqual([{
      actionId: 'action:one', contractRef: model.contractRef,
      evidenceId: completion?.evidenceId, outputPointer: completion?.outputPointer,
      purpose: 'completion', schemaIdentity: completion?.schemaIdentity,
    }])
  })

  it('compiles two exact contracts into a deterministic dependency when registered semantics and schemas match', () => {
    const lookup = compositionLookupModel()
    const shipping = compositionShippingModel(lookup)
    const lookupRequest = requiredInput(lookup, 'request')
    const compile = (models: [typeof lookup, typeof shipping]) => compileCustomerRequest({
      requestId: 'request:composed', expectedRevision: 4,
      principalId: 'principal:test', delegatedAgentId: 'agent:test',
      intent: 'Find an option and get its shipping quote.', networkId: 'ae:public',
      proposal: {
        kind: 'capability_candidates',
        selections: models.map((model) => ({
          selectionKey: model.selectionKey, contractRef: model.contractRef,
          facts: model === lookup ? [{
            contractRef: lookup.contractRef, selectionKey: lookup.selectionKey,
            inputKey: lookupRequest.key, inputPointer: lookupRequest.inputPointer,
            schemaIdentity: lookupRequest.schemaIdentity, value: 'routing book',
            source: { kind: 'agent_inference' as const, inferenceRef: 'inference:request' },
          }] : [],
        })),
      },
      interpreterId: 'interpreter:test',
      bindings: models.map((model) => supply(`binding:${model.contractRef.capabilityId}`, model)),
      models, now: 10_000,
    })

    const first = compile([lookup, shipping])
    const permuted = compile([shipping, lookup])
    expect(first).toMatchObject({
      kind: 'compiled', aggregate: {
        outcome: 'plan_ready',
        plan: {
          requestRevision: 5,
          authority: 'proposal_only',
          routes: [{
            maximumTotalCost: { kind: 'known', currency: 'AUD', amountMinor: 200 },
            expiresAt: 20_000,
            steps: [
              {
                contractRef: lookup.contractRef, publicationRevision: 1,
                price: { kind: 'fixed', currency: 'AUD', amountMinor: 100 },
                dataUse: [{ purposes: ['return_requested_result'] }],
                effects: [{ class: 'data_release', authority: 'mandate_or_explicit' }],
                evidence: [{ evidenceId: 'selected_option' }, { evidenceId: 'lookup_complete' }],
                recovery: { idempotency: 'required', recovery: 'retry_safe' },
              },
              {
                contractRef: shipping.contractRef, publicationRevision: 1,
                price: { kind: 'fixed', currency: 'AUD', amountMinor: 100 },
              },
            ],
            edges: [{ authority: 'registered_contract_semantics' }],
            fallbacks: { ordering: 'unranked', alternatives: [] },
            comparison: {
              fit: 'all_steps_viable', completeness: 'complete', trust: 'registered_live_supply',
              ordering: { kind: 'unranked' },
            },
          }],
          actions: [
            { contractRef: lookup.contractRef, dependsOn: [], inputMappings: [] },
            {
              contractRef: shipping.contractRef,
              dependsOn: [expect.stringMatching(/^action:/)],
              inputMappings: [{
                semanticIdentity: 'ae.option_id:v1',
                source: { actionId: expect.stringMatching(/^action:/), annotationId: 'option_id', outputPointer: '/optionId' },
                target: { annotationId: 'option_id', inputPointer: '/optionId' },
                schemaIdentity: lookup.evidence.find((item) => item.annotationId === 'option_id')?.schemaIdentity,
                authority: 'registered_contract_semantics',
              }],
            },
          ],
        },
      },
    })
    expect(permuted).toEqual(first)
  })

  it('asks for the downstream fact instead of guessing between ambiguous registered producers', () => {
    const firstLookup = compositionLookupModel('catalog.lookup.one')
    const secondLookup = compositionLookupModel('catalog.lookup.two')
    const shipping = compositionShippingModel(firstLookup)
    const requestInput = requiredInput(firstLookup, 'request')
    const result = compileCustomerRequest({
      requestId: 'request:ambiguous', expectedRevision: 0,
      principalId: 'principal:test', delegatedAgentId: 'agent:test',
      intent: 'Find options and quote shipping.', networkId: 'ae:public',
      proposal: { kind: 'capability_candidates', selections: [firstLookup, secondLookup, shipping].map((model) => ({
        selectionKey: model.selectionKey, contractRef: model.contractRef,
        facts: model === firstLookup || model === secondLookup ? [{
          contractRef: model.contractRef, selectionKey: model.selectionKey,
          inputKey: requiredInput(model, 'request').key, inputPointer: requiredInput(model, 'request').inputPointer,
          schemaIdentity: requestInput.schemaIdentity, value: 'routing book',
          source: { kind: 'agent_inference' as const, inferenceRef: `inference:${model.contractRef.capabilityId}` },
        }] : [],
      })) },
      interpreterId: 'interpreter:test',
      bindings: [firstLookup, secondLookup, shipping].map((model) => supply(`binding:${model.contractRef.capabilityId}`, model)),
      models: [firstLookup, secondLookup, shipping], now: 10_000,
    })
    expect(result).toMatchObject({ kind: 'compiled', aggregate: {
      outcome: 'needs_information',
      evaluation: { nextRequirement: { kind: 'contract_fact', customerLabel: 'Option identifier' } },
    } })
    if (result.kind !== 'compiled') throw new Error('expected compilation')
    const shippingAction = result.aggregate.plan.actions.find((action) => action.contractRef.capabilityId === 'shipping.quote')
    expect(shippingAction).toMatchObject({ dependsOn: [], inputMappings: [] })
  })

  it('fails closed on unsafe aggregate money and marks on-request cost as uncertain preparation', () => {
    const lookup = compositionLookupModel()
    const shipping = compositionShippingModel(lookup)
    const request = requiredInput(lookup, 'request')
    const compileWithPrices = (prices: readonly [RegisteredSupplyPrice, RegisteredSupplyPrice]) => (
      compileCustomerRequest({
        requestId: 'request:money-safety', expectedRevision: 0,
        principalId: 'principal:test', delegatedAgentId: 'agent:test',
        intent: 'Find an option and quote shipping.', networkId: 'ae:public',
        proposal: { kind: 'capability_candidates', selections: [lookup, shipping].map((model) => ({
          selectionKey: model.selectionKey, contractRef: model.contractRef,
          facts: model === lookup ? [{
            contractRef: lookup.contractRef, selectionKey: lookup.selectionKey,
            inputKey: request.key, inputPointer: request.inputPointer, schemaIdentity: request.schemaIdentity,
            value: 'routing book', source: { kind: 'agent_inference' as const, inferenceRef: 'inference:money-safety' },
          }] : [],
        })) },
        interpreterId: 'interpreter:test', models: [lookup, shipping], now: 10_000,
        bindings: [lookup, shipping].map((model, index) => {
          const price = prices[index]
          if (price === undefined) throw new Error('test price missing')
          return { ...supply(`binding:money:${index}`, model), price }
        }),
      })
    )

    expect(compileWithPrices([
      { kind: 'fixed', currency: 'AUD', amountMinor: 100 },
      { kind: 'fixed', currency: 'USD', amountMinor: 100 },
    ])).toMatchObject({ kind: 'compiled', aggregate: { outcome: 'unsupported', plan: { routes: [] } } })
    expect(compileWithPrices([
      { kind: 'fixed', currency: 'AUD', amountMinor: Number.MAX_SAFE_INTEGER },
      { kind: 'fixed', currency: 'AUD', amountMinor: 1 },
    ])).toMatchObject({ kind: 'compiled', aggregate: { outcome: 'unsupported', plan: { routes: [] } } })
    expect(compileWithPrices([
      { kind: 'fixed', currency: 'AUD', amountMinor: 100 },
      { kind: 'on_request' },
    ])).toMatchObject({ kind: 'compiled', aggregate: { outcome: 'plan_ready', plan: { routes: [{
      maximumTotalCost: { kind: 'requires_preparation' }, uncertainty: ['cost_requires_preparation'],
      comparison: { ordering: { kind: 'unranked' } },
    }] } } })
  })

  it('declares only provider-disjoint fallbacks and ranks same-currency routes on an explicit price objective', () => {
    const lookup = compositionLookupModel()
    const shipping = compositionShippingModel(lookup)
    const request = requiredInput(lookup, 'request')
    const bindings = [
      supply('binding:lookup:cheap', lookup),
      {
        ...supply('binding:lookup:same-business', lookup),
        businessId: 'business:binding:lookup:cheap',
        price: { kind: 'fixed' as const, currency: 'AUD', amountMinor: 150 },
      },
      { ...supply('binding:lookup:expensive', lookup), price: { kind: 'fixed' as const, currency: 'AUD', amountMinor: 200 } },
      { ...supply('binding:shipping:expensive', shipping), price: { kind: 'fixed' as const, currency: 'AUD', amountMinor: 300 } },
      { ...supply('binding:shipping:cheap', shipping), price: { kind: 'fixed' as const, currency: 'AUD', amountMinor: 100 } },
    ]
    const result = compileCustomerRequest({
      requestId: 'request:ranked-fallback', expectedRevision: 0,
      principalId: 'principal:test', delegatedAgentId: 'agent:test',
      intent: 'Find the cheapest option and quote shipping.', networkId: 'ae:public',
      proposal: { kind: 'capability_candidates', selections: [lookup, shipping].map((model) => ({
        selectionKey: model.selectionKey, contractRef: model.contractRef,
        facts: model === lookup ? [{
          contractRef: lookup.contractRef, selectionKey: lookup.selectionKey,
          inputKey: request.key, inputPointer: request.inputPointer, schemaIdentity: request.schemaIdentity,
          value: 'routing book', source: { kind: 'customer' as const, assertionRef: 'customer:request-message' },
        }] : [],
      })) },
      interpreterId: 'interpreter:test', bindings, models: [lookup, shipping], now: 10_000,
    })
    if (result.kind !== 'compiled') throw new Error(`compile refused: ${result.reason}`)
    expect(result.aggregate.plan.routes).toHaveLength(6)
    expect(result.aggregate.plan.routes.map((route) => route.maximumTotalCost)).toEqual([
      { kind: 'known', currency: 'AUD', amountMinor: 200 },
      { kind: 'known', currency: 'AUD', amountMinor: 250 },
      { kind: 'known', currency: 'AUD', amountMinor: 300 },
      { kind: 'known', currency: 'AUD', amountMinor: 400 },
      { kind: 'known', currency: 'AUD', amountMinor: 450 },
      { kind: 'known', currency: 'AUD', amountMinor: 500 },
    ])
    for (const [index, route] of result.aggregate.plan.routes.entries()) {
      expect(route.comparison.ordering).toEqual({
        kind: 'ranked', objective: 'lowest_maximum_price', position: index + 1,
      })
      expect(route.fallbacks.ordering).toBe('unranked')
      expect(route.fallbacks.alternatives.length).toBeGreaterThan(0)
      const bindingsInRoute = new Set(route.steps.map((step) => step.bindingId))
      const businessesInRoute = new Set(route.steps.map((step) => step.businessId))
      for (const fallback of route.fallbacks.alternatives) {
        const alternative = result.aggregate.plan.routes.find((candidate) => (
          candidate.routePlanId === fallback.alternativeRouteRef
        ))
        if (alternative === undefined) throw new Error('declared fallback missing')
        expect(alternative.steps.every((step) => (
          !bindingsInRoute.has(step.bindingId) && !businessesInRoute.has(step.businessId)
        ))).toBe(true)
      }
    }
  })

  it('does not price-rank otherwise viable routes across currencies', () => {
    const lookup = compositionLookupModel()
    const request = requiredInput(lookup, 'request')
    const result = compileCustomerRequest({
      requestId: 'request:cross-currency', expectedRevision: 0,
      principalId: 'principal:test', delegatedAgentId: 'agent:test',
      intent: 'Find the cheapest lookup.', networkId: 'ae:public',
      proposal: { kind: 'capability_candidates', selections: [{
        selectionKey: lookup.selectionKey, contractRef: lookup.contractRef,
        facts: [{
          contractRef: lookup.contractRef, selectionKey: lookup.selectionKey,
          inputKey: request.key, inputPointer: request.inputPointer, schemaIdentity: request.schemaIdentity,
          value: 'routing book', source: { kind: 'customer' as const, assertionRef: 'customer:request-message' },
        }],
      }] },
      interpreterId: 'interpreter:test', models: [lookup], now: 10_000,
      bindings: [
        supply('binding:lookup:aud', lookup),
        { ...supply('binding:lookup:usd', lookup), price: { kind: 'fixed' as const, currency: 'USD', amountMinor: 1 } },
      ],
    })
    if (result.kind !== 'compiled') throw new Error(`compile refused: ${result.reason}`)
    expect(result.aggregate.plan.routes.map((route) => route.comparison.ordering)).toEqual([
      { kind: 'unranked' }, { kind: 'unranked' },
    ])
  })

  it('fails closed for cyclic contract semantics and duplicate model selections', () => {
    const first = cyclicModel('cycle.first', 'from_second', 'from_first')
    const second = cyclicModel('cycle.second', 'from_first', 'from_second')
    const command = {
      requestId: 'request:cycle', expectedRevision: 0,
      principalId: 'principal:test', delegatedAgentId: 'agent:test', intent: 'Run the cycle', networkId: 'ae:public',
      proposal: { kind: 'capability_candidates' as const, selections: [first, second].map((model) => ({
        selectionKey: model.selectionKey, contractRef: model.contractRef, facts: [],
      })) },
      interpreterId: 'interpreter:test', bindings: [first, second].map((model) => supply(`binding:${model.contractRef.capabilityId}`, model)),
      models: [first, second], now: 10_000,
    }
    expect(compileCustomerRequest(command)).toEqual({ kind: 'refused', reason: 'capability_graph_invalid' })
    expect(compileCustomerRequest({
      ...command,
      proposal: { kind: 'capability_candidates', selections: [command.proposal.selections[0]!, command.proposal.selections[0]!] },
      bindings: [supply('binding:duplicate', first)], models: [first],
    })).toEqual({ kind: 'refused', reason: 'unsafe_interpretation' })
  })

  it('refuses an aggregate that would exceed the durable Convex document boundary', () => {
    const model = decisionModelWithCommitment()
    const requestInput = requiredInput(model, 'request')
    const binding = supply('binding:bounded', model)

    const result = compileCustomerRequest({
      requestId: 'request:oversized', expectedRevision: 0,
      principalId: 'principal:test', delegatedAgentId: 'agent:test', intent: 'Find data', networkId: 'ae:public',
      proposal: {
        kind: 'capability_candidates',
        selections: [{
          selectionKey: model.selectionKey,
          contractRef: model.contractRef,
          facts: [{
            contractRef: model.contractRef,
            selectionKey: model.selectionKey,
            inputKey: requestInput.key,
            inputPointer: requestInput.inputPointer,
            schemaIdentity: requestInput.schemaIdentity,
            value: { topic: 'x'.repeat(250_000) },
            source: { kind: 'agent_inference', inferenceRef: 'inference:oversized' },
          }],
        }],
      },
      interpreterId: 'interpreter:test', bindings: [binding], models: [model], now: 1,
    })

    expect(result).toEqual({ kind: 'refused', reason: 'unsafe_interpretation' })
  })

  it('keeps structured request input missing when verbatim customer text does not satisfy its registered schema', () => {
    const model = decisionModelWithCommitment()
    const requestInput = requiredInput(model, 'request')
    const result = compileCustomerRequest({
      requestId: 'request:structured-recovery', expectedRevision: 0,
      principalId: 'principal:test', delegatedAgentId: 'agent:test',
      intent: 'Find market data about routing.', networkId: 'ae:public',
      proposal: {
        kind: 'capability_candidates',
        selections: [{
          selectionKey: model.selectionKey,
          contractRef: model.contractRef,
          facts: [{
            contractRef: model.contractRef,
            selectionKey: model.selectionKey,
            inputKey: requestInput.key,
            inputPointer: requestInput.inputPointer,
            schemaIdentity: requestInput.schemaIdentity,
            value: 'Find market data about routing.',
            source: { kind: 'agent_inference', inferenceRef: 'inference:wrong-shape' },
          }],
        }],
      },
      interpreterId: 'interpreter:test', bindings: [supply('binding:structured', model)], models: [model], now: 1,
    })

    expect(result).toMatchObject({
      kind: 'compiled',
      aggregate: {
        outcome: 'needs_information',
        snapshot: { facts: [] },
        evaluation: { nextRequirement: { kind: 'contract_fact' } },
      },
    })
  })

  it('keeps a schema-valid agent inference missing when the registered input requires customer provenance', () => {
    const model = openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2({
      inputSchema: structuredInputSchema(),
      customerAnnotations: structuredAnnotations('customer_required'),
      dataUse: structuredDataUse(), effects: structuredEffects(),
    })))
    const requestInput = requiredInput(model, 'request')
    const result = compileCustomerRequest({
      requestId: 'request:customer-provenance', expectedRevision: 0,
      principalId: 'principal:test', delegatedAgentId: 'agent:test',
      intent: 'Find market data about routing.', networkId: 'ae:public',
      proposal: {
        kind: 'capability_candidates',
        selections: [{
          selectionKey: model.selectionKey, contractRef: model.contractRef,
          facts: [{
            contractRef: model.contractRef, selectionKey: model.selectionKey,
            inputKey: requestInput.key, inputPointer: requestInput.inputPointer,
            schemaIdentity: requestInput.schemaIdentity, value: { topic: 'routing' },
            source: { kind: 'agent_inference', inferenceRef: 'inference:schema-valid' },
          }],
        }],
      },
      interpreterId: 'interpreter:test', bindings: [supply('binding:customer-provenance', model)],
      models: [model], now: 1,
    })

    expect(requestInput.inference).toBe('customer_required')
    expect(result).toMatchObject({
      kind: 'compiled',
      aggregate: {
        outcome: 'needs_information', snapshot: { facts: [] },
        evaluation: { nextRequirement: { kind: 'contract_fact' } },
      },
    })
  })

  it('derives ranking intent from customer text only and rejects model-injected preference', async () => {
    expect(deriveCustomerDecisionPreference('Find the cheapest suitable option')).toMatchObject({
      objective: 'lowest_maximum_price', basis: 'extracted_from_request',
    })
    expect(deriveCustomerDecisionPreference('Price should not be the cheapest')).toBeUndefined()
    const model = decisionModelWithCommitment()
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:preference-injection',
      transport: { generateJson: async () => ({ content: JSON.stringify({
        kind: 'capability_candidates', selections: [], decisionPreference: 'lowest_maximum_price',
      }) }) },
      timeoutMs: 1_000, maximumPayloadBytes: 64_000, maximumResponseBytes: 8_000,
    })

    await expect(interpreter.propose({
      customerJob: 'Find a suitable option.',
      capabilities: [bindCustomerCapabilityDescriptor({
        contractRef: model.contractRef, selectionKey: model.selectionKey,
        name: 'Search data', description: 'Returns matching data.', inputs: model.inputs,
        valueSchemas: inputValueSchemas(model, structuredInputSchema()),
        evidence: model.evidence.map(({ label, purpose, schemaIdentity }) => ({ label, purpose, schemaIdentity })),
      })],
    })).rejects.toThrow('customer_request_semantic_interpretation_invalid')
  })

  it('accepts only bounded plain JSON values at recursive Convex boundaries', () => {
    expect(isBoundedJsonValue({ nested: ['value', 1, true, null] })).toBe(true)
    expect(isBoundedJsonValue(new ArrayBuffer(8))).toBe(false)
    expect(isBoundedJsonValue(1n)).toBe(false)
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(isBoundedJsonValue(cyclic)).toBe(false)
  })
})

function decisionModelWithCommitment() {
  return openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2({
    inputSchema: structuredInputSchema(),
    customerAnnotations: structuredAnnotations(),
    dataUse: structuredDataUse(),
    effects: structuredEffects(),
  })))
}

function compositionLookupModel(capabilityId = 'catalog.lookup') {
  return openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2({
    capabilityId, version: 2,
    inputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { request: { type: 'string' } }, required: ['request'], additionalProperties: false },
    outputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { optionId: { type: 'string' }, result: { type: 'string' } }, required: ['optionId', 'result'], additionalProperties: false },
    customerAnnotations: [
      { annotationId: 'request', document: 'input', pointer: '/request', label: 'What to find', role: 'request' },
      { annotationId: 'option_id', semanticIdentity: 'ae.option_id:v1', document: 'output', pointer: '/optionId', label: 'Option identifier', role: 'comparison' },
      { annotationId: 'result', document: 'output', pointer: '/result', label: 'Lookup result', role: 'completion_evidence' },
    ],
    dataUse: [dataUse('request_release', '/request')], effects: [dataEffect('request_release')],
    evidence: [
      { evidenceId: 'selected_option', outputPointer: '/optionId', purpose: 'comparison' },
      { evidenceId: 'lookup_complete', outputPointer: '/result', purpose: 'completion' },
    ],
  })))
}

function compositionShippingModel(lookup: ReturnType<typeof compositionLookupModel>) {
  if (!lookup.evidence.some((item) => item.annotationId === 'option_id')) throw new Error('lookup option semantic missing')
  return openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2({
    capabilityId: 'shipping.quote', version: 1,
    inputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { optionId: { type: 'string' } }, required: ['optionId'], additionalProperties: false },
    outputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { result: { type: 'string' } }, required: ['result'], additionalProperties: false },
    customerAnnotations: [
      { annotationId: 'option_id', semanticIdentity: 'ae.option_id:v1', document: 'input', pointer: '/optionId', label: 'Option identifier', role: 'request' },
      { annotationId: 'result', document: 'output', pointer: '/result', label: 'Shipping quote', role: 'completion_evidence' },
    ],
    dataUse: [dataUse('option_release', '/optionId')], effects: [dataEffect('option_release')],
    evidence: [{ evidenceId: 'shipping_quote', outputPointer: '/result', purpose: 'completion' }],
  })))
}

function cyclicModel(capabilityId: string, inputAnnotationId: string, outputAnnotationId: string) {
  return openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2({
    capabilityId,
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
      properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false,
    },
    outputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
      properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false,
    },
    customerAnnotations: [
      { annotationId: inputAnnotationId, semanticIdentity: `ae.${inputAnnotationId}:v1`, document: 'input', pointer: '/value', label: 'Input value', role: 'request' },
      { annotationId: outputAnnotationId, semanticIdentity: `ae.${outputAnnotationId}:v1`, document: 'output', pointer: '/value', label: 'Output value', role: 'completion_evidence' },
    ],
    dataUse: [dataUse('value_release', '/value')], effects: [dataEffect('value_release')],
    evidence: [{ evidenceId: `${outputAnnotationId}_evidence`, outputPointer: '/value', purpose: 'completion' }],
  })))
}

function structuredInputSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
    properties: {
      request: {
        type: 'object', properties: { topic: { type: 'string', minLength: 1 } },
        required: ['topic'], additionalProperties: false,
      },
      approval: { type: 'string', minLength: 4 },
    },
    required: ['request', 'approval'], additionalProperties: false,
  }
}

function structuredAnnotations(requestInference?: 'allowed' | 'customer_required') {
  return [
    {
      annotationId: 'request', document: 'input', pointer: '/request', label: 'What to find', role: 'request',
      ...(requestInference === undefined ? {} : { inference: requestInference }),
    },
    { annotationId: 'approval', document: 'input', pointer: '/approval', label: 'Approval', role: 'commitment' },
    { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
  ]
}

function structuredDataUse() {
  return [
    dataUse('request_release', '/request'),
    dataUse('approval_release', '/approval'),
  ]
}

function structuredEffects() {
  return [dataEffect('request_release'), dataEffect('approval_release')]
}

function dataUse(effectId: string, inputPointer: string) {
  return {
    effectId, inputPointer, classification: 'personal', phase: 'execution',
    recipient: { kind: 'selected_binding' }, purposes: ['return_requested_result'],
  }
}

function dataEffect(effectId: string) {
  return {
    effectId, class: 'data_release', authority: 'mandate_or_explicit', reversibility: 'irreversible',
  }
}

function requiredInput(model: ReturnType<typeof decisionModelWithCommitment>, annotationId: string) {
  const input = model.inputs.find((candidate) => candidate.annotationId === annotationId)
  if (input === undefined) throw new Error(`missing test input: ${annotationId}`)
  return input
}

function inputValueSchemas(
  model: ReturnType<typeof decisionModelWithCommitment>,
  inputSchema: ReturnType<typeof structuredInputSchema>,
) {
  return model.inputs.map((input) => ({
    inputKey: input.key,
    valueSchema: projectCapabilityInputValueSchema(inputSchema, input),
  }))
}

function supply(bindingId: string, model: ReturnType<typeof decisionModelWithCommitment>) {
  return {
    businessId: `business:${bindingId}`, offeringId: `offering:${bindingId}`, bindingId,
    contractRef: model.contractRef, offeringRegistrationHash: `sha256:offering:${bindingId}`,
    bindingRegistrationHash: `sha256:binding:${bindingId}`,
    publicationRef: `publication:${bindingId}`, publicationRevision: 1, readinessValidUntil: 20_000,
    price: { kind: 'fixed' as const, currency: 'AUD', amountMinor: 100 },
  }
}
