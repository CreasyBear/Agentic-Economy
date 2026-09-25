import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v, type Infer } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'

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

export const listOwnerDocumentsArgs = v.object({ paginationOpts: paginationOptsValidator })
export const listOwnerDocumentsResult = paginationResultValidator(documentValue)
export const listOwnerDocumentsHandler = async (ctx: QueryCtx, args: Infer<typeof listOwnerDocumentsArgs>) => {
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
  }

export const readForRenderArgs = v.object({ documentRef: v.string() })
export const readForRenderResult = v.union(v.null(), v.object({
    documentRef: v.string(),
    renderInputJson: v.string(),
    renderInputDigest: v.string(),
    templateVersion: v.string(),
    state: v.union(v.literal('rendering'), v.literal('issued')),
    fileId: v.optional(v.id('_storage')),
    fileDigest: v.optional(v.string()),
    csvFileId: v.optional(v.id('_storage')),
    csvFileDigest: v.optional(v.string()),
  }))
export const readForRenderHandler = async (ctx: QueryCtx, args: Infer<typeof readForRenderArgs>) => {
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
  }

export const readQueuedForRenderArgs = v.object({ documentRef: v.string() })
export const readQueuedForRenderResult = v.union(v.null(), v.object({
    documentRef: v.string(),
    renderInputJson: v.string(),
    renderInputDigest: v.string(),
    templateVersion: v.string(),
    state: v.union(v.literal('rendering'), v.literal('issued')),
    fileId: v.optional(v.id('_storage')),
    fileDigest: v.optional(v.string()),
    csvFileId: v.optional(v.id('_storage')),
    csvFileDigest: v.optional(v.string()),
  }))
export const readQueuedForRenderHandler = async (ctx: QueryCtx, args: Infer<typeof readQueuedForRenderArgs>) => {
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
  }

export const readOwnerDocumentUrlArgs = v.object({ documentRef: v.string() })
export const readOwnerDocumentUrlResult = v.union(v.null(), v.string())
export const readOwnerDocumentUrlHandler = async (ctx: QueryCtx, args: Infer<typeof readOwnerDocumentUrlArgs>) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return null
    const row = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', args.documentRef))
      .unique()
    if (row === null || row.accountRef !== actor.canonicalAccountRef
      || row.state !== 'issued' || row.fileId === undefined) return null
    return await ctx.storage.getUrl(row.fileId)
  }

