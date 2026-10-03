import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v, type Infer } from 'convex/values'
import type { Doc } from '../../../_generated/dataModel'
import { env, type QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { isRecord } from '../../../../src/modules/common/is-record'
import { parseTaxDocumentSnapshot } from '../../../../src/modules/money/public'
import { deploymentPaymentEnvironment } from '../../../../src/lib/deployment/environment'
import { degradeBackend } from '../../../../src/lib/observability/degrade-backend'

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

type TaxReadiness = 'ordinary' | 'ready' | 'awaiting_original' | 'invalid'

/** Shares evidence admission across the owner list and download boundary.
 * Projection only: a rendered note waits for its original without altering either
 * immutable snapshot or the worker's persisted attachment state. Ordinary receipts,
 * adjustments and signed-close documents keep their existing lifecycle. */
async function taxDocumentReadiness(ctx: QueryCtx, row: Doc<'moneyDocuments'>): Promise<TaxReadiness> {
  if (row.kind !== 'tax_invoice' && row.kind !== 'adjustment') return 'ordinary'
  let input: unknown
  try { input = JSON.parse(row.renderInputJson) }
  catch (cause) {
    return degradeBackend(cause, row.kind === 'tax_invoice' ? 'invalid' : 'ordinary', {
      site: 'taxDocumentReadiness', reason: 'invalid_response',
    })
  }
  if (!isRecord(input) || input.format !== 'ae.tax-document:v1') return row.kind === 'tax_invoice' ? 'invalid' : 'ordinary'
  const snapshot = parseTaxDocumentSnapshot(input)
  if (snapshot === undefined || snapshot.kind !== row.kind || snapshot.accountRef !== row.accountRef
    || snapshot.documentRef !== row.documentRef || snapshot.environment !== deploymentPaymentEnvironment(env)
    || snapshot.environment !== row.environment || canonicalDigest(snapshot) !== row.renderInputDigest) return 'invalid'
  if (row.state === 'issued' && (row.fileId === undefined || row.csvFileId === undefined
    || row.fileDigest === undefined || row.csvFileDigest === undefined)) return 'invalid'
  if (snapshot.kind !== 'adjustment') return 'ready'
  const original = await ctx.db.query('moneyDocuments').withIndex('by_documentRef', q => q.eq('documentRef', snapshot.original.documentRef)).unique()
  if (original === null || original.accountRef !== row.accountRef || original.environment !== row.environment
    || original.kind !== 'tax_invoice' || original.renderInputDigest !== snapshot.original.renderInputDigest) return 'invalid'
  // Recursion stops at the required tax_invoice kind above.
  if (await taxDocumentReadiness(ctx, original) !== 'ready') return 'invalid'
  return original.state === 'issued' ? 'ready' : 'awaiting_original'
}

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
      page: await Promise.all(page.page.map(async (row) => {
        const readiness = await taxDocumentReadiness(ctx, row)
        const state = readiness === 'invalid' ? 'failed' : readiness === 'awaiting_original' ? 'adjusting' : row.state
        return {
        documentRef: row.documentRef,
        kind: row.kind,
        amountUnits: row.amountUnits,
        residualUnits: row.residualUnits,
        sourceTransactionRefs: row.sourceTransactionRefs,
        policyRefs: row.policyRefs,
        policyDigest: row.policyDigest,
        renderInputDigest: row.renderInputDigest,
        templateVersion: row.templateVersion,
        state,
        sourceCount: row.sourceCount,
        ...(readiness === 'invalid' ? { failureCode: 'document_integrity_failed' }
          : row.failureCode === undefined ? {} : { failureCode: row.failureCode }),
        rendered: (state === 'issued' || state === 'awaiting_signature') && row.fileId !== undefined,
        ...(row.signedByPrincipalRef === undefined ? {} : { signedByPrincipalRef: row.signedByPrincipalRef }),
        ...(row.signedAt === undefined ? {} : { signedAt: row.signedAt }),
        ...(row.closeEvidenceDigest === undefined ? {} : { closeEvidenceDigest: row.closeEvidenceDigest }),
        createdAt: row.createdAt,
        }
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
    state: v.union(v.literal('rendering'), v.literal('awaiting_signature'), v.literal('issued')),
    fileId: v.optional(v.id('_storage')),
    fileDigest: v.optional(v.string()),
    csvFileId: v.optional(v.id('_storage')),
    csvFileDigest: v.optional(v.string()),
  }))
export const readQueuedForRenderHandler = async (ctx: QueryCtx, args: Infer<typeof readQueuedForRenderArgs>) => {
    const row = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', args.documentRef))
      .unique()
    if (row === null || (row.state !== 'rendering' && row.state !== 'awaiting_signature' && row.state !== 'issued')) return null
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

export const readOwnerDocumentUrlArgs = v.object({ documentRef: v.string(), format: v.optional(v.union(v.literal('html'), v.literal('csv'))) })
export const readOwnerDocumentUrlResult = v.union(v.null(), v.string())
export const readOwnerDocumentUrlHandler = async (ctx: QueryCtx, args: Infer<typeof readOwnerDocumentUrlArgs>) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return null
    const row = await ctx.db.query('moneyDocuments')
      .withIndex('by_documentRef', (index) => index.eq('documentRef', args.documentRef))
      .unique()
    if (row === null || row.accountRef !== actor.canonicalAccountRef
      || row.state !== 'issued' || row.fileId === undefined) return null
    const readiness = await taxDocumentReadiness(ctx, row)
    if (readiness === 'invalid' || readiness === 'awaiting_original') return null
    const fileId = args.format === 'csv' ? row.csvFileId : row.fileId
    return fileId === undefined ? null : await ctx.storage.getUrl(fileId)
  }
