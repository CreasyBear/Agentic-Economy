import { vOnCompleteArgs, type OnCompleteArgs } from '@convex-dev/workpool'
import { makeFunctionReference } from 'convex/server'
import { v, type Infer } from 'convex/values'
import type { Id } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { marketDispatchWorkpool } from '../../../marketDispatchWorkpool'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'

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

export async function enqueueStatementPage(
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

export async function enqueueStatementFinalization(ctx: MutationCtx, documentRef: string): Promise<string> {
  return await marketDispatchWorkpool.enqueueAction(ctx, finalizeStatementRef, { documentRef }, {
    retry: true,
    onComplete: completeDocumentWorkRef,
    context: { documentRef },
  })
}

export const completeDocumentWorkArgs = vOnCompleteArgs(v.object({ documentRef: v.string() }))
export const completeDocumentWorkResult = v.null()
export const completeDocumentWorkHandler = async (ctx: MutationCtx, { workId, context, result }: Infer<typeof completeDocumentWorkArgs>) => {
    const row = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', context.documentRef))
      .unique()
    // Attachment committed independently of the action acknowledgement. A late
    // worker failure cannot retire the canonical files or undo readiness to sign.
    if (row === null || row.workId !== workId || row.state === 'issued' || row.state === 'awaiting_signature') return null
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
  }
