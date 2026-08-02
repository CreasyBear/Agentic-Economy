import { addBusinessDays } from 'date-fns'
import IntervalTree from '@flatten-js/interval-tree'
import { DirectedGraph } from 'graphology'
import { hasCycle, topologicalGenerations } from 'graphology-dag'

import { isRecord } from '@/modules/common/is-record'

import {
  MAX_CHILDREN_PER_ELABORATION,
  MAX_NODES_PER_TREE,
  MAX_TREE_DEPTH,
  WORK_NODE_STATUS_TRANSITIONS,
  workTreeSchema,
  type WorkNode,
  type WorkNodeStatus,
  type WorkTree,
} from './contract'
import {
  calculateCpm,
  type CpmNodeSchedule,
  type CpmOptions,
  type CpmResult,
} from './cpm'

/**
 * The five dimension aggregation contract is AE-specific (the donor search
 * found no library that models fog, cost envelopes, attention budgets, and
 * scope denominators together). CPM/date-fns and interval-tree calls below
 * remain donor-backed; their provenance is recorded at each seam.
 */

export type RollupOptions = CpmOptions & Readonly<{
  attentionBudgetMinutes?: number
  /** Number of business days in each attention window; defaults to five. */
  effortWindowBusinessDays?: number
}>

export type TimingRollup = Readonly<{
  cpm: CpmResult
  schedules: readonly CpmNodeSchedule[]
  knownMinDays: number
  fogBounded: boolean
}>

export type CostCurrencyRollup = Readonly<{
  currency: string
  estimateMinor: number
  committedMinor: number
  /** Sum of envelope fields present on nodes in this currency. */
  envelopeMinor: number
  childEnvelopeMinor: number
  envelopeBreached: boolean
}>

export type CostEnvelopeBreach = Readonly<{
  nodeId: string
  currency: string
  envelopeMinor: number
  childEnvelopeMinor: number
  subtreeEstimateMinor: number
  subtreeCommittedMinor: number
  breached: true
}>

export type CostRollup = Readonly<{
  byCurrency: Readonly<Record<string, CostCurrencyRollup>>
  estimateMinorByCurrency: Readonly<Record<string, number>>
  committedMinorByCurrency: Readonly<Record<string, number>>
  envelopeBreached: boolean
  breaches: readonly CostEnvelopeBreach[]
}>

export type ResourceConflict = Readonly<{
  ownerRef: string
  leftNodeId: string
  rightNodeId: string
  overlap: Readonly<{ startMs: number; endMs: number }>
}>

export type ResourceRollup = Readonly<{
  conflicts: readonly ResourceConflict[]
  /** Alias matching the contract language used by host projections. */
  conflictPairs: readonly ResourceConflict[]
  bookingCount: number
  ownerRefs: readonly string[]
}>

export type EffortWindow = Readonly<{
  index: number
  start: Date
  end: Date
  humanMinutes: number
  overBudget: boolean
}>

export type EffortRollup = Readonly<{
  humanMinutes: number
  totalHumanMinutes: number
  attentionBudgetMinutes?: number
  overBudget: boolean
  windows: readonly EffortWindow[]
  fogBounded: boolean
}>

export type ScopeRollup = Readonly<{
  accepted: number
  total: number
  coverage: number
  /** True when fog nodes may add unknown acceptance criteria. */
  fogDenominator: boolean
  /** Alias for consumers that group all uncertainty flags together. */
  fogBounded: boolean
}>

export type WorkTreeRollup = Readonly<{
  treeId: string
  timing: TimingRollup
  cost: CostRollup
  resources: ResourceRollup
  effort: EffortRollup
  scope: ScopeRollup
}>

export type TreeValidationReason =
  | 'schema_invalid'
  | 'node_count_exceeded'
  | 'duplicate_node_id'
  | 'parent_missing'
  | 'parent_cycle'
  | 'tree_depth_exceeded'
  | 'children_cap_exceeded'
  | 'dependency_missing'
  | 'dependency_cycle'
  | 'illegal_status_transition'

export type TreeValidationIssue = Readonly<{
  reason: TreeValidationReason
  message: string
  nodeId?: string
  relatedNodeId?: string
  path?: string
  previousStatus?: WorkNodeStatus
  nextStatus?: WorkNodeStatus
}>

export type TreeValidationResult = Readonly<{
  valid: boolean
  errors: readonly TreeValidationIssue[]
}>

function rawNodeList(value: unknown): readonly unknown[] {
  if (!isRecord(value) || !('nodes' in value)) return []
  const nodes = value.nodes
  return Array.isArray(nodes) ? nodes : []
}

function issue(reason: TreeValidationReason, message: string, fields: Omit<TreeValidationIssue, 'reason' | 'message'> = {}): TreeValidationIssue {
  return { reason, message, ...fields }
}

/** Validate shape, hierarchy, dependency DAG, bounds, and optional status transitions. */
export function validateTree(tree: WorkTree, previousTree?: WorkTree): TreeValidationResult {
  const parsed = workTreeSchema.safeParse(tree)
  const errors: TreeValidationIssue[] = []
  if (!parsed.success) {
    for (const zodIssue of parsed.error.issues) {
      errors.push(issue('schema_invalid', zodIssue.message, { path: zodIssue.path.map(String).join('.') }))
    }
  }

  const rawNodes = rawNodeList(tree)
  if (rawNodes.length > MAX_NODES_PER_TREE) {
    errors.push(issue('node_count_exceeded', `tree has ${rawNodes.length} nodes; maximum is ${MAX_NODES_PER_TREE}`))
  }
  if (!parsed.success) return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) })

  const nodes = parsed.data.nodes
  const byId = new Map(nodes.map((node) => [node.nodeId, node]))
  const duplicateIds = new Set<string>()
  for (const node of nodes) {
    if (duplicateIds.has(node.nodeId)) {
      errors.push(issue('duplicate_node_id', `nodeId '${node.nodeId}' is duplicated`, { nodeId: node.nodeId }))
    }
    duplicateIds.add(node.nodeId)
  }

  const childrenByParent = new Map<string, WorkNode[]>()
  for (const node of nodes) {
    if (node.parentId === undefined) continue
    if (!byId.has(node.parentId)) {
      errors.push(issue('parent_missing', `parent '${node.parentId}' does not exist`, { nodeId: node.nodeId, relatedNodeId: node.parentId }))
      continue
    }
    const children = childrenByParent.get(node.parentId) ?? []
    children.push(node)
    childrenByParent.set(node.parentId, children)
  }
  for (const [parentId, children] of childrenByParent) {
    if (children.length > MAX_CHILDREN_PER_ELABORATION) {
      errors.push(issue(
        'children_cap_exceeded',
        `parent '${parentId}' has ${children.length} children; maximum is ${MAX_CHILDREN_PER_ELABORATION}`,
        { nodeId: parentId },
      ))
    }
  }

  // Parent hierarchy is a graph as well as a depth-indexed tree. Graphology
  // provides both the adopted cycle predicate and topological generations;
  // generation index is the bounded depth diagnostic for each node.
  const parentGraph = new DirectedGraph()
  for (const node of nodes) parentGraph.mergeNode(node.nodeId)
  let parentCycle = false
  for (const node of nodes) {
    const parentId = node.parentId
    if (parentId === undefined || !byId.has(parentId)) continue
    if (parentId === node.nodeId) {
      errors.push(issue('parent_cycle', `node '${node.nodeId}' is its own parent`, { nodeId: node.nodeId }))
      parentCycle = true
      continue
    }
    parentGraph.mergeDirectedEdge(parentId, node.nodeId)
  }
  if (hasCycle(parentGraph)) {
    errors.push(issue('parent_cycle', 'parent edges contain a cycle'))
    parentCycle = true
  }
  const parentDepthById = new Map<string, number>()
  if (!parentCycle) {
    for (const [depth, generation] of topologicalGenerations(parentGraph).entries()) {
      for (const nodeId of generation) parentDepthById.set(nodeId, depth)
    }
  }
  for (const node of nodes) {
    const depth = parentDepthById.get(node.nodeId) ?? 0
    if (depth > MAX_TREE_DEPTH) {
      errors.push(issue(
        'tree_depth_exceeded',
        `node '${node.nodeId}' is at depth ${depth}; maximum is ${MAX_TREE_DEPTH}`,
        { nodeId: node.nodeId },
      ))
    }
  }

  // Provenance: graphology-dag's cycle and generation APIs are adopted directly;
  // declarations: node_modules/graphology-dag/has-cycle.d.ts:1-3 and
  // node_modules/graphology-dag/topological-sort.d.ts:13-20 (MIT).
  // Donor source/license: https://github.com/graphology/graphology/tree/master/src
  // and https://github.com/graphology/graphology/blob/master/LICENSE.txt.
  const dependencyGraph = new DirectedGraph()
  for (const node of nodes) dependencyGraph.mergeNode(node.nodeId)
  for (const node of nodes) {
    for (const dependencyId of node.dependsOn) {
      if (!byId.has(dependencyId)) {
        errors.push(issue('dependency_missing', `dependency '${dependencyId}' does not exist`, { nodeId: node.nodeId, relatedNodeId: dependencyId }))
        continue
      }
      if (dependencyId === node.nodeId) {
        errors.push(issue('dependency_cycle', `node '${node.nodeId}' depends on itself`, { nodeId: node.nodeId }))
        continue
      }
      dependencyGraph.mergeDirectedEdge(dependencyId, node.nodeId)
    }
  }
  if (hasCycle(dependencyGraph)) errors.push(issue('dependency_cycle', 'dependsOn edges contain a cycle'))

  if (previousTree !== undefined) {
    const previousById = new Map(previousTree.nodes.map((node) => [node.nodeId, node]))
    for (const node of nodes) {
      const previous = previousById.get(node.nodeId)
      if (previous === undefined || previous.status === node.status) continue
      const allowed = WORK_NODE_STATUS_TRANSITIONS[previous.status]
      if (!allowed.includes(node.status)) {
        errors.push(issue(
          'illegal_status_transition',
          `status transition '${previous.status}' → '${node.status}' is not allowed`,
          { nodeId: node.nodeId, previousStatus: previous.status, nextStatus: node.status },
        ))
      }
    }
  }

  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) })
}

export function assertValidTree(tree: WorkTree, previousTree?: WorkTree): asserts tree is WorkTree {
  const result = validateTree(tree, previousTree)
  if (!result.valid) {
    throw new Error(result.errors.map((error) => `${error.reason}${error.nodeId === undefined ? '' : `:${error.nodeId}`}`).join(','))
  }
}

type CurrencyTotals = { estimateMinor: number; committedMinor: number; envelopeMinor: number }

type CostSubtree = Readonly<{
  byCurrency: ReadonlyMap<string, CurrencyTotals>
  childEnvelopeByCurrency: ReadonlyMap<string, number>
}>

function addTotals(target: CurrencyTotals, source: CurrencyTotals): void {
  target.estimateMinor += source.estimateMinor
  target.committedMinor += source.committedMinor
  target.envelopeMinor += source.envelopeMinor
}

function addCurrency(target: Map<string, CurrencyTotals>, currency: string, totals: CurrencyTotals): void {
  const current = target.get(currency) ?? { estimateMinor: 0, committedMinor: 0, envelopeMinor: 0 }
  addTotals(current, totals)
  target.set(currency, current)
}

function collectCostSubtree(nodeId: string, nodeById: ReadonlyMap<string, WorkNode>, childrenByParent: ReadonlyMap<string, readonly WorkNode[]>, stack: Set<string>): CostSubtree {
  if (stack.has(nodeId)) return { byCurrency: new Map(), childEnvelopeByCurrency: new Map() }
  const node = nodeById.get(nodeId)
  if (node === undefined) return { byCurrency: new Map(), childEnvelopeByCurrency: new Map() }
  const nextStack = new Set(stack)
  nextStack.add(nodeId)
  const byCurrency = new Map<string, CurrencyTotals>()
  if (node.cost !== undefined) {
    addCurrency(byCurrency, node.cost.currency, {
      estimateMinor: node.cost.estimateMinor ?? 0,
      committedMinor: node.cost.committedMinor ?? 0,
      envelopeMinor: node.cost.envelopeMinor ?? 0,
    })
  }
  const childEnvelopeByCurrency = new Map<string, number>()
  for (const child of childrenByParent.get(nodeId) ?? []) {
    const childRollup = collectCostSubtree(child.nodeId, nodeById, childrenByParent, nextStack)
    for (const [currency, totals] of childRollup.byCurrency) addCurrency(byCurrency, currency, totals)
    for (const [currency, envelope] of childRollup.byCurrency) {
      childEnvelopeByCurrency.set(currency, (childEnvelopeByCurrency.get(currency) ?? 0) + envelope.envelopeMinor)
    }
  }
  return { byCurrency, childEnvelopeByCurrency }
}

function rollupCost(tree: WorkTree): CostRollup {
  const nodes = tree.nodes
  const nodeById = new Map(nodes.map((node) => [node.nodeId, node]))
  const childrenByParent = new Map<string, WorkNode[]>()
  for (const node of nodes) {
    if (node.parentId === undefined) continue
    const children = childrenByParent.get(node.parentId) ?? []
    children.push(node)
    childrenByParent.set(node.parentId, children)
  }
  const allTotals = new Map<string, CurrencyTotals>()
  for (const node of nodes) {
    if (node.cost === undefined) continue
    addCurrency(allTotals, node.cost.currency, {
      estimateMinor: node.cost.estimateMinor ?? 0,
      committedMinor: node.cost.committedMinor ?? 0,
      envelopeMinor: node.cost.envelopeMinor ?? 0,
    })
  }

  const breaches: CostEnvelopeBreach[] = []
  const childEnvelopeTotals = new Map<string, number>()
  for (const node of nodes) {
    if (node.cost?.envelopeMinor === undefined) continue
    const subtree = collectCostSubtree(node.nodeId, nodeById, childrenByParent, new Set())
    const subtreeTotals = subtree.byCurrency.get(node.cost.currency) ?? { estimateMinor: 0, committedMinor: 0, envelopeMinor: 0 }
    const childEnvelopeMinor = subtree.childEnvelopeByCurrency.get(node.cost.currency) ?? 0
    childEnvelopeTotals.set(node.cost.currency, (childEnvelopeTotals.get(node.cost.currency) ?? 0) + childEnvelopeMinor)
    const breached = childEnvelopeMinor > node.cost.envelopeMinor
      || subtreeTotals.estimateMinor > node.cost.envelopeMinor
      || subtreeTotals.committedMinor > node.cost.envelopeMinor
    if (breached) {
      breaches.push({
        nodeId: node.nodeId,
        currency: node.cost.currency,
        envelopeMinor: node.cost.envelopeMinor,
        childEnvelopeMinor,
        subtreeEstimateMinor: subtreeTotals.estimateMinor,
        subtreeCommittedMinor: subtreeTotals.committedMinor,
        breached: true,
      })
    }
  }

  const byCurrency: Record<string, CostCurrencyRollup> = {}
  const estimateMinorByCurrency: Record<string, number> = {}
  const committedMinorByCurrency: Record<string, number> = {}
  for (const [currency, totals] of allTotals) {
    const currencyBreached = breaches.some((breach) => breach.currency === currency)
    byCurrency[currency] = {
      currency,
      estimateMinor: totals.estimateMinor,
      committedMinor: totals.committedMinor,
      envelopeMinor: totals.envelopeMinor,
      childEnvelopeMinor: childEnvelopeTotals.get(currency) ?? 0,
      envelopeBreached: currencyBreached,
    }
    estimateMinorByCurrency[currency] = totals.estimateMinor
    committedMinorByCurrency[currency] = totals.committedMinor
  }
  return Object.freeze({
    byCurrency,
    estimateMinorByCurrency,
    committedMinorByCurrency,
    envelopeBreached: breaches.length > 0,
    breaches: Object.freeze(breaches),
  })
}

type ResourceBooking = Readonly<{ nodeId: string; ownerRef: string; startMs: number; endMs: number }>

function rollupResources(tree: WorkTree): ResourceRollup {
  // Provenance: @flatten-js/interval-tree's insert/search/intersect_any API is
  // adopted from `node_modules/@flatten-js/interval-tree/dist/classes/IntervalTree.d.ts:52-86` (MIT).
  // Donor source/license: https://github.com/alexbol99/flatten-interval-tree
  // and https://github.com/alexbol99/flatten-interval-tree/blob/master/LICENSE.
  // The donor uses closed intervals; AE normalizes [startMs,endMs) to the
  // closed integer interval [startMs,endMs-1] so touching bookings do not hit.
  const trees = new Map<string, IntervalTree<ResourceBooking>>()
  const conflicts: ResourceConflict[] = []
  let bookingCount = 0
  for (const node of tree.nodes) {
    const exclusive = node.resource?.exclusive
    const ownerRef = node.resource?.ownerRef
    if (exclusive === undefined || ownerRef === undefined) continue
    const booking: ResourceBooking = { nodeId: node.nodeId, ownerRef, startMs: exclusive.startMs, endMs: exclusive.endMs }
    const treeForOwner = trees.get(ownerRef) ?? new IntervalTree<ResourceBooking>()
    const normalized: [number, number] = [exclusive.startMs, exclusive.endMs - 1]
    for (const existing of treeForOwner.search(normalized)) {
      const leftNodeId = existing.nodeId.localeCompare(node.nodeId, undefined, { numeric: true }) <= 0 ? existing.nodeId : node.nodeId
      const rightNodeId = leftNodeId === existing.nodeId ? node.nodeId : existing.nodeId
      conflicts.push({
        ownerRef,
        leftNodeId,
        rightNodeId,
        overlap: {
          startMs: Math.max(existing.startMs, booking.startMs),
          endMs: Math.min(existing.endMs, booking.endMs),
        },
      })
    }
    treeForOwner.insert(normalized, booking)
    trees.set(ownerRef, treeForOwner)
    bookingCount += 1
  }
  conflicts.sort((left, right) => {
    const owner = left.ownerRef.localeCompare(right.ownerRef)
    if (owner !== 0) return owner
    const first = left.leftNodeId.localeCompare(right.leftNodeId, undefined, { numeric: true })
    if (first !== 0) return first
    return left.rightNodeId.localeCompare(right.rightNodeId, undefined, { numeric: true })
  })
  const frozenConflicts = Object.freeze(conflicts)
  return Object.freeze({
    conflicts: frozenConflicts,
    conflictPairs: frozenConflicts,
    bookingCount,
    ownerRefs: Object.freeze([...trees.keys()].sort()),
  })
}

function rollupEffort(tree: WorkTree, cpm: CpmResult, options: RollupOptions): EffortRollup {
  const totalHumanMinutes = tree.nodes.reduce((sum, node) => sum + (node.effort?.humanMinutes ?? 0), 0)
  const windowDays = Math.max(1, options.effortWindowBusinessDays ?? 5)
  const maxDay = Math.max(0, cpm.knownMinDays)
  // A rolling window starts on each known business-day offset, rather than
  // partitioning effort into disjoint buckets.
  const windowCount = Math.max(1, maxDay + 1)
  const windows: EffortWindow[] = []
  for (let index = 0; index < windowCount; index += 1) {
    const start = addBusinessDays(cpm.anchor, index)
    const end = addBusinessDays(start, windowDays)
    let humanMinutes = 0
    for (const node of tree.nodes) {
      const schedule = cpm.byNodeId.get(node.nodeId)
      if (schedule === undefined) continue
      if (schedule.earlyStartDay >= index && schedule.earlyStartDay < index + windowDays) {
        humanMinutes += node.effort?.humanMinutes ?? 0
      }
    }
    windows.push({
      index,
      start,
      end,
      humanMinutes,
      overBudget: options.attentionBudgetMinutes !== undefined && humanMinutes > options.attentionBudgetMinutes,
    })
  }
  const overBudget = options.attentionBudgetMinutes !== undefined
    && windows.some((window) => window.overBudget)
  const output: {
    humanMinutes: number
    totalHumanMinutes: number
    overBudget: boolean
    windows: readonly EffortWindow[]
    fogBounded: boolean
    attentionBudgetMinutes?: number
  } = {
    humanMinutes: totalHumanMinutes,
    totalHumanMinutes,
    overBudget,
    windows: Object.freeze(windows),
    fogBounded: tree.nodes.some((node) => node.status === 'fog' && node.effort?.humanMinutes === undefined),
  }
  if (options.attentionBudgetMinutes !== undefined) output.attentionBudgetMinutes = options.attentionBudgetMinutes
  return Object.freeze(output)
}

function rollupScope(tree: WorkTree): ScopeRollup {
  let accepted = 0
  let total = 0
  let fogDenominator = false
  for (const node of tree.nodes) {
    if (node.status === 'fog') fogDenominator = true
    const criteria = node.scope?.criteria
    if (criteria !== undefined) {
      total += criteria.length
      accepted += criteria.filter((criterion) => criterion.accepted).length
      continue
    }
    if (node.scope?.acceptance === 'binary' || node.scope?.acceptance === 'judgement') {
      total += 1
      if (node.status === 'done') accepted += 1
    }
  }
  const coverage = total === 0 ? 0 : accepted / total
  return Object.freeze({ accepted, total, coverage, fogDenominator, fogBounded: fogDenominator })
}

/** Aggregate all five dimensions without mutation or host/runtime dependencies. */
export function rollupTree(tree: WorkTree, options: RollupOptions = {}): WorkTreeRollup {
  const cpm = calculateCpm(tree, options)
  const timing: TimingRollup = {
    cpm,
    schedules: cpm.schedules,
    knownMinDays: cpm.knownMinDays,
    fogBounded: cpm.fogBounded,
  }
  return Object.freeze({
    treeId: tree.treeId,
    timing,
    cost: rollupCost(tree),
    resources: rollupResources(tree),
    effort: rollupEffort(tree, cpm, options),
    scope: rollupScope(tree),
  })
}
