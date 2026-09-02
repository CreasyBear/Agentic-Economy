import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'

import { internalMutation, internalQuery, mutation, query } from './_generated/server'
import { resolveBusinessActor } from './authz'
import { readCommercialPolicyGate } from './moneyCommercialPolicy'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '../src/modules/common/stable-hash'
import { roundAudStatementTotal } from '../src/modules/money/public'

const documentKind = v.union(
  v.literal('funding_receipt'),
  v.literal('service_fee_document'),
  v.literal('statement'),
  v.literal('adjustment'),
  v.literal('tax_invoice'),
)

const documentValue = v.object({
  documentRef: v.string(),
  kind: documentKind,
  amountUnits: v.string(),
  residualUnits: v.string(),
  sourceTransactionRefs: v.array(v.string()),
  policyRefs: v.array(v.string()),
  policyDigest: v.string(),
  templateVersion: v.string(),
  rendered: v.boolean(),
  createdAt: v.number(),
})

const documentEnvironment = v.union(v.literal('sandbox'), v.literal('production'))

export const createOwnerStatement = mutation({
  args: {
    environment: documentEnvironment,
    periodStart: v.number(),
    periodEnd: v.number(),
  },
  returns: v.union(
    v.object({ kind: v.literal('created'), documentRef: v.string() }),
    v.object({ kind: v.literal('replayed'), documentRef: v.string() }),
    v.object({ kind: v.literal('refused'), code: v.string() }),
  ),
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'refused' as const, code: 'authentication_required' }
    if (!Number.isSafeInteger(args.periodStart)
      || !Number.isSafeInteger(args.periodEnd)
      || args.periodStart < 0
      || args.periodEnd <= args.periodStart
      || args.periodEnd - args.periodStart > 366 * 24 * 60 * 60 * 1_000) {
      return { kind: 'refused' as const, code: 'statement_period_invalid' }
    }
    const policy = await readCommercialPolicyGate(ctx.db, {
      environment: args.environment,
      now: Date.now(),
      ...(args.environment === 'sandbox'
        ? { sandboxFixture: 'managed_x402_deterministic_v1' as const }
        : {}),
    })
    if (policy.kind === 'refused') return { kind: 'refused' as const, code: policy.code }
    const transactions = await ctx.db.query('moneyLedgerTransactions')
      .withIndex('by_accountRef_and_recordedAt', (index) => index
        .eq('accountRef', actor.canonicalAccountRef)
        .gte('recordedAt', args.periodStart)
        .lt('recordedAt', args.periodEnd))
      .take(501)
    if (transactions.length > 500) return { kind: 'refused' as const, code: 'statement_period_too_large' }
    const calls = transactions.filter((transaction) => transaction.kind === 'call_settlement')
    if (calls.length === 0) return { kind: 'refused' as const, code: 'statement_has_no_calls' }
    const exactUnits = calls.reduce((sum, transaction) => sum + BigInt(transaction.debitUnits), 0n)
    const rounded = roundAudStatementTotal(exactUnits)
    const sourceTransactionRefs = calls.map((transaction) => transaction.transactionRef)
    const documentRef = `money-document:statement:${canonicalDigest({
      format: 'ae.money-statement-identity:v1',
      accountRef: actor.canonicalAccountRef,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      sourceTransactionRefs,
    }).slice('sha256:'.length)}`
    const existing = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', documentRef))
      .unique()
    if (existing !== null) return { kind: 'replayed' as const, documentRef }
    const renderInput = {
      format: 'ae.money-document-render-input:v1',
      documentRef,
      accountRef: actor.canonicalAccountRef,
      kind: 'statement',
      currency: 'AUD',
      exponent: 6,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      exactCallUnits: exactUnits.toString(),
      roundedCallUnits: rounded.roundedUnits.toString(),
      residualUnits: rounded.residualUnits.toString(),
      sourceTransactionRefs,
      policyRefs: policy.policyRefs,
      policyDigest: policy.policyDigest,
    } as const satisfies StableHashValue
    await ctx.db.insert('moneyDocuments', {
      documentRef,
      accountRef: actor.canonicalAccountRef,
      kind: 'statement',
      sourceTransactionRefs,
      amountUnits: rounded.roundedUnits.toString(),
      residualUnits: rounded.residualUnits.toString(),
      policyRefs: [...policy.policyRefs],
      policyDigest: policy.policyDigest,
      templateVersion: 'ae.money-document:text:v1',
      renderInputJson: stableStringify(renderInput),
      renderInputDigest: canonicalDigest(renderInput),
      createdAt: Date.now(),
    })
    return { kind: 'created' as const, documentRef }
  },
})

export const listOwnerDocuments = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(documentValue),
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') throw new Error('money_document_authentication_required')
    if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50) {
      throw new Error('money_document_page_size_invalid')
    }
    const page = await ctx.db.query('moneyDocuments')
      .withIndex('by_accountRef_and_createdAt', (index) => index.eq('accountRef', actor.canonicalAccountRef))
      .order('desc')
      .paginate(args.paginationOpts)
    return {
      ...page,
      page: page.page.map((row) => ({
        documentRef: row.documentRef,
        kind: row.kind,
        amountUnits: row.amountUnits,
        residualUnits: row.residualUnits,
        sourceTransactionRefs: row.sourceTransactionRefs,
        policyRefs: row.policyRefs,
        policyDigest: row.policyDigest,
        templateVersion: row.templateVersion,
        rendered: row.fileId !== undefined,
        createdAt: row.createdAt,
      })),
    }
  },
})

export const readForRender = internalQuery({
  args: { documentRef: v.string() },
  returns: v.union(v.null(), v.object({
    documentRef: v.string(),
    renderInputJson: v.string(),
    renderInputDigest: v.string(),
    templateVersion: v.string(),
    fileId: v.optional(v.id('_storage')),
    fileDigest: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return null
    const row = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', args.documentRef))
      .unique()
    if (row === null || row.accountRef !== actor.canonicalAccountRef) return null
    return {
      documentRef: row.documentRef,
      renderInputJson: row.renderInputJson,
      renderInputDigest: row.renderInputDigest,
      templateVersion: row.templateVersion,
      ...(row.fileId === undefined ? {} : { fileId: row.fileId }),
      ...(row.fileDigest === undefined ? {} : { fileDigest: row.fileDigest }),
    }
  },
})

export const attachRenderedFile = internalMutation({
  args: {
    documentRef: v.string(),
    renderInputDigest: v.string(),
    fileId: v.id('_storage'),
    fileDigest: v.string(),
    renderedAt: v.number(),
  },
  returns: v.union(
    v.object({ kind: v.literal('attached'), fileId: v.id('_storage') }),
    v.object({ kind: v.literal('replayed'), fileId: v.id('_storage') }),
    v.object({ kind: v.literal('refused') }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', args.documentRef))
      .unique()
    if (row === null || row.renderInputDigest !== args.renderInputDigest) return { kind: 'refused' as const }
    if (row.fileId !== undefined) return { kind: 'replayed' as const, fileId: row.fileId }
    await ctx.db.patch(row._id, {
      fileId: args.fileId,
      fileDigest: args.fileDigest,
      renderedAt: args.renderedAt,
    })
    return { kind: 'attached' as const, fileId: args.fileId }
  },
})

export const readOwnerDocumentUrl = query({
  args: { documentRef: v.string() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return null
    const row = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', args.documentRef))
      .unique()
    if (row === null || row.accountRef !== actor.canonicalAccountRef || row.fileId === undefined) return null
    return await ctx.storage.getUrl(row.fileId)
  },
})
