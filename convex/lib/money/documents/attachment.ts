import {enqueueDocumentUsageAlert} from '../../principalAccount/notifications/usageAlerts'
import { v, type Infer } from 'convex/values'
import type { MutationCtx } from '../../../_generated/server'

export const attachRenderedFileArgs = v.object({
    documentRef: v.string(),
    renderInputDigest: v.string(),
    fileId: v.id('_storage'),
    fileDigest: v.string(),
    csvFileId: v.id('_storage'),
    csvFileDigest: v.string(),
    renderedAt: v.number(),
  })
export const attachRenderedFileResult = v.union(
    v.object({ kind: v.literal('attached'), fileId: v.id('_storage'), csvFileId: v.id('_storage') }),
    v.object({ kind: v.literal('replayed'), fileId: v.id('_storage'), csvFileId: v.id('_storage') }),
    v.object({ kind: v.literal('refused') }),
  )
/** Requires the frozen render input. Ensures one immutable attachment pair;
 * concurrent/repeated matching renders return that pair without replacing it.
 * Conflicting material or incomplete attachments are refused without writes. */
export const attachRenderedFileHandler = async (ctx: MutationCtx, args: Infer<typeof attachRenderedFileArgs>) => {
    const row = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', args.documentRef))
      .unique()
    if (row === null || row.renderInputDigest !== args.renderInputDigest) {
      return { kind: 'refused' as const }
    }
    if (row.fileId !== undefined && row.csvFileId !== undefined) {
      if (row.fileDigest !== args.fileDigest || row.csvFileDigest !== args.csvFileDigest) {
        return { kind: 'refused' as const }
      }
      return { kind: 'replayed' as const, fileId: row.fileId, csvFileId: row.csvFileId }
    }
    if (row.state !== 'rendering' || row.fileId !== undefined || row.csvFileId !== undefined) {
      return { kind: 'refused' as const }
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
    if(row.kind==='monthly_usage')await enqueueDocumentUsageAlert(ctx,row.documentRef)
    return { kind: 'attached' as const, fileId: args.fileId, csvFileId: args.csvFileId }
  }
