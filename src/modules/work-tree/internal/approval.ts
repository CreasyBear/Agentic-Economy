import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { compareExactAmounts, exactAmountSchema } from '@/modules/money/public'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { WorkNode } from './contract'

export const workTreeApprovalAuthorityKindSchema = z.literal('per_item')
export type WorkTreeApprovalAuthorityKind = z.infer<typeof workTreeApprovalAuthorityKindSchema>

export const workTreeApprovalAmountSchema = exactAmountSchema
export type WorkTreeApprovalAmount = z.infer<typeof workTreeApprovalAmountSchema>

export const workTreeApprovalAuthoritySchema = z.strictObject({
  kind: workTreeApprovalAuthorityKindSchema,
  amount: workTreeApprovalAmountSchema.optional(),
})
export type WorkTreeApprovalAuthority = z.infer<typeof workTreeApprovalAuthoritySchema>

export const workTreeApprovalIssueInputSchema = z.strictObject({
  projectId: z.string().trim().min(1).max(200),
  nodeId: z.string().trim().min(1).max(200),
  kind: z.literal('lock'),
  expectedGeneration: z.number().int().positive(),
  expectedRevision: z.number().int().positive(),
  proposalDigest: z.string().trim().min(1).max(200),
  credentialId: z.string().trim().min(1).max(200),
  authority: workTreeApprovalAuthoritySchema,
  expiresAt: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(1).max(200),
})
export type WorkTreeApprovalIssueInput = z.infer<typeof workTreeApprovalIssueInputSchema>

export const workTreeApprovalArtifactSchema = z.strictObject({
  approvalRef: z.string().trim().min(1).max(256),
  approvalDigest: z.string().trim().min(1).max(200),
  ownerId: z.string().trim().min(1).max(200),
  credentialId: z.string().trim().min(1).max(200),
  projectId: z.string().trim().min(1).max(200),
  nodeId: z.string().trim().min(1).max(200),
  proposalDigest: z.string().trim().min(1).max(200),
  authority: workTreeApprovalAuthoritySchema,
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  status: z.enum(['unused', 'consumed']),
  consumedAt: z.number().int().positive().optional(),
  consumedReceiptId: z.string().trim().min(1).max(256).optional(),
})
export type WorkTreeApprovalArtifact = z.infer<typeof workTreeApprovalArtifactSchema>

export const workTreeApprovalIssueReceiptSchema = z.strictObject({
  kind: z.literal('accepted'),
  approvalRef: z.string().trim().min(1).max(256),
  approvalDigest: z.string().trim().min(1).max(200),
  ownerId: z.string().trim().min(1).max(200),
  credentialId: z.string().trim().min(1).max(200),
  projectId: z.string().trim().min(1).max(200),
  nodeId: z.string().trim().min(1).max(200),
  proposalDigest: z.string().trim().min(1).max(200),
  authority: workTreeApprovalAuthoritySchema,
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  status: z.literal('unused'),
})
export type WorkTreeApprovalIssueReceipt = z.infer<typeof workTreeApprovalIssueReceiptSchema>

export type WorkTreeApprovalBindingCheck = Readonly<{
  ownerId: string
  credentialId: string
  projectId: string
  nodeId: string
  proposalDigest: string
  authority: WorkTreeApprovalAuthority
  now: number
}>

export type WorkTreeApprovalRefusalCode =
  | 'approval_not_found'
  | 'approval_owner_mismatch'
  | 'approval_credential_mismatch'
  | 'approval_project_mismatch'
  | 'approval_node_mismatch'
  | 'approval_proposal_mismatch'
  | 'approval_authority_mismatch'
  | 'approval_amount_mismatch'
  | 'approval_expired'
  | 'approval_used'
  | 'approval_conflict'

export type WorkTreeApprovalValidation =
  | Readonly<{ kind: 'accepted' }>
  | Readonly<{ kind: 'refused'; code: WorkTreeApprovalRefusalCode }>

export function workTreeNodeAuthorityAmount(node: WorkNode): WorkTreeApprovalAmount | undefined {
  const cost = node.cost
  if (cost === undefined) return undefined
  return cost.committed ?? cost.envelope ?? cost.estimate
}

export function workTreeApprovalMaterial(input: Readonly<{
  ownerId: string
  issue: WorkTreeApprovalIssueInput
  issuedAt: number
}>): Readonly<Record<string, unknown>> {
  return {
    ownerId: input.ownerId,
    credentialId: input.issue.credentialId,
    projectId: input.issue.projectId,
    nodeId: input.issue.nodeId,
    kind: input.issue.kind,
    expectedGeneration: input.issue.expectedGeneration,
    expectedRevision: input.issue.expectedRevision,
    proposalDigest: input.issue.proposalDigest,
    authority: input.issue.authority,
    issuedAt: input.issuedAt,
    expiresAt: input.issue.expiresAt,
  }
}

export function workTreeApprovalDigest(input: Readonly<{
  ownerId: string
  issue: WorkTreeApprovalIssueInput
  issuedAt: number
}>): string {
  return canonicalDigest(workTreeApprovalMaterial(input) as StableHashValue)
}

export function verifyWorkTreeApprovalBinding(
  artifact: Pick<WorkTreeApprovalArtifact, 'ownerId' | 'credentialId' | 'projectId' | 'nodeId' | 'proposalDigest' | 'authority' | 'expiresAt' | 'status'>,
  expected: WorkTreeApprovalBindingCheck,
): WorkTreeApprovalValidation {
  if (artifact.ownerId !== expected.ownerId) return { kind: 'refused', code: 'approval_owner_mismatch' }
  if (artifact.credentialId !== expected.credentialId) return { kind: 'refused', code: 'approval_credential_mismatch' }
  if (artifact.projectId !== expected.projectId) return { kind: 'refused', code: 'approval_project_mismatch' }
  if (artifact.nodeId !== expected.nodeId) return { kind: 'refused', code: 'approval_node_mismatch' }
  if (artifact.proposalDigest !== expected.proposalDigest) return { kind: 'refused', code: 'approval_proposal_mismatch' }
  if (artifact.authority.kind !== expected.authority.kind) return { kind: 'refused', code: 'approval_authority_mismatch' }
  const actualAmount = artifact.authority.amount
  const expectedAmount = expected.authority.amount
  if ((actualAmount === undefined) !== (expectedAmount === undefined)) {
    return { kind: 'refused', code: 'approval_amount_mismatch' }
  }
  if (actualAmount !== undefined && expectedAmount !== undefined
    && compareExactAmounts(actualAmount, expectedAmount) !== 0) {
    return { kind: 'refused', code: 'approval_amount_mismatch' }
  }
  if (expected.now >= artifact.expiresAt) return { kind: 'refused', code: 'approval_expired' }
  if (artifact.status !== 'unused') return { kind: 'refused', code: 'approval_used' }
  return { kind: 'accepted' }
}
