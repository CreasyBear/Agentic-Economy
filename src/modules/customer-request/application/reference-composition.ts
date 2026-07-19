import type {
  CustomerRequestCompletedTaskReference,
  CustomerRequestV2Aggregate,
} from '@/modules/customer-request/compiler'

export type ReferenceCompositionNode = Readonly<{
  nodeRef: string
  actionId: string
  actionVersion: string
  dependencies: readonly string[]
  completionCondition: 'required' | 'optional'
  inspection:
    | Readonly<{ kind: 'completed_task'; referenceRef: string }>
    | Readonly<{ kind: 'invocation'; invocationRef: string }>
  nextOwner: string
  continuation: string
  outcome: string
}>

export type ReferenceCompositionState = 'completed' | 'current' | 'optional' | 'blocked'

export type RegisteredActionIdentity = Readonly<{ actionId: string; actionVersion: string }>

export type ReferenceCompositionProjection = Readonly<{
  request: Readonly<{ requestRef: string; revision: number }>
  state: 'complete' | 'incomplete'
  nodes: readonly Readonly<{
    nodeRef: string
    state: ReferenceCompositionState
    dependencies: readonly string[]
    completionCondition: 'required' | 'optional'
    inspection:
      | Readonly<{ kind: 'completed_task'; referenceRef: string }>
      | Readonly<{ kind: 'invocation'; invocationRef: string }>
    nextOwner: string
    continuation: string
    outcome: string
  }>[]
  noEffect: true
}>

export type ReferenceCompositionResult =
  | Readonly<{ kind: 'projected'; projection: ReferenceCompositionProjection }>
  | Readonly<{
      kind: 'refused'
      reason:
        | 'request_identity_mismatch'
        | 'duplicate_node_ref'
        | 'action_not_registered'
        | 'action_version_mismatch'
        | 'dependency_endpoint_missing'
        | 'dependency_cycle'
        | 'completed_reference_missing'
        | 'completed_reference_mismatch'
    }>

/**
 * Builds a deletable, reference-only view over one exact Customer Request
 * revision. Constituent action state remains inspectable at its own reference;
 * this projection owns no authority, attempts, evidence, results, or recovery.
 */
export function projectReferenceComposition(input: Readonly<{
  requestRef: string
  revision: number
  aggregate: CustomerRequestV2Aggregate
  registeredActions: readonly RegisteredActionIdentity[]
  nodes: readonly ReferenceCompositionNode[]
}>): ReferenceCompositionResult {
  if (
    input.aggregate.snapshot.requestId !== input.requestRef
    || input.aggregate.snapshot.revision !== input.revision
  ) return { kind: 'refused', reason: 'request_identity_mismatch' }

  const byRef = new Map<string, ReferenceCompositionNode>()
  for (const node of input.nodes) {
    if (byRef.has(node.nodeRef)) return { kind: 'refused', reason: 'duplicate_node_ref' }
    byRef.set(node.nodeRef, node)
    const action = input.registeredActions.find(({ actionId }) => actionId === node.actionId)
    if (action === undefined) return { kind: 'refused', reason: 'action_not_registered' }
    if (action.actionVersion !== node.actionVersion) {
      return { kind: 'refused', reason: 'action_version_mismatch' }
    }
  }
  for (const node of input.nodes) {
    if (node.dependencies.some((dependency) => !byRef.has(dependency))) {
      return { kind: 'refused', reason: 'dependency_endpoint_missing' }
    }
  }
  if (hasCycle(input.nodes, byRef)) return { kind: 'refused', reason: 'dependency_cycle' }

  const completedReferences = new Map(
    (input.aggregate.completedTaskReferences ?? []).map((reference) => [reference.referenceRef, reference]),
  )
  const completed = new Set<string>()
  for (const node of input.nodes) {
    if (node.inspection.kind !== 'completed_task') continue
    const reference = completedReferences.get(node.inspection.referenceRef)
    if (reference === undefined) return { kind: 'refused', reason: 'completed_reference_missing' }
    if (!completedReferenceMatches(node, reference)) {
      return { kind: 'refused', reason: 'completed_reference_mismatch' }
    }
    completed.add(node.nodeRef)
  }

  const nodes = input.nodes.map((node) => {
    const state: ReferenceCompositionState = completed.has(node.nodeRef)
      ? 'completed'
      : node.completionCondition === 'optional'
        ? 'optional'
        : node.dependencies.every((dependency) => completed.has(dependency))
          ? 'current'
          : 'blocked'
    return Object.freeze({
      nodeRef: node.nodeRef,
      state,
      dependencies: Object.freeze([...node.dependencies]),
      completionCondition: node.completionCondition,
      inspection: Object.freeze({ ...node.inspection }),
      nextOwner: node.nextOwner,
      continuation: node.continuation,
      outcome: node.outcome,
    })
  })
  return {
    kind: 'projected',
    projection: Object.freeze({
      request: Object.freeze({ requestRef: input.requestRef, revision: input.revision }),
      state: nodes.some((node) => (
        node.completionCondition === 'required' && node.state !== 'completed'
      )) ? 'incomplete' : 'complete',
      nodes: Object.freeze(nodes),
      noEffect: true,
    }),
  }
}

function completedReferenceMatches(
  node: ReferenceCompositionNode,
  reference: CustomerRequestCompletedTaskReference,
): boolean {
  return reference.actionId === node.actionId
    && reference.actionVersion === node.actionVersion
    && node.inspection.kind === 'completed_task'
    && reference.referenceRef === node.inspection.referenceRef
}

function hasCycle(
  nodes: readonly ReferenceCompositionNode[],
  byRef: ReadonlyMap<string, ReferenceCompositionNode>,
): boolean {
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (nodeRef: string): boolean => {
    if (visiting.has(nodeRef)) return true
    if (visited.has(nodeRef)) return false
    visiting.add(nodeRef)
    for (const dependency of byRef.get(nodeRef)?.dependencies ?? []) {
      if (visit(dependency)) return true
    }
    visiting.delete(nodeRef)
    visited.add(nodeRef)
    return false
  }
  return nodes.some(({ nodeRef }) => visit(nodeRef))
}
