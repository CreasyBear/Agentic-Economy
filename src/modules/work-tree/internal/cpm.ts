import { addBusinessDays, differenceInBusinessDays } from 'date-fns'
import { DirectedGraph } from 'graphology'
import { hasCycle, topologicalGenerations } from 'graphology-dag'

import type { WorkNode, WorkTree } from './contract'

/**
 * Provenance: the forward/backward pass, slack, and critical-path convention
 * are ported from `@pyraxi/cpm-engine` `package/src/schedule.ts` (v1.2.4),
 * specifically its forward/backward pass and slack assembly
 * (`schedule.ts:39-189,195-244`). Donor license: MIT (`package/LICENSE.md`).
 * Source package metadata and source:
 * https://github.com/Pyraxi/gantt/tree/main/packages/engine/src/schedule.ts
 * https://github.com/Pyraxi/gantt/blob/main/packages/engine/LICENSE.md
 *
 * lead times with date-fns v4 `addBusinessDays` and `differenceInBusinessDays`.
 * The installed declarations document those APIs at
 * `node_modules/date-fns/addBusinessDays.d.ts:8-13,35-43` and
 * `node_modules/date-fns/differenceInBusinessDays.d.ts:7-21,56-60`.
 * Date-fns donor source/license: https://github.com/date-fns/date-fns
 * and https://unpkg.com/date-fns@4.4.0/LICENSE.md (MIT).
 * Dependency ordering adopts graphology-dag `topologicalGenerations` from
 * `node_modules/graphology-dag/topological-sort.d.ts:13-20` (MIT);
 * donor source/license: https://github.com/graphology/graphology and
 * https://github.com/graphology/graphology/blob/master/LICENSE.txt.
 */

export type CpmDateInput = Date | string

export type CpmOptions = Readonly<{
  /** Anchor for relative lead times. Defaults to a Monday in the local calendar. */
  startDate?: CpmDateInput
}>

export type CpmNodeSchedule = Readonly<{
  nodeId: string
  durationDays: number
  earlyStart: Date
  earlyFinish: Date
  lateStart: Date
  lateFinish: Date
  earlyStartDay: number
  earlyFinishDay: number
  lateStartDay: number
  lateFinishDay: number
  totalSlackDays: number
  freeSlackDays: number
  isCritical: boolean
}>

export type CpmResult = Readonly<{
  anchor: Date
  projectFinish: Date
  schedules: readonly CpmNodeSchedule[]
  byNodeId: ReadonlyMap<string, CpmNodeSchedule>
  knownMinDays: number
  fogBounded: boolean
}>

const DEFAULT_START = new Date(1970, 0, 5)

function asDate(value: CpmDateInput | undefined, fallback: Date): Date {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? new Date(fallback) : new Date(value)
  }
  if (typeof value === 'string') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return new Date(fallback)
}

function maxDate(left: Date, right: Date): Date {
  return left.getTime() >= right.getTime() ? left : right
}
function minDate(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? left : right
}

function durationDays(node: WorkNode): number {
  return node.status === 'fog' ? 0 : node.timing?.leadTimeDays ?? 0
}

function dateFor(node: WorkNode, field: 'date' | 'earliest' | 'latest'): Date | undefined {
  const raw = field === 'date'
    ? node.timing?.date
    : node.timing?.window?.[field]
  if (raw === undefined) return undefined
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function earliestConstraint(node: WorkNode): Date | undefined {
  if (node.status === 'fog') return undefined
  if (node.timing?.certainty === 'fixed') return dateFor(node, 'date')
  if (node.timing?.certainty === 'window') return dateFor(node, 'earliest')
  return undefined
}

function latestConstraint(node: WorkNode): Date | undefined {
  if (node.status === 'fog') return undefined
  if (node.timing?.certainty === 'fixed') return dateFor(node, 'date')
  if (node.timing?.certainty === 'window') return dateFor(node, 'latest')
  return undefined
}

function makeDependencyGraph(tree: WorkTree): DirectedGraph {
  const graph = new DirectedGraph()
  const ids = new Set(tree.nodes.map((node) => node.nodeId))
  for (const node of tree.nodes) graph.mergeNode(node.nodeId)
  for (const node of tree.nodes) {
    for (const dependencyId of node.dependsOn) {
      // Validation reports missing references. CPM remains total and simply
      // excludes an unknown edge so callers can inspect partial input safely.
      if (ids.has(dependencyId) && dependencyId !== node.nodeId) {
        graph.mergeDirectedEdge(dependencyId, node.nodeId)
      }
    }
  }
  return graph
}

/**
 * Compute the contract's dependency-only CPM network.
 *
 * Dependencies are finish-to-start links. `leadTimeDays` is the business-day
 * duration; fog nodes have a zero known duration and set `fogBounded` so the
 * resulting minimum is never presented as a complete forecast.
 */
export function calculateCpm(tree: WorkTree, options: CpmOptions = {}): CpmResult {
  const anchor = asDate(options.startDate, DEFAULT_START)
  const graph = makeDependencyGraph(tree)
  if (hasCycle(graph)) throw new Error('work_tree_dependency_cycle')

  const nodeById = new Map(tree.nodes.map((node) => [node.nodeId, node]))
  const order = topologicalGenerations(graph).flat()
  const forward = new Map<string, { earlyStart: Date; earlyFinish: Date }>()
  const successorIds = new Map<string, string[]>()
  for (const node of tree.nodes) successorIds.set(node.nodeId, [])
  for (const node of tree.nodes) {
    for (const dependencyId of node.dependsOn) {
      if (!nodeById.has(dependencyId)) continue
      const successors = successorIds.get(dependencyId)
      if (successors !== undefined) successors.push(node.nodeId)
    }
  }

  // Forward pass (CPM donor's ES/EF pass).
  for (const nodeId of order) {
    const node = nodeById.get(nodeId)
    if (node === undefined) continue
    let earlyStart = new Date(anchor)
    for (const dependencyId of node.dependsOn) {
      const predecessor = forward.get(dependencyId)
      if (predecessor !== undefined) earlyStart = maxDate(earlyStart, predecessor.earlyFinish)
    }
    const constrainedStart = earliestConstraint(node)
    if (node.timing?.certainty === 'fixed' && constrainedStart !== undefined) {
      // A fixed date is an exact pin. As in the donor's MSO constraint,
      // predecessors that cannot deliver by the pin retain negative slack.
      earlyStart = new Date(constrainedStart)
    } else if (constrainedStart !== undefined) {
      earlyStart = maxDate(earlyStart, constrainedStart)
    }
    const earlyFinish = addBusinessDays(earlyStart, durationDays(node))
    forward.set(node.nodeId, { earlyStart, earlyFinish })
  }

  let projectFinish = new Date(anchor)
  for (const dates of forward.values()) projectFinish = maxDate(projectFinish, dates.earlyFinish)

  const backward = new Map<string, { lateStart: Date; lateFinish: Date }>()
  // Reverse topological pass (CPM donor's LS/LF pass).
  for (const nodeId of [...order].reverse()) {
    const node = nodeById.get(nodeId)
    const dates = forward.get(nodeId)
    if (node === undefined || dates === undefined) continue
    let lateFinish = new Date(projectFinish)
    for (const successorId of successorIds.get(nodeId) ?? []) {
      const successor = backward.get(successorId)
      if (successor !== undefined) lateFinish = minDate(lateFinish, successor.lateStart)
    }

    const constrained = latestConstraint(node)
    if (node.timing?.certainty === 'fixed' && constrained !== undefined) {
      // Fixed dates are hard pins, mirroring MS Project's pinned constraint
      // behavior in the donor. Negative predecessor slack is intentionally
      // preserved by the backward pass rather than clipped.
      const lateStart = new Date(constrained)
      const lateFinishAtPin = addBusinessDays(lateStart, durationDays(node))
      backward.set(nodeId, { lateStart, lateFinish: lateFinishAtPin })
      continue
    }
    if (constrained !== undefined) {
      const latestStart = minDate(addBusinessDays(lateFinish, -durationDays(node)), constrained)
      lateFinish = addBusinessDays(latestStart, durationDays(node))
      backward.set(nodeId, { lateStart: latestStart, lateFinish })
      continue
    }

    const lateStart = addBusinessDays(lateFinish, -durationDays(node))
    backward.set(nodeId, { lateStart, lateFinish })
  }

  const schedules: CpmNodeSchedule[] = []
  const byNodeId = new Map<string, CpmNodeSchedule>()
  for (const node of tree.nodes) {
    const f = forward.get(node.nodeId)
    const b = backward.get(node.nodeId)
    if (f === undefined || b === undefined) continue
    const totalSlackDays = differenceInBusinessDays(b.lateStart, f.earlyStart)
    let freeSlackDays = 0
    const successors = successorIds.get(node.nodeId) ?? []
    if (successors.length > 0) {
      freeSlackDays = Number.POSITIVE_INFINITY
      for (const successorId of successors) {
        const successor = forward.get(successorId)
        if (successor === undefined) continue
        freeSlackDays = Math.min(freeSlackDays, differenceInBusinessDays(successor.earlyStart, f.earlyFinish))
      }
      if (!Number.isFinite(freeSlackDays)) freeSlackDays = 0
    }
    const schedule: CpmNodeSchedule = {
      nodeId: node.nodeId,
      durationDays: durationDays(node),
      earlyStart: new Date(f.earlyStart),
      earlyFinish: new Date(f.earlyFinish),
      lateStart: new Date(b.lateStart),
      lateFinish: new Date(b.lateFinish),
      earlyStartDay: differenceInBusinessDays(f.earlyStart, anchor),
      earlyFinishDay: differenceInBusinessDays(f.earlyFinish, anchor),
      lateStartDay: differenceInBusinessDays(b.lateStart, anchor),
      lateFinishDay: differenceInBusinessDays(b.lateFinish, anchor),
      totalSlackDays,
      freeSlackDays,
      isCritical: totalSlackDays <= 0,
    }
    schedules.push(schedule)
    byNodeId.set(node.nodeId, schedule)
  }

  let knownMinDays = 0
  let fogBounded = false
  for (const node of tree.nodes) {
    const schedule = byNodeId.get(node.nodeId)
    if (node.status === 'fog') {
      fogBounded = true
      continue
    }
    if (schedule !== undefined) knownMinDays = Math.max(knownMinDays, schedule.earlyFinishDay)
  }

  return Object.freeze({
    anchor: new Date(anchor),
    projectFinish: new Date(projectFinish),
    schedules: Object.freeze(schedules),
    byNodeId,
    knownMinDays,
    fogBounded,
  })
}

