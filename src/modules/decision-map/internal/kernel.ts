import { DirectedGraph } from 'graphology'
import { hasCycle } from 'graphology-dag'
import { bfsFromNode } from 'graphology-traversal'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
  decisionMapChoiceInputSchema,
  decisionMapConstraintChangeInputSchema,
  decisionMapDraftSchema,
  decisionMapSnapshotSchema,
  DecisionMapInvariantError,
  DecisionMapKernelError,
  type DecisionMapAreaNode,
  type DecisionMapAuthorInput,
  type DecisionMapChangeReport,
  type DecisionMapChoiceInput,
  type DecisionMapDecisionNode,
  type DecisionMapDecisionRecord,
  type DecisionMapDraft,
  type DecisionMapNode,
  type DecisionMapOperationRecord,
  type DecisionMapSnapshot,
  type DecisionMapValidationIssue,
  type DecisionMapValidationOptions,
  type DecisionMapConstraintChangeInput,
} from './contract'

export type DecisionMapChoiceResult = Readonly<{
  kind: 'applied' | 'replayed'
  snapshot: DecisionMapSnapshot
  replayed: boolean
  operationKey: string
  decisionRecord?: DecisionMapDecisionRecord
}>

export type DecisionMapConstraintChangeResult = Readonly<{
  kind: 'applied' | 'replayed'
  snapshot: DecisionMapSnapshot
  replayed: boolean
  operationKey: string
  changedDetail: string
  preservedNodeIds: readonly string[]
  affectedNodeIds: readonly string[]
  reopenedNodeIds: readonly string[]
  changeReport: DecisionMapChangeReport
}>

export function validateDecisionMapDraft(
  input: unknown,
  options: DecisionMapValidationOptions = {},
): DecisionMapDraft {
  const draft = decisionMapDraftSchema.parse(input)
  const issues: DecisionMapValidationIssue[] = []
  const nodes = draft.nodes
  const nodeById = new Map<string, DecisionMapNode>()
  const assumptionIds = new Set<string>()

  for (const assumption of draft.assumptions) {
    if (assumptionIds.has(assumption.id)) issues.push({ code: 'duplicate_id', message: `Duplicate assumption id: ${assumption.id}` })
    assumptionIds.add(assumption.id)
  }
  for (const [index, node] of nodes.entries()) {
    if (nodeById.has(node.id)) issues.push({ code: 'duplicate_id', message: `Duplicate node id: ${node.id}`, path: ['nodes', index, 'id'] })
    nodeById.set(node.id, node)
    if (node.kind === 'area' && node.status !== 'queued' && node.status !== 'fog') issues.push({ code: 'invalid_status', message: `Area ${node.id} must be queued or fog.` })
    if (options.initial === true && node.status === 'locked') issues.push({ code: 'invalid_status', message: `Initial map cannot contain locked node ${node.id}.` })
  }

  const roots = nodes.filter((node): node is DecisionMapAreaNode => node.kind === 'area' && (node.parentId === undefined || node.parentId === null))
  if (roots.length < 3 || roots.length > 7) issues.push({ code: 'invalid_root_count', message: `Map must have 3-7 root areas; received ${roots.length}.` })

  const childrenByParent = new Map<string, DecisionMapNode[]>()
  for (const node of nodes) {
    if (node.kind === 'area') {
      if (node.parentId !== undefined && node.parentId !== null) issues.push({ code: 'invalid_depth', message: `Area ${node.id} cannot be nested.` })
      continue
    }
    const parent = nodeById.get(node.parentId)
    if (parent === undefined) issues.push({ code: 'missing_reference', message: `Decision ${node.id} references missing parent ${node.parentId}.` })
    else if (parent.kind !== 'area' || parent.parentId !== undefined && parent.parentId !== null) issues.push({ code: 'invalid_parent', message: `Decision ${node.id} must be a direct child of a root area.` })
    const children = childrenByParent.get(node.parentId) ?? []
    children.push(node)
    childrenByParent.set(node.parentId, children)
  }
  const branchRoots = roots.filter((root) => (childrenByParent.get(root.id)?.length ?? 0) > 0)
  if (branchRoots.length !== 1) issues.push({ code: 'invalid_branch', message: `Exactly one root area must contain decision children; received ${branchRoots.length}.` })
  for (const root of roots) {
    const childCount = childrenByParent.get(root.id)?.length ?? 0
    if (childCount !== 0 && (childCount < 2 || childCount > 3)) issues.push({ code: 'invalid_branch', message: `Root ${root.id} must contain 2-3 decisions; received ${childCount}.` })
  }

  const decisionNodes = nodes.filter((node): node is DecisionMapDecisionNode => node.kind === 'decision')
  const readyNodes = decisionNodes.filter((node) => node.status === 'ready')
  const requireReady = options.requireReady ?? true
  if (readyNodes.length > 1 || requireReady && readyNodes.length !== 1) issues.push({ code: 'invalid_ready', message: `Map must contain exactly one ready decision; received ${readyNodes.length}.` })
  if (readyNodes.length === 1) {
    const ready = readyNodes[0]
    if (ready !== undefined) for (const dependencyId of ready.dependsOn) {
      const dependency = nodeById.get(dependencyId)
      if (dependency?.kind === 'decision' && dependency.status !== 'locked') issues.push({ code: 'invalid_ready', message: `Ready decision ${ready.id} depends on unlocked ${dependencyId}.` })
    }
  }

  for (const node of nodes) {
    for (const reference of node.dependsOn) if (!nodeById.has(reference)) issues.push({ code: 'missing_reference', message: `Node ${node.id} references missing dependency ${reference}.` })
    for (const reference of node.constraintRefs) if (!assumptionIds.has(reference)) issues.push({ code: 'invalid_constraint_reference', message: `Node ${node.id} references missing assumption ${reference}.` })
    if (node.kind === 'decision') {
      const optionIds = new Set<string>()
      for (const option of node.options) {
        if (optionIds.has(option.id)) issues.push({ code: 'duplicate_id', message: `Decision ${node.id} repeats option id ${option.id}.` })
        optionIds.add(option.id)
      }
      if (!optionIds.has(node.recommendedOptionId)) issues.push({ code: 'invalid_option_reference', message: `Decision ${node.id} recommends missing option ${node.recommendedOptionId}.` })
      for (const reference of node.unlocks) if (!nodeById.has(reference)) issues.push({ code: 'missing_reference', message: `Decision ${node.id} unlocks missing node ${reference}.` })
    }
  }

  const referenceGraph = new DirectedGraph()
  for (const node of nodes) referenceGraph.mergeNode(node.id)
  for (const node of nodes) {
    if (node.kind === 'decision' && nodeById.has(node.parentId)) referenceGraph.mergeDirectedEdge(node.id, node.parentId)
    for (const dependencyId of node.dependsOn) if (nodeById.has(dependencyId)) referenceGraph.mergeDirectedEdge(node.id, dependencyId)
    if (node.kind === 'decision') for (const targetId of node.unlocks) if (nodeById.has(targetId)) referenceGraph.mergeDirectedEdge(targetId, node.id)
  }
  if (hasCycle(referenceGraph)) issues.push({ code: 'cycle', message: 'Decision map references form a cycle.' })
  if (issues.length > 0) throw new DecisionMapInvariantError(issues)
  return draft
}

export function authorDecisionMapSnapshot(input: DecisionMapAuthorInput): DecisionMapSnapshot {
  const draft = validateDecisionMapDraft(input.draft, { initial: true })
  const generation = input.generation ?? 0
  const revision = input.revision ?? 1
  const now = input.now ?? input.updatedAt ?? input.createdAt ?? input.authoredAt ?? 0
  const snapshot = decisionMapSnapshotSchema.parse({ ...draft, projectId: input.projectId, threadId: input.threadId, generation, revision, createdAt: input.createdAt ?? now, updatedAt: input.updatedAt ?? now, decisionRecords: [], operationRecords: [] })
  validateDecisionMapDraft(draft, { requireReady: true })
  return snapshot
}

export function applyDecisionMapChoice(snapshotInput: DecisionMapSnapshot, input: DecisionMapChoiceInput): DecisionMapChoiceResult {
  const snapshot = parseSnapshot(snapshotInput)
  const choice = decisionMapChoiceInputSchema.parse(input)
  assertContext(snapshot, choice)
  const payloadDigest = payloadDigestFor('choice', choice)
  if (findReplay(snapshot, choice.operationKey, payloadDigest) !== undefined) {
    const record = snapshot.decisionRecords.find((entry) => entry.operationKey === choice.operationKey)
    return { kind: 'replayed', snapshot, replayed: true, operationKey: choice.operationKey, ...(record === undefined ? {} : { decisionRecord: record }) }
  }
  assertFence(snapshot, choice)
  const targetIndex = snapshot.nodes.findIndex((node) => node.id === choice.decisionId && node.kind === 'decision')
  const target = snapshot.nodes[targetIndex]
  if (target === undefined || target.kind !== 'decision') throw new DecisionMapKernelError('decision_not_found', `Decision ${choice.decisionId} was not found.`)
  if (target.status !== 'ready') throw new DecisionMapKernelError('decision_not_ready', `Decision ${choice.decisionId} is not ready.`)
  const nextNodes = snapshot.nodes.slice()
  nextNodes[targetIndex] = { ...target, status: choice.choice === 'lock' ? 'locked' : 'queued' }
  openFirstFrontier(nextNodes, target.id, choice.choice === 'lock' ? target.unlocks : [])
  const at = choice.at ?? snapshot.updatedAt
  const decisionRecord: DecisionMapDecisionRecord = { decisionId: target.id, choice: choice.choice, recommendedOptionId: target.recommendedOptionId, ...(choice.choice === 'lock' ? { selectedOptionId: target.recommendedOptionId } : { parkTrigger: target.parkTrigger }), operationKey: choice.operationKey, generation: snapshot.generation, revision: snapshot.revision + 1, at }
  const nextSnapshot = withOperationRecord({ ...snapshot, nodes: nextNodes, revision: snapshot.revision + 1, updatedAt: at, decisionRecords: [...snapshot.decisionRecords, decisionRecord] }, { operationKey: choice.operationKey, kind: 'choice', payloadDigest })
  return { kind: 'applied', snapshot: nextSnapshot, replayed: false, operationKey: choice.operationKey, decisionRecord }
}

export function applyDecisionMapConstraintChange(snapshotInput: DecisionMapSnapshot, input: DecisionMapConstraintChangeInput): DecisionMapConstraintChangeResult {
  const snapshot = parseSnapshot(snapshotInput)
  const change = decisionMapConstraintChangeInputSchema.parse(input)
  assertContext(snapshot, change)
  const payloadDigest = payloadDigestFor('constraint_change', change)
  if (findReplay(snapshot, change.operationKey, payloadDigest) !== undefined) {
    const report = snapshot.lastChangeReport?.operationKey === change.operationKey ? snapshot.lastChangeReport : { changedAssumptionId: change.assumptionId, changedDetail: 'This operation was already applied.', preservedNodeIds: [], affectedNodeIds: [], reopenedNodeIds: [], operationKey: change.operationKey, generation: snapshot.generation, revision: snapshot.revision }
    return { kind: 'replayed', snapshot, replayed: true, operationKey: change.operationKey, changedDetail: report.changedDetail, preservedNodeIds: report.preservedNodeIds, affectedNodeIds: report.affectedNodeIds, reopenedNodeIds: report.reopenedNodeIds, changeReport: report }
  }
  assertFence(snapshot, change)
  const assumptionIndex = snapshot.assumptions.findIndex((assumption) => assumption.id === change.assumptionId)
  const assumption = snapshot.assumptions[assumptionIndex]
  if (assumption === undefined) throw new DecisionMapKernelError('assumption_not_found', `Assumption ${change.assumptionId} was not found.`)
  const affected = collectAffectedNodes(snapshot.nodes, change.assumptionId)
  const affectedNodeIds = snapshot.nodes.filter((node) => affected.has(node.id)).map((node) => node.id)
  const preservedNodeIds = snapshot.nodes.filter((node) => !affected.has(node.id)).map((node) => node.id)
  const reopenedNodeIds = snapshot.nodes.filter((node): node is DecisionMapDecisionNode => affected.has(node.id) && node.kind === 'decision' && node.status === 'locked').map((node) => node.id)
  const nextNodes = snapshot.nodes.map((node) => affected.has(node.id) && node.kind === 'decision' && node.status === 'locked' ? { ...node, status: 'queued' as const } : node)
  if (reopenedNodeIds.length > 0 && !nextNodes.some((node) => node.kind === 'decision' && node.status === 'ready' && !affected.has(node.id))) {
    for (const node of nextNodes) if (node.kind === 'decision' && affected.has(node.id) && node.status === 'ready') {
      const index = nextNodes.findIndex((candidate) => candidate.id === node.id)
      if (index >= 0) nextNodes[index] = { ...node, status: 'queued' }
    }
    openFirstFrontier(nextNodes, undefined, reopenedNodeIds)
  } else if (!nextNodes.some((node) => node.kind === 'decision' && node.status === 'ready')) openFirstFrontier(nextNodes, undefined, affectedNodeIds)
  const nextGeneration = snapshot.generation + 1
  const nextRevision = snapshot.revision + 1
  const at = change.at ?? snapshot.updatedAt
  const assumptions = snapshot.assumptions.slice()
  assumptions[assumptionIndex] = { ...assumption, value: change.value }
  const changedDetail = `Updated ${assumption.label} from “${assumption.value}” to “${change.value}”.`.slice(0, 500)
  const changeReport: DecisionMapChangeReport = { changedAssumptionId: change.assumptionId, changedDetail, preservedNodeIds, affectedNodeIds, reopenedNodeIds, operationKey: change.operationKey, generation: nextGeneration, revision: nextRevision }
  const nextSnapshot = withOperationRecord({ ...snapshot, assumptions, nodes: nextNodes, generation: nextGeneration, revision: nextRevision, updatedAt: at, lastChangeReport: changeReport }, { operationKey: change.operationKey, kind: 'constraint_change', payloadDigest })
  return { kind: 'applied', snapshot: nextSnapshot, replayed: false, operationKey: change.operationKey, changedDetail, preservedNodeIds, affectedNodeIds, reopenedNodeIds, changeReport }
}

function parseSnapshot(input: DecisionMapSnapshot): DecisionMapSnapshot {
  const snapshot = decisionMapSnapshotSchema.parse(input)
  validateDecisionMapDraft(draftFromSnapshot(snapshot), { requireReady: false })
  return snapshot
}
function draftFromSnapshot(snapshot: DecisionMapSnapshot): DecisionMapDraft {
  return {
    version: snapshot.version,
    goalText: snapshot.goalText,
    summary: snapshot.summary,
    assumptions: snapshot.assumptions,
    nodes: snapshot.nodes,
  }
}
function assertFence(snapshot: DecisionMapSnapshot, input: Readonly<{ expectedGeneration: number; expectedRevision: number }>): void {
  if (input.expectedGeneration !== snapshot.generation) throw new DecisionMapKernelError('stale_generation', 'That decision map belongs to an earlier generation.', { expectedGeneration: input.expectedGeneration, actualGeneration: snapshot.generation })
  if (input.expectedRevision !== snapshot.revision) throw new DecisionMapKernelError('stale_revision', 'That decision map revision is stale.', { expectedRevision: input.expectedRevision, actualRevision: snapshot.revision })
}
function assertContext(snapshot: DecisionMapSnapshot, input: Readonly<{ projectId?: string | undefined; threadId?: string | undefined }>): void {
  if (input.projectId !== undefined && input.projectId !== snapshot.projectId) throw new DecisionMapKernelError('project_mismatch', 'Decision map project does not match the request.')
  if (input.threadId !== undefined && input.threadId !== snapshot.threadId) throw new DecisionMapKernelError('thread_mismatch', 'Decision map thread does not match the request.')
}
function payloadDigestFor(kind: 'choice' | 'constraint_change', input: DecisionMapChoiceInput | DecisionMapConstraintChangeInput): string {
  const { operationKey: _operationKey, ...payload } = input
  return canonicalDigest({ kind, payload } as unknown as StableHashValue)
}
function findReplay(snapshot: DecisionMapSnapshot, operationKey: string, payloadDigest: string): DecisionMapOperationRecord | undefined {
  const existing = snapshot.operationRecords.find((record) => record.operationKey === operationKey)
  if (existing !== undefined && existing.payloadDigest !== payloadDigest) throw new DecisionMapKernelError('operation_conflict', `Operation key ${operationKey} was already used with different input.`)
  return existing
}
function withOperationRecord(snapshot: DecisionMapSnapshot, input: Readonly<{ operationKey: string; kind: 'choice' | 'constraint_change'; payloadDigest: string }>): DecisionMapSnapshot {
  const resultDigest = canonicalDigest({ ...snapshot, operationRecords: undefined } as unknown as StableHashValue)
  return decisionMapSnapshotSchema.parse({ ...snapshot, operationRecords: [...snapshot.operationRecords, { operationKey: input.operationKey, kind: input.kind, payloadDigest: input.payloadDigest, generation: snapshot.generation, revision: snapshot.revision, resultDigest }] })
}
function collectAffectedNodes(nodes: readonly DecisionMapNode[], assumptionId: string): Set<string> {
  const knownIds = new Set(nodes.map((node) => node.id))
  const rippleGraph = new DirectedGraph()
  for (const node of nodes) rippleGraph.mergeNode(node.id)
  for (const node of nodes) {
    if (node.parentId !== undefined && node.parentId !== null && knownIds.has(node.parentId)) rippleGraph.mergeDirectedEdge(node.parentId, node.id)
    for (const dependencyId of node.dependsOn) if (knownIds.has(dependencyId)) rippleGraph.mergeDirectedEdge(dependencyId, node.id)
    if (node.kind === 'decision') for (const targetId of node.unlocks) if (knownIds.has(targetId)) rippleGraph.mergeDirectedEdge(node.id, targetId)
  }
  const affected = new Set<string>()
  for (const node of nodes) {
    if (!node.constraintRefs.includes(assumptionId)) continue
    bfsFromNode(rippleGraph, node.id, (visitedId) => { affected.add(visitedId) })
  }
  return affected
}
function openFirstFrontier(nodes: DecisionMapNode[], sourceId: string | undefined, preferredIds: readonly string[]): void {
  const preferred = new Set(preferredIds)
  const candidates = nodes.map((node, index) => ({ node, index })).filter(({ node }) => {
    if (node.kind !== 'decision' || node.status === 'locked' || node.status === 'ready') return false
    if (sourceId !== undefined && node.id === sourceId) return false
    if (preferred.size > 0 && !preferred.has(node.id)) return false
    return decisionIsEligible(node, nodes)
  })
  const fallback = preferred.size === 0 ? candidates : candidates.length > 0 ? candidates : nodes.map((node, index) => ({ node, index })).filter(({ node }) => node.kind === 'decision' && node.status !== 'locked' && node.status !== 'ready' && decisionIsEligible(node, nodes))
  const first = fallback[0]
  if (first !== undefined && first.node.kind === 'decision') nodes[first.index] = { ...first.node, status: 'ready' }
}
function decisionIsEligible(node: DecisionMapDecisionNode, nodes: readonly DecisionMapNode[]): boolean {
  const byId = new Map(nodes.map((entry) => [entry.id, entry]))
  for (const dependencyId of node.dependsOn) {
    const dependency = byId.get(dependencyId)
    if (dependency?.kind === 'decision' && dependency.status !== 'locked') return false
  }
  const incoming = nodes.filter((candidate): candidate is DecisionMapDecisionNode => candidate.kind === 'decision' && candidate.unlocks.includes(node.id))
  return incoming.length === 0 || incoming.every((source) => source.status === 'locked')
}
