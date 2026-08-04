import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { createTestOperationLineage } from '../../../helpers/customer-request-lineage'

import {
  defineCapabilityContract,
  openCapabilityDecisionModel,
} from '@/modules/capability-contract/public'
import { compileCustomerRequest } from '@/modules/customer-request/compiler'
import { createConfiguredRequestInterpreter } from '@/modules/customer-request/application/interpret-compile/interpreter'
import type { CustomerRequestSemanticInterpreter } from '@/modules/customer-request/semantic-interpreter'
import {
  compileCommit,
  customerProgressState,
  durableSubmissionShellView,
  interpretCompileCommit,
  isPartialRouteResult,
  isProviderReportedRouteFailure,
  loadRequestGraph,
  retryableCompileAdmissionFailure,
  storedGenerationRepresentsAggregate,
  type CompileCommitInput,
  type RequestGraph,
} from '@/modules/customer-request/application/public'

vi.mock('@/modules/customer-request/application/interpret-compile/interpreter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/customer-request/application/interpret-compile/interpreter')>()
  return {
    ...actual,
    createConfiguredRequestInterpreter: vi.fn(actual.createConfiguredRequestInterpreter),
  }
})

describe('customer-request application composition', () => {
  describe('interpret-compile', () => {
    it('builds a durable submission shell that asks for retry', () => {
      expect(durableSubmissionShellView('req-1')).toMatchObject({
        kind: 'request',
        requestRef: 'req-1',
        revision: 0,
        state: 'needs_attention',
        nextAction: 'retry',
      })
    })

    it('detects retryable compile admission failures only for same-revision needs_attention retry', () => {
      expect(retryableCompileAdmissionFailure({
        kind: 'request',
        requestRef: 'req-1',
        revision: 3,
        state: 'needs_attention',
        nextAction: 'retry',
        summary: 'try again',
        missingFields: [],
        options: [],
      }, 3)).toBe(true)
      expect(retryableCompileAdmissionFailure({
        kind: 'request',
        requestRef: 'req-1',
        revision: 4,
        state: 'needs_attention',
        nextAction: 'retry',
        summary: 'try again',
        missingFields: [],
        options: [],
      }, 3)).toBe(false)
      expect(retryableCompileAdmissionFailure({
        kind: 'refused',
        reason: 'interpreter_unavailable',
      }, 3)).toBe(false)
    })
  })

  describe('interpret-compile orchestration ports', () => {
    const interpreterEnv = { maximumDescriptorBytes: 512_000 }
    const baseInput = {
      commandKey: 'cmd:1',
      commandDigest: 'digest:1',
      requestId: 'req:1',
      expectedRevision: 3,
      expectedRouteGeneration: 0,
      principalId: 'principal:1',
      delegatedAgentId: 'agent:1',
      intent: 'Find an option to Perth',
      networkId: 'ae:public',
      priorFacts: [],
      now: 1_000,
    }

    beforeEach(() => {
      vi.mocked(createConfiguredRequestInterpreter).mockReset()
      vi.mocked(createConfiguredRequestInterpreter).mockImplementation(() => ({
        interpreterId: 'test:interpreter',
        propose: async () => fixture().proposal,
      }))
    })

    it('short-circuits interpretCompileCommit on committed-command replay', async () => {
      const replayed = durableSubmissionShellView('req:1')
      const loadRequestGraphPort = vi.fn(async () => {
        throw new Error('loadRequestGraph must not run after replay')
      })
      const result = await interpretCompileCommit(baseInput, {
        replayCommittedCommand: async () => replayed,
        loadRequestGraph: loadRequestGraphPort,
        commitAggregate: async () => {
          throw new Error('commitAggregate must not run after replay')
        },
      }, interpreterEnv)
      expect(result).toEqual(replayed)
      expect(loadRequestGraphPort).not.toHaveBeenCalled()
    })

    it('returns durable shell vs refuse when every interpretation attempt fails', async () => {
      // The factory always yields an interpreter now, so the only remaining refusal is one that
      // exhausts its attempts. A provider outage no longer reaches this path.
      const propose = vi.fn(async () => {
        throw new Error('customer_request_semantic_interpretation_failed')
      })
      const failing: CustomerRequestSemanticInterpreter = { interpreterId: 'test:interpreter', propose }
      vi.mocked(createConfiguredRequestInterpreter).mockReturnValue(failing)
      const logInterpretationFailure = vi.fn()
      const ports = {
        replayCommittedCommand: async () => undefined,
        loadRequestGraph: async () => fixture().graph,
        commitAggregate: async () => {
          throw new Error('commitAggregate must not run without an interpretation')
        },
        logInterpretationFailure,
      }
      expect(await interpretCompileCommit({ ...baseInput, durableShell: true }, ports, interpreterEnv))
        .toEqual(durableSubmissionShellView('req:1'))
      expect(await interpretCompileCommit(baseInput, ports, interpreterEnv))
        .toEqual({ kind: 'refused', reason: 'interpreter_unavailable' })
      expect(propose).toHaveBeenCalledTimes(4)
      expect(logInterpretationFailure)
        .toHaveBeenCalledWith('customer_request_semantic_interpretation_failed')
    })

    it('commits a compiled aggregate through compileCommit', async () => {
      const { compiled, compileInput } = fixture()
      const result = await compileCommit({
        ...compileInput,
        compiledResult: compiled,
      }, {
        replayCommittedCommand: async () => undefined,
        commitAggregate: async () => ({ kind: 'stored', requestId: 'req:1', revision: 4 }),
      })
      expect(result).toMatchObject({
        kind: 'request',
        requestRef: 'req:1',
      })
    })

    it('continues interpretCompileCommit after a retryable admission failure', async () => {
      const { proposal, graph } = fixture()
      vi.mocked(createConfiguredRequestInterpreter).mockReturnValue({
        interpreterId: 'test:interpreter',
        propose: async () => proposal,
      } as ReturnType<typeof createConfiguredRequestInterpreter>)
      const commitAggregate = vi.fn()
        .mockResolvedValueOnce({ kind: 'aggregate_invalid' })
        .mockResolvedValueOnce({ kind: 'stored', requestId: 'req:1', revision: 4 })
      const result = await interpretCompileCommit(baseInput, {
        replayCommittedCommand: async () => undefined,
        loadRequestGraph: async () => graph,
        commitAggregate,
      }, { ...interpreterEnv, openRouterApiKey: 'test-key' })
      expect(commitAggregate).toHaveBeenCalledTimes(2)
      expect(result).toMatchObject({
        kind: 'request',
        requestRef: 'req:1',
      })
    })

    it('names empty supply as no routeable supply, not an unreadable graph', async () => {
      expect(await loadRequestGraph('ae:public', {
        listRouteable: async () => ({ kind: 'available', supplies: [] }),
        listMappings: async () => [],
        getActiveExact: async () => {
          throw new Error('getActiveExact must not run for empty supply')
        },
      }, {
        maximumDescriptorBytes: 512_000,
        maximumContractProjectedInputSchemaBytes: 256_000,
      })).toEqual({ kind: 'unavailable', reason: 'no_routeable_supply' })
    })

    it('returns durable shell vs refuse when the request graph cannot be read', async () => {
      const ports = unreadableGraphPorts('graph_unreadable')
      expect(await interpretCompileCommit(
        { ...baseInput, durableShell: true },
        ports,
        { ...interpreterEnv, openRouterApiKey: 'test-key' },
      )).toEqual(durableSubmissionShellView('req:1'))
      expect(await interpretCompileCommit(
        baseInput,
        ports,
        { ...interpreterEnv, openRouterApiKey: 'test-key' },
      )).toEqual({ kind: 'refused', reason: 'capabilities_unavailable' })
    })

    it('tells the customer no business is registered instead of asking for a retry', async () => {
      // Retrying cannot register supply, so the front door must not offer retry as the next move.
      const result = await interpretCompileCommit(
        { ...baseInput, durableShell: true },
        unreadableGraphPorts('no_routeable_supply'),
        { ...interpreterEnv, openRouterApiKey: 'test-key' },
      )

      expect(result).toMatchObject({
        kind: 'request',
        state: 'unsupported',
        nextAction: 'revise_request',
        summary: 'AE cannot arrange this request end to end yet.',
        unsupportedRecovery: { reason: 'no_current_business', preservedRequest: true },
      })
      expect(result).not.toMatchObject({ nextAction: 'retry' })
    })

    function unreadableGraphPorts(reason: 'graph_unreadable' | 'no_routeable_supply') {
      vi.mocked(createConfiguredRequestInterpreter).mockReturnValue({
        interpreterId: 'test:interpreter',
        propose: async () => {
          throw new Error('propose must not run when graph is unavailable')
        },
      })
      return {
        replayCommittedCommand: async () => undefined,
        loadRequestGraph: async () => ({ kind: 'unavailable' as const, reason }),
        commitAggregate: async () => {
          throw new Error('commitAggregate must not run when graph is unavailable')
        },
      }
    }
  })

  describe('route-plan-projection', () => {
    it('matches current generations via decision snapshot digests', () => {
      const aggregate = {
        snapshot: { snapshotDigest: 'snap-1' },
        evaluation: { factsDigest: 'facts-1', evaluationDigest: 'eval-1' },
        plan: {
          planRevisionId: 'plan-1',
          planDigest: 'plan-digest-1',
          createdAt: 100,
          registrySnapshotDigest: 'reg-1',
          compilerVersion: 'customer-request-route-compiler:v1',
          interpreterId: 'openrouter:model',
          proposalDigest: 'proposal-1',
        },
      }
      expect(storedGenerationRepresentsAggregate({
        decisionSnapshot: {
          requestSnapshotDigest: 'snap-1',
          factsDigest: 'facts-1',
          evaluationDigest: 'eval-1',
          planRevisionId: 'plan-1',
          planDigest: 'plan-digest-1',
        },
        createdAt: 999,
        registrySnapshotDigest: 'other',
        compiler: {
          compilerVersion: 'other',
          interpreterId: 'other',
          proposalDigest: 'other',
        },
      }, aggregate)).toBe(true)
      expect(storedGenerationRepresentsAggregate({
        decisionSnapshot: {
          requestSnapshotDigest: 'snap-1',
          factsDigest: 'facts-1',
          evaluationDigest: 'eval-1',
          planRevisionId: 'plan-1',
          planDigest: 'wrong',
        },
        createdAt: 999,
        registrySnapshotDigest: 'other',
        compiler: {
          compilerVersion: 'other',
          interpreterId: 'other',
          proposalDigest: 'other',
        },
      }, aggregate)).toBe(false)
    })

    it('falls back to historical compiler lineage when decision snapshot is absent', () => {
      const aggregate = {
        snapshot: { snapshotDigest: 'snap-1' },
        evaluation: { factsDigest: 'facts-1', evaluationDigest: 'eval-1' },
        plan: {
          planRevisionId: 'plan-1',
          planDigest: 'plan-digest-1',
          createdAt: 100,
          registrySnapshotDigest: 'reg-1',
          compilerVersion: 'customer-request-route-compiler:v1',
          interpreterId: 'openrouter:model',
          proposalDigest: 'proposal-1',
        },
      }
      expect(storedGenerationRepresentsAggregate({
        createdAt: 100,
        registrySnapshotDigest: 'reg-1',
        compiler: {
          compilerVersion: 'customer-request-route-compiler:v1',
          interpreterId: 'openrouter:model',
          proposalDigest: 'proposal-1',
        },
      }, aggregate)).toBe(true)
      expect(storedGenerationRepresentsAggregate({
        createdAt: 101,
        registrySnapshotDigest: 'reg-1',
        compiler: {
          compilerVersion: 'customer-request-route-compiler:v1',
          interpreterId: 'openrouter:model',
          proposalDigest: 'proposal-1',
        },
      }, aggregate)).toBe(false)
    })

    it('maps route progress and failure result predicates', () => {
      expect(customerProgressState('accepted')).toBe('awaiting_result')
      expect(isProviderReportedRouteFailure({ reason: 'business_reported_failure' })).toBe(true)
      expect(isProviderReportedRouteFailure({ reason: 'other' })).toBe(false)
      expect(isPartialRouteResult({ kind: 'partial_result', output: { ok: true } })).toBe(true)
      expect(isPartialRouteResult({ kind: 'complete' })).toBe(false)
    })
  })
})
function fixture() {
  const model = openCapabilityDecisionModel(defineCapabilityContract({
    contractFormat: 'ae.capability-contract:v2', capabilityId: 'test.destination.lookup', version: 1,
    name: 'Destination lookup', description: 'Find a registered option for a destination.',
    inputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
      properties: { destination: { type: 'string', minLength: 1 } },
      required: ['destination'], additionalProperties: false,
    },
    outputSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
      properties: { result: { type: 'string' } }, required: ['result'], additionalProperties: false,
    },
    customerAnnotations: [
      { annotationId: 'destination', document: 'input', pointer: '/destination', label: 'Destination', role: 'request' },
      { annotationId: 'result', document: 'output', pointer: '/result', label: 'Result', role: 'completion_evidence' },
    ],
    dataUse: [{
      effectId: 'destination_release', inputPointer: '/destination', classification: 'personal',
      phase: 'preparation', recipient: { kind: 'candidate_binding' }, purposes: ['compare_options'],
    }],
    effects: [{
      effectId: 'destination_release', class: 'data_release', authority: 'explicit', reversibility: 'irreversible',
    }],
    evidence: [{ evidenceId: 'result', outputPointer: '/result', purpose: 'completion' }],
    lifecycle: { idempotency: 'required', recovery: 'retry_safe' },
  }))
  const destination = model.inputs.find((input) => input.annotationId === 'destination')
  if (destination === undefined) throw new Error('destination input missing')
  const lineage = createTestOperationLineage(model.contractRef, 'composition:binding:one')
  const binding = {
    ...lineage,
    businessId: 'business:one', offeringId: 'offering:one', bindingId: 'binding:one',
    contractRef: model.contractRef, offeringRegistrationHash: canonicalDigest('offering:one'),
    bindingRegistrationHash: canonicalDigest('binding:one'),
    cancellation: { kind: 'unsupported' as const, evidenceRefs: ['cancellation:binding:one'] },
  }
  const proposal = {
    kind: 'capability_candidates' as const,
    selections: [{
      operationRef: lineage.operationRef,
      selectionKey: model.selectionKey, contractRef: model.contractRef,
      facts: [{
        contractRef: model.contractRef, selectionKey: model.selectionKey,
        inputKey: destination.key, inputPointer: destination.inputPointer,
        schemaIdentity: destination.schemaIdentity, value: 'Perth',
        source: { kind: 'customer' as const, assertionRef: 'assertion:destination' },
      }],
    }],
  }
  const graph: RequestGraph = {
    kind: 'available',
    models: [model],
    descriptors: [],
    bindings: [binding],
    mappings: [],
    registrySnapshotDigest: 'reg:test',
  }
  const compileInput: CompileCommitInput = {
    commandKey: 'cmd:1',
    commandDigest: 'digest:1',
    requestId: 'req:1',
    expectedRevision: 3,
    expectedRouteGeneration: 0,
    principalId: 'principal:1',
    delegatedAgentId: 'agent:1',
    intent: 'Find an option to Perth',
    networkId: 'ae:public',
    priorFacts: [],
    proposal,
    interpreterId: 'test:interpreter',
    graph,
    now: 1_000,
  }
  const compiled = compileCustomerRequest({
    requestId: compileInput.requestId,
    expectedRevision: compileInput.expectedRevision,
    principalId: compileInput.principalId,
    delegatedAgentId: compileInput.delegatedAgentId,
    intent: compileInput.intent,
    networkId: compileInput.networkId,
    proposal,
    interpreterId: compileInput.interpreterId,
    bindings: graph.bindings,
    models: graph.models,
    mappings: graph.mappings,
    now: 1_000,
    expectedRouteGeneration: compileInput.expectedRouteGeneration,
  })
  if (compiled.kind !== 'compiled') throw new Error(compiled.reason)
  return { proposal, graph, compileInput, compiled }
}
