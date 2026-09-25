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
export const attachRenderedFileHandler = async (ctx: MutationCtx, args: Infer<typeof attachRenderedFileArgs>) => {
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
  }

