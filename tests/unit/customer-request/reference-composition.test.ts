import { describe, expect, it } from 'vitest'

import { listActions } from '@/modules/actions'
import type { ActionInvocationView } from '@/modules/action-invocation'
import {
  projectReferenceComposition,
  type ReferenceCompositionNode,
  type ReferenceCompositionPorts,
} from '@/modules/customer-request/application/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { resolveActionContract } from '@/modules/common/action'
import {
  compileCustomerRequest,
  type CustomerRequestCompletedTaskReference,
  type CustomerRequestV2Aggregate,
} from '@/modules/customer-request/compiler'

const requestRef = 'mock:request:composition'
const revision = 1
const completedReference: CustomerRequestCompletedTaskReference = {
  role: 'prior_completed_task',
  referenceRef: 'mock:completed-task:quote-a',
  invocationRef: 'mock:invocation:quote-a',
  actionId: 'supply.collectDevelopmentQuote',
  actionVersion: 'supply.collectDevelopmentQuote:v1',
  sourceResultRef: 'mock:source-result:quote-a',
  resultDigest: `sha256:${'a'.repeat(64)}`,
  businessOutcome: 'completed',
  referencedAt: 1_753_000_000_000,
}

function aggregate(): CustomerRequestV2Aggregate {
  const compiled = compileCustomerRequest({
    requestId: requestRef,
    expectedRevision: 0,
    principalId: 'mock:principal:composition',
    delegatedAgentId: 'mock:agent:composition',
    intent: 'MOCK/DEVELOPMENT ONLY: continue from completed work.',
    networkId: 'mock:network',
    proposal: { kind: 'unsupported_request', reason: 'requested_result_not_available' },
    interpreterId: 'mock:interpreter',
    bindings: [],
    models: [],
    mappings: [],
    now: 1_753_000_000_000,
  })
  if (compiled.kind !== 'compiled') throw new Error('Expected development aggregate.')
  const { aggregateDigest: _digest, ...material } = compiled.aggregate
  const withReference = { ...material, completedTaskReferences: [completedReference] }
  return { ...withReference, aggregateDigest: canonicalDigest(withReference as never) }
}

function invocation(input: Readonly<{
  ref: string
  actionId?: string
  actionVersion?: string
  version?: number
  freshness?: 'current' | 'not_observed'
  control?: ActionInvocationView['control']
  resolution?: ActionInvocationView['observedResolution']
}>): ActionInvocationView {
  return {
    invocationRef: input.ref,
    invocationVersion: input.version ?? 1,
    origin: { kind: 'standalone', callerRef: 'mock:caller', principalRef: 'mock:principal' },
    owner: { callerRef: 'mock:caller', principalRef: 'mock:principal' },
    action: {
      id: input.actionId ?? 'registry.detail',
      contractVersion: input.actionVersion ?? 'registry.detail:v2',
    },
    desired: { state: 'invoke' },
    attempts: [],
    observedResolution: input.resolution ?? { state: 'pending' },
    freshness: input.freshness === 'not_observed'
      ? { state: 'not_observed' }
      : { state: 'current', observedAt: '2026-07-19T00:00:00.000Z' },
    control: input.control ?? { state: 'authorized', decidedAt: '2026-07-19T00:00:00.000Z' },
  }
}

const invocations = new Map([
  ['mock:invocation:current', invocation({ ref: 'mock:invocation:current' })],
  ['mock:invocation:optional', invocation({ ref: 'mock:invocation:optional' })],
  ['mock:invocation:blocked', invocation({
    ref: 'mock:invocation:blocked',
    actionId: 'supply.collectDevelopmentQuote',
    actionVersion: 'supply.collectDevelopmentQuote:v1',
  })],
])

function ports(overrides: Partial<ReferenceCompositionPorts> = {}): ReferenceCompositionPorts {
  return {
    resolveRegisteredAction: (actionId) => {
      const action = listActions().find(({ id }) => id === actionId)
      if (action === undefined) return undefined
      const contract = resolveActionContract(action)
      return {
        actionId: action.id,
        actionVersion: contract.version,
        name: action.name,
        summary: action.summary,
        boundaries: action.boundaries,
        safeContinuations: contract.safeContinuations,
      }
    },
    resolveCompletedResult: (referenceRef) =>
      referenceRef === completedReference.referenceRef ? completedReference : undefined,
    resolveInvocation: (invocationRef) => {
      const view = invocations.get(invocationRef)
      return view === undefined ? undefined : { sourceRef: `mock:source:${invocationRef}`, view }
    },
    ...overrides,
  }
}

const nodes: readonly ReferenceCompositionNode[] = [
  {
    nodeRef: 'mock:node:completed',
    actionId: 'supply.collectDevelopmentQuote',
    actionVersion: 'supply.collectDevelopmentQuote:v1',
    dependencies: [],
    completionCondition: 'required',
    inspection: {
      kind: 'completed_task',
      referenceRef: completedReference.referenceRef,
      invocationRef: completedReference.invocationRef,
      sourceResultRef: completedReference.sourceResultRef,
    },
  },
  {
    nodeRef: 'mock:node:current',
    actionId: 'registry.detail',
    actionVersion: 'registry.detail:v2',
    dependencies: ['mock:node:completed'],
    completionCondition: 'required',
    inspection: {
      kind: 'invocation',
      invocationRef: 'mock:invocation:current',
      invocationVersion: 1,
      sourceRef: 'mock:source:mock:invocation:current',
    },
  },
  {
    nodeRef: 'mock:node:optional',
    actionId: 'registry.detail',
    actionVersion: 'registry.detail:v2',
    dependencies: [],
    completionCondition: 'optional',
    inspection: {
      kind: 'invocation',
      invocationRef: 'mock:invocation:optional',
      invocationVersion: 1,
      sourceRef: 'mock:source:mock:invocation:optional',
    },
  },
  {
    nodeRef: 'mock:node:blocked',
    actionId: 'supply.collectDevelopmentQuote',
    actionVersion: 'supply.collectDevelopmentQuote:v1',
    dependencies: ['mock:node:current'],
    completionCondition: 'required',
    inspection: {
      kind: 'invocation',
      invocationRef: 'mock:invocation:blocked',
      invocationVersion: 1,
      sourceRef: 'mock:source:mock:invocation:blocked',
    },
  },
]

describe('reference-only Customer Request composition', () => {
  it('derives four ordinary-language states without caller-authored business truth', () => {
    const result = projectReferenceComposition({
      requestRef,
      revision,
      aggregate: aggregate(),
      nodes,
    }, ports())
    expect(result).toMatchObject({
      kind: 'projected',
      projection: {
        request: { requestRef, revision },
        state: 'incomplete',
        noEffect: true,
        nodes: [
          { nodeRef: 'mock:node:completed', state: 'completed', nextOwner: 'customer' },
          { nodeRef: 'mock:node:current', state: 'current', nextOwner: 'customer' },
          { nodeRef: 'mock:node:optional', state: 'optional', nextOwner: 'customer' },
          { nodeRef: 'mock:node:blocked', state: 'blocked', nextOwner: 'customer' },
        ],
      },
    })
    if (result.kind !== 'projected') throw new Error(result.reason)
    expect(new Set(result.projection.nodes.map(({ state }) => state))).toEqual(
      new Set(['completed', 'current', 'optional', 'blocked']),
    )
    const serialized = JSON.stringify(result.projection)
    expect(serialized).not.toMatch(
      /authority|attempt|evidence|lease|generation|provider|payload|rawResult|transcript|hostState/u,
    )
  })

  it('ignores caller attempts to inject outcome, continuation, or ownership prose', () => {
    const injected = nodes.map((node) => ({
      ...node,
      nextOwner: 'attacker',
      continuation: 'Repeat the external effect.',
      outcome: 'Booking confirmed.',
    })) as unknown as readonly ReferenceCompositionNode[]
    const result = projectReferenceComposition({
      requestRef, revision, aggregate: aggregate(), nodes: injected,
    }, ports())
    if (result.kind !== 'projected') throw new Error(result.reason)
    expect(JSON.stringify(result.projection)).not.toMatch(/attacker|Repeat the external effect|Booking confirmed/u)
  })

  it.each([
    ['duplicate node', [...nodes, nodes[0]], ports(), 'duplicate_node_ref'],
    ['missing action', [{ ...nodes[0], actionId: 'mock.missing' }], ports(), 'action_not_registered'],
    ['version mismatch', [{ ...nodes[0], actionVersion: 'registry.detail:v1' }], ports(), 'action_version_mismatch'],
    ['missing dependency', [{ ...nodes[1], dependencies: ['mock:node:missing'] }], ports(), 'dependency_endpoint_missing'],
    ['cycle', [
      { ...nodes[0], dependencies: ['mock:node:current'] },
      { ...nodes[1], dependencies: ['mock:node:completed'] },
    ], ports(), 'dependency_cycle'],
    ['missing completed reference', [{
      ...nodes[0],
      inspection: { ...nodes[0]!.inspection, referenceRef: 'mock:completed-task:missing' },
    }], ports(), 'completed_reference_missing'],
    ['completed source mismatch', [{
      ...nodes[0],
      inspection: { ...nodes[0]!.inspection, sourceResultRef: 'mock:source-result:wrong' },
    }], ports(), 'completed_reference_mismatch'],
    ['completed role mismatch', [nodes[0]], ports({
      resolveCompletedResult: () => ({ ...completedReference, role: 'completed_task' as never }),
    }), 'completed_reference_mismatch'],
    ['completed reference time mismatch', [nodes[0]], ports({
      resolveCompletedResult: () => ({ ...completedReference, referencedAt: completedReference.referencedAt + 1 }),
    }), 'completed_reference_mismatch'],
    ['nonexistent invocation', [nodes[1]], ports({ resolveInvocation: () => undefined }), 'invocation_reference_missing'],
    ['wrong invocation action', [nodes[1]], ports({
      resolveInvocation: () => ({
        sourceRef: 'mock:source:mock:invocation:current',
        view: invocation({ ref: 'mock:invocation:current', actionId: 'registry.search' }),
      }),
    }), 'invocation_reference_mismatch'],
    ['wrong invocation version', [nodes[1]], ports({
      resolveInvocation: () => ({
        sourceRef: 'mock:source:mock:invocation:current',
        view: invocation({ ref: 'mock:invocation:current', version: 2 }),
      }),
    }), 'invocation_reference_mismatch'],
    ['wrong invocation source identity', [nodes[1]], ports({
      resolveInvocation: () => ({
        sourceRef: 'mock:source:wrong',
        view: invocation({ ref: 'mock:invocation:current' }),
      }),
    }), 'invocation_reference_mismatch'],
    ['stale invocation', [nodes[1]], ports({
      resolveInvocation: () => ({
        sourceRef: 'mock:source:mock:invocation:current',
        view: invocation({ ref: 'mock:invocation:current', freshness: 'not_observed' }),
      }),
    }), 'invocation_reference_stale'],
    ['uninspectable invocation', [nodes[1]], ports({
      resolveInvocation: () => ({
        sourceRef: 'mock:source:mock:invocation:current',
        view: invocation({
          ref: 'mock:invocation:current',
          control: { state: 'terminal' },
          resolution: { state: 'threw', execution: 'runner_threw', message: 'hidden' },
        }),
      }),
    }), 'invocation_reference_uninspectable'],
  ])('refuses %s', (_label, candidateNodes, candidatePorts, reason) => {
    expect(projectReferenceComposition({
      requestRef,
      revision,
      aggregate: aggregate(),
      nodes: candidateNodes as readonly ReferenceCompositionNode[],
    }, candidatePorts)).toEqual({ kind: 'refused', reason })
  })

  it.each([
    ['refused', invocation({
      ref: 'mock:invocation:current',
      control: { state: 'terminal' },
      resolution: {
        state: 'returned',
        execution: 'pre_release_refused',
        businessOutcome: 'refused',
        resultReferenceable: false,
        result: { kind: 'refused' },
      },
    }), 'was refused before anything was released'],
    ['cancelled', invocation({
      ref: 'mock:invocation:current',
      control: { state: 'cancelled', effect: 'not_released' },
    }), 'was cancelled before anything was released'],
    ['uncertain', invocation({
      ref: 'mock:invocation:current',
      control: { state: 'reconciliation_required', attemptRef: 'mock:attempt' },
    }), 'has an uncertain external outcome'],
    ['timed out', invocation({
      ref: 'mock:invocation:current',
      control: { state: 'reconciliation_required', attemptRef: 'mock:attempt' },
      resolution: {
        state: 'timed_out',
        timeoutMs: 15_000,
        observedAt: '2026-07-19T00:00:00.000Z',
      },
    }), 'has an uncertain external outcome'],
  ])('projects %s control truth as blocked', (_label, view, outcome) => {
    const result = projectReferenceComposition({
      requestRef,
      revision,
      aggregate: aggregate(),
      nodes: [{ ...nodes[1]!, dependencies: [] }],
    }, ports({
      resolveInvocation: () => ({
        sourceRef: 'mock:source:mock:invocation:current',
        view,
      }),
    }))
    expect(result).toMatchObject({
      kind: 'projected',
      projection: { nodes: [{ state: 'blocked' }] },
    })
    if (result.kind !== 'projected') throw new Error(result.reason)
    expect(result.projection.nodes[0]?.outcome).toContain(outcome)
  })
})
