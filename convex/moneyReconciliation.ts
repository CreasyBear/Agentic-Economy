import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'

import { internalMutation, query } from './_generated/server'
import { resolveBusinessActor } from './authz'

const differenceKind = v.union(
  v.literal('processor_difference'),
  v.literal('treasury_difference'),
  v.literal('settlement_difference'),
  v.literal('document_difference'),
)
const caseKind = v.union(v.literal('projection_mismatch'), differenceKind)
const caseValue = v.object({
  caseRef: v.string(),
  accountRef: v.string(),
  kind: caseKind,
  status: v.union(v.literal('open'), v.literal('resolved')),
  ownerPrincipalRef: v.optional(v.string()),
  transactionRef: v.optional(v.string()),
  reasonCode: v.string(),
  evidenceRefs: v.array(v.string()),
  resolutionEvidenceRefs: v.optional(v.array(v.string())),
  createdAt: v.number(),
  updatedAt: v.number(),
  resolvedAt: v.optional(v.number()),
})

export const listOwnerCases = query({
  args: {
    status: v.optional(v.union(v.literal('open'), v.literal('resolved'))),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(caseValue),
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') throw new Error('money_reconciliation_authentication_required')
    if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50) {
      throw new Error('money_reconciliation_page_size_invalid')
    }
    const rows = args.status === undefined
      ? ctx.db.query('moneyReconciliationCases')
          .withIndex('by_accountRef_and_createdAt', (index) => index.eq('accountRef', actor.canonicalAccountRef))
      : ctx.db.query('moneyReconciliationCases')
          .withIndex('by_accountRef_and_status_and_createdAt', (index) => index
            .eq('accountRef', actor.canonicalAccountRef)
            .eq('status', args.status!))
    const page = await rows.order('desc').paginate(args.paginationOpts)
    return {
      ...page,
      page: page.page.map(({ _id, _creationTime, ...row }) => row),
    }
  },
})

export const openDifference = internalMutation({
  args: {
    caseRef: v.string(),
    accountRef: v.string(),
    kind: differenceKind,
    ownerPrincipalRef: v.string(),
    transactionRef: v.optional(v.string()),
    reasonCode: v.string(),
    evidenceRefs: v.array(v.string()),
    observedAt: v.number(),
  },
  returns: v.object({ kind: v.union(v.literal('opened'), v.literal('replayed')), caseRef: v.string() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('moneyReconciliationCases')
      .withIndex('by_caseRef', (index) => index.eq('caseRef', args.caseRef))
      .unique()
    if (existing !== null) {
      if (existing.accountRef !== args.accountRef
        || existing.kind !== args.kind
        || existing.reasonCode !== args.reasonCode) throw new Error('money_reconciliation_case_conflict')
      return { kind: 'replayed' as const, caseRef: existing.caseRef }
    }
    await ctx.db.insert('moneyReconciliationCases', {
      caseRef: args.caseRef,
      accountRef: args.accountRef,
      kind: args.kind,
      status: 'open',
      ownerPrincipalRef: args.ownerPrincipalRef,
      ...(args.transactionRef === undefined ? {} : { transactionRef: args.transactionRef }),
      reasonCode: args.reasonCode,
      evidenceRefs: [...args.evidenceRefs],
      createdAt: args.observedAt,
      updatedAt: args.observedAt,
    })
    return { kind: 'opened' as const, caseRef: args.caseRef }
  },
})

export const resolveDifference = internalMutation({
  args: {
    caseRef: v.string(),
    resolutionEvidenceRefs: v.array(v.string()),
    resolvedAt: v.number(),
  },
  returns: v.object({ kind: v.union(v.literal('resolved'), v.literal('replayed')), caseRef: v.string() }),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('moneyReconciliationCases')
      .withIndex('by_caseRef', (index) => index.eq('caseRef', args.caseRef))
      .unique()
    if (row === null) throw new Error('money_reconciliation_case_not_found')
    if (row.status === 'resolved') return { kind: 'replayed' as const, caseRef: row.caseRef }
    if (args.resolutionEvidenceRefs.length === 0) throw new Error('money_reconciliation_resolution_evidence_required')
    await ctx.db.patch(row._id, {
      status: 'resolved',
      resolutionEvidenceRefs: [...args.resolutionEvidenceRefs],
      resolvedAt: args.resolvedAt,
      updatedAt: args.resolvedAt,
    })
    return { kind: 'resolved' as const, caseRef: row.caseRef }
  },
})
