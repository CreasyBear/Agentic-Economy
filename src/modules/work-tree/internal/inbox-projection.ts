import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { WorkNode, WorkTree } from './contract'
import {
  assessWorkTreeDecisionPolicy,
  compareDecisionRanking,
  decisionRankingDimensions,
  dependentCount,
  type DecisionRankingDimensions,
  type WorkTreeDecisionPolicy,
} from './decision-policy'

export const DECISION_INBOX_LIMIT = 3 as const

export type DecisionInboxExitKind = 'lock' | 'adjust' | 'park'

export type WorkTreeDecisionIdentity = Readonly<{
  treeId: string
  projectId: string
  nodeId: string
  proposalDigest: string
  generation: number
  revision: number
  principalId?: string
}>

export type DecisionInboxExit = Readonly<{
  kind: DecisionInboxExitKind
  treeId: string
  projectId: string
  nodeId: string
  expectedGeneration: number
  expectedRevision: number
  proposalDigest: string
  decisionIdentity: WorkTreeDecisionIdentity
  proposalId?: string
}>

/** A propose_decision that is waiting to be applied to the referenced tree node. */
export type PendingProposeDecision = Readonly<{
  proposalId: string
  treeId: string
  targetNodeId: string
  createdAt: number
}>

export type DecisionInboxOptions = Readonly<{
  nowMs?: number
  principalId?: string
  pendingProposeDecisions?: readonly PendingProposeDecision[]
}>

type WorkNodeDimensions = Pick<WorkNode, 'timing' | 'cost' | 'resource' | 'effort' | 'scope'>

export type DecisionInboxItem = Readonly<WorkNodeDimensions & {
  source: 'ready-node' | 'propose_decision'
  status: 'ready' | 'pending'
  treeId: string
  projectId: string
  nodeId: string
  title: string
  description?: string
  readyAt: number
  priority: number
  irreversibility: number
  constraintPower: number
  leadTimeDays: number
  priorityUrgency: number
  moneyYes: boolean
  moneyBatchKey?: 'money-yes'
  requiresStepUp: boolean
  authorityWidening: boolean
  eligibleForRepeatPermission: boolean
  exits: Readonly<Record<DecisionInboxExitKind, DecisionInboxExit>>
}>

export type DecisionInboxProjection = Readonly<{
  items: readonly DecisionInboxItem[]
  nextDecision: string
  nextDecisionHours: number
  oldestReadyAt?: number
}>

type Candidate = Readonly<{
  tree: WorkTree
  node: WorkNode
  source: DecisionInboxItem['source']
  readyAt: number
  proposalId?: string
  ranking: DecisionRankingDimensions
  policy: WorkTreeDecisionPolicy
}>

/**
 * Project one or more work trees into the single person-facing decision inbox.
 * Ready nodes and pending propose_decision proposals share the global N=3 cap.
 * Ordering is source-owned risk first (irreversibility, constraint power, lead
 * time, priority), with age and stable IDs as deterministic tie-breakers.
 */
export function projectDecisionInbox(
  input: WorkTree | readonly WorkTree[],
  options: DecisionInboxOptions = {},
): DecisionInboxProjection {
  const trees: readonly WorkTree[] = Array.isArray(input) ? input : [input]
  const candidates: Candidate[] = []
  const seen = new Set<string>()

  for (const tree of trees) {
    for (const node of tree.nodes) {
      if (node.kind !== 'decision' || node.status !== 'ready') continue
      const key = candidateKey(tree.treeId, node.nodeId)
      if (seen.has(key)) continue
      seen.add(key)
      candidates.push(candidate(tree, node, 'ready-node', node.updatedAt, undefined))
    }
  }

  for (const proposal of options.pendingProposeDecisions ?? []) {
    const tree = trees.find((candidate) => candidate.treeId === proposal.treeId)
    const node = tree?.nodes.find((candidate) => candidate.nodeId === proposal.targetNodeId)
    if (tree === undefined || node === undefined || node.kind !== 'decision') continue
    const key = candidateKey(proposal.treeId, node.nodeId)
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push(candidate(tree, node, 'propose_decision', proposal.createdAt, proposal.proposalId))
  }

  const ordered = candidates
    .sort((left, right) => compareDecisionRanking({
      dimensions: left.ranking,
      readyAt: left.readyAt,
      treeId: left.tree.treeId,
      nodeId: left.node.nodeId,
    }, {
      dimensions: right.ranking,
      readyAt: right.readyAt,
      treeId: right.tree.treeId,
      nodeId: right.node.nodeId,
    }))
    .slice(0, DECISION_INBOX_LIMIT)

  const oldestReadyAt = ordered[0]?.readyAt
  const nowMs = options.nowMs ?? Date.now()
  const nextDecisionHours = oldestReadyAt === undefined
    ? 0
    : Math.max(0, Math.floor((nowMs - oldestReadyAt) / (60 * 60 * 1_000)))

  return {
    items: ordered.map((item) => toInboxItem(item, options.principalId)),
    nextDecision: `Next decision: ${nextDecisionHours}h`,
    nextDecisionHours,
    ...(oldestReadyAt === undefined ? {} : { oldestReadyAt }),
  }
}

function candidate(
  tree: WorkTree,
  node: WorkNode,
  source: Candidate['source'],
  readyAt: number,
  proposalId: string | undefined,
): Candidate {
  return {
    tree,
    node,
    source,
    readyAt,
    ...(proposalId === undefined ? {} : { proposalId }),
    ranking: decisionRankingDimensions(node, { dependentCount: dependentCount(tree, node.nodeId) }),
    policy: assessWorkTreeDecisionPolicy(node),
  }
}

function toInboxItem(candidate: Candidate, principalId: string | undefined): DecisionInboxItem {
  const { tree, node } = candidate
  const moneyYes = candidate.policy.paid
  return {
    source: candidate.source,
    status: candidate.source === 'ready-node' ? 'ready' : 'pending',
    treeId: tree.treeId,
    projectId: tree.projectId,
    nodeId: node.nodeId,
    title: node.title,
    ...(node.description === undefined ? {} : { description: node.description }),
    readyAt: candidate.readyAt,
    priority: node.priority,
    irreversibility: candidate.ranking.irreversibility,
    constraintPower: candidate.ranking.constraintPower,
    leadTimeDays: candidate.ranking.leadTimeDays,
    priorityUrgency: candidate.ranking.priorityUrgency,
    ...dimensions(node),
    moneyYes,
    ...(moneyYes ? { moneyBatchKey: 'money-yes' as const } : {}),
    requiresStepUp: candidate.policy.requiresStepUp,
    authorityWidening: candidate.policy.authorityWidening,
    eligibleForRepeatPermission: candidate.policy.eligibleForRepeatPermission,
    exits: {
      lock: makeExit('lock', tree, node, candidate.proposalId, principalId),
      adjust: makeExit('adjust', tree, node, candidate.proposalId, principalId),
      park: makeExit('park', tree, node, candidate.proposalId, principalId),
    },
  }
}

function dimensions(node: WorkNode): WorkNodeDimensions {
  return {
    ...(node.timing === undefined ? {} : { timing: node.timing }),
    ...(node.cost === undefined ? {} : { cost: node.cost }),
    ...(node.resource === undefined ? {} : { resource: node.resource }),
    ...(node.effort === undefined ? {} : { effort: node.effort }),
    ...(node.scope === undefined ? {} : { scope: node.scope }),
  }
}

function makeExit(
  kind: DecisionInboxExitKind,
  tree: WorkTree,
  node: WorkNode,
  proposalId: string | undefined,
  principalId: string | undefined,
): DecisionInboxExit {
  const expectedGeneration = tree.generation
  const expectedRevision = tree.revision
  const proposal = {
    projectId: tree.projectId,
    nodeId: node.nodeId,
    kind,
    expectedGeneration,
    expectedRevision,
  }
  const proposalDigest = canonicalDigest(proposal)
  return {
    kind,
    treeId: tree.treeId,
    projectId: tree.projectId,
    nodeId: node.nodeId,
    expectedGeneration,
    expectedRevision,
    proposalDigest,
    decisionIdentity: {
      treeId: tree.treeId,
      projectId: tree.projectId,
      nodeId: node.nodeId,
      proposalDigest,
      generation: expectedGeneration,
      revision: expectedRevision,
      ...(principalId === undefined ? {} : { principalId }),
    },
    ...(proposalId === undefined ? {} : { proposalId }),
  }
}

function candidateKey(treeId: string, nodeId: string): string {
  return `${treeId}:${nodeId}`
}
