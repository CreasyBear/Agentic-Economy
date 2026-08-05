import { DirectedGraph } from 'graphology'
import { hasCycle as graphHasCycle } from 'graphology-dag'
import type { ActionInvocationView } from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
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
    | Readonly<{
        kind: 'completed_task'
        referenceRef: string
        invocationRef: string
        sourceResultRef: string
      }>
    | Readonly<{
        kind: 'invocation'
        invocationRef: string
        invocationVersion: number
        sourceRef: string
      }>
}>

export type ReferenceCompositionState = 'completed' | 'current' | 'optional' | 'blocked'

export type RegisteredActionDescriptor = Readonly<{
  actionId: string
  actionVersion: string
  name: string
  summary: string
  boundaries: readonly string[]
  safeContinuations: readonly string[]
}>

export type ResolvedInvocationReference = Readonly<{
  sourceRef: string
  view: ActionInvocationView
}>

export type ReferenceCompositionPorts = Readonly<{
  resolveRegisteredAction(actionId: string): RegisteredActionDescriptor | undefined
  resolveCompletedResult(referenceRef: string): CustomerRequestCompletedTaskReference | undefined
  resolveInvocation(invocationRef: string): ResolvedInvocationReference | undefined
}>

export type ReferenceCompositionProjection = Readonly<{
  request: Readonly<{ requestRef: string; revision: number }>
  state: 'complete' | 'incomplete'
  nodes: readonly Readonly<{
    nodeRef: string
    state: ReferenceCompositionState
    dependencies: readonly string[]
    completionCondition: 'required' | 'optional'
    inspection: ReferenceCompositionNode['inspection']
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
        | 'invocation_reference_missing'
        | 'invocation_reference_mismatch'
        | 'invocation_reference_stale'
        | 'invocation_reference_uninspectable'
    }>

type ResolvedNode = Readonly<{
  node: ReferenceCompositionNode
  action: RegisteredActionDescriptor
  invocation?: ActionInvocationView
  completedReference?: CustomerRequestCompletedTaskReference
}>

/**
 * Builds a deletable, reference-only view over one exact Customer Request
 * revision. All business wording and control meaning is derived from registered
 * descriptors and exact source-owned records; the node declaration supplies
 * only graph structure and inspectable identities.
 */
export function projectReferenceComposition(
  input: Readonly<{
    requestRef: string
    revision: number
    aggregate: CustomerRequestV2Aggregate
    nodes: readonly ReferenceCompositionNode[]
  }>,
  ports: ReferenceCompositionPorts,
): ReferenceCompositionResult {
  if (
    input.aggregate.snapshot.requestId !== input.requestRef
    || input.aggregate.snapshot.revision !== input.revision
  ) return { kind: 'refused', reason: 'request_identity_mismatch' }

  const byRef = new Map<string, ReferenceCompositionNode>()
  const resolved: ResolvedNode[] = []
  for (const node of input.nodes) {
    if (byRef.has(node.nodeRef)) return { kind: 'refused', reason: 'duplicate_node_ref' }
    byRef.set(node.nodeRef, node)
    const action = ports.resolveRegisteredAction(node.actionId)
    if (action === undefined) return { kind: 'refused', reason: 'action_not_registered' }
    if (action.actionVersion !== node.actionVersion) {
      return { kind: 'refused', reason: 'action_version_mismatch' }
    }
    if (node.inspection.kind === 'completed_task') {
      const inspection = node.inspection
      const aggregateReference = (input.aggregate.completedTaskReferences ?? [])
        .find(({ referenceRef }) => referenceRef === inspection.referenceRef)
      const authoritativeReference = ports.resolveCompletedResult(inspection.referenceRef)
      if (aggregateReference === undefined || authoritativeReference === undefined) {
        return { kind: 'refused', reason: 'completed_reference_missing' }
      }
      if (
        !completedReferenceMatches(node, aggregateReference)
        || !sameCompletedReference(aggregateReference, authoritativeReference)
      ) return { kind: 'refused', reason: 'completed_reference_mismatch' }
      resolved.push({ node, action, completedReference: authoritativeReference })
      continue
    }
    const invocation = ports.resolveInvocation(node.inspection.invocationRef)
    if (invocation === undefined) {
      return { kind: 'refused', reason: 'invocation_reference_missing' }
    }
    if (
      invocation.sourceRef !== node.inspection.sourceRef
      || invocation.view.invocationRef !== node.inspection.invocationRef
      || invocation.view.invocationVersion !== node.inspection.invocationVersion
      || invocation.view.action.id !== node.actionId
      || invocation.view.action.contractVersion !== node.actionVersion
    ) return { kind: 'refused', reason: 'invocation_reference_mismatch' }
    if (invocation.view.freshness.state !== 'current') {
      return { kind: 'refused', reason: 'invocation_reference_stale' }
    }
    if (!isInspectable(invocation.view)) {
      return { kind: 'refused', reason: 'invocation_reference_uninspectable' }
    }
    resolved.push({ node, action, invocation: invocation.view })
  }
  for (const node of input.nodes) {
    if (node.dependencies.some((dependency) => !byRef.has(dependency))) {
      return { kind: 'refused', reason: 'dependency_endpoint_missing' }
    }
  }
  if (hasCycle(input.nodes, byRef)) return { kind: 'refused', reason: 'dependency_cycle' }

  const completed = new Set<string>()
  for (const { completedReference, invocation, node } of resolved) {
    if (completedReference !== undefined || invocationIsCompleted(invocation)) {
      completed.add(node.nodeRef)
    }
  }
  const nodes = resolved.map(({ node, action, invocation, completedReference }) => {
    const state = deriveState(node, invocation, completed, completedReference !== undefined)
    const meaning = deriveMeaning(action, state, invocation, completedReference)
    return Object.freeze({
      nodeRef: node.nodeRef,
      state,
      dependencies: Object.freeze([...node.dependencies]),
      completionCondition: node.completionCondition,
      inspection: Object.freeze({ ...node.inspection }),
      ...meaning,
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

function deriveState(
  node: ReferenceCompositionNode,
  invocation: ActionInvocationView | undefined,
  completed: ReadonlySet<string>,
  completedReference: boolean,
): ReferenceCompositionState {
  if (completedReference || invocationIsCompleted(invocation)) return 'completed'
  if (node.completionCondition === 'optional') return 'optional'
  if (!node.dependencies.every((dependency) => completed.has(dependency))) return 'blocked'
  if (invocation !== undefined && invocationIsBlocked(invocation)) return 'blocked'
  return 'current'
}

function deriveMeaning(
  action: RegisteredActionDescriptor,
  state: ReferenceCompositionState,
  invocation: ActionInvocationView | undefined,
  completedReference: CustomerRequestCompletedTaskReference | undefined,
): Readonly<{ nextOwner: string; continuation: string; outcome: string }> {
  const safeContinuation = action.safeContinuations[0]
    ?? `Inspect ${action.name.toLocaleLowerCase()} before continuing.`
  if (completedReference !== undefined) return {
    nextOwner: 'customer',
    continuation: safeContinuation,
    outcome: `${action.name} completed with the recorded outcome “${completedReference.businessOutcome}”.`,
  }
  if (invocation === undefined) return {
    nextOwner: 'customer',
    continuation: safeContinuation,
    outcome: state === 'optional'
      ? `${action.name} is optional.`
      : `${action.name} is waiting for an earlier task.`,
  }
  if (
    invocation.observedResolution.state === 'returned'
    && invocation.observedResolution.execution === 'pre_release_refused'
  ) return {
    nextOwner: 'customer',
    continuation: safeContinuation,
    outcome: `${action.name} was refused before anything was released.`,
  }
  if (invocation.control.state === 'cancelled') return {
    nextOwner: 'customer',
    continuation: safeContinuation,
    outcome: `${action.name} was cancelled before anything was released.`,
  }
  if (invocation.control.state === 'reconciliation_required') return {
    nextOwner: 'Agentic Economy',
    continuation: action.safeContinuations.find((value) => /reconcil/u.test(value))
      ?? 'Wait while the possible external effect is checked before retrying.',
    outcome: `${action.name} has an uncertain external outcome.`,
  }
  if (invocation.observedResolution.state === 'timed_out') return {
    nextOwner: 'Agentic Economy',
    continuation: 'Wait while the timed-out attempt is checked before retrying.',
    outcome: `${action.name} timed out and its external outcome is not yet known.`,
  }
  if (invocation.control.state === 'awaiting_authority') return {
    nextOwner: 'customer',
    continuation: 'Review and decide whether to authorize this exact task.',
    outcome: `${action.name} is waiting for the customer’s decision.`,
  }
  if (invocation.control.state === 'invalidated') return {
    nextOwner: 'customer',
    continuation: safeContinuation,
    outcome: `${action.name} can no longer continue from this invocation.`,
  }
  if (invocationIsCompleted(invocation)) return {
    nextOwner: 'customer',
    continuation: safeContinuation,
    outcome: `${action.name} completed with the recorded outcome “${
      invocation.observedResolution.state === 'returned'
        ? invocation.observedResolution.businessOutcome
        : 'completed'
    }”.`,
  }
  return {
    nextOwner: invocation.control.state === 'in_progress' || invocation.control.state === 'leased'
      ? 'Agentic Economy'
      : 'customer',
    continuation: safeContinuation,
    outcome: state === 'optional'
      ? `${action.name} is optional.`
      : state === 'blocked'
        ? `${action.name} is waiting for an earlier task.`
        : `${action.name} is ready for its safe continuation.`,
  }
}

function invocationIsCompleted(view: ActionInvocationView | undefined): boolean {
  return view?.control.state === 'terminal'
    && view.observedResolution.state === 'returned'
    && view.observedResolution.execution === 'runner_returned'
    && view.observedResolution.resultReferenceable
}

function invocationIsBlocked(view: ActionInvocationView): boolean {
  return view.control.state === 'cancelled'
    || view.control.state === 'invalidated'
    || view.control.state === 'reconciliation_required'
    || view.observedResolution.state === 'timed_out'
    || (
      view.observedResolution.state === 'returned'
      && view.observedResolution.execution === 'pre_release_refused'
    )
}

function isInspectable(view: ActionInvocationView): boolean {
  if (view.observedResolution.state === 'threw') return false
  return view.control.state !== 'terminal' || view.observedResolution.state === 'returned'
}

function completedReferenceMatches(
  node: ReferenceCompositionNode,
  reference: CustomerRequestCompletedTaskReference,
): boolean {
  return node.inspection.kind === 'completed_task'
    && reference.referenceRef === node.inspection.referenceRef
    && reference.invocationRef === node.inspection.invocationRef
    && reference.sourceResultRef === node.inspection.sourceResultRef
    && reference.actionId === node.actionId
    && reference.actionVersion === node.actionVersion
}

function sameCompletedReference(
  left: CustomerRequestCompletedTaskReference,
  right: CustomerRequestCompletedTaskReference,
): boolean {
  return canonicalDigest(left as never) === canonicalDigest(right as never)
}

function hasCycle(
  nodes: readonly ReferenceCompositionNode[],
  byRef: ReadonlyMap<string, ReferenceCompositionNode>,
): boolean {
  const dependencyGraph = new DirectedGraph()
  for (const { nodeRef } of nodes) dependencyGraph.mergeNode(nodeRef)
  for (const { nodeRef } of nodes) {
    for (const dependency of byRef.get(nodeRef)?.dependencies ?? []) {
      if (byRef.has(dependency)) dependencyGraph.mergeDirectedEdge(nodeRef, dependency)
    }
  }
  return graphHasCycle(dependencyGraph)
}
