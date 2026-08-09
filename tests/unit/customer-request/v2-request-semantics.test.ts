import { describe, expect, it, vi } from 'vitest'
import { createTestOperationLineage } from '../../helpers/customer-request-lineage'
import { createRegisteredOperationMappingRef, type RegisteredOperationMapping } from '@/modules/capability-supply/public'

import {
  defineCapabilityContract,
  isBoundedJsonValue,
  openCapabilityDecisionModel,
  projectCapabilityInputValueSchema,
  type CapabilityDecisionModel,
} from '@/modules/capability-contract/public'
import {
  discoverRequestEvaluationCandidates,
  evaluateCustomerRequestSnapshot,
  requestRegistrySnapshotDigest,
  type RegisteredSupplyPrice,
} from '@/modules/customer-request/evaluation'
import { compileCustomerRequest, routeChoiceSignature } from '@/modules/customer-request/compiler'
import { projectCustomerRequest, projectRequestEvaluation } from '@/modules/customer-request/customer-projection'
import {
  routePlanGenerationIsInternallyConsistent,
  routePlanGenerationMaterialDigest,
  routePlanGenerationOwnsCancellationPosture,
  writableCustomerRequestRoutePlanGeneration,
} from '@/modules/customer-request/route-plan-generation'
import {
  bindCustomerCapabilityDescriptor,
  createJsonCustomerRequestSemanticInterpreter,
  deriveCustomerDecisionPreference,
  deriveCustomerMaterialConstraints,
  deriveCustomerMaximumTotalCostCriterion,
  deriveCustomerMaximumResponseTimeCriterion,
  deriveCustomerProviderDataSharingCriterion,
} from '@/modules/customer-request/semantic-interpreter'
import type { ExactAmount } from '@/modules/money/public'
import { capabilityContractV2 } from '@/../tests/fixtures/capability-contract-v2'

describe('V2 Request semantics', () => {
  it('identifies one exact registered supply choice independently of incidental step enumeration', () => {
    const first = {
      businessId: 'business:one', offeringId: 'offering:one', bindingId: 'binding:one',
      contractRef: { capabilityId: 'capability:one', version: 1, contractDigest: 'sha256:one' },
      offeringRegistrationHash: 'sha256:offering-one', bindingRegistrationHash: 'sha256:binding-one',
    }
    const second = {
      businessId: 'business:two', offeringId: 'offering:two', bindingId: 'binding:two',
      contractRef: { capabilityId: 'capability:two', version: 1, contractDigest: 'sha256:two' },
      offeringRegistrationHash: 'sha256:offering-two', bindingRegistrationHash: 'sha256:binding-two',
    }

    expect(routeChoiceSignature({ steps: [first, second] }))
      .toBe(routeChoiceSignature({ steps: [second, first] }))
    expect(routeChoiceSignature({ steps: [first] }))
      .not.toBe(routeChoiceSignature({ steps: [second] }))
  })

  it('resolves an amendment into exact source statements without retaining a superseded assertion', async () => {
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:canonical-amendment',
      transport: { generateJson: async () => ({
        kind: 'unsupported_request',
        reason: 'requested_result_not_available',
        canonicalStatements: [
          { source: 'prior', quote: 'Wheelchair accessibility is mandatory.' },
          { source: 'prior', quote: 'Passport validity is unknown.' },
          { source: 'amendment', quote: 'Arrival before 09:00 is now immovable.' },
        ],
        supersededStatements: [{
          priorQuote: 'Arrival before 08:00 is immovable.',
          amendmentQuote: 'Arrival before 09:00 is now immovable.',
        }],
      }) },
      timeoutMs: 1_000, maximumPayloadBytes: 64_000, maximumResponseBytes: 8_000,
    })

    await expect(interpreter.propose({
      customerJob: 'Arrival before 08:00 is immovable. Wheelchair accessibility is mandatory. '
        + 'Passport validity is unknown.\nArrival before 09:00 is now immovable.',
      amendment: {
        priorCustomerJob: 'Arrival before 08:00 is immovable. Wheelchair accessibility is mandatory. '
          + 'Passport validity is unknown.',
        message: 'Arrival before 09:00 is now immovable.',
        replacesPriorStatement: 'Arrival before 08:00 is immovable.',
      },
      capabilities: [],
    })).resolves.toMatchObject({
      canonicalCustomerJob: 'Wheelchair accessibility is mandatory.\n'
        + 'Passport validity is unknown.\nArrival before 09:00 is now immovable.',
    })
  })

  it('rejects a canonical amendment statement that the customer did not provide', async () => {
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:fabricated-amendment',
      transport: { generateJson: async () => ({
        kind: 'unsupported_request',
        reason: 'requested_result_not_available',
        canonicalStatements: [
          { source: 'amendment', quote: 'The customer approved provider contact.' },
        ],
      }) },
      timeoutMs: 1_000, maximumPayloadBytes: 64_000, maximumResponseBytes: 8_000,
    })

    await expect(interpreter.propose({
      customerJob: 'Do not contact providers.\nChange the arrival time to 09:00.',
      amendment: {
        priorCustomerJob: 'Do not contact providers.',
        message: 'Change the arrival time to 09:00.',
      },
      capabilities: [],
    })).rejects.toThrow('customer_request_semantic_amendment_source_invalid')
  })

  it('rejects an append amendment that silently drops a prior authority boundary', async () => {
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:dropped-authority-boundary',
      transport: { generateJson: async () => ({
        kind: 'unsupported_request',
        reason: 'requested_result_not_available',
        canonicalStatements: [
          { source: 'prior', quote: 'Find an accessible itinerary.' },
          { source: 'amendment', quote: 'Move arrival to 09:00.' },
        ],
      }) },
      timeoutMs: 1_000, maximumPayloadBytes: 64_000, maximumResponseBytes: 8_000,
    })

    await expect(interpreter.propose({
      customerJob: 'Find an accessible itinerary. Do not contact providers.\nMove arrival to 09:00.',
      amendment: {
        priorCustomerJob: 'Find an accessible itinerary. Do not contact providers.',
        message: 'Move arrival to 09:00.',
      },
      capabilities: [],
    })).rejects.toThrow('customer_request_semantic_amendment_authority_removed')
  })

  it('rejects an append amendment that silently drops any prior customer statement', async () => {
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:dropped-customer-requirement',
      transport: { generateJson: async () => ({
        kind: 'unsupported_request',
        reason: 'requested_result_not_available',
        canonicalStatements: [
          { source: 'prior', quote: 'Find an accessible itinerary.' },
          { source: 'amendment', quote: 'Move arrival to 09:00.' },
        ],
        supersededStatements: [],
      }) },
      timeoutMs: 1_000, maximumPayloadBytes: 64_000, maximumResponseBytes: 8_000,
    })

    await expect(interpreter.propose({
      customerJob: 'Find an accessible itinerary. Wheelchair assistance is mandatory.\nMove arrival to 09:00.',
      amendment: {
        priorCustomerJob: 'Find an accessible itinerary. Wheelchair assistance is mandatory.',
        message: 'Move arrival to 09:00.',
      },
      capabilities: [],
    })).rejects.toThrow('customer_request_semantic_amendment_omission_unaccounted')
  })

  it('rejects a source-exact supersession between unrelated customer statements', async () => {
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:unrelated-supersession',
      transport: { generateJson: async () => ({
        kind: 'unsupported_request',
        reason: 'requested_result_not_available',
        canonicalStatements: [
          { source: 'prior', quote: 'Find an accessible itinerary.' },
          { source: 'amendment', quote: 'Move arrival to 09:00.' },
        ],
        supersededStatements: [{
          priorQuote: 'Wheelchair assistance is mandatory.',
          amendmentQuote: 'Move arrival to 09:00.',
        }],
      }) },
      timeoutMs: 1_000, maximumPayloadBytes: 64_000, maximumResponseBytes: 8_000,
    })

    await expect(interpreter.propose({
      customerJob: 'Find an accessible itinerary. Wheelchair assistance is mandatory.\nMove arrival to 09:00.',
      amendment: {
        priorCustomerJob: 'Find an accessible itinerary. Wheelchair assistance is mandatory.',
        message: 'Move arrival to 09:00.',
      },
      capabilities: [],
    })).rejects.toThrow('customer_request_semantic_amendment_supersession_invalid')
  })

  it('rejects a replacement target that is not an exact prior customer statement', async () => {
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:invalid-replacement-target',
      transport: { generateJson: async () => ({
        kind: 'unsupported_request',
        reason: 'requested_result_not_available',
        canonicalStatements: [
          { source: 'prior', quote: 'Find an accessible itinerary.' },
          { source: 'amendment', quote: 'Move arrival to 09:00.' },
        ],
        supersededStatements: [{
          priorQuote: 'Wheelchair assistance is mandatory.',
          amendmentQuote: 'Move arrival to 09:00.',
        }],
      }) },
      timeoutMs: 1_000, maximumPayloadBytes: 64_000, maximumResponseBytes: 8_000,
    })

    await expect(interpreter.propose({
      customerJob: 'Find an accessible itinerary. Wheelchair assistance is mandatory.\nMove arrival to 09:00.',
      amendment: {
        priorCustomerJob: 'Find an accessible itinerary. Wheelchair assistance is mandatory.',
        message: 'Move arrival to 09:00.',
        replacesPriorStatement: 'A statement the customer never made.',
      },
      capabilities: [],
    })).rejects.toThrow('customer_request_semantic_amendment_replacement_target_invalid')
  })

  it('rejects a replacement target the semantic proposal leaves unresolved', async () => {
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:unresolved-replacement-target',
      transport: { generateJson: async () => ({
        kind: 'unsupported_request',
        reason: 'requested_result_not_available',
        canonicalStatements: [
          { source: 'prior', quote: 'Arrival before 08:00 is immovable.' },
          { source: 'amendment', quote: 'Arrival before 09:00 is now immovable.' },
        ],
        supersededStatements: [],
      }) },
      timeoutMs: 1_000, maximumPayloadBytes: 64_000, maximumResponseBytes: 8_000,
    })

    await expect(interpreter.propose({
      customerJob: 'Arrival before 08:00 is immovable.\nArrival before 09:00 is now immovable.',
      amendment: {
        priorCustomerJob: 'Arrival before 08:00 is immovable.',
        message: 'Arrival before 09:00 is now immovable.',
        replacesPriorStatement: 'Arrival before 08:00 is immovable.',
      },
      capabilities: [],
    })).rejects.toThrow('customer_request_semantic_amendment_replacement_target_unresolved')
  })

  it('rejects a claimed supersession that shares an entity but changes a different property', async () => {
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:shared-entity-unrelated-property',
      transport: { generateJson: async () => ({
        kind: 'unsupported_request',
        reason: 'requested_result_not_available',
        canonicalStatements: [
          { source: 'prior', quote: 'Find an accessible itinerary.' },
          { source: 'amendment', quote: 'Set the hotel check-in to 15:00 now.' },
        ],
        supersededStatements: [{
          priorQuote: 'The hotel must be wheelchair accessible.',
          amendmentQuote: 'Set the hotel check-in to 15:00 now.',
        }],
      }) },
      timeoutMs: 1_000, maximumPayloadBytes: 64_000, maximumResponseBytes: 8_000,
    })

    await expect(interpreter.propose({
      customerJob: 'Find an accessible itinerary. The hotel must be wheelchair accessible.\n'
        + 'Set the hotel check-in to 15:00 now.',
      amendment: {
        priorCustomerJob: 'Find an accessible itinerary. The hotel must be wheelchair accessible.',
        message: 'Set the hotel check-in to 15:00 now.',
      },
      capabilities: [],
    })).rejects.toThrow('customer_request_semantic_amendment_supersession_invalid')
  })

  it('rejects a multi-statement amendment when any new statement is omitted', async () => {
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:dropped-amendment-statement',
      transport: { generateJson: async () => ({
        kind: 'unsupported_request',
        reason: 'requested_result_not_available',
        canonicalStatements: [
          { source: 'prior', quote: 'Find an accessible itinerary.' },
          { source: 'amendment', quote: 'Move arrival to 09:00.' },
        ],
        supersededStatements: [],
      }) },
      timeoutMs: 1_000, maximumPayloadBytes: 64_000, maximumResponseBytes: 8_000,
    })

    await expect(interpreter.propose({
      customerJob: 'Find an accessible itinerary.\nMove arrival to 09:00. Keep the hotel under AUD 500.',
      amendment: {
        priorCustomerJob: 'Find an accessible itinerary.',
        message: 'Move arrival to 09:00. Keep the hotel under AUD 500.',
      },
      capabilities: [],
    })).rejects.toThrow('customer_request_semantic_amendment_statement_omitted')
  })

  it('preserves decimal prices, email addresses, URLs, abbreviations, and initials as exact statements', async () => {
    const priorCustomerJob = 'Keep the total under AUD 1,000.50. Email ops@example.com. '
      + 'Use https://example.com/path. Dr. J. Chen must approve.'
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:punctuation-safe-amendment',
      transport: { generateJson: async () => ({
        kind: 'unsupported_request',
        reason: 'requested_result_not_available',
        canonicalStatements: [
          { source: 'prior', quote: 'Keep the total under AUD 1,000.50.' },
          { source: 'prior', quote: 'Email ops@example.com.' },
          { source: 'prior', quote: 'Use https://example.com/path.' },
          { source: 'prior', quote: 'Dr. J.' },
          { source: 'prior', quote: 'Chen must approve.' },
          { source: 'amendment', quote: 'Move arrival to 09:00.' },
        ],
        supersededStatements: [],
      }) },
      timeoutMs: 1_000, maximumPayloadBytes: 64_000, maximumResponseBytes: 8_000,
    })

    await expect(interpreter.propose({
      customerJob: `${priorCustomerJob}\nMove arrival to 09:00.`,
      amendment: { priorCustomerJob, message: 'Move arrival to 09:00.' },
      capabilities: [],
    })).resolves.toMatchObject({
      canonicalCustomerJob: 'Keep the total under AUD 1,000.50.\n'
        + 'Email ops@example.com.\nUse https://example.com/path.\n'
        + 'Dr. J.\nChen must approve.\nMove arrival to 09:00.',
    })
  })

  it('extracts explicit material constraints without itinerary-specific kernel rules', () => {
    expect(deriveCustomerMaterialConstraints(
      'Plan a work trip for two travellers. A wheelchair-accessible hotel and ground transport are mandatory. '
      + 'Arrival by 09:00 on 21 July is immovable. Passport details are uncertain and unavailable today. '
      + 'Maximum total budget is AUD 4,000. Do not book, pay, or contact providers.',
    )).toEqual([
      expect.objectContaining({
        label: 'Must preserve',
        value: 'A wheelchair-accessible hotel and ground transport are mandatory.',
        basis: 'extracted_from_request',
      }),
      expect.objectContaining({
        label: 'Must preserve', value: 'Arrival by 09:00 on 21 July is immovable.',
      }),
      expect.objectContaining({
        label: 'Known uncertainty', value: 'Passport details are uncertain and unavailable today.',
        impact: 'uncertainty',
      }),
      expect.objectContaining({
        label: 'Must not happen', value: 'Do not book, pay, or contact providers.',
        impact: 'authority_boundary',
      }),
    ])
  })

  it('does not treat an ordinary statement of need as a hard constraint', () => {
    expect(deriveCustomerMaterialConstraints(
      'I need help planning a work trip for two travellers.',
    )).toEqual([])
  })

  it('persists extracted material constraints while keeping route satisfaction unproven', () => {
    const model = compositionLookupModel()
    const requestInput = requiredInput(model, 'request')
    const binding = supply('binding:material-constraint', model)
    const intent = 'Prepare a result. Wheelchair accessibility is mandatory. Passport validity is unknown.'
    const result = compileCustomerRequest({
      requestId: 'request:material-constraint', expectedRevision: 0,
      principalId: 'principal:test', delegatedAgentId: 'agent:test', intent,
      networkId: 'ae:public', interpreterId: 'interpreter:test', now: 10_000,
      proposal: { kind: 'capability_candidates', selections: [{
        operationRef: binding.operationRef,
        selectionKey: model.selectionKey, contractRef: model.contractRef,
        facts: [{
          contractRef: model.contractRef, selectionKey: model.selectionKey,
          inputKey: requestInput.key, inputPointer: requestInput.inputPointer,
          schemaIdentity: requestInput.schemaIdentity, value: intent,
          source: { kind: 'customer', assertionRef: 'assertion:request' },
        }],
      }] },
      bindings: [binding], mappings: [], models: [model],
    })

    expect(result).toMatchObject({
      kind: 'compiled',
      aggregate: { evaluation: { criteria: expect.arrayContaining([expect.objectContaining({
        label: 'Must preserve', value: 'Wheelchair accessibility is mandatory.',
      })]) } },
      routeGeneration: { routes: [expect.objectContaining({
        uncertainty: ['customer_fact_requires_evidence'],
        comparison: expect.objectContaining({ hardConstraints: 'not_evaluated' }),
      })] },
    })
    expect(projectCustomerRequest(result)).toMatchObject({
      criteria: expect.arrayContaining([expect.objectContaining({
        label: 'Must preserve', value: 'Wheelchair accessibility is mandatory.',
        basis: 'extracted_from_request',
      }), expect.objectContaining({
        label: 'Known uncertainty', value: 'Passport validity is unknown.',
        impact: 'uncertainty',
      })]),
    })
  })

  it('distinguishes a clear unsupported operation from missing intent', async () => {
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:unsupported-operation',
      transport: { generateJson: async () => ({
        kind: 'unsupported_request', reason: 'requested_result_not_available', prompt: '', selections: [],
      }) },
      timeoutMs: 1_000, maximumPayloadBytes: 64_000, maximumResponseBytes: 8_000,
    })

    const proposal = await interpreter.propose({
      customerJob: 'Book it, pay for it, and guarantee completion without asking me again.',
      capabilities: [],
    })
    expect(proposal).toMatchObject({
      kind: 'unsupported_request', reason: 'requested_result_not_available',
    })
    const compiled = compileCustomerRequest({
      requestId: 'request:unsupported-operation', expectedRevision: 0,
      principalId: 'principal:test', delegatedAgentId: 'agent:test',
      intent: 'Book it, pay for it, and guarantee completion without asking me again.',
      networkId: 'ae:public', proposal, interpreterId: 'interpreter:unsupported-operation',
      bindings: [], mappings: [], models: [], now: 1,
    })
    expect(compiled).toMatchObject({ kind: 'compiled', aggregate: { outcome: 'unsupported', plan: { actions: [] } } })
    expect(projectCustomerRequest(compiled)).toMatchObject({
      state: 'unsupported', summary: 'AE cannot perform the requested operation.', nextAction: 'revise_request',
      unsupportedRecovery: {
        reason: 'requested_result_not_available',
        preservedRequest: true,
        authorityCreatedForThisRevision: false,
        businessContactedForThisRevision: false,
        nextStep: {
          kind: 'change_request',
          summary: 'Change the outcome you want while keeping this Request and its history.',
        },
      },
    })
  })

  it('keeps intent-direction copy in customer language instead of exposing model or capability vocabulary', async () => {
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:intent-direction',
      transport: { generateJson: async () => ({
        kind: 'needs_intent_direction', prompt: 'Choose a sandbox lookup capability.', selections: [],
      }) },
      timeoutMs: 1_000, maximumPayloadBytes: 64_000, maximumResponseBytes: 8_000,
    })

    await expect(interpreter.propose({ customerJob: 'Fremantle', capabilities: [] })).resolves.toMatchObject({
      kind: 'needs_intent_direction', prompt: 'You mentioned “Fremantle”. What would you like to find or decide?',
    })
  })

  it('treats named component results as material and later changes as authoritative', async () => {
    const generateJson = vi.fn().mockResolvedValue({
      kind: 'unsupported_request', reason: 'requested_result_not_available', prompt: '', selections: [],
    })
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:component-amendment',
      transport: { generateJson }, timeoutMs: 1_000,
      maximumPayloadBytes: 64_000, maximumResponseBytes: 8_000,
    })

    await interpreter.propose({
      customerJob: 'Prepare A, B, C, and D.\nKeep A, B, and C, but remove D.',
      capabilities: [],
    })

    const instruction = generateJson.mock.calls[0]?.[0].systemInstruction as string
    expect(instruction).toContain('select every capability that directly returns each named component')
    expect(instruction).toContain('later statements override conflicting earlier statements')
  })

  it('decodes bounded neutral JSON fact values from the strict model envelope', async () => {
    const model = decisionModelWithCommitment()
    const requestInput = requiredInput(model, 'request')
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:value-json',
      transport: { generateJson: async () => ({
        kind: 'capability_candidates', prompt: '', selections: [{
          operationRef: testOperationRef(model),
          selectionKey: model.selectionKey,
          facts: [{ inputKey: requestInput.key, valueJson: JSON.stringify({ topic: 'Fremantle' }) }],
        }],
      }) },
      timeoutMs: 1_000, maximumPayloadBytes: 64_000, maximumResponseBytes: 8_000,
    })
    await expect(interpreter.propose({
      customerJob: 'Fremantle', capabilities: [bindCustomerCapabilityDescriptor({
        operationRef: testOperationRef(model),
        contractRef: model.contractRef, selectionKey: model.selectionKey,
        name: 'Search data', description: 'Returns matching data.', inputs: model.inputs,
        valueSchemas: inputValueSchemas(model, structuredInputSchema()),
        evidence: model.evidence.map(({ label, purpose, schemaIdentity }) => ({ label, purpose, schemaIdentity })),
      })],
    })).resolves.toMatchObject({
      kind: 'capability_candidates', selections: [{ facts: [{ value: { topic: 'Fremantle' } }] }],
    })
  })

  it('gives the interpreter only opaque keys and customer descriptors, then binds structured values server-side', async () => {
    const model = decisionModelWithCommitment()
    const requestInput = requiredInput(model, 'request')
    const generateJson = vi.fn().mockResolvedValue({
      kind: 'capability_candidates',
      selections: [{
        operationRef: testOperationRef(model),
        selectionKey: model.selectionKey,
        facts: [{ inputKey: requestInput.key, value: { topic: 'market data' } }],
      }],
    })
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:test', transport: { generateJson }, timeoutMs: 1_000,
      maximumPayloadBytes: 64_000, maximumResponseBytes: 8_000,
    })
    const proposal = await interpreter.propose({
      customerJob: 'Find market data about routing.',
      capabilities: [bindCustomerCapabilityDescriptor({
        operationRef: testOperationRef(model),
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

  it('closes a selected outcome over one uniquely registered producer without another customer question', async () => {
    const lookup = compositionLookupModel('catalog.resolve-for-quote')
    const quote = compositionShippingModel(lookup)
    const generateJson = vi.fn().mockResolvedValue({
      kind: 'capability_candidates',
      selections: [{ operationRef: testOperationRef(quote), selectionKey: quote.selectionKey, facts: [] }],
    })
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:dependency-closure', transport: { generateJson }, timeoutMs: 1_000,
      maximumPayloadBytes: 64_000, maximumResponseBytes: 8_000,
    })
    const customerJob = 'Find a labelled service and tell me what it costs.'
    const capabilities = [lookup, quote].map((model) => bindCustomerCapabilityDescriptor({
      operationRef: testOperationRef(model),
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      name: model.contractRef.capabilityId,
      description: `Registered ${model.contractRef.capabilityId} service.`,
      inputs: model.inputs,
      valueSchemas: model.inputs.map((input) => ({
        inputKey: input.key,
        valueSchema: projectCapabilityInputValueSchema(
          model === lookup
            ? { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { request: { type: 'string' } }, required: ['request'], additionalProperties: false }
            : { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { optionId: { type: 'string' } }, required: ['optionId'], additionalProperties: false },
          input,
        ),
      })),
      evidence: model.evidence.map(({ label, purpose, schemaIdentity, semanticIdentity, guaranteed }) => ({
        label, purpose, schemaIdentity, guaranteed,
        ...(semanticIdentity === undefined ? {} : { semanticIdentity }),
      })),
    }))

    const proposal = await interpreter.propose({ customerJob, capabilities })

    expect(proposal).toMatchObject({
      kind: 'capability_candidates',
      selections: expect.arrayContaining([
        expect.objectContaining({ selectionKey: quote.selectionKey, facts: [] }),
        expect.objectContaining({
          selectionKey: lookup.selectionKey,
          facts: [expect.objectContaining({
            value: customerJob, source: expect.objectContaining({ kind: 'customer' }),
          })],
        }),
      ]),
    })
  })

  it('preserves the exact customer request when the model paraphrases a registered request input', async () => {
    const lookup = compositionLookupModel('catalog.source-first')
    const requestInput = lookup.inputs.find((input) => input.role === 'request')
    if (requestInput === undefined) throw new Error('request input missing')
    const generateJson = vi.fn().mockResolvedValue({
      kind: 'capability_candidates',
      selections: [{
        operationRef: testOperationRef(lookup),
        selectionKey: lookup.selectionKey,
        facts: [{ inputKey: requestInput.key, valueJson: JSON.stringify('A shorter model paraphrase.') }],
      }],
    })
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:source-first', transport: { generateJson }, timeoutMs: 1_000,
      maximumPayloadBytes: 64_000, maximumResponseBytes: 8_000,
    })
    const customerJob = 'Resolve the service reference. Only a partial result is available.'

    const proposal = await interpreter.propose({
      customerJob,
      capabilities: [bindCustomerCapabilityDescriptor({
        operationRef: testOperationRef(lookup),
        contractRef: lookup.contractRef, selectionKey: lookup.selectionKey,
        name: 'Resolve service reference', description: 'Returns a registered service reference.',
        inputs: lookup.inputs,
        valueSchemas: lookup.inputs.map((input) => ({
          inputKey: input.key,
          valueSchema: projectCapabilityInputValueSchema({
            $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
            properties: { request: { type: 'string' } }, required: ['request'], additionalProperties: false,
          }, input),
        })),
        evidence: lookup.evidence.map(({ label, purpose, schemaIdentity }) => ({ label, purpose, schemaIdentity })),
      })],
    })

    expect(proposal).toMatchObject({
      kind: 'capability_candidates',
      selections: [{
        selectionKey: lookup.selectionKey,
        facts: [{
          inputKey: requestInput.key,
          value: customerJob,
          source: { kind: 'customer', assertionRef: expect.stringMatching(/^assertion:customer-request-literal:/u) },
        }],
      }],
    })
  })

  it('uses the literal customer request for a plain request input without asking them to restate it', async () => {
    const lookup = compositionLookupModel('catalog.customer-grounded', 'customer_required')
    const generateJson = vi.fn().mockResolvedValue({
      kind: 'capability_candidates',
      selections: [{ operationRef: testOperationRef(lookup), selectionKey: lookup.selectionKey, facts: [] }],
    })
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:customer-grounded', transport: { generateJson }, timeoutMs: 1_000,
      maximumPayloadBytes: 64_000, maximumResponseBytes: 8_000,
    })
    const customerJob = 'Fremantle'
    const proposal = await interpreter.propose({
      customerJob,
      capabilities: [bindCustomerCapabilityDescriptor({
        operationRef: testOperationRef(lookup),
        contractRef: lookup.contractRef, selectionKey: lookup.selectionKey,
        name: 'Find a place', description: 'Returns matching places.', inputs: lookup.inputs,
        valueSchemas: lookup.inputs.map((input) => ({
          inputKey: input.key,
          valueSchema: projectCapabilityInputValueSchema({
            $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
            properties: { request: { type: 'string' } }, required: ['request'], additionalProperties: false,
          }, input),
        })),
        evidence: lookup.evidence.map(({ label, purpose, schemaIdentity }) => ({ label, purpose, schemaIdentity })),
      })],
    })

    expect(proposal).toMatchObject({
      kind: 'capability_candidates',
      selections: [{
        selectionKey: lookup.selectionKey,
        facts: [{ value: customerJob, source: { kind: 'customer', assertionRef: expect.stringMatching(/^assertion:/u) } }],
      }],
    })
  })

  it('does not guess a prerequisite when two registered producers match the same semantic input', async () => {
    const first = compositionLookupModel('catalog.resolve-one')
    const second = compositionLookupModel('catalog.resolve-two')
    const quote = compositionShippingModel(first)
    const generateJson = vi.fn().mockResolvedValue({
      kind: 'capability_candidates',
      selections: [{ operationRef: testOperationRef(quote), selectionKey: quote.selectionKey, facts: [] }],
    })
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:ambiguous-dependency', transport: { generateJson }, timeoutMs: 1_000,
      maximumPayloadBytes: 64_000, maximumResponseBytes: 8_000,
    })
    const capabilities = [first, second, quote].map((model) => bindCustomerCapabilityDescriptor({
      operationRef: testOperationRef(model),
      contractRef: model.contractRef, selectionKey: model.selectionKey,
      name: model.contractRef.capabilityId, description: 'Registered service.', inputs: model.inputs,
      valueSchemas: model.inputs.map((input) => ({
        inputKey: input.key,
        valueSchema: projectCapabilityInputValueSchema(
          model === quote
            ? { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { optionId: { type: 'string' } }, required: ['optionId'], additionalProperties: false }
            : { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { request: { type: 'string' } }, required: ['request'], additionalProperties: false },
          input,
        ),
      })),
      evidence: model.evidence.map(({ label, purpose, schemaIdentity, semanticIdentity, guaranteed }) => ({
        label, purpose, schemaIdentity, guaranteed,
        ...(semanticIdentity === undefined ? {} : { semanticIdentity }),
      })),
    }))

    const proposal = await interpreter.propose({
      customerJob: 'Find a service and tell me what it costs.', capabilities,
    })

    expect(proposal).toMatchObject({
      kind: 'capability_candidates', selections: [expect.objectContaining({
        selectionKey: quote.selectionKey, facts: [],
      })],
    })
  })

  it('rejects divergent model outputs with unknown operation refs', async () => {
    const model = decisionModelWithCommitment()
    const generateJson = vi.fn()
      .mockResolvedValueOnce({
        kind: 'capability_candidates',
        selections: [{
          operationRef: testOperationRef(model, 'v2-semantics:unknown:first'),
          selectionKey: model.selectionKey, facts: [],
        }],
      })
      .mockResolvedValueOnce({
        kind: 'capability_candidates',
        selections: [{
          operationRef: testOperationRef(model, 'v2-semantics:unknown:second'),
          selectionKey: model.selectionKey, facts: [],
        }],
      })
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:divergence', transport: { generateJson }, timeoutMs: 1_000,
      maximumPayloadBytes: 64_000, maximumResponseBytes: 8_000,
    })
    const capabilities = [bindCustomerCapabilityDescriptor({
      operationRef: testOperationRef(model),
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      name: 'Search data',
      description: 'Returns matching data.',
      inputs: model.inputs,
      valueSchemas: inputValueSchemas(model, structuredInputSchema()),
      evidence: model.evidence.map(({ label, purpose, schemaIdentity }) => ({ label, purpose, schemaIdentity })),
    })]

    await expect(interpreter.propose({ customerJob: 'Find market data.', capabilities }))
      .rejects.toThrow('customer_request_semantic_operation_ref_mismatch')
    await expect(interpreter.propose({ customerJob: 'Find market data.', capabilities }))
      .rejects.toThrow('customer_request_semantic_operation_ref_mismatch')
    expect(generateJson).toHaveBeenCalledTimes(2)
  })

  it('derives option viability from the V2 model without requiring commitment-only input', () => {
    const model = decisionModelWithCommitment()
    const requestInput = requiredInput(model, 'request')
    const candidateLineage = createTestOperationLineage(model.contractRef, 'v2-semantics:candidate')
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
        operationRef: candidateLineage.operationRef,
        admittedOperation: candidateLineage.admittedOperation,
        businessId: candidateLineage.admittedOperation.businessId,
        offeringId: candidateLineage.admittedOperation.offeringId,
        bindingId: candidateLineage.admittedOperation.bindingId,
        model,
        offeringRegistrationHash: candidateLineage.admittedOperation.offeringRegistrationHash,
        bindingRegistrationHash: candidateLineage.admittedOperation.bindingRegistrationHash,
        cancellation: { kind: 'unsupported', evidenceRefs: ['cancellation:v2-semantics:candidate'] },
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

  it('shows one customer criterion when the same request literal feeds multiple businesses', () => {
    const first = openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2({ version: 1 })))
    const second = openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2({ version: 2 })))
    const firstRequest = requiredInput(first, 'request')
    const secondRequest = requiredInput(second, 'request')
    const request = 'Preserve the accessible hotel and ground transport.'
    const evaluation = evaluateCustomerRequestSnapshot({
      requestId: 'request:shared-literal', requestRevision: 2, intent: request,
      registrySnapshotDigest: 'sha256:graph',
      facts: [
        {
          contractRef: first.contractRef, selectionKey: first.selectionKey,
          inputKey: firstRequest.key, inputPointer: firstRequest.inputPointer,
          schemaIdentity: firstRequest.schemaIdentity, value: request,
          source: { kind: 'customer', assertionRef: 'assertion:shared-request' },
        },
        {
          contractRef: second.contractRef, selectionKey: second.selectionKey,
          inputKey: secondRequest.key, inputPointer: secondRequest.inputPointer,
          schemaIdentity: secondRequest.schemaIdentity, value: request,
          source: { kind: 'customer', assertionRef: 'assertion:shared-request' },
        },
      ],
      candidates: [
        { ...supply('binding:shared-literal:first', first), model: first },
        { ...supply('binding:shared-literal:second', second), model: second },
      ],
    })

    expect(evaluation.candidates).toHaveLength(2)
    expect(evaluation.criteria).toEqual([
      expect.objectContaining({ label: 'Request', value: request, basis: 'customer_provided' }),
    ])
  })

  it('asks the missing question that makes the most registered options decidable first', () => {
    const first = decisionModelWithCommitment()
    const second = openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2({
      version: 2,
      inputSchema: structuredInputSchema(),
      customerAnnotations: structuredAnnotations(),
      dataUse: structuredDataUse(),
      effects: structuredEffects(),
    })))
    const shipping = compositionShippingModel(compositionLookupModel())

    const evaluation = evaluateCustomerRequestSnapshot({
      requestId: 'request:best-question', requestRevision: 1,
      intent: 'Find a useful option', facts: [], registrySnapshotDigest: 'sha256:graph',
      candidates: [
        { ...supply('binding:first-question', first), model: first },
        { ...supply('binding:second-question', second), model: second },
        { ...supply('binding:shipping-question', shipping), model: shipping },
      ],
    })

    expect(evaluation.nextRequirement).toMatchObject({
      kind: 'contract_fact', customerLabel: 'What to find',
      impact: { affectedCandidates: expect.any(Array), probesEnabled: expect.any(Array) },
    })
    if (evaluation.nextRequirement?.kind !== 'contract_fact') throw new Error('expected an exact question')
    expect(evaluation.nextRequirement.impact.affectedCandidates).toHaveLength(2)
    expect(evaluation.nextRequirement.impact.probesEnabled)
      .toEqual(evaluation.nextRequirement.impact.affectedCandidates)
    expect(evaluation.nextRequirement).not.toMatchObject({ customerLabel: 'Option identifier' })
  })

  it('keeps a registered fact label separate from the question shown to the customer', () => {
    const document = capabilityContractV2({
      customerAnnotations: [
        {
          annotationId: 'area', document: 'input', pointer: '/request', label: 'Area',
          prompt: 'Which area should the business cover?', role: 'constraint', inference: 'customer_required',
        },
        {
          annotationId: 'result', document: 'output', pointer: '/result',
          label: 'Result', role: 'completion_evidence',
        },
      ],
    })
    const model = openCapabilityDecisionModel(defineCapabilityContract(document))
    const input = requiredInput(model, 'area')
    const candidate = { ...supply('binding:label-and-prompt', model), model }
    const missing = evaluateCustomerRequestSnapshot({
      requestId: 'request:label-and-prompt', requestRevision: 1,
      intent: 'Find a nearby business', facts: [], registrySnapshotDigest: 'sha256:graph',
      candidates: [candidate],
    })

    expect(missing.nextRequirement).toMatchObject({
      kind: 'contract_fact', customerLabel: 'Area', customerPrompt: 'Which area should the business cover?',
    })
    expect(projectRequestEvaluation({
      snapshot: { requestId: 'request:label-and-prompt', revision: 1, intent: 'Find a nearby business' },
      evaluation: missing,
    })).toMatchObject({
      missingFields: [{ label: 'Area' }],
      clarification: { kind: 'contract_fact', prompt: 'Which area should the business cover?' },
    })

    const answered = evaluateCustomerRequestSnapshot({
      requestId: 'request:label-and-prompt', requestRevision: 2,
      intent: 'Find a nearby business', registrySnapshotDigest: 'sha256:graph', candidates: [candidate],
      facts: [{
        contractRef: model.contractRef, selectionKey: model.selectionKey,
        inputKey: input.key, inputPointer: input.inputPointer, schemaIdentity: input.schemaIdentity,
        value: 'Fremantle', source: { kind: 'customer', assertionRef: 'assertion:area' },
      }],
    })
    expect(projectRequestEvaluation({
      snapshot: { requestId: 'request:label-and-prompt', revision: 2, intent: 'Find a nearby business' },
      evaluation: answered,
    }).criteria).toContainEqual(expect.objectContaining({ label: 'Area', value: 'Fremantle' }))
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
        operationRef: testOperationRef(model),
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
    const candidateLineage = createTestOperationLineage(model.contractRef, 'v2-semantics:disclosure')

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
        operationRef: candidateLineage.operationRef,
        admittedOperation: candidateLineage.admittedOperation,
        businessId: candidateLineage.admittedOperation.businessId,
        offeringId: candidateLineage.admittedOperation.offeringId,
        bindingId: candidateLineage.admittedOperation.bindingId,
        model,
        offeringRegistrationHash: candidateLineage.admittedOperation.offeringRegistrationHash,
        bindingRegistrationHash: candidateLineage.admittedOperation.bindingRegistrationHash,
        cancellation: { kind: 'unsupported', evidenceRefs: ['cancellation:v2-semantics:disclosure'] },
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
      selectedCapabilities: [{
        operationRef: bindings[0]!.operationRef,
        selectionKey: first.selectionKey, contractRef: first.contractRef,
      }],
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
        actionId: 'action:one', operationRef: testOperationRef(model), contractRef: model.contractRef,
        selectionKey: model.selectionKey, semanticDigest: model.semanticDigest, dependsOn: [], inputs: [],
        mappingRefs: [], inputMappings: [],
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
    const compile = (
      models: [typeof lookup, typeof shipping],
      expectedRouteGeneration = 0,
      downstreamAmount = 100,
    ) => {
      const bindings = models.map((model) => ({
        ...supply(`binding:${model.contractRef.capabilityId}`, model),
        price: {
          kind: 'fixed' as const, amount: audAmount(model === shipping ? downstreamAmount : 100),
        },
      }))
      return compileCustomerRequest({
        requestId: 'request:composed', expectedRevision: 4, expectedRouteGeneration,
        principalId: 'principal:test', delegatedAgentId: 'agent:test',
        intent: 'Find an option and get its shipping quote.', networkId: 'ae:public',
        proposal: {
          kind: 'capability_candidates',
          selections: models.map((model, index) => ({
            operationRef: bindings[index]!.operationRef,
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
        bindings, mappings: [registeredFieldMapping(lookup, shipping, '/optionId', '/optionId')], models, now: 10_000,
      })
    }

    const first = compile([lookup, shipping])
    const permuted = compile([shipping, lookup])
    const nextOrdinal = compile([lookup, shipping], 1)
    const changedPrice = compile([lookup, shipping], 0, 101)
    expect(first).toMatchObject({
      kind: 'compiled', aggregate: {
        outcome: 'plan_ready',
        plan: {
          requestRevision: 5,
          authority: 'proposal_only',
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
      routeGeneration: { routes: [{
        maximumTotalCost: { kind: 'known', amount: audAmount(200) },
        expiresAt: 20_000,
        steps: [
          {
            contractRef: lookup.contractRef, publicationRevision: 1,
            resolvedInputs: [expect.objectContaining({ inputPointer: '/request' })], deferredInputs: [],
            price: { kind: 'fixed', amount: audAmount(100) },
            dataUse: [{ purposes: ['return_requested_result'] }],
            effects: [{ class: 'data_release', authority: 'mandate_or_explicit' }],
            evidence: [{ evidenceId: 'selected_option' }, { evidenceId: 'lookup_complete' }],
            cancellation: { kind: 'unsupported', evidenceRefs: ['cancellation:binding:catalog.lookup'] },
            recovery: { idempotency: 'required', recovery: 'retry_safe' },
          },
          {
            contractRef: shipping.contractRef, publicationRevision: 1,
            resolvedInputs: [], deferredInputs: [expect.objectContaining({ semanticIdentity: 'ae.option_id:v1' })],
            price: { kind: 'fixed', amount: audAmount(100) },
          },
        ],
        edges: [{ authority: 'registered_contract_semantics' }],
        fallbacks: { ordering: 'unranked', alternatives: [] },
        comparison: {
          fit: 'all_steps_viable', completeness: 'complete', trust: 'registered_current_option',
          ordering: { kind: 'unranked' },
        },
      }] },
    })
    expect(permuted).toEqual(first)
    if (first.kind !== 'compiled' || first.routeGeneration === undefined
      || nextOrdinal.kind !== 'compiled' || nextOrdinal.routeGeneration === undefined
      || changedPrice.kind !== 'compiled' || changedPrice.routeGeneration === undefined) {
      throw new Error('route generation digest setup failed')
    }
    expect(nextOrdinal.routeGeneration.generation).toBe(2)
    expect(nextOrdinal.routeGeneration.generationDigest).toBe(first.routeGeneration.generationDigest)
    expect(nextOrdinal.routeGeneration.generationRef).not.toBe(first.routeGeneration.generationRef)
    expect(changedPrice.routeGeneration.generationDigest).not.toBe(first.routeGeneration.generationDigest)
    expect(routePlanGenerationMaterialDigest(nextOrdinal.routeGeneration))
      .toBe(routePlanGenerationMaterialDigest(first.routeGeneration))
    expect(routePlanGenerationMaterialDigest(changedPrice.routeGeneration))
      .not.toBe(routePlanGenerationMaterialDigest(first.routeGeneration))
    expect(routePlanGenerationOwnsCancellationPosture(first.routeGeneration)).toBe(true)
    const cancellationOmitted = writableCustomerRequestRoutePlanGeneration(first.routeGeneration)
    Reflect.deleteProperty(cancellationOmitted.routes[0]!.steps[0]!, 'cancellation')
    expect(routePlanGenerationOwnsCancellationPosture(cancellationOmitted)).toBe(false)
    const materialVariants = [
      (generation: typeof first.routeGeneration) => {
        const changed = writableCustomerRequestRoutePlanGeneration(generation)
        const criterion = changed.decisionSnapshot?.criteria[0]
        if (criterion === undefined) throw new Error('decision criterion variant missing')
        criterion.value = 'materially changed customer criterion'
        return changed
      },
      (generation: typeof first.routeGeneration) => {
        const changed = writableCustomerRequestRoutePlanGeneration(generation)
        const step = changed.routes[0]?.steps[0]
        if (step === undefined) throw new Error('contract variant step missing')
        step.contractRef.contractDigest = ('sha256:' + '1'.repeat(64)) as typeof step.contractRef.contractDigest
        return changed
      },
      (generation: typeof first.routeGeneration) => {
        const changed = writableCustomerRequestRoutePlanGeneration(generation)
        const input = changed.routes[0]?.steps[0]?.resolvedInputs[0]
        if (input === undefined) throw new Error('schema variant input missing')
        input.schemaIdentity = ('sha256:' + '2'.repeat(64)) as typeof input.schemaIdentity
        return changed
      },
      (generation: typeof first.routeGeneration) => {
        const changed = writableCustomerRequestRoutePlanGeneration(generation)
        const dataUse = changed.routes[0]?.steps[0]?.dataUse[0]
        if (dataUse === undefined) throw new Error('data-use variant missing')
        dataUse.purposes = ['changed_purpose']
        return changed
      },
      (generation: typeof first.routeGeneration) => {
        const changed = writableCustomerRequestRoutePlanGeneration(generation)
        const effect = changed.routes[0]?.steps[0]?.effects[0]
        if (effect === undefined) throw new Error('effect variant missing')
        effect.reversibility = 'reversible'
        return changed
      },
      (generation: typeof first.routeGeneration) => {
        const changed = writableCustomerRequestRoutePlanGeneration(generation)
        const evidence = changed.routes[0]?.steps[0]?.evidence[0]
        if (evidence === undefined) throw new Error('evidence variant missing')
        evidence.guaranteed = !evidence.guaranteed
        return changed
      },
      (generation: typeof first.routeGeneration) => {
        const changed = writableCustomerRequestRoutePlanGeneration(generation)
        const route = changed.routes[0]
        if (route === undefined) throw new Error('expiry variant route missing')
        route.expiresAt += 1
        return changed
      },
      (generation: typeof first.routeGeneration) => {
        const changed = writableCustomerRequestRoutePlanGeneration(generation)
        const recovery = changed.routes[0]?.steps[0]?.recovery
        if (recovery === undefined) throw new Error('recovery variant missing')
        recovery.recovery = recovery.recovery === 'retry_safe' ? 'reconcile_required' : 'retry_safe'
        return changed
      },
      (generation: typeof first.routeGeneration) => {
        const changed = writableCustomerRequestRoutePlanGeneration(generation)
        const route = changed.routes[0]
        if (route === undefined) throw new Error('shape variant route missing')
        route.steps = route.steps.slice(0, 1)
        return changed
      },
    ]
    for (const variant of materialVariants) {
      expect(routePlanGenerationMaterialDigest(variant(first.routeGeneration)))
        .not.toBe(routePlanGenerationMaterialDigest(first.routeGeneration))
    }
    expect(routePlanGenerationIsInternallyConsistent({
      ...first.routeGeneration,
      createdAt: first.routeGeneration.createdAt + 1,
    }, 0)).toBe(false)
  })

  it('composes a selected component into one optional registered assembly input', () => {
    const component = compositionLookupModel('workflow.optional-component')
    const assembly = compositionOptionalAssemblyModel()
    const request = requiredInput(component, 'request')
    const compiled = compileCustomerRequest({
      requestId: 'request:optional-component', expectedRevision: 0,
      principalId: 'principal:test', delegatedAgentId: 'agent:test',
      intent: 'Include the selected component in the assembled result.', networkId: 'ae:public',
      proposal: {
        kind: 'capability_candidates',
        selections: [
          {
            operationRef: testOperationRef(component, `v2-semantics:binding:${component.contractRef.capabilityId}`),
            selectionKey: component.selectionKey, contractRef: component.contractRef,
            facts: [{
              contractRef: component.contractRef, selectionKey: component.selectionKey,
              inputKey: request.key, inputPointer: request.inputPointer,
              schemaIdentity: request.schemaIdentity, value: 'Selected component',
              source: { kind: 'customer', assertionRef: 'assertion:optional-component' },
            }],
          },
          { operationRef: testOperationRef(assembly, `v2-semantics:binding:${assembly.contractRef.capabilityId}`), selectionKey: assembly.selectionKey, contractRef: assembly.contractRef, facts: [] },
        ],
      },
      interpreterId: 'interpreter:test',
      bindings: [component, assembly].map((model) => supply(`binding:${model.contractRef.capabilityId}`, model)),
      mappings: [registeredFieldMapping(component, assembly, '/optionId', '/optionalComponent')],
      models: [component, assembly],
      now: 10_000,
    })

    expect(compiled).toMatchObject({
      kind: 'compiled',
      aggregate: { outcome: 'plan_ready', plan: { actions: [
        { contractRef: component.contractRef, dependsOn: [] },
        {
          contractRef: assembly.contractRef,
          dependsOn: [expect.stringMatching(/^action:/u)],
          inputMappings: [{ semanticIdentity: 'ae.option_id:v1', target: { inputPointer: '/optionalComponent' } }],
        },
      ] } },
      routeGeneration: { routes: [{
        edges: [{ semanticIdentity: 'ae.option_id:v1' }],
        steps: [
          expect.any(Object),
          {
            dataUse: [{ inputPointer: '/optionalComponent', effectId: 'component_release' }],
            effects: [{ effectId: 'component_release', class: 'data_release' }],
          },
        ],
      }] },
    })
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
        operationRef: testOperationRef(model, `v2-semantics:binding:${model.contractRef.capabilityId}`),
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
      mappings: [], models: [firstLookup, secondLookup, shipping], now: 10_000,
    })
    expect(result).toMatchObject({ kind: 'compiled', aggregate: {
      outcome: 'needs_information',
      evaluation: { nextRequirement: { kind: 'contract_fact', customerLabel: 'Option identifier' } },
    } })
    if (result.kind !== 'compiled') throw new Error('expected compilation')
    const shippingAction = result.aggregate.plan.actions.find((action) => action.contractRef.capabilityId === 'shipping.quote')
    expect(shippingAction).toMatchObject({ dependsOn: [], inputMappings: [] })
  })

  it('fails closed unless every route has a known safe maximum cost', () => {
    const lookup = compositionLookupModel()
    const shipping = compositionShippingModel(lookup)
    const request = requiredInput(lookup, 'request')
    const compileWithPrices = (prices: readonly [RegisteredSupplyPrice, RegisteredSupplyPrice]) => (
      compileCustomerRequest({
        requestId: 'request:money-safety', expectedRevision: 0,
        principalId: 'principal:test', delegatedAgentId: 'agent:test',
        intent: 'Find an option and quote shipping.', networkId: 'ae:public',
        proposal: { kind: 'capability_candidates', selections: [lookup, shipping].map((model, index) => ({
          operationRef: testOperationRef(model, `v2-semantics:binding:money:${index}`),
          selectionKey: model.selectionKey, contractRef: model.contractRef,
          facts: model === lookup ? [{
            contractRef: lookup.contractRef, selectionKey: lookup.selectionKey,
            inputKey: request.key, inputPointer: request.inputPointer, schemaIdentity: request.schemaIdentity,
            value: 'routing book', source: { kind: 'agent_inference' as const, inferenceRef: 'inference:money-safety' },
          }] : [],
        })) },
        interpreterId: 'interpreter:test',
        mappings: [registeredFieldMapping(lookup, shipping, '/optionId', '/optionId')],
        models: [lookup, shipping], now: 10_000,
        bindings: [lookup, shipping].map((model, index) => {
          const price = prices[index]
          if (price === undefined) throw new Error('test price missing')
          return { ...supply(`binding:money:${index}`, model), price }
        }),
      })
    )

    const mixedCurrency = compileWithPrices([
      { kind: 'fixed', amount: audAmount(100) },
      { kind: 'fixed', amount: { currency: 'USD', units: '100', exponent: 2 } },
    ])
    expect(mixedCurrency).toMatchObject({ kind: 'compiled', aggregate: { outcome: 'unsupported' } })
    expect(mixedCurrency).not.toHaveProperty('routeGeneration')
    expect(projectCustomerRequest(mixedCurrency)).toMatchObject({
      state: 'unsupported', nextAction: 'revise_request',
      summary: 'AE cannot arrange this request end to end yet.',
    })
    const unsafeSum = compileWithPrices([
      { kind: 'fixed', amount: audAmount('9007199254740991.5') },
      { kind: 'fixed', amount: audAmount('1') },
    ])
    expect(unsafeSum).toMatchObject({ kind: 'compiled', aggregate: { outcome: 'unsupported' } })
    expect(unsafeSum).not.toHaveProperty('routeGeneration')
    const onRequest = compileWithPrices([
      { kind: 'fixed', amount: audAmount(100) },
      { kind: 'on_request' },
    ])
    expect(onRequest).toMatchObject({ kind: 'compiled', aggregate: { outcome: 'unsupported' } })
    expect(onRequest).not.toHaveProperty('routeGeneration')
  })

  it('declares only provider-disjoint fallbacks and ranks same-currency routes on an explicit price objective', () => {
    const lookup = compositionLookupModel()
    const shipping = compositionShippingModel(lookup)
    const request = requiredInput(lookup, 'request')
    const lookupOperationId = 'operation:test:ranked-fallback:lookup'
    const lookupPublicationRef = 'publication:test:ranked-fallback:lookup'
    const shippingOperationId = 'operation:test:ranked-fallback:shipping'
    const shippingPublicationRef = 'publication:test:ranked-fallback:shipping'
    const bindings = [
      supply('binding:lookup:cheap', lookup, {
        operationId: lookupOperationId, publicationRef: lookupPublicationRef,
      }),
      {
        ...supply('binding:lookup:same-business', lookup, {
          operationId: lookupOperationId, publicationRef: lookupPublicationRef,
          businessId: 'business:binding:lookup:cheap',
        }),
        price: { kind: 'fixed' as const, amount: audAmount(150) },
      },
      { ...supply('binding:lookup:expensive', lookup, {
        operationId: lookupOperationId, publicationRef: lookupPublicationRef,
      }), price: { kind: 'fixed' as const, amount: audAmount(200) } },
      { ...supply('binding:shipping:expensive', shipping, {
        operationId: shippingOperationId, publicationRef: shippingPublicationRef,
      }), price: { kind: 'fixed' as const, amount: audAmount(300) } },
      { ...supply('binding:shipping:cheap', shipping, {
        operationId: shippingOperationId, publicationRef: shippingPublicationRef,
      }), price: { kind: 'fixed' as const, amount: audAmount(100) } },
    ]
    const result = compileCustomerRequest({
      requestId: 'request:ranked-fallback', expectedRevision: 0,
      principalId: 'principal:test', delegatedAgentId: 'agent:test',
      intent: 'Find the cheapest option and quote shipping.', networkId: 'ae:public',
      proposal: {
        kind: 'capability_candidates',
        selections: [lookup, shipping].map((model) => {
          const operationRef = bindings.find((binding) => (
            binding.contractRef.capabilityId === model.contractRef.capabilityId
          ))?.operationRef
          if (operationRef === undefined) throw new Error('fallback operation lineage missing')
          return {
            operationRef,
            selectionKey: model.selectionKey, contractRef: model.contractRef,
            facts: model === lookup ? [{
              contractRef: lookup.contractRef, selectionKey: lookup.selectionKey,
              inputKey: request.key, inputPointer: request.inputPointer, schemaIdentity: request.schemaIdentity,
              value: 'routing book', source: { kind: 'customer' as const, assertionRef: 'customer:request-message' },
            }] : [],
          }
        }),
      },
      interpreterId: 'interpreter:test',
      bindings, mappings: [registeredFieldMapping(lookup, shipping, '/optionId', '/optionId')], models: [lookup, shipping], now: 10_000,
    })
    if (result.kind !== 'compiled') throw new Error(`compile refused: ${result.reason}`)
    if (result.routeGeneration === undefined) throw new Error('route generation missing')
    expect(result.routeGeneration.routes).toHaveLength(6)
    expect(result.routeGeneration.routes.map((route) => route.maximumTotalCost)).toEqual([
      { kind: 'known', amount: audAmount(200) },
      { kind: 'known', amount: audAmount(250) },
      { kind: 'known', amount: audAmount(300) },
      { kind: 'known', amount: audAmount(400) },
      { kind: 'known', amount: audAmount(450) },
      { kind: 'known', amount: audAmount(500) },
    ])
    for (const [index, route] of result.routeGeneration.routes.entries()) {
      expect(route.comparison.hardConstraints).toBe('not_evaluated')
      expect(route.comparison.ordering).toEqual({
        kind: 'ranked', objective: 'lowest_maximum_price', position: index + 1,
        evidenceRef: expect.any(String),
      })
      expect(route.fallbacks.ordering).toBe('unranked')
      expect(route.fallbacks.alternatives.length).toBeGreaterThan(0)
      const bindingsInRoute = new Set(route.steps.map((step) => step.bindingId))
      const businessesInRoute = new Set(route.steps.map((step) => step.businessId))
      for (const fallback of route.fallbacks.alternatives) {
        const alternative = result.routeGeneration.routes.find((candidate) => (
          candidate.routePlanId === fallback.alternativeRouteRef
        ))
        if (alternative === undefined) throw new Error('declared fallback missing')
        expect(alternative.steps.every((step) => (
          !bindingsInRoute.has(step.bindingId) && !businessesInRoute.has(step.businessId)
        ))).toBe(true)
      }
    }
  })

  it('derives and enforces an explicit maximum total cost from customer language', () => {
    expect(deriveCustomerMaximumTotalCostCriterion(
      'Source workplace catering and keep the total under AUD 4,000.',
    )).toMatchObject({
      value: { currency: 'AUD', units: '4000', exponent: 0 },
    })
    expect(deriveCustomerMaximumTotalCostCriterion('Use both providers but keep the total below AUD 5.00.')).toMatchObject({
      label: 'Maximum total cost', value: { currency: 'AUD', units: '500', exponent: 2 }, basis: 'extracted_from_request',
    })
    const lookup = compositionLookupModel()
    const shipping = compositionShippingModel(lookup)
    const request = requiredInput(lookup, 'request')
    const result = compileCustomerRequest({
      requestId: 'request:hard-spend', expectedRevision: 0,
      principalId: 'principal:test', delegatedAgentId: 'agent:test',
      intent: 'Use both providers but keep the total below AUD 5.00.', networkId: 'ae:public',
      proposal: { kind: 'capability_candidates', selections: [lookup, shipping].map((model) => ({
        operationRef: testOperationRef(model, `v2-semantics:binding:${model === lookup ? 'lookup' : 'shipping'}:hard-spend`),
        selectionKey: model.selectionKey, contractRef: model.contractRef,
        facts: model === lookup ? [{
          contractRef: lookup.contractRef, selectionKey: lookup.selectionKey,
          inputKey: request.key, inputPointer: request.inputPointer, schemaIdentity: request.schemaIdentity,
          value: 'routing book', source: { kind: 'customer' as const, assertionRef: 'customer:request-message' },
        }] : [],
      })) },
      interpreterId: 'interpreter:test',
      mappings: [registeredFieldMapping(lookup, shipping, '/optionId', '/optionId')],
      bindings: [
        { ...supply('binding:lookup:hard-spend', lookup), price: { kind: 'fixed', amount: audAmount(300) } },
        { ...supply('binding:shipping:hard-spend', shipping), price: { kind: 'fixed', amount: audAmount(700) } },
      ],
      models: [lookup, shipping], now: 10_000,
    })

    expect(result).toMatchObject({ kind: 'compiled', aggregate: { outcome: 'unsupported' } })
    expect(result).not.toHaveProperty('routeGeneration')
    expect(projectCustomerRequest(result)).toMatchObject({
      state: 'unsupported', summary: 'No current option stays within your AUD 5.00 maximum.',
      nextAction: 'revise_request',
      unsupportedRecovery: {
        reason: 'maximum_total_cost_exceeded',
        nextStep: {
          kind: 'change_request',
          summary: 'Raise or remove the maximum total, or ask for a different outcome.',
        },
      },
    })
  })

  it('refuses provider routes when the customer explicitly prohibits data sharing', () => {
    expect(deriveCustomerProviderDataSharingCriterion(
      'Find a labelled sandbox option, but do not share any data with a business.',
    )).toMatchObject({
      label: 'Share data with businesses', value: false, basis: 'extracted_from_request',
    })
    const lookup = compositionLookupModel('catalog.public-lookup', 'allowed', 'public')
    const request = requiredInput(lookup, 'request')
    const result = compileCustomerRequest({
      requestId: 'request:no-provider-sharing', expectedRevision: 0,
      principalId: 'principal:test', delegatedAgentId: 'agent:test',
      intent: 'Find a labelled sandbox option, but do not share any data with a business.',
      networkId: 'ae:public',
      proposal: { kind: 'capability_candidates', selections: [{
        operationRef: testOperationRef(lookup, 'v2-semantics:binding:lookup:no-provider-sharing'),
        selectionKey: lookup.selectionKey, contractRef: lookup.contractRef,
        facts: [{
          contractRef: lookup.contractRef, selectionKey: lookup.selectionKey,
          inputKey: request.key, inputPointer: request.inputPointer, schemaIdentity: request.schemaIdentity,
          value: 'labelled sandbox option',
          source: { kind: 'customer' as const, assertionRef: 'customer:request-message' },
        }],
      }] },
      interpreterId: 'interpreter:test',
      bindings: [supply('binding:lookup:no-provider-sharing', lookup)],
      mappings: [], models: [lookup], now: 10_000,
    })

    expect(result).toMatchObject({
      kind: 'compiled',
      aggregate: {
        outcome: 'unsupported',
        evaluation: {
          candidates: [],
        },
      },
    })
    if (result.kind !== 'compiled') throw new Error(`compile refused: ${result.reason}`)
    expect(result.aggregate.evaluation.criteria).toContainEqual(expect.objectContaining({
      label: 'Share data with businesses', value: false,
    }))
    expect(result).not.toHaveProperty('routeGeneration')
    expect(projectCustomerRequest(result)).toMatchObject({
      state: 'unsupported',
      summary: 'Available options require sharing information with a business, which you asked AE not to do.',
      nextAction: 'revise_request',
      unsupportedRecovery: {
        reason: 'provider_data_sharing_prohibited',
        nextStep: {
          kind: 'change_request',
          summary: 'Allow the minimum stated business sharing, or ask for a public-information-only outcome.',
        },
      },
      dataHandling: {
        requestStorage: 'saved_for_revision',
        businessSharing: 'not_shared',
        explanation: 'AE saved this revision so you can change it. No information from this revision was sent to a business.',
      },
    })
  })

  it('fails closed when an explicit maximum response time has no declared supply evidence', () => {
    expect(deriveCustomerMaximumResponseTimeCriterion(
      'Find a labelled sandbox option that responds within 50 milliseconds.',
    )).toMatchObject({
      label: 'Maximum response time', value: { amount: 50, unit: 'milliseconds' },
      basis: 'extracted_from_request',
    })
    const lookup = compositionLookupModel()
    const request = requiredInput(lookup, 'request')
    const result = compileCustomerRequest({
      requestId: 'request:maximum-response-time', expectedRevision: 0,
      principalId: 'principal:test', delegatedAgentId: 'agent:test',
      intent: 'Find a labelled sandbox option that responds within 50 milliseconds.',
      networkId: 'ae:public',
      proposal: { kind: 'capability_candidates', selections: [{
        operationRef: testOperationRef(lookup, 'v2-semantics:binding:lookup:maximum-response-time'),
        selectionKey: lookup.selectionKey, contractRef: lookup.contractRef,
        facts: [{
          contractRef: lookup.contractRef, selectionKey: lookup.selectionKey,
          inputKey: request.key, inputPointer: request.inputPointer, schemaIdentity: request.schemaIdentity,
          value: 'labelled sandbox option',
          source: { kind: 'customer' as const, assertionRef: 'customer:request-message' },
        }],
      }] },
      interpreterId: 'interpreter:test',
      bindings: [supply('binding:lookup:maximum-response-time', lookup)],
      mappings: [], models: [lookup], now: 10_000,
    })

    expect(result).toMatchObject({
      kind: 'compiled', aggregate: { outcome: 'unsupported', evaluation: { candidates: [] } },
    })
    expect(result).not.toHaveProperty('routeGeneration')
    expect(projectCustomerRequest(result)).toMatchObject({
      state: 'unsupported',
      summary: 'No current option declares a response time within 50 milliseconds.',
      nextAction: 'revise_request',
      unsupportedRecovery: {
        reason: 'maximum_response_time_unproven',
        nextStep: {
          kind: 'change_request',
          summary: 'Relax or remove the response-time limit, or ask for a different outcome.',
        },
      },
    })
  })

  it('does not invent a response-time constraint from an unrelated duration', () => {
    expect(deriveCustomerMaximumResponseTimeCriterion(
      'I will decide within 2 seconds; response time is not constrained.',
    )).toBeUndefined()
  })

  it('does not price-rank otherwise viable routes across currencies', () => {
    const lookup = compositionLookupModel()
    const request = requiredInput(lookup, 'request')
    const operationId = 'operation:test:cross-currency'
    const publicationRef = 'publication:test:cross-currency'
    const bindings = [
      {
        ...supply('binding:lookup:aud', lookup, { operationId, publicationRef }),
        price: { kind: 'fixed' as const, amount: audAmount(1) },
      },
      {
        ...supply('binding:lookup:usd', lookup, { operationId, publicationRef }),
        price: { kind: 'fixed' as const, amount: { currency: 'USD', units: '1', exponent: 2 } },
      },
    ]
    const result = compileCustomerRequest({
      requestId: 'request:cross-currency', expectedRevision: 0,
      principalId: 'principal:test', delegatedAgentId: 'agent:test', intent: 'Find the cheapest lookup.',
      networkId: 'ae:public',
      proposal: {
        kind: 'capability_candidates',
        selections: [{
          operationRef: bindings[0]!.operationRef,
          selectionKey: lookup.selectionKey, contractRef: lookup.contractRef,
          facts: [{
            contractRef: lookup.contractRef, selectionKey: lookup.selectionKey,
            inputKey: request.key, inputPointer: request.inputPointer, schemaIdentity: request.schemaIdentity,
            value: 'routing book', source: { kind: 'customer' as const, assertionRef: 'customer:request-message' },
          }],
        }],
      },
      interpreterId: 'interpreter:test', models: [lookup], now: 10_000,
      mappings: [], bindings,
    })
    if (result.kind !== 'compiled') throw new Error(`compile refused: ${result.reason}`)
    if (result.routeGeneration === undefined) throw new Error('route generation missing')
    expect(result.routeGeneration.routes.map((route) => route.comparison.ordering)).toEqual([
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
        operationRef: testOperationRef(model, `v2-semantics:binding:${model.contractRef.capabilityId}`),
        selectionKey: model.selectionKey, contractRef: model.contractRef, facts: [],
      })) },
      interpreterId: 'interpreter:test',
      mappings: [
        registeredFieldMapping(first, second, '/value', '/value'),
        registeredFieldMapping(second, first, '/value', '/value'),
      ],
      bindings: [first, second].map((model) => supply(`binding:${model.contractRef.capabilityId}`, model)),
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
          operationRef: binding.operationRef,
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
      interpreterId: 'interpreter:test', bindings: [binding], mappings: [], models: [model], now: 1,
    })

    expect(result).toEqual({ kind: 'refused', reason: 'unsafe_interpretation' })
  })

  it('keeps structured request input missing when verbatim customer text does not satisfy its registered schema', () => {
    const model = decisionModelWithCommitment()
    const requestInput = requiredInput(model, 'request')
    const binding = supply('binding:structured', model)
    const result = compileCustomerRequest({
      requestId: 'request:structured-recovery', expectedRevision: 0,
      principalId: 'principal:test', delegatedAgentId: 'agent:test',
      intent: 'Find market data about routing.', networkId: 'ae:public',
      proposal: {
        kind: 'capability_candidates',
        selections: [{
          operationRef: binding.operationRef,
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
      interpreterId: 'interpreter:test', bindings: [binding], mappings: [], models: [model], now: 1,
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
    const binding = supply('binding:customer-provenance', model)
    const result = compileCustomerRequest({
      requestId: 'request:customer-provenance', expectedRevision: 0,
      principalId: 'principal:test', delegatedAgentId: 'agent:test',
      intent: 'Find market data about routing.', networkId: 'ae:public',
      proposal: {
        kind: 'capability_candidates',
        selections: [{
          operationRef: binding.operationRef,
          selectionKey: model.selectionKey, contractRef: model.contractRef,
          facts: [{
            contractRef: model.contractRef, selectionKey: model.selectionKey,
            inputKey: requestInput.key, inputPointer: requestInput.inputPointer,
            schemaIdentity: requestInput.schemaIdentity, value: { topic: 'routing' },
            source: { kind: 'agent_inference', inferenceRef: 'inference:schema-valid' },
          }],
        }],
      },
      interpreterId: 'interpreter:test', bindings: [binding], mappings: [],
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

  it('derives ranking intent from customer text only and discards model-injected preference', async () => {
    expect(deriveCustomerDecisionPreference('Find the cheapest suitable option')).toMatchObject({
      objective: 'lowest_maximum_price', basis: 'extracted_from_request',
    })
    expect(deriveCustomerDecisionPreference('Prefer the lowest maximum total cost.')).toMatchObject({
      objective: 'lowest_maximum_price', basis: 'extracted_from_request',
    })
    expect(deriveCustomerDecisionPreference('Price should not be the cheapest')).toBeUndefined()
    const model = decisionModelWithCommitment()
    const interpreter = createJsonCustomerRequestSemanticInterpreter({
      interpreterId: 'interpreter:preference-injection',
      transport: { generateJson: async () => ({
        kind: 'capability_candidates', selections: [], decisionPreference: 'lowest_maximum_price',
      }) },
      timeoutMs: 1_000, maximumPayloadBytes: 64_000, maximumResponseBytes: 8_000,
    })

    await expect(interpreter.propose({
      customerJob: 'Find a suitable option.',
      capabilities: [bindCustomerCapabilityDescriptor({
        operationRef: testOperationRef(model),
        contractRef: model.contractRef, selectionKey: model.selectionKey,
        name: 'Search data', description: 'Returns matching data.', inputs: model.inputs,
        valueSchemas: inputValueSchemas(model, structuredInputSchema()),
        evidence: model.evidence.map(({ label, purpose, schemaIdentity }) => ({ label, purpose, schemaIdentity })),
      })],
    })).resolves.toMatchObject({ kind: 'capability_candidates', selections: [] })
  })

  it('uses the latest explicit customer price priority instead of a stale earlier request', () => {
    expect(deriveCustomerDecisionPreference([
      'Find the cheapest labelled sandbox option.',
      'Change my priority: prefer Sandbox Option One even if it costs more.',
    ].join('\n'))).toBeUndefined()
    expect(deriveCustomerDecisionPreference([
      'Prefer Sandbox Option One even if it costs more.',
      'Change my priority: find the cheapest option after all.',
    ].join('\n'))).toMatchObject({ objective: 'lowest_maximum_price', basis: 'extracted_from_request' })
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


function audAmount(units: number | string): ExactAmount {
  return { currency: 'AUD', units: String(units), exponent: 2 }
}

function decisionModelWithCommitment() {
  return openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2({
    inputSchema: structuredInputSchema(),
    customerAnnotations: structuredAnnotations(),
    dataUse: structuredDataUse(),
    effects: structuredEffects(),
  })))
}

function compositionLookupModel(
  capabilityId = 'catalog.lookup',
  inference: 'allowed' | 'customer_required' = 'allowed',
  classification: 'public' | 'personal' = 'personal',
) {
  return openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2({
    capabilityId, version: 2,
    inputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { request: { type: 'string' } }, required: ['request'], additionalProperties: false },
    outputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { optionId: { type: 'string' }, result: { type: 'string' } }, required: ['optionId', 'result'], additionalProperties: false },
    customerAnnotations: [
      { annotationId: 'request', document: 'input', pointer: '/request', label: 'What to find', role: 'request', inference },
      { annotationId: 'option_id', semanticIdentity: 'ae.option_id:v1', document: 'output', pointer: '/optionId', label: 'Option identifier', role: 'comparison' },
      { annotationId: 'result', document: 'output', pointer: '/result', label: 'Lookup result', role: 'completion_evidence' },
    ],
    dataUse: [dataUse('request_release', '/request', classification)], effects: [dataEffect('request_release')],
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

function compositionOptionalAssemblyModel() {
  return openCapabilityDecisionModel(defineCapabilityContract(capabilityContractV2({
    capabilityId: 'workflow.optional-assembly', version: 1,
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
      properties: {
        optionalComponent: { type: 'string' }, omittedComponent: { type: 'string' },
      }, required: [], additionalProperties: false,
    },
    outputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
      properties: { result: { type: 'string' } }, required: ['result'], additionalProperties: false,
    },
    customerAnnotations: [
      {
        annotationId: 'optional_component', semanticIdentity: 'ae.option_id:v1',
        document: 'input', pointer: '/optionalComponent', label: 'Optional component', role: 'constraint',
      },
      {
        annotationId: 'omitted_component', semanticIdentity: 'ae.omitted-component:v1',
        document: 'input', pointer: '/omittedComponent', label: 'Omitted component', role: 'constraint',
      },
      {
        annotationId: 'result', document: 'output', pointer: '/result',
        label: 'Assembled result', role: 'completion_evidence',
      },
    ],
    dataUse: [
      dataUse('component_release', '/optionalComponent'),
      dataUse('omitted_release', '/omittedComponent'),
    ],
    effects: [dataEffect('component_release'), dataEffect('omitted_release')],
    evidence: [{ evidenceId: 'assembly_complete', outputPointer: '/result', purpose: 'completion' }],
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

function dataUse(effectId: string, inputPointer: string, classification: 'public' | 'personal' = 'personal') {
  return {
    effectId, inputPointer, classification, phase: 'execution',
    recipient: { kind: 'selected_binding' }, purposes: ['return_requested_result'],
  }
}

function dataEffect(effectId: string) {
  return {
    effectId, class: 'data_release', authority: 'mandate_or_explicit', reversibility: 'irreversible',
  }
}

function requiredInput(model: CapabilityDecisionModel, annotationId: string) {
  const input = model.inputs.find((candidate) => candidate.annotationId === annotationId)
  if (input === undefined) throw new Error(`missing test input: ${annotationId}`)
  return input
}

function registeredFieldMapping(
  source: CapabilityDecisionModel,
  target: CapabilityDecisionModel,
  sourceOutputPointer: string,
  targetInputPointer: string,
): RegisteredOperationMapping {
  const output = source.evidence.find((candidate) => candidate.outputPointer === sourceOutputPointer)
  const input = target.inputs.find((candidate) => candidate.inputPointer === targetInputPointer)
  if (output === undefined || input === undefined) throw new Error('registered mapping semantics missing')
  const material = {
    kind: 'field' as const,
    authority: 'registered_contract_semantics' as const,
    sourceContractRef: source.contractRef,
    targetContractRef: target.contractRef,
    sourceSchemaIdentity: output.schemaIdentity,
    targetSchemaIdentity: input.schemaIdentity,
    sourceOutputPointer,
    targetInputPointer,
  }
  return { ...material, mappingRef: createRegisteredOperationMappingRef(material) }
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

function supply(
  bindingId: string,
  model: CapabilityDecisionModel,
  overrides: Readonly<{ businessId?: string; operationId?: string; publicationRef?: string }> = {},
) {
  const lineage = createTestOperationLineage(model.contractRef, `v2-semantics:${bindingId}`, {
    operationId: overrides.operationId ?? `operation:test:${bindingId}`,
    businessId: overrides.businessId ?? `business:${bindingId}`,
    publicationRef: overrides.publicationRef ?? `publication:${bindingId}`,
    offeringId: `offering:${bindingId}`,
    offeringRegistrationHash: `sha256:offering:${bindingId}`,
    bindingId,
    bindingRegistrationHash: `sha256:binding:${bindingId}`,
    readinessValidUntil: 20_000,
  })
  return {
    operationRef: lineage.operationRef,
    admittedOperation: lineage.admittedOperation,
    businessId: lineage.admittedOperation.businessId,
    offeringId: lineage.admittedOperation.offeringId,
    bindingId: lineage.admittedOperation.bindingId,
    contractRef: model.contractRef,
    offeringRegistrationHash: lineage.admittedOperation.offeringRegistrationHash,
    bindingRegistrationHash: lineage.admittedOperation.bindingRegistrationHash,
    publicationRef: lineage.admittedOperation.publicationRef,
    publicationRevision: lineage.admittedOperation.publicationRevision,
    readinessValidUntil: lineage.admittedOperation.readinessValidUntil,
    price: { kind: 'fixed' as const, amount: audAmount(100) },
    cancellation: { kind: 'unsupported' as const, evidenceRefs: [`cancellation:${bindingId}`] },
  }
}
function testOperationRef(
  model: CapabilityDecisionModel,
  suffix = `v2-semantics:descriptor:${model.contractRef.capabilityId}`,
) {
  const bindingPrefix = 'v2-semantics:binding:'
  if (suffix.startsWith(bindingPrefix)) {
    const bindingId = `binding:${suffix.slice(bindingPrefix.length)}`
    return createTestOperationLineage(model.contractRef, suffix, {
      operationId: `operation:test:${bindingId}`,
      businessId: `business:${bindingId}`,
      publicationRef: `publication:${bindingId}`,
      offeringId: `offering:${bindingId}`,
      offeringRegistrationHash: `sha256:offering:${bindingId}`,
      bindingId,
      bindingRegistrationHash: `sha256:binding:${bindingId}`,
      readinessValidUntil: 20_000,
    }).operationRef
  }
  return createTestOperationLineage(model.contractRef, suffix).operationRef
}
