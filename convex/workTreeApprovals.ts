import { mutationGeneric } from 'convex/server'
import { v } from 'convex/values'
import { internalQuery, type MutationCtx } from './_generated/server'
import { unlistedWorkTreeTables } from './customerRequestUnlisted'

import {
  type WorkTreeApprovalAuthority,
  type WorkTreeApprovalRefusalCode,
} from '../src/modules/work-tree/convex'

const exactAmountArg = v.object({ currency: v.string(), units: v.string(), exponent: v.number() })
const authorityArg = v.object({
  kind: v.literal('per_item'),
  amount: v.optional(exactAmountArg),
})
const issueArgs = {
  projectId: v.string(),
  nodeId: v.string(),
  kind: v.literal('lock'),
  expectedGeneration: v.number(),
  expectedRevision: v.number(),
  proposalDigest: v.string(),
  credentialId: v.string(),
  authority: authorityArg,
  expiresAt: v.number(),
  idempotencyKey: v.string(),
}

export const issue = mutationGeneric({
  args: issueArgs,
  handler: async () => ({ kind: 'refused' as const, code: 'work_tree_tables_unlisted' }),
})

export const readByApprovalRef = internalQuery({
  args: { approvalRef: v.string() },
  handler: async () => null,
})

export type WorkTreeApprovalConsumeResult =
  | Readonly<{ kind: 'accepted'; approvalRef: string }>
  | Readonly<{ kind: 'refused'; code: WorkTreeApprovalRefusalCode }>

export async function consumeWorkTreeApproval(
  _ctx: Pick<MutationCtx, 'db'>,
  _input: Readonly<{
    approvalRef: string
    ownerId: string
    credentialId: string
    projectId: string
    nodeId: string
    proposalDigest: string
    authority: WorkTreeApprovalAuthority
    receiptId: string
    now: number
  }>,
): Promise<WorkTreeApprovalConsumeResult> {
  return unlistedWorkTreeTables()
}
