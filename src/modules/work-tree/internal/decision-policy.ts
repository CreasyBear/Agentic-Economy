import type { WorkNode, WorkTree } from './contract'

export type WorkTreeDecisionKind = 'lock' | 'adjust' | 'park'

export type DecisionRankingDimensions = Readonly<{
  irreversibility: number
  constraintPower: number
  leadTimeDays: number
  priority: number
  priorityUrgency: number
  moneyYes: boolean
}>

export type WorkTreeDecisionPolicy = Readonly<{
  paid: boolean
  irreversible: boolean
  authorityWidening: boolean
  requiresStepUp: boolean
  eligibleForRepeatPermission: boolean
}>

export type DecisionRankingContext = Readonly<{
  dependentCount?: number
}>

/**
 * Derive the minimum authority boundary from the dimensions already carried by
 * a WorkNode. The source keeps these facts on the node; hosts only project the
 * result and never infer a successful effect from it.
 */
export function assessWorkTreeDecisionPolicy(
  node: WorkNode,
  kind: WorkTreeDecisionKind = 'lock',
): WorkTreeDecisionPolicy {
  const paid = hasMoneyCommitment(node)
  const irreversible = node.resource?.exclusive !== undefined
    || node.scope?.acceptance === 'judgement'
    || (node.cost?.committedMinor ?? 0) > 0
  const authorityWidening = node.authorityRef !== undefined && node.authorityRef.trim().length > 0
  const requiresStepUp = kind === 'lock' && (paid || irreversible || authorityWidening)
  return {
    paid,
    irreversible,
    authorityWidening,
    requiresStepUp,
    eligibleForRepeatPermission: kind === 'lock'
      && !paid
      && !irreversible
      && !authorityWidening
      && node.resource?.exclusive === undefined,
  }
}

/**
 * Compute the deterministic ranking tuple used by the one global inbox. Money
 * contributes to irreversibility, but is deliberately not a separate leading
 * bucket and cannot create a batch approval path.
 */
export function decisionRankingDimensions(
  node: WorkNode,
  context: DecisionRankingContext = {},
): DecisionRankingDimensions {
  const policy = assessWorkTreeDecisionPolicy(node)
  const dependentCount = Math.max(0, context.dependentCount ?? 0)
  const criteriaCount = node.scope?.criteria?.length ?? 0
  const irreversibility = (policy.paid ? 2 : 0)
    + (policy.irreversible ? 3 : 0)
    + (policy.authorityWidening ? 1 : 0)
  const constraintPower = Math.min(
    32,
    dependentCount * 2
      + node.dependsOn.length
      + (node.resource?.exclusive === undefined ? 0 : 2)
      + Math.min(criteriaCount, 4)
      + (policy.authorityWidening ? 2 : 0),
  )
  const leadTimeDays = Math.max(0, node.timing?.leadTimeDays ?? 0)
  const priorityUrgency = node.priority === 0 ? 0 : 5 - node.priority
  return {
    irreversibility,
    constraintPower,
    leadTimeDays,
    priority: node.priority,
    priorityUrgency,
    moneyYes: policy.paid,
  }
}

/** Compare highest-risk decisions first, then oldest waiting decision. */
export function compareDecisionRanking(
  left: Readonly<{ dimensions: DecisionRankingDimensions; readyAt: number; treeId: string; nodeId: string }>,
  right: Readonly<{ dimensions: DecisionRankingDimensions; readyAt: number; treeId: string; nodeId: string }>,
): number {
  const byIrreversibility = right.dimensions.irreversibility - left.dimensions.irreversibility
  if (byIrreversibility !== 0) return byIrreversibility
  const byConstraintPower = right.dimensions.constraintPower - left.dimensions.constraintPower
  if (byConstraintPower !== 0) return byConstraintPower
  const byLeadTime = right.dimensions.leadTimeDays - left.dimensions.leadTimeDays
  if (byLeadTime !== 0) return byLeadTime
  const byPriority = right.dimensions.priorityUrgency - left.dimensions.priorityUrgency
  if (byPriority !== 0) return byPriority
  const byMoney = Number(right.dimensions.moneyYes) - Number(left.dimensions.moneyYes)
  if (byMoney !== 0) return byMoney
  const byAge = left.readyAt - right.readyAt
  if (byAge !== 0) return byAge
  const byTree = left.treeId.localeCompare(right.treeId)
  return byTree !== 0 ? byTree : left.nodeId.localeCompare(right.nodeId)
}

export function hasMoneyCommitment(node: WorkNode): boolean {
  const cost = node.cost
  if (cost === undefined) return false
  return (cost.estimateMinor ?? 0) > 0
    || (cost.committedMinor ?? 0) > 0
    || (cost.envelopeMinor ?? 0) > 0
}

/** Return the number of nodes that explicitly depend on this decision. */
export function dependentCount(tree: WorkTree, nodeId: string): number {
  return tree.nodes.reduce((count, node) => count + (node.dependsOn.includes(nodeId) ? 1 : 0), 0)
}
