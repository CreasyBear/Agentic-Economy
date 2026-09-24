import { makeFunctionReference } from 'convex/server'
import { v, type Infer } from 'convex/values'
import type { ActionCtx, MutationCtx, QueryCtx } from '../../../_generated/server'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { roundAudStatementTotal } from '../../../../src/modules/money/public'
import { enqueueStatementPage, enqueueStatementFinalization } from './workpool'

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

export const readStatementPageArgs = v.object({ documentRef: v.string() })
export const readStatementPageResult = v.union(v.null(), v.object({
    documentRef: v.string(),
    accountRef: v.string(),
    periodStartAt: v.number(),
    periodEndAt: v.number(),
    snapshotCutoffAt: v.number(),
    expectedCursor: v.union(v.string(), v.null()),
  }))
export const readStatementPageHandler = async (ctx: QueryCtx, args: Infer<typeof readStatementPageArgs>): Promise<StatementReadRequest | null> => {
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
  }

export const applyStatementPageArgs = v.object({
    documentRef: v.string(),
    expectedCursor: v.union(v.string(), v.null()),
    continueCursor: v.string(),
    isDone: v.boolean(),
    transactionRefs: v.array(v.string()),
    exactAmountUnits: v.string(),
    pageDigest: v.string(),
  })
export const applyStatementPageResult = v.object({ kind: v.union(v.literal('advanced'), v.literal('replayed'), v.literal('refused')) })
export const applyStatementPageHandler = async (ctx: MutationCtx, args: Infer<typeof applyStatementPageArgs>) => {
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
  }

export const runStatementPageArgs = v.object({ documentRef: v.string() })
export const runStatementPageResult = v.object({ kind: v.union(v.literal('advanced'), v.literal('unavailable')) })
export const runStatementPageHandler = async (ctx: ActionCtx, args: Infer<typeof runStatementPageArgs>) => {
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
  }

