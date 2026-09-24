import { makeFunctionReference } from 'convex/server'
import { v, type Infer } from 'convex/values'
import type { ActionCtx, MutationCtx, QueryCtx } from '../../../_generated/server'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '../../../../src/modules/common/stable-hash'
import { enqueueDocumentRender } from './workpool'

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

export const readStatementFinalizationArgs = v.object({ documentRef: v.string() })
export const readStatementFinalizationResult = v.union(v.null(), v.object({
    documentRef: v.string(),
    accountRef: v.string(),
    residualUnits: v.string(),
    policyDigest: v.string(),
    snapshotDigest: v.string(),
  }))
export const readStatementFinalizationHandler = async (ctx: QueryCtx, args: Infer<typeof readStatementFinalizationArgs>) => {
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
  }

export const queueStatementRenderArgs = v.object({ documentRef: v.string(), adjustmentTransactionRefs: v.array(v.string()) })
export const queueStatementRenderResult = v.object({ kind: v.union(v.literal('advanced'), v.literal('replayed'), v.literal('refused')) })
export const queueStatementRenderHandler = async (ctx: MutationCtx, args: Infer<typeof queueStatementRenderArgs>) => {
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
  }

export const finalizeStatementArgs = v.object({ documentRef: v.string() })
export const finalizeStatementResult = v.object({ kind: v.literal('advanced') })
export const finalizeStatementHandler = async (ctx: ActionCtx, args: Infer<typeof finalizeStatementArgs>) => {
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
  }

