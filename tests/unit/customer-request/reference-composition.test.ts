import { describe, expect, it } from 'vitest'

import { listActions } from '@/modules/actions'
import { projectReferenceComposition } from '@/modules/customer-request/application/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { resolveActionContract } from '@/modules/common/action'
import {
  compileCustomerRequest,
  type CustomerRequestCompletedTaskReference,
  type CustomerRequestV2Aggregate,
} from '@/modules/customer-request/compiler'

const requestRef = 'mock:request:composition'
const revision = 1
const registeredActions = listActions().map((action) => ({
  actionId: action.id,
  actionVersion: resolveActionContract(action).version,
}))
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
    now: 1_753_000_000_000,
  })
  if (compiled.kind !== 'compiled') throw new Error('Expected development aggregate.')
  const { aggregateDigest: _digest, ...material } = compiled.aggregate
  const withReference = { ...material, completedTaskReferences: [completedReference] }
  return { ...withReference, aggregateDigest: canonicalDigest(withReference as never) }
}

const nodes = [
  {
    nodeRef: 'mock:node:completed',
    actionId: 'supply.collectDevelopmentQuote',
    actionVersion: 'supply.collectDevelopmentQuote:v1',
    dependencies: [],
    completionCondition: 'required' as const,
    inspection: { kind: 'completed_task' as const, referenceRef: completedReference.referenceRef },
    nextOwner: 'customer',
    continuation: 'Review the completed quote.',
    outcome: 'A prior quote is available to inspect.',
  },
  {
    nodeRef: 'mock:node:current',
    actionId: 'registry.detail',
    actionVersion: 'registry.detail:v1',
    dependencies: ['mock:node:completed'],
    completionCondition: 'required' as const,
    inspection: { kind: 'invocation' as const, invocationRef: 'mock:invocation:current' },
    nextOwner: 'customer',
    continuation: 'Review the listed business and choose whether to contact it.',
    outcome: 'The listed business is ready to inspect.',
  },
  {
    nodeRef: 'mock:node:optional',
    actionId: 'registry.detail',
    actionVersion: 'registry.detail:v1',
    dependencies: [],
    completionCondition: 'optional' as const,
    inspection: { kind: 'invocation' as const, invocationRef: 'mock:invocation:optional' },
    nextOwner: 'customer',
    continuation: 'Inspect another listed business if useful.',
    outcome: 'Another listing may be inspected.',
  },
  {
    nodeRef: 'mock:node:blocked',
    actionId: 'supply.collectDevelopmentQuote',
    actionVersion: 'supply.collectDevelopmentQuote:v1',
    dependencies: ['mock:node:current'],
    completionCondition: 'required' as const,
    inspection: { kind: 'invocation' as const, invocationRef: 'mock:invocation:quote-b' },
    nextOwner: 'customer',
    continuation: 'Finish the listing review before requesting another quote.',
    outcome: 'The next quote waits for the listing review.',
  },
] as const

describe('reference-only Customer Request composition', () => {
  it('projects independently inspectable references into exactly four ordinary-language states', () => {
    const result = projectReferenceComposition({
      requestRef,
      revision,
      aggregate: aggregate(),
      registeredActions,
      nodes,
    })
    expect(result).toMatchObject({
      kind: 'projected',
      projection: {
        request: { requestRef, revision },
        state: 'incomplete',
        noEffect: true,
        nodes: [
          { nodeRef: 'mock:node:completed', state: 'completed' },
          { nodeRef: 'mock:node:current', state: 'current' },
          { nodeRef: 'mock:node:optional', state: 'optional' },
          { nodeRef: 'mock:node:blocked', state: 'blocked' },
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

  it.each([
    ['duplicate node', [...nodes, nodes[0]], 'duplicate_node_ref'],
    ['missing action', [{ ...nodes[0], actionId: 'mock.missing' }], 'action_not_registered'],
    ['version mismatch', [{ ...nodes[0], actionVersion: 'registry.detail:v1' }], 'action_version_mismatch'],
    ['missing dependency', [{ ...nodes[1], dependencies: ['mock:node:missing'] }], 'dependency_endpoint_missing'],
    ['cycle', [
      { ...nodes[0], dependencies: ['mock:node:current'] },
      { ...nodes[1], dependencies: ['mock:node:completed'] },
    ], 'dependency_cycle'],
    ['missing completed reference', [{
      ...nodes[0],
      inspection: { kind: 'completed_task' as const, referenceRef: 'mock:completed-task:missing' },
    }], 'completed_reference_missing'],
    ['completed action mismatch', [{
      ...nodes[0],
      actionId: 'registry.detail',
      actionVersion: 'registry.detail:v1',
    }], 'completed_reference_mismatch'],
  ])('refuses %s', (_label, candidateNodes, reason) => {
    expect(projectReferenceComposition({
      requestRef,
      revision,
      aggregate: aggregate(),
      registeredActions,
      nodes: candidateNodes,
    })).toEqual({ kind: 'refused', reason })
  })
})
