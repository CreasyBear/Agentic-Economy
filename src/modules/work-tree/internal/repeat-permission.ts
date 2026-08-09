import { assessWorkTreeDecisionPolicy, type WorkTreeDecisionPolicy } from './decision-policy'
import { compareExactAmounts, type ExactAmount } from '@/modules/money/public'
import type { WorkNode } from './contract'
import {
  allowStandingRoute,
  type AllowStandingRouteInput,
  type RepeatPermissionReceipt,
  type RepeatPermissionResult,
  type StandingRoutePorts,
} from '@/modules/customer-request/application/public'

export type WorkTreeRepeatPermissionBinding = Readonly<{
  projectId: string
  nodeId: string
  generation: number
  /** Customer Request revision inherited by the standing permission. */
  revision: number
  /** Current WorkTree revision for the exact decision binding. */
  workTreeRevision: number
  proposalDigest: string
  permission: RepeatPermissionReceipt
}>

export type WorkTreeRepeatPermissionReceipt = Readonly<{
  kind: 'work_tree_repeat_permission'
  status: 'active' | 'withdrawn'
  projectId: string
  nodeId: string
  generation: number
  revision: number
  workTreeRevision: number
  proposalDigest: string
  permission: RepeatPermissionReceipt
  policy: WorkTreeDecisionPolicy
}>

export type WorkTreeRepeatPermissionResult =
  | WorkTreeRepeatPermissionReceipt
  | Extract<RepeatPermissionResult, { kind: 'conflict' | 'refused' | 'unavailable' }>

export type WorkTreeRepeatUseInput = Readonly<{
  binding: WorkTreeRepeatPermissionBinding
  projectId: string
  nodeId: string
  generation: number
  workTreeRevision: number
  proposalDigest: string
  delegatedCredentialId: string
  now: number
  requestedSpend?: ExactAmount
  requestedDataAllocations?: number
  requestedOccurrences?: number
}>

export type WorkTreeRepeatUseReceipt = Readonly<{
  kind: 'work_tree_repeat_authorization'
  status: 'accepted'
  projectId: string
  nodeId: string
  generation: number
  workTreeRevision: number
  proposalDigest: string
  permissionRef: string
  readback: Readonly<{ projectId: string; revision: number }>
}>

export type WorkTreeRepeatUseRefusal = Readonly<{
  kind: 'refused'
  reason:
    | 'not_eligible'
    | 'permission_expired'
    | 'permission_revoked'
    | 'scope_widened'
    | 'identity_mismatch'
    | 'revision_changed'
    | 'generation_changed'
    | 'proposal_changed'
    | 'limit_exceeded'
}>

export type WorkTreeRepeatUseResult = WorkTreeRepeatUseReceipt | WorkTreeRepeatUseRefusal

/** Compose the existing bounded Customer Request permission with one exact node. */
export async function allowWorkTreeRepeatPermission(
  input: Readonly<AllowStandingRouteInput & {
    projectId: string
    nodeId: string
    generation: number
    workTreeRevision: number
    proposalDigest: string
    node: WorkNode
  }>,
  ports: StandingRoutePorts,
): Promise<WorkTreeRepeatPermissionResult> {
  const policy = assessWorkTreeDecisionPolicy(input.node)
  if (input.node.kind !== 'decision' || input.node.status !== 'ready') {
    return {
      kind: 'unavailable',
      reason: 'repeat_permission_not_available',
      summary: 'Repeat permission is only available for a ready WorkTree decision.',
    }
  }
  if (!policy.eligibleForRepeatPermission) {
    return {
      kind: 'unavailable',
      reason: 'repeat_permission_not_available',
      summary: 'Repeat permission is not available for this exact WorkTree decision.',
    }
  }
  const result = await allowStandingRoute(input, ports)
  return composeWorkTreeRepeatPermission({
    projectId: input.projectId,
    nodeId: input.nodeId,
    generation: input.generation,
    revision: input.revision,
    workTreeRevision: input.workTreeRevision,
    proposalDigest: input.proposalDigest,
    policy,
  }, result)
}

export function composeWorkTreeRepeatPermission(
  identity: Readonly<{
    projectId: string
    nodeId: string
    generation: number
    revision: number
    workTreeRevision: number
    proposalDigest: string
    policy: WorkTreeDecisionPolicy
  }>,
  result: RepeatPermissionResult,
): WorkTreeRepeatPermissionResult {
  if (result.kind !== 'repeat_permission') return result
  return {
    kind: 'work_tree_repeat_permission',
    status: result.status,
    projectId: identity.projectId,
    nodeId: identity.nodeId,
    generation: identity.generation,
    revision: identity.revision,
    workTreeRevision: identity.workTreeRevision,
    proposalDigest: identity.proposalDigest,
    permission: result,
    policy: identity.policy,
  }
}

/** Fail closed when a permission is expired, revoked, widened or fenced stale. */
export function validateWorkTreeRepeatUse(input: WorkTreeRepeatUseInput): WorkTreeRepeatUseResult {
  const { binding } = input
  if (input.projectId !== binding.projectId || input.nodeId !== binding.nodeId) return { kind: 'refused', reason: 'identity_mismatch' }
  if (input.generation !== binding.generation) return { kind: 'refused', reason: 'generation_changed' }
  if (input.workTreeRevision !== binding.workTreeRevision) return { kind: 'refused', reason: 'revision_changed' }
  if (input.proposalDigest !== binding.proposalDigest) return { kind: 'refused', reason: 'proposal_changed' }
  if (binding.permission.status === 'withdrawn' || binding.permission.withdrawnAt !== undefined) return { kind: 'refused', reason: 'permission_revoked' }
  if (input.now < binding.permission.validFrom || input.now >= binding.permission.validUntil) return { kind: 'refused', reason: 'permission_expired' }
  if (binding.permission.delegatedCredentialId !== input.delegatedCredentialId) return { kind: 'refused', reason: 'identity_mismatch' }
  if (input.requestedSpend !== undefined) {
    const spendComparison = compareExactAmounts(input.requestedSpend, binding.permission.limits.perUseSpend)
    if (spendComparison === undefined || spendComparison === 1) return { kind: 'refused', reason: 'scope_widened' }
  }
  if ((input.requestedDataAllocations ?? 0) > binding.permission.limits.perUseDataAllocations) return { kind: 'refused', reason: 'scope_widened' }
  if ((input.requestedOccurrences ?? 1) > 1 || (input.requestedOccurrences ?? 1) > binding.permission.limits.occurrences) return { kind: 'refused', reason: 'limit_exceeded' }
  return {
    kind: 'work_tree_repeat_authorization',
    status: 'accepted',
    projectId: input.projectId,
    nodeId: input.nodeId,
    generation: input.generation,
    workTreeRevision: input.workTreeRevision,
    proposalDigest: input.proposalDigest,
    permissionRef: binding.permission.permissionRef,
    readback: { projectId: input.projectId, revision: input.workTreeRevision },
  }
}
