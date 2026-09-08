import { vOnCompleteArgs, type OnCompleteArgs } from '@convex-dev/workpool'
import { makeFunctionReference, paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'

import type { Id } from './_generated/dataModel'
import { internalAction, internalMutation, internalQuery, mutation, query, type MutationCtx } from './_generated/server'
import { resolveBusinessActor } from './authz'
import { marketDispatchWorkpool } from './marketDispatchWorkpool'
import { readCommercialPolicyGate } from './moneyCommercialPolicy'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '../src/modules/common/stable-hash'
import { roundAudStatementTotal } from '../src/modules/money/public'

const documentKind = v.union(
  v.literal('funding_receipt'),
  v.literal('service_fee_document'),
  v.literal('statement'),
  v.literal('daily_close'),
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
  renderInputDigest: v.string(),
  templateVersion: v.string(),
  state: v.union(
    v.literal('building'),
    v.literal('adjusting'),
    v.literal('rendering'),
    v.literal('awaiting_signature'),
    v.literal('issued'),
    v.literal('failed'),
  ),
  sourceCount: v.number(),
  failureCode: v.optional(v.string()),
  rendered: v.boolean(),
  signedByPrincipalRef: v.optional(v.string()),
  signedAt: v.optional(v.number()),
  closeEvidenceDigest: v.optional(v.string()),
  createdAt: v.number(),
})

const documentEnvironment = v.union(v.literal('sandbox'), v.literal('production'))

type StatementPage = Readonly<{
  documentRef: string
  expectedCursor: string | null
  continueCursor: string
  isDone: boolean
  transactionRefs: string[]
  exactAmountUnits: string
  pageDigest: string
}>

type StatementReadRequest = Readonly<{
  documentRef: string
  accountRef: string
  periodStartAt: number
  periodEndAt: number
  snapshotCutoffAt: number
  expectedCursor: string | null
}>

const readStatementPageRef = makeFunctionReference<'query', { documentRef: string }, StatementReadRequest | null>(
  'moneyDocuments:readStatementPage',
)
const readFormanceStatementPageRef = makeFunctionReference<'action', {
  accountRef: string; periodStartAt: number; periodEndAt: number; snapshotCutoffAt: number; cursor?: string
}, { kind: 'available'; transactionRefs: string[]; exactAmountUnits: string; continueCursor: string; isDone: boolean }
  | { kind: 'setup_required' | 'unavailable'; code: string }>('moneyFormance:readStatementPage')
const applyStatementPageRef = makeFunctionReference<'mutation', StatementPage, { kind: 'advanced' | 'replayed' | 'refused' }>(
  'moneyDocuments:applyStatementPage',
)
const runStatementPageRef = makeFunctionReference<'action', { documentRef: string }, { kind: 'advanced' | 'unavailable' }>(
  'moneyDocuments:runStatementPage',
)
const completeDocumentWorkRef = makeFunctionReference<'mutation', OnCompleteArgs<{ documentRef: string }, unknown>, null>(
  'moneyDocuments:completeDocumentWork',
)
const renderQueuedDocumentRef = makeFunctionReference<'action', { documentRef: string }, { kind: 'available'; fileId: Id<'_storage'> }>(
  'moneyDocumentRender:renderQueuedDocument',
)
const finalizeStatementRef = makeFunctionReference<'action', { documentRef: string }, { kind: 'advanced' }>(
  'moneyDocuments:finalizeStatement',
)
const readStatementFinalizationRef = makeFunctionReference<'query', { documentRef: string }, {
  documentRef: string; accountRef: string; residualUnits: string; policyDigest: string; snapshotDigest: string
} | null>('moneyDocuments:readStatementFinalization')
const bookBuyerAdjustmentRef = makeFunctionReference<'action', {
  documentRef: string; accountRef: string; residualUnits: string; policyDigest: string; snapshotDigest: string
}, { kind: 'completed'; transactionRefs: string[]; replayed: boolean }
  | { kind: 'refused'; code: string; retryable: false }
  | { kind: 'unavailable'; code: string; submissionProvenAbsent: true }
  | { kind: 'outcome_unknown'; reference: string; statusRef: string }>('moneyFormance:bookBuyerAdjustment')
const queueStatementRenderRef = makeFunctionReference<'mutation', {
  documentRef: string; adjustmentTransactionRefs: string[]
}, { kind: 'advanced' | 'replayed' | 'refused' }>('moneyDocuments:queueStatementRender')

async function enqueueStatementPage(
  ctx: MutationCtx,
  documentRef: string,
): Promise<string> {
  return await marketDispatchWorkpool.enqueueAction(ctx, runStatementPageRef, { documentRef }, {
    retry: true,
    onComplete: completeDocumentWorkRef,
    context: { documentRef },
  })
}

export async function enqueueDocumentRender(
  ctx: MutationCtx,
  documentRef: string,
): Promise<string> {
  return await marketDispatchWorkpool.enqueueAction(ctx, renderQueuedDocumentRef, { documentRef }, {
    retry: true,
    onComplete: completeDocumentWorkRef,
    context: { documentRef },
  })
}

async function enqueueStatementFinalization(ctx: MutationCtx, documentRef: string): Promise<string> {
  return await marketDispatchWorkpool.enqueueAction(ctx, finalizeStatementRef, { documentRef }, {
    retry: true,
    onComplete: completeDocumentWorkRef,
    context: { documentRef },
  })
}

export const createOwnerStatement = mutation({
  args: {
    environment: documentEnvironment,
    periodStart: v.number(),
    periodEnd: v.number(),
    purpose: v.optional(v.union(v.literal('statement'), v.literal('daily_close'))),
  },
  returns: v.union(
    v.object({ kind: v.literal('created'), documentRef: v.string() }),
    v.object({ kind: v.literal('replayed'), documentRef: v.string() }),
    v.object({ kind: v.literal('refused'), code: v.string() }),
  ),
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'refused' as const, code: 'authentication_required' }
    const purpose = args.purpose ?? 'statement'
    if (!Number.isSafeInteger(args.periodStart)
      || !Number.isSafeInteger(args.periodEnd)
      || args.periodStart < 0
      || args.periodEnd <= args.periodStart
      || args.periodEnd - args.periodStart > 366 * 24 * 60 * 60 * 1_000) {
      return { kind: 'refused' as const, code: 'statement_period_invalid' }
    }
    if (purpose === 'daily_close'
      && (args.periodEnd - args.periodStart !== 24 * 60 * 60 * 1_000
        || args.periodStart % (24 * 60 * 60 * 1_000) !== 0)) {
      return { kind: 'refused' as const, code: 'daily_close_period_invalid' }
    }
    const policy = await readCommercialPolicyGate(ctx.db, {
      environment: args.environment,
      now: Date.now(),
      ...(args.environment === 'sandbox'
        ? { sandboxFixture: 'managed_x402_deterministic_v1' as const }
        : {}),
    })
    if (policy.kind === 'refused') return { kind: 'refused' as const, code: policy.code }
    const snapshotCutoffAt = Date.now()
    const documentRef = `money-document:${purpose}:${canonicalDigest({
      format: 'ae.money-statement-identity:v2',
      accountRef: actor.canonicalAccountRef,
      environment: args.environment,
      purpose,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
    }).slice('sha256:'.length)}`
    const existing = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', documentRef))
      .unique()
    if (existing !== null) return { kind: 'replayed' as const, documentRef }
    const initialSnapshot = {
      format: 'ae.money-statement-snapshot:v2',
      documentRef,
      accountRef: actor.canonicalAccountRef,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      snapshotCutoffAt,
      purpose,
    } as const satisfies StableHashValue
    const documentId = await ctx.db.insert('moneyDocuments', {
      documentRef,
      accountRef: actor.canonicalAccountRef,
      kind: purpose,
      sourceTransactionRefs: [],
      amountUnits: '0',
      residualUnits: '0',
      policyRefs: [...policy.policyRefs],
      policyDigest: policy.policyDigest,
      templateVersion: 'ae.money-document:html:v1',
      renderInputJson: stableStringify(initialSnapshot),
      renderInputDigest: canonicalDigest(initialSnapshot),
      state: 'building',
      environment: args.environment,
      sourceCount: 0,
      snapshotDigest: canonicalDigest(initialSnapshot),
      snapshotCutoffAt,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      pageCount: 0,
      exactAmountUnits: '0',
      createdAt: snapshotCutoffAt,
    })
    const workId = await enqueueStatementPage(ctx, documentRef)
    await ctx.db.patch(documentId, { workId })
    return { kind: 'created' as const, documentRef }
  },
})

export const readStatementPage = internalQuery({
  args: { documentRef: v.string() },
  returns: v.union(v.null(), v.object({
    documentRef: v.string(),
    accountRef: v.string(),
    periodStartAt: v.number(),
    periodEndAt: v.number(),
    snapshotCutoffAt: v.number(),
    expectedCursor: v.union(v.string(), v.null()),
  })),
  handler: async (ctx, args): Promise<StatementReadRequest | null> => {
    const row = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', args.documentRef))
      .unique()
    if (row === null || (row.kind !== 'statement' && row.kind !== 'daily_close') || row.state !== 'building'
      || row.periodStart === undefined || row.periodEnd === undefined
      || row.snapshotCutoffAt === undefined) return null
    return {
      documentRef: row.documentRef,
      accountRef: row.accountRef,
      periodStartAt: row.periodStart,
      periodEndAt: row.periodEnd,
      snapshotCutoffAt: row.snapshotCutoffAt,
      expectedCursor: row.nextCursor ?? null,
    }
  },
})

export const applyStatementPage = internalMutation({
  args: {
    documentRef: v.string(),
    expectedCursor: v.union(v.string(), v.null()),
    continueCursor: v.string(),
    isDone: v.boolean(),
    transactionRefs: v.array(v.string()),
    exactAmountUnits: v.string(),
    pageDigest: v.string(),
  },
  returns: v.object({ kind: v.union(v.literal('advanced'), v.literal('replayed'), v.literal('refused')) }),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', args.documentRef))
      .unique()
    if (row === null || (row.kind !== 'statement' && row.kind !== 'daily_close')) return { kind: 'refused' as const }
    if (row.state !== 'building') return { kind: 'replayed' as const }
    const currentCursor = row.nextCursor ?? null
    if (currentCursor !== args.expectedCursor) {
      const prior = await ctx.db.query('moneyDocumentSnapshotPages')
        .withIndex('by_pageRef', (index) => index.eq('pageRef', `money-document-page:${args.pageDigest}`))
        .unique()
      return { kind: prior === null ? 'refused' as const : 'replayed' as const }
    }
    if (!/^(0|[1-9]\d{0,77})$/u.test(args.exactAmountUnits)) return { kind: 'refused' as const }
    const expectedDigest = canonicalDigest({
      format: 'ae.money-statement-page:v1',
      documentRef: row.documentRef,
      expectedCursor: args.expectedCursor ?? 'start',
      continueCursor: args.continueCursor,
      isDone: args.isDone,
      transactionRefs: args.transactionRefs,
      exactAmountUnits: args.exactAmountUnits,
    })
    if (expectedDigest !== args.pageDigest) return { kind: 'refused' as const }
    const position = row.pageCount ?? 0
    const pageRef = `money-document-page:${args.pageDigest}`
    if (args.transactionRefs.length > 0) {
      await ctx.db.insert('moneyDocumentSnapshotPages', {
        pageRef,
        documentRef: row.documentRef,
        accountRef: row.accountRef,
        position,
        transactionRefs: [...args.transactionRefs],
        exactAmountUnits: args.exactAmountUnits,
        pageDigest: args.pageDigest,
        createdAt: Date.now(),
      })
    }
    const nextExactUnits = (BigInt(row.exactAmountUnits ?? '0') + BigInt(args.exactAmountUnits)).toString()
    const nextSourceCount = row.sourceCount + args.transactionRefs.length
    const nextSnapshotDigest = canonicalDigest({
      format: 'ae.money-statement-snapshot-chain:v1',
      previousDigest: row.snapshotDigest,
      pageDigest: args.pageDigest,
    })
    const sourceTransactionRefs = [...row.sourceTransactionRefs, ...args.transactionRefs].slice(0, 32)
    if (!args.isDone) {
      const workId = await enqueueStatementPage(ctx, row.documentRef)
      await ctx.db.patch(row._id, {
        sourceTransactionRefs,
        sourceCount: nextSourceCount,
        exactAmountUnits: nextExactUnits,
        snapshotDigest: nextSnapshotDigest,
        nextCursor: args.continueCursor,
        pageCount: position + 1,
        workId,
      })
      return { kind: 'advanced' as const }
    }
    const rounded = roundAudStatementTotal(BigInt(nextExactUnits))
    const workId = await enqueueStatementFinalization(ctx, row.documentRef)
    await ctx.db.patch(row._id, {
      sourceTransactionRefs,
      sourceCount: nextSourceCount,
      exactAmountUnits: nextExactUnits,
      amountUnits: rounded.roundedUnits.toString(),
      residualUnits: rounded.residualUnits.toString(),
      snapshotDigest: nextSnapshotDigest,
      nextCursor: args.continueCursor,
      pageCount: position + 1,
      state: 'adjusting',
      workId,
    })
    return { kind: 'advanced' as const }
  },
})

export const runStatementPage = internalAction({
  args: { documentRef: v.string() },
  returns: v.object({ kind: v.union(v.literal('advanced'), v.literal('unavailable')) }),
  handler: async (ctx, args) => {
    const request = await ctx.runQuery(readStatementPageRef, args)
    if (request === null) return { kind: 'unavailable' as const }
    const read = await ctx.runAction(readFormanceStatementPageRef, {
      accountRef: request.accountRef,
      periodStartAt: request.periodStartAt,
      periodEndAt: request.periodEndAt,
      snapshotCutoffAt: request.snapshotCutoffAt,
      ...(request.expectedCursor === null ? {} : { cursor: request.expectedCursor }),
    })
    if (read.kind !== 'available') throw new Error(read.code)
    const page: StatementPage = {
      documentRef: request.documentRef,
      expectedCursor: request.expectedCursor,
      continueCursor: read.continueCursor,
      isDone: read.isDone,
      transactionRefs: read.transactionRefs,
      exactAmountUnits: read.exactAmountUnits,
      pageDigest: canonicalDigest({
        format: 'ae.money-statement-page:v1',
        documentRef: request.documentRef,
        expectedCursor: request.expectedCursor ?? 'start',
        continueCursor: read.continueCursor,
        isDone: read.isDone,
        transactionRefs: read.transactionRefs,
        exactAmountUnits: read.exactAmountUnits,
      }),
    }
    const result = await ctx.runMutation(applyStatementPageRef, page)
    return { kind: result.kind === 'refused' ? 'unavailable' as const : 'advanced' as const }
  },
})

export const readStatementFinalization = internalQuery({
  args: { documentRef: v.string() },
  returns: v.union(v.null(), v.object({
    documentRef: v.string(),
    accountRef: v.string(),
    residualUnits: v.string(),
    policyDigest: v.string(),
    snapshotDigest: v.string(),
  })),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', args.documentRef))
      .unique()
    if (row === null || row.state !== 'adjusting'
      || (row.kind !== 'statement' && row.kind !== 'daily_close')) return null
    return {
      documentRef: row.documentRef,
      accountRef: row.accountRef,
      residualUnits: row.residualUnits,
      policyDigest: row.policyDigest,
      snapshotDigest: row.snapshotDigest,
    }
  },
})

export const queueStatementRender = internalMutation({
  args: { documentRef: v.string(), adjustmentTransactionRefs: v.array(v.string()) },
  returns: v.object({ kind: v.union(v.literal('advanced'), v.literal('replayed'), v.literal('refused')) }),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', args.documentRef))
      .unique()
    if (row === null || (row.kind !== 'statement' && row.kind !== 'daily_close')) {
      return { kind: 'refused' as const }
    }
    if (row.state === 'rendering' || row.state === 'awaiting_signature' || row.state === 'issued') {
      return { kind: 'replayed' as const }
    }
    if (row.state !== 'adjusting'
      || args.adjustmentTransactionRefs.length > 1
      || (row.residualUnits === '0') !== (args.adjustmentTransactionRefs.length === 0)
      || row.periodStart === undefined
      || row.periodEnd === undefined
      || row.snapshotCutoffAt === undefined) return { kind: 'refused' as const }
    const sourceTransactionRefs = [...row.sourceTransactionRefs, ...args.adjustmentTransactionRefs].slice(0, 32)
    const renderInput = {
      format: 'ae.money-document-render-input:v3',
      documentRef: row.documentRef,
      accountRef: row.accountRef,
      kind: row.kind,
      currency: 'AUD',
      exponent: 6,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      snapshotCutoffAt: row.snapshotCutoffAt,
      exactCallUnits: row.exactAmountUnits ?? '0',
      roundedCallUnits: row.amountUnits,
      residualUnits: row.residualUnits,
      sourceCount: row.sourceCount,
      adjustmentTransactionRefs: args.adjustmentTransactionRefs,
      snapshotDigest: row.snapshotDigest,
      policyRefs: row.policyRefs,
      policyDigest: row.policyDigest,
    } as const satisfies StableHashValue
    const workId = await enqueueDocumentRender(ctx, row.documentRef)
    await ctx.db.patch(row._id, {
      sourceTransactionRefs,
      renderInputJson: stableStringify(renderInput),
      renderInputDigest: canonicalDigest(renderInput),
      state: 'rendering',
      workId,
    })
    return { kind: 'advanced' as const }
  },
})

export const finalizeStatement = internalAction({
  args: { documentRef: v.string() },
  returns: v.object({ kind: v.literal('advanced') }),
  handler: async (ctx, args) => {
    const input = await ctx.runQuery(readStatementFinalizationRef, args)
    if (input === null) return { kind: 'advanced' as const }
    let adjustmentTransactionRefs: string[] = []
    if (input.residualUnits !== '0') {
      const result = await ctx.runAction(bookBuyerAdjustmentRef, input)
      if (result.kind !== 'completed') {
        throw new Error(result.kind === 'outcome_unknown' ? 'document_adjustment_outcome_unknown' : result.code)
      }
      adjustmentTransactionRefs = result.transactionRefs
    }
    const queued = await ctx.runMutation(queueStatementRenderRef, {
      documentRef: input.documentRef,
      adjustmentTransactionRefs,
    })
    if (queued.kind === 'refused') throw new Error('money_document_finalize_conflict')
    return { kind: 'advanced' as const }
  },
})

export const completeDocumentWork = internalMutation({
  args: vOnCompleteArgs(v.object({ documentRef: v.string() })),
  returns: v.null(),
  handler: async (ctx, { workId, context, result }) => {
    const row = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', context.documentRef))
      .unique()
    if (row === null || row.workId !== workId || row.state === 'issued') return null
    if (result.kind !== 'success') {
      const now = Date.now()
      const failureCode = result.kind === 'canceled' ? 'document_work_canceled' : 'document_work_failed'
      await ctx.db.patch(row._id, {
        state: 'failed',
        failureCode,
      })
      const caseRef = `money-case:${canonicalDigest({ format: 'ae.money-document-case:v1', documentRef: row.documentRef }).slice('sha256:'.length)}`
      const existing = await ctx.db.query('moneyReconciliationCases')
        .withIndex('by_caseRef', (index) => index.eq('caseRef', caseRef))
        .unique()
      const transactionRef = row.sourceTransactionRefs[row.sourceTransactionRefs.length - 1]
      if (existing === null) await ctx.db.insert('moneyReconciliationCases', {
        caseRef,
        accountRef: row.accountRef,
        kind: 'document_difference',
        status: 'open',
        scopeType: row.kind === 'daily_close' ? 'account' : 'document',
        scopeRef: row.kind === 'daily_close' ? row.accountRef : row.documentRef,
        ...(transactionRef === undefined ? {} : { transactionRef }),
        reasonCode: failureCode,
        evidenceRefs: [row.documentRef, row.snapshotDigest],
        createdAt: now,
        updatedAt: now,
      })
    }
    return null
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
        renderInputDigest: row.renderInputDigest,
        templateVersion: row.templateVersion,
        state: row.state,
        sourceCount: row.sourceCount,
        ...(row.failureCode === undefined ? {} : { failureCode: row.failureCode }),
        rendered: (row.state === 'issued' || row.state === 'awaiting_signature') && row.fileId !== undefined,
        ...(row.signedByPrincipalRef === undefined ? {} : { signedByPrincipalRef: row.signedByPrincipalRef }),
        ...(row.signedAt === undefined ? {} : { signedAt: row.signedAt }),
        ...(row.closeEvidenceDigest === undefined ? {} : { closeEvidenceDigest: row.closeEvidenceDigest }),
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
    state: v.union(v.literal('rendering'), v.literal('issued')),
    fileId: v.optional(v.id('_storage')),
    fileDigest: v.optional(v.string()),
    csvFileId: v.optional(v.id('_storage')),
    csvFileDigest: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return null
    const row = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', args.documentRef))
      .unique()
    if (row === null || row.accountRef !== actor.canonicalAccountRef
      || (row.state !== 'rendering' && row.state !== 'issued')) return null
    return {
      documentRef: row.documentRef,
      renderInputJson: row.renderInputJson,
      renderInputDigest: row.renderInputDigest,
      templateVersion: row.templateVersion,
      state: row.state,
      ...(row.fileId === undefined ? {} : { fileId: row.fileId }),
      ...(row.fileDigest === undefined ? {} : { fileDigest: row.fileDigest }),
      ...(row.csvFileId === undefined ? {} : { csvFileId: row.csvFileId }),
      ...(row.csvFileDigest === undefined ? {} : { csvFileDigest: row.csvFileDigest }),
    }
  },
})

export const readQueuedForRender = internalQuery({
  args: { documentRef: v.string() },
  returns: v.union(v.null(), v.object({
    documentRef: v.string(),
    renderInputJson: v.string(),
    renderInputDigest: v.string(),
    templateVersion: v.string(),
    state: v.union(v.literal('rendering'), v.literal('issued')),
    fileId: v.optional(v.id('_storage')),
    fileDigest: v.optional(v.string()),
    csvFileId: v.optional(v.id('_storage')),
    csvFileDigest: v.optional(v.string()),
  })),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', args.documentRef))
      .unique()
    if (row === null || (row.state !== 'rendering' && row.state !== 'issued')) return null
    return {
      documentRef: row.documentRef,
      renderInputJson: row.renderInputJson,
      renderInputDigest: row.renderInputDigest,
      templateVersion: row.templateVersion,
      state: row.state,
      ...(row.fileId === undefined ? {} : { fileId: row.fileId }),
      ...(row.fileDigest === undefined ? {} : { fileDigest: row.fileDigest }),
      ...(row.csvFileId === undefined ? {} : { csvFileId: row.csvFileId }),
      ...(row.csvFileDigest === undefined ? {} : { csvFileDigest: row.csvFileDigest }),
    }
  },
})

export const attachRenderedFile = internalMutation({
  args: {
    documentRef: v.string(),
    renderInputDigest: v.string(),
    fileId: v.id('_storage'),
    fileDigest: v.string(),
    csvFileId: v.id('_storage'),
    csvFileDigest: v.string(),
    renderedAt: v.number(),
  },
  returns: v.union(
    v.object({ kind: v.literal('attached'), fileId: v.id('_storage'), csvFileId: v.id('_storage') }),
    v.object({ kind: v.literal('replayed'), fileId: v.id('_storage'), csvFileId: v.id('_storage') }),
    v.object({ kind: v.literal('refused') }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', args.documentRef))
      .unique()
    if (row === null || row.renderInputDigest !== args.renderInputDigest || row.state !== 'rendering') {
      return { kind: 'refused' as const }
    }
    if (row.fileId !== undefined && row.csvFileId !== undefined) {
      return { kind: 'replayed' as const, fileId: row.fileId, csvFileId: row.csvFileId }
    }
    await ctx.db.patch(row._id, {
      fileId: args.fileId,
      fileDigest: args.fileDigest,
      csvFileId: args.csvFileId,
      csvFileDigest: args.csvFileDigest,
      state: row.kind === 'daily_close' ? 'awaiting_signature' : 'issued',
      failureCode: undefined,
      renderedAt: args.renderedAt,
    })
    return { kind: 'attached' as const, fileId: args.fileId, csvFileId: args.csvFileId }
  },
})

export const signOwnerDailyClose = mutation({
  args: {
    documentRef: v.string(),
    expectedRenderInputDigest: v.string(),
    confirmation: v.string(),
  },
  returns: v.union(
    v.object({ kind: v.literal('signed'), documentRef: v.string(), evidenceDigest: v.string() }),
    v.object({ kind: v.literal('replayed'), documentRef: v.string(), evidenceDigest: v.string() }),
    v.object({ kind: v.literal('refused'), code: v.string() }),
  ),
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'refused' as const, code: 'authentication_required' }
    const row = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', args.documentRef))
      .unique()
    if (row === null || row.accountRef !== actor.canonicalAccountRef || row.kind !== 'daily_close') {
      return { kind: 'refused' as const, code: 'daily_close_not_found' }
    }
    if (row.closeEvidenceDigest !== undefined) {
      return { kind: 'replayed' as const, documentRef: row.documentRef, evidenceDigest: row.closeEvidenceDigest }
    }
    if (row.state !== 'awaiting_signature'
      || row.renderInputDigest !== args.expectedRenderInputDigest
      || args.confirmation !== row.documentRef
      || row.fileDigest === undefined
      || row.csvFileDigest === undefined) {
      return { kind: 'refused' as const, code: 'daily_close_confirmation_invalid' }
    }
    const signedAt = Date.now()
    const evidenceDigest = canonicalDigest({
      format: 'ae.money-daily-close-signature:v1',
      documentRef: row.documentRef,
      renderInputDigest: row.renderInputDigest,
      fileDigest: row.fileDigest,
      csvFileDigest: row.csvFileDigest,
      snapshotDigest: row.snapshotDigest,
      signedByPrincipalRef: actor.canonicalPrincipalRef,
      signedAt,
    })
    await ctx.db.patch(row._id, {
      state: 'issued',
      signedByPrincipalRef: actor.canonicalPrincipalRef,
      signedAt,
      closeEvidenceDigest: evidenceDigest,
    })
    return { kind: 'signed' as const, documentRef: row.documentRef, evidenceDigest }
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
    if (row === null || row.accountRef !== actor.canonicalAccountRef
      || row.state !== 'issued' || row.fileId === undefined) return null
    return await ctx.storage.getUrl(row.fileId)
  },
})
