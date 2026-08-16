import { nanoid } from 'nanoid'
import { mutationGeneric } from 'convex/server'
import { v } from 'convex/values'
import { internalQuery, type MutationCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'

import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { compareExactAmounts, type ExactAmount } from '../src/modules/money/public'
import {
  workTreeApprovalDigest,
  verifyWorkTreeApprovalBinding,
  workTreeNodeAuthorityAmount,
  type WorkTreeApprovalAuthority,
  type WorkTreeApprovalIssueInput,
  type WorkTreeApprovalRefusalCode,
} from '../src/modules/work-tree/convex'
import { workTreeSchema, type WorkTree } from '../src/modules/work-tree/convex'

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
  handler: async (ctx, args) => issueApproval(ctx, args),
})

export const readByApprovalRef = internalQuery({
  args: { approvalRef: v.string() },
  handler: async (ctx, args) => await ctx.db
    .query('workTreeApprovals')
    .withIndex('by_approvalRef', (query) => query.eq('approvalRef', args.approvalRef))
    .unique(),
})

type ApprovalIssueArgs = Readonly<{
  projectId: string
  nodeId: string
  kind: 'lock'
  expectedGeneration: number
  expectedRevision: number
  proposalDigest: string
  credentialId: string
  authority: WorkTreeApprovalAuthority
  expiresAt: number
  idempotencyKey: string
}>
type ApprovalContext = Pick<MutationCtx, 'db' | 'auth'>
type ApprovalRow = Doc<'workTreeApprovals'>

export type WorkTreeApprovalConsumeResult =
  | Readonly<{ kind: 'accepted'; approvalRef: string }>
  | Readonly<{ kind: 'refused'; code: WorkTreeApprovalRefusalCode }>

export async function consumeWorkTreeApproval(
  ctx: Pick<MutationCtx, 'db'>,
  input: Readonly<{
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
  const row = await ctx.db
    .query('workTreeApprovals')
    .withIndex('by_approvalRef', (query) => query.eq('approvalRef', input.approvalRef))
    .unique()
  if (row === null) return { kind: 'refused', code: 'approval_not_found' }
  const validation = verifyWorkTreeApprovalBinding({
    ownerId: row.ownerId,
    credentialId: row.credentialId,
    projectId: row.projectId,
    nodeId: row.nodeId,
    proposalDigest: row.proposalDigest,
    authority: rowAuthority(row),
    expiresAt: row.expiresAt,
    status: row.status,
  }, {
    ownerId: input.ownerId,
    credentialId: input.credentialId,
    projectId: input.projectId,
    nodeId: input.nodeId,
    proposalDigest: input.proposalDigest,
    authority: input.authority,
    now: input.now,
  })
  if (validation.kind === 'refused') return validation
  await ctx.db.patch(row._id, {
    status: 'consumed',
    consumedAt: input.now,
    consumedReceiptId: input.receiptId,
  })
  return { kind: 'accepted', approvalRef: row.approvalRef }
}

async function issueApproval(ctx: ApprovalContext, args: ApprovalIssueArgs): Promise<Record<string, unknown>> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null || typeof identity.subject !== 'string' || identity.subject.trim().length === 0) {
    return { kind: 'refused', code: 'authentication_required' }
  }
  const ownerId = identity.subject
  const credentialId = args.credentialId.trim()
  if (credentialId.length === 0) return { kind: 'refused', code: 'approval_credential_mismatch' }
  const credential = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_credentialId', (query) => query.eq('credentialId', credentialId))
    .unique()
  if (credential === null || credential.ownerId !== ownerId) {
    return { kind: 'refused', code: 'approval_credential_mismatch' }
  }
  const issue = {
    projectId: args.projectId,
    nodeId: args.nodeId,
    kind: args.kind,
    expectedGeneration: args.expectedGeneration,
    expectedRevision: args.expectedRevision,
    proposalDigest: args.proposalDigest,
    credentialId,
    authority: args.authority,
    expiresAt: args.expiresAt,
    idempotencyKey: args.idempotencyKey,
  } satisfies WorkTreeApprovalIssueInput
  const existing = await ctx.db.query('workTreeApprovals')
    .withIndex('by_ownerId_and_idempotencyKey', (query) => query.eq('ownerId', ownerId).eq('idempotencyKey', args.idempotencyKey))
    .unique()
  if (existing !== null) {
    if (!sameIssuedRequest(existing, { ownerId, issue })) return { kind: 'refused', code: 'approval_conflict' }
    return issueReceipt(existing)
  }
  const tree = await ctx.db.query('workTrees')
    .withIndex('by_projectId', (query) => query.eq('projectId', args.projectId))
    .unique()
  if (tree === null) return { kind: 'refused', code: 'not_found' }
  if (tree.ownerId !== ownerId) return { kind: 'refused', code: 'forbidden' }
  const snapshot = parseSnapshot(tree.snapshotJson)
  const target = snapshot.nodes.find((node) => node.nodeId === args.nodeId)
  if (target === undefined || target.kind !== 'decision' || target.status !== 'ready') {
    return { kind: 'refused', code: 'not_found' }
  }
  const proposalDigest = canonicalDigest({
    projectId: args.projectId,
    nodeId: args.nodeId,
    kind: args.kind,
    expectedGeneration: args.expectedGeneration,
    expectedRevision: args.expectedRevision,
  })
  if (args.proposalDigest !== proposalDigest) return { kind: 'refused', code: 'digest_mismatch' }
  if (args.expectedGeneration !== tree.generation || args.expectedRevision !== tree.revision) {
    return { kind: 'refused', code: 'stale_fence' }
  }
  const expectedAmount = workTreeNodeAuthorityAmount(target)
  if (!sameAmount(expectedAmount, args.authority.amount)) {
    return { kind: 'refused', code: 'approval_amount_mismatch' }
  }
  const issuedAt = Date.now()
  if (!Number.isSafeInteger(args.expiresAt) || args.expiresAt <= issuedAt) {
    return { kind: 'refused', code: 'approval_expired' }
  }
  const materialDigest = workTreeApprovalDigest({ ownerId, issue, issuedAt })
  const approvalRef = `work-tree-approval:${nanoid(32)}`
  const inserted = await ctx.db.insert('workTreeApprovals', {
    approvalRef,
    approvalDigest: materialDigest,
    ownerId,
    credentialId,
    projectId: args.projectId,
    nodeId: args.nodeId,
    proposalDigest: args.proposalDigest,
    authorityKind: args.authority.kind,
    ...(args.authority.amount === undefined ? {} : {
      authorityAmountCurrency: args.authority.amount.currency,
      authorityAmountUnits: args.authority.amount.units,
      authorityAmountExponent: args.authority.amount.exponent,
    }),
    expectedGeneration: args.expectedGeneration,
    expectedRevision: args.expectedRevision,
    issuedAt,
    expiresAt: args.expiresAt,
    status: 'unused',
    idempotencyKey: args.idempotencyKey,
  })
  const stored = await ctx.db.get(inserted)
  return stored === null ? { kind: 'refused', code: 'approval_not_found' } : issueReceipt(stored)
}

function issueReceipt(row: ApprovalRow): Record<string, unknown> {
  const amount = rowAmount(row)
  return {
    kind: 'accepted',
    approvalRef: row.approvalRef,
    approvalDigest: row.approvalDigest,
    ownerId: row.ownerId,
    credentialId: row.credentialId,
    projectId: row.projectId,
    nodeId: row.nodeId,
    proposalDigest: row.proposalDigest,
    authority: {
      kind: row.authorityKind,
      ...(amount === undefined ? {} : { amount }),
    },
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    status: 'unused',
  }
}

function rowAuthority(row: Pick<ApprovalRow, 'authorityKind' | 'authorityAmountCurrency' | 'authorityAmountUnits' | 'authorityAmountExponent'>): WorkTreeApprovalAuthority {
  const amount = rowAmount(row)
  return {
    kind: row.authorityKind,
    ...(amount === undefined ? {} : { amount }),
  }
}

function sameIssuedRequest(row: ApprovalRow, input: Readonly<{ ownerId: string; issue: WorkTreeApprovalIssueInput }>): boolean {
  return row.approvalDigest === workTreeApprovalDigest({
    ownerId: input.ownerId,
    issue: input.issue,
    issuedAt: row.issuedAt,
  })
    && row.ownerId === input.ownerId
    && row.credentialId === input.issue.credentialId
    && row.projectId === input.issue.projectId
    && row.nodeId === input.issue.nodeId
    && row.proposalDigest === input.issue.proposalDigest
    && row.authorityKind === input.issue.authority.kind
    && sameAmount(rowAuthority(row).amount, input.issue.authority.amount)
    && row.expiresAt === input.issue.expiresAt
    && row.expectedGeneration === input.issue.expectedGeneration
    && row.expectedRevision === input.issue.expectedRevision
}

function rowAmount(
  row: Pick<ApprovalRow, 'authorityAmountCurrency' | 'authorityAmountUnits' | 'authorityAmountExponent'>,
): ExactAmount | undefined {
  const { authorityAmountCurrency: currency, authorityAmountUnits: units, authorityAmountExponent: exponent } = row
  if (currency === undefined && units === undefined && exponent === undefined) return undefined
  if (currency === undefined || units === undefined || exponent === undefined) {
    throw new Error('approval_amount_missing')
  }
  return { currency, units, exponent }
}

function sameAmount(left: ExactAmount | undefined, right: ExactAmount | undefined): boolean {
  return left === undefined
    ? right === undefined
    : right !== undefined && compareExactAmounts(left, right) === 0
}

function parseSnapshot(snapshotJson: string): WorkTree {
  return workTreeSchema.parse(JSON.parse(snapshotJson))
}
