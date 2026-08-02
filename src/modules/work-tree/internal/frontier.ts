import type { WorkNode, WorkTree } from './contract'
import { isElaborationFrontier } from './contract'

/**
 * Provenance: candidate filtering and deterministic priority/dependency tie
 * breaking are vendored from Task Master AI's `find-next-task.js` (MIT with the
 * donor's Commons Clause condition; `find-next-task.js:1-136`). Source:
 * https://raw.githubusercontent.com/eyaltoledano/claude-task-master/main/scripts/modules/task-manager/find-next-task.js
 * License:
 * https://raw.githubusercontent.com/eyaltoledano/claude-task-master/main/LICENSE
 *
 * AE adapts Task Master's pending/in-progress subtask frontier to fog nodes,
 * the contract's numeric priority scale, and WorkNode parent/dependsOn refs.
 */

function priorityRank(priority: number): number {
  // WorkNode follows the Linear-derived scale: 1 urgent, 2 high, 3 medium,
  // 4 low. Priority 0 means "none" and sorts after explicit priorities.
  return priority === 0 ? Number.MAX_SAFE_INTEGER : priority
}

function pathKey(node: WorkNode, byId: ReadonlyMap<string, WorkNode>): string {
  const parts: string[] = []
  const seen = new Set<string>()
  let current: WorkNode | undefined = node
  while (current !== undefined && !seen.has(current.nodeId)) {
    seen.add(current.nodeId)
    parts.push(current.nodeId)
    current = current.parentId === undefined ? undefined : byId.get(current.parentId)
  }
  return parts.reverse().join('.')
}

function dependenciesSatisfied(node: WorkNode, byId: ReadonlyMap<string, WorkNode>): boolean {
  return node.dependsOn.every((dependencyId) => byId.get(dependencyId)?.status === 'done')
}

/**
 * Return all elaboration-frontier fog nodes in the donor's deterministic order.
 * A frontier node's dependencies must be done in addition to the contract's
 * ancestor/parent readiness rule.
 */
export function selectFrontier(tree: WorkTree): WorkNode[] {
  const byId = new Map(tree.nodes.map((node) => [node.nodeId, node]))
  const candidates = tree.nodes.filter((node) =>
    isElaborationFrontier(tree, node.nodeId) && dependenciesSatisfied(node, byId),
  )

  candidates.sort((left, right) => {
    const priority = priorityRank(left.priority) - priorityRank(right.priority)
    if (priority !== 0) return priority
    const dependencyCount = left.dependsOn.length - right.dependsOn.length
    if (dependencyCount !== 0) return dependencyCount
    const pathOrder = pathKey(left, byId).localeCompare(pathKey(right, byId), undefined, { numeric: true })
    if (pathOrder !== 0) return pathOrder
    return left.nodeId.localeCompare(right.nodeId, undefined, { numeric: true })
  })

  return candidates
}

