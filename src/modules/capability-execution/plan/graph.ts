import { escapePointerSegment } from '@/modules/capability-contract/public'

import type { FlowRef, PlanInput, PlanJson, PlanNode, PlanNodeId, PlanValidationRefusal } from './contracts'

const MAX_PLAN_DEPTH = 5
const FLOW_REF_PREFIX = 'flow://'
const FLOW_OUTPUT_PATH = '/output'

function hasDeclaredFlowSource(reference: FlowRef, dependsOn: readonly PlanNodeId[]): boolean {
  const sourceId = reference.slice(FLOW_REF_PREFIX.length, reference.indexOf(FLOW_OUTPUT_PATH))
  return dependsOn.some((nodeId) => nodeId === sourceId)
}

/** Collects FlowRefs and their RFC 6901 paths within one Plan input value. */
export function collectPlanFlowRefs(input: PlanInput): readonly { ref: FlowRef; slotPointer: string }[] {
  const refs: { ref: FlowRef; slotPointer: string }[] = []
  function visit(value: unknown, slotPointer: string): void {
    if (typeof value === 'string') {
      if (value.startsWith(FLOW_REF_PREFIX)) refs.push({ ref: value as FlowRef, slotPointer })
      return
    }
    if (value === null || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) visit(value[index], `${slotPointer}/${index}`)
      return
    }
    for (const [key, child] of Object.entries(value)) {
      visit(child, `${slotPointer}/${escapePointerSegment(key)}`)
    }
  }
  visit(input, '')
  return refs
}

function kahnStages(
  nodes: readonly PlanNode[],
  dependents: ReadonlyMap<PlanNodeId, readonly PlanNodeId[]>,
  indegrees: Map<PlanNodeId, number>,
): readonly (readonly PlanNodeId[])[] | PlanValidationRefusal {
  const emitted = new Set<PlanNodeId>()
  const stages: PlanNodeId[][] = []
  let tooDeep = false
  while (emitted.size < nodes.length) {
    const stage: PlanNodeId[] = []
    for (const node of nodes) if (!emitted.has(node.id) && indegrees.get(node.id) === 0) stage.push(node.id)
    if (stage.length === 0) return { kind: 'refused', code: 'cycle' }
    stages.push(stage)
    tooDeep ||= stages.length > MAX_PLAN_DEPTH
    for (const id of stage) {
      emitted.add(id)
      for (const dependent of dependents.get(id) ?? []) indegrees.set(dependent, (indegrees.get(dependent) ?? 0) - 1)
    }
  }
  return tooDeep ? { kind: 'refused', code: 'plan_too_deep' } : stages
}

/** Returns deterministic topological levels without modifying the Plan. */
export function topologicalStages(plan: PlanJson): readonly (readonly PlanNodeId[])[] | PlanValidationRefusal {
  const { nodes } = plan
  if (nodes.length === 0) return { kind: 'refused', code: 'plan_empty' }
  const nodeIds = new Set<PlanNodeId>()
  const dependents = new Map<PlanNodeId, PlanNodeId[]>()
  const indegrees = new Map<PlanNodeId, number>()
  for (const node of nodes) {
    if (nodeIds.has(node.id)) return { kind: 'refused', code: 'duplicate_node_id', nodeId: node.id }
    nodeIds.add(node.id)
    dependents.set(node.id, [])
    indegrees.set(node.id, 0)
  }
  for (const node of nodes) {
    const declared = new Set<PlanNodeId>()
    for (const dependency of node.dependsOn) {
      if (declared.has(dependency)) return { kind: 'refused', code: 'duplicate_dependency', nodeId: node.id }
      declared.add(dependency)
      if (!nodeIds.has(dependency)) return { kind: 'refused', code: 'unknown_dependency', nodeId: node.id }
      indegrees.set(node.id, (indegrees.get(node.id) ?? 0) + 1)
      dependents.get(dependency)?.push(node.id)
    }
    for (const input of Object.values(node.input)) {
      if (collectPlanFlowRefs(input).some(({ ref }) => !hasDeclaredFlowSource(ref, node.dependsOn))) {
        return { kind: 'refused', code: 'ref_not_in_depends_on', nodeId: node.id }
      }
    }
  }
  return kahnStages(nodes, dependents, indegrees)
}
