import { describe, expect, it, vi } from 'vitest'

import {
  defineCapabilityContract,
  isBoundedJsonValue,
  openCapabilityDecisionModel,
} from '@/modules/capability-contract/public'
import {
  discoverRequestEvaluationCandidates,
  evaluateCustomerRequestSnapshot,
  requestRegistrySnapshotDigest,
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
      interpreterId: 'interpreter:test', transport: { generateJson }, timeoutMs: 1_000, maximumResponseBytes: 8_000,
    })

    const proposal = await interpreter.propose({
      customerJob: 'Find market data about routing.',
      capabilities: [bindCustomerCapabilityDescriptor({
        contractRef: model.contractRef,
        selectionKey: model.selectionKey,
        name: 'Search data',
        description: 'Returns matching data.',
        inputs: model.inputs,
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
      }],
      resolveModel: () => model,
    })

    expect(evaluation.completionRequirements).toEqual([{
      actionId: 'action:one', contractRef: model.contractRef,
      evidenceId: completion?.evidenceId, outputPointer: completion?.outputPointer,
      purpose: 'completion', schemaIdentity: completion?.schemaIdentity,
    }])
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
      timeoutMs: 1_000, maximumResponseBytes: 8_000,
    })

    await expect(interpreter.propose({
      customerJob: 'Find a suitable option.',
      capabilities: [bindCustomerCapabilityDescriptor({
        contractRef: model.contractRef, selectionKey: model.selectionKey,
        name: 'Search data', description: 'Returns matching data.', inputs: model.inputs,
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

function structuredAnnotations() {
  return [
    { annotationId: 'request', document: 'input', pointer: '/request', label: 'What to find', role: 'request' },
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

function supply(bindingId: string, model: ReturnType<typeof decisionModelWithCommitment>) {
  return {
    businessId: `business:${bindingId}`, offeringId: `offering:${bindingId}`, bindingId,
    contractRef: model.contractRef, offeringRegistrationHash: `sha256:offering:${bindingId}`,
    bindingRegistrationHash: `sha256:binding:${bindingId}`,
  }
}
