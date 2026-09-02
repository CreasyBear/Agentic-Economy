import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { resolveBusinessActor } from './authz'

const caseKind = v.union(
  v.literal('projection_mismatch'),
  v.literal('processor_difference'),
  v.literal('treasury_difference'),
  v.literal('settlement_difference'),
  v.literal('document_difference'),
)
const scopeType = v.union(
  v.literal('account'),
  v.literal('legal_customer'),
  v.literal('treasury_pool'),
  v.literal('operation'),
  v.literal('provider_obligation'),
  v.literal('document'),
)
const caseValue = v.object({
  caseRef: v.string(),
  accountRef: v.string(),
  kind: caseKind,
  status: v.union(v.literal('open'), v.literal('resolved')),
  scopeType: v.optional(scopeType),
  scopeRef: v.optional(v.string()),
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
    if (actor.kind !== 'authenticated_owner') throw new Error('money_case_authentication_required')
    if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50) {
      throw new Error('money_case_page_size_invalid')
    }
    const page = args.status === undefined
      ? await ctx.db.query('moneyReconciliationCases')
          .withIndex('by_accountRef_and_createdAt', (index) => index.eq('accountRef', actor.canonicalAccountRef))
          .order('desc')
          .paginate(args.paginationOpts)
      : await ctx.db.query('moneyReconciliationCases')
          .withIndex('by_accountRef_and_status_and_createdAt', (index) => index
            .eq('accountRef', actor.canonicalAccountRef)
            .eq('status', args.status!))
          .order('desc')
          .paginate(args.paginationOpts)
    return {
      ...page,
      page: page.page.map(({ _id, _creationTime, ...row }) => row),
    }
  },
})

export const resolveOwnerCase = mutation({
  args: {
    caseRef: v.string(),
    confirmation: v.string(),
    resolutionEvidenceRef: v.string(),
  },
  returns: v.union(
    v.object({ kind: v.literal('resolved'), caseRef: v.string() }),
    v.object({ kind: v.literal('replayed'), caseRef: v.string() }),
    v.object({ kind: v.literal('refused'), code: v.string() }),
  ),
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'refused' as const, code: 'authentication_required' }
    const row = await ctx.db.query('moneyReconciliationCases')
      .withIndex('by_caseRef', (index) => index.eq('caseRef', args.caseRef))
      .unique()
    if (row === null || row.accountRef !== actor.canonicalAccountRef) {
      return { kind: 'refused' as const, code: 'money_case_not_found' }
    }
    if (row.status === 'resolved') return { kind: 'replayed' as const, caseRef: row.caseRef }
    if (args.confirmation !== row.caseRef
      || args.resolutionEvidenceRef !== args.resolutionEvidenceRef.trim()
      || !/^[\u0020-\u007e]{1,500}$/u.test(args.resolutionEvidenceRef)) {
      return { kind: 'refused' as const, code: 'money_case_resolution_invalid' }
    }
    const now = Date.now()
    await ctx.db.patch(row._id, {
      status: 'resolved',
      ownerPrincipalRef: actor.canonicalPrincipalRef,
      resolutionEvidenceRefs: [args.resolutionEvidenceRef],
      resolvedAt: now,
      updatedAt: now,
    })
    return { kind: 'resolved' as const, caseRef: row.caseRef }
  },
})
