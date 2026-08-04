import { describe, expect, it, vi } from 'vitest'
import { createTestOperationLineage } from '../../helpers/customer-request-lineage'
import {
  defineCapabilityContract,
  openCapabilityDecisionModel,
  projectCapabilityInputValueSchema,
  type CapabilityDecisionModel,
} from '@/modules/capability-contract/public'
import {
  createConfiguredRequestInterpreter,
  createDeterministicCustomerRequestInterpreter,
} from '@/modules/customer-request/application/interpret-compile'
import { compileCustomerRequest } from '@/modules/customer-request/compiler'
import { projectCustomerRequest } from '@/modules/customer-request/customer-projection'
import {
  bindCustomerCapabilityDescriptor,
  DETERMINISTIC_TOKEN_MATCH_INTERPRETER_ID,
} from '@/modules/customer-request/semantic-interpreter'
import { capabilityContractV2 } from '@/../tests/fixtures/capability-contract-v2'

const BURST_PIPE_JOB = 'emergency plumber near me tonight, how much?'

describe('deterministic customer request interpretation', () => {
  it('matches the plumbing capability and leaves the accountant out', async () => {
    const plumbing = capability('plumbing.callout', 'Emergency plumbing callout',
      'Burst pipe and blocked drain triage for urgent local plumbing issues.')
    const accounting = capability('accounting.review', 'Business accounting review',
      'Prepare and lodge business activity statements for local companies.')

    const proposal = await createDeterministicCustomerRequestInterpreter().propose({
      customerJob: BURST_PIPE_JOB,
      capabilities: [plumbing.descriptor, accounting.descriptor],
    })

    expect(proposal).toMatchObject({
      kind: 'capability_candidates',
      canonicalCustomerJob: BURST_PIPE_JOB,
      interpreterId: DETERMINISTIC_TOKEN_MATCH_INTERPRETER_ID,
      selections: [{ selectionKey: plumbing.model.selectionKey, contractRef: plumbing.model.contractRef, facts: [] }],
    })
    expect(proposal).not.toMatchObject({ selections: [{ selectionKey: accounting.model.selectionKey }] })
  })

  it('proposes nothing rather than an arbitrary capability when no word matches', async () => {
    const plumbing = capability('plumbing.callout', 'Emergency plumbing callout',
      'Burst pipe and blocked drain triage for urgent local plumbing issues.')
    const accounting = capability('accounting.review', 'Business accounting review',
      'Prepare and lodge business activity statements for local companies.')

    await expect(createDeterministicCustomerRequestInterpreter().propose({
      customerJob: 'xyzzy-nonsense',
      capabilities: [plumbing.descriptor, accounting.descriptor],
    })).resolves.toMatchObject({ kind: 'capability_candidates', selections: [] })
  })

  it('ignores requirement words so availability wording cannot decide the capability', async () => {
    // "emergency" and "tonight" say when, not what. A capability whose only overlap with the
    // request is an availability word must not outrank the one that names the actual trade.
    const plumbing = capability('plumbing.callout', 'Local plumbing callout',
      'Burst pipe and blocked drain triage for a plumber to attend.')
    const emergencyDentist = capability('dental.emergency', 'Emergency dental appointment',
      'Emergency tonight appointment for urgent dental pain.')

    await expect(createDeterministicCustomerRequestInterpreter().propose({
      customerJob: BURST_PIPE_JOB,
      capabilities: [emergencyDentist.descriptor, plumbing.descriptor],
    })).resolves.toMatchObject({ selections: [{ selectionKey: plumbing.model.selectionKey }] })
  })

  it('ranks identically whichever order the capabilities arrive in', async () => {
    const description = 'Burst pipe and blocked drain triage for urgent local plumbing issues.'
    const first = capability('plumbing.first', 'Emergency plumbing callout', description)
    const second = capability('plumbing.second', 'Emergency plumbing callout', description)
    const accounting = capability('accounting.review', 'Business accounting review',
      'Prepare and lodge business activity statements for local companies.')
    const interpreter = createDeterministicCustomerRequestInterpreter()

    const forward = await interpreter.propose({
      customerJob: BURST_PIPE_JOB,
      capabilities: [first.descriptor, second.descriptor, accounting.descriptor],
    })
    const reversed = await interpreter.propose({
      customerJob: BURST_PIPE_JOB,
      capabilities: [accounting.descriptor, second.descriptor, first.descriptor],
    })

    // Two capabilities score identically here, so only the stable key can decide which one wins.
    const tieBreak = [first.model.selectionKey, second.model.selectionKey]
      .sort((left, right) => left.localeCompare(right))[0]
    expect(forward).toEqual(reversed)
    expect(forward).toMatchObject({ selections: [{ selectionKey: tieBreak }] })
  })

  it('compiles a keyword-matched proposal through the normal path and marks it as keyword-matched', async () => {
    const plumbing = capability('plumbing.callout', 'Emergency plumbing callout',
      'Burst pipe and blocked drain triage for urgent local plumbing issues.')
    const proposal = await createDeterministicCustomerRequestInterpreter().propose({
      customerJob: BURST_PIPE_JOB, capabilities: [plumbing.descriptor],
    })

    const compiled = compileCustomerRequest({
      requestId: 'request:deterministic', expectedRevision: 0,
      principalId: 'principal:test', delegatedAgentId: 'agent:test',
      intent: BURST_PIPE_JOB, networkId: 'ae:public',
      proposal, interpreterId: DETERMINISTIC_TOKEN_MATCH_INTERPRETER_ID,
      bindings: [supply('binding:plumbing', plumbing.model)], models: [plumbing.model], mappings: [], now: 1,
    })

    expect(compiled).toMatchObject({ kind: 'compiled' })
    const view = projectCustomerRequest(compiled)
    expect(view).toMatchObject({
      kind: 'request', interpretationBasis: 'keyword_match', state: 'needs_information',
      nextAction: 'provide_information',
    })
    // The dead end this replaces told the customer to retry an operation that could never succeed.
    expect(view).not.toMatchObject({ nextAction: 'retry' })
  })
})

describe('configured customer request interpretation', () => {
  it('still interprets without a provider key instead of leaving no interpreter at all', async () => {
    const plumbing = capability('plumbing.callout', 'Emergency plumbing callout',
      'Burst pipe and blocked drain triage for urgent local plumbing issues.')
    const interpreter = createConfiguredRequestInterpreter({ maximumDescriptorBytes: 64_000 })

    expect(interpreter.interpreterId).toBe(DETERMINISTIC_TOKEN_MATCH_INTERPRETER_ID)
    await expect(interpreter.propose({
      customerJob: BURST_PIPE_JOB, capabilities: [plumbing.descriptor],
    })).resolves.toMatchObject({ selections: [{ selectionKey: plumbing.model.selectionKey }] })
  })

  it('falls back to keyword matching on the last attempt, and reports which leg answered', async () => {
    const plumbing = capability('plumbing.callout', 'Emergency plumbing callout',
      'Burst pipe and blocked drain triage for urgent local plumbing issues.')
    const logged: unknown[] = []
    const consoleError = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(...args)
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'Insufficient credits' } }), { status: 402 },
    )))

    try {
      const interpreter = createConfiguredRequestInterpreter({
        openRouterApiKey: 'sk-test', modelName: 'test/model', maximumDescriptorBytes: 64_000,
      })

      const proposal = await interpreter.propose({
        customerJob: BURST_PIPE_JOB, capabilities: [plumbing.descriptor], finalAttempt: true,
      })

      expect(proposal).toMatchObject({
        kind: 'capability_candidates',
        interpreterId: DETERMINISTIC_TOKEN_MATCH_INTERPRETER_ID,
        selections: [{ selectionKey: plumbing.model.selectionKey }],
      })
      expect(proposal.interpreterId).not.toContain('openrouter')
      expect(logged).toContain('customer_request_interpretation_provider_402')
    } finally {
      consoleError.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  it('lets a retryable attempt fail so a transient provider blip is not answered by keywords', async () => {
    // Absorbing the first failure would turn one 503 into a permanently downgraded answer.
    const plumbing = capability('plumbing.callout', 'Emergency plumbing callout',
      'Burst pipe and blocked drain triage for urgent local plumbing issues.')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable', { status: 503 })))

    try {
      await expect(createConfiguredRequestInterpreter({
        openRouterApiKey: 'sk-test', modelName: 'test/model', maximumDescriptorBytes: 64_000,
      }).propose({
        customerJob: BURST_PIPE_JOB, capabilities: [plumbing.descriptor], finalAttempt: false,
      })).rejects.toThrowError('customer_request_interpretation_provider_503')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('attributes a model answer to the model, never to the fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify({
        kind: 'unsupported_request', reason: 'requested_result_not_available', prompt: '',
        canonicalStatements: [], supersededStatements: [], selections: [],
      }) }, finish_reason: 'stop' }],
    }), { status: 200 })))

    try {
      const proposal = await createConfiguredRequestInterpreter({
        openRouterApiKey: 'sk-test', modelName: 'test/model', maximumDescriptorBytes: 64_000,
      }).propose({ customerJob: BURST_PIPE_JOB, capabilities: [] })

      expect(proposal).toMatchObject({
        kind: 'unsupported_request', interpreterId: 'openrouter:test/model',
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

function capability(capabilityId: string, name: string, description: string) {
  const document = capabilityContractV2({ capabilityId, name, description, inputSchema: requestInputSchema() })
  const model = openCapabilityDecisionModel(defineCapabilityContract(document))
  return {
    model,
    descriptor: bindCustomerCapabilityDescriptor({
      operationRef: createTestOperationLineage(model.contractRef).operationRef,
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      name,
      description,
      inputs: model.inputs,
      valueSchemas: model.inputs.map((input) => ({
        inputKey: input.key,
        valueSchema: projectCapabilityInputValueSchema(requestInputSchema(), input),
      })),
      evidence: model.evidence.map(({ label, purpose, schemaIdentity }) => ({ label, purpose, schemaIdentity })),
    }),
  }
}

function requestInputSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
    properties: { request: { type: 'string', minLength: 1 } },
    required: ['request'], additionalProperties: false,
  }
}
function supply(bindingId: string, model: CapabilityDecisionModel) {
  return {
    ...createTestOperationLineage(model.contractRef),
    businessId: `business:${bindingId}`, offeringId: `offering:${bindingId}`, bindingId,
    contractRef: model.contractRef, offeringRegistrationHash: `sha256:offering:${bindingId}`,
    bindingRegistrationHash: `sha256:binding:${bindingId}`,
    publicationRef: `publication:${bindingId}`, publicationRevision: 1, readinessValidUntil: 20_000,
    price: { kind: 'fixed' as const, currency: 'AUD', amountMinor: 100 },
    cancellation: { kind: 'unsupported' as const, evidenceRefs: [`cancellation:${bindingId}`] },
  }
}
