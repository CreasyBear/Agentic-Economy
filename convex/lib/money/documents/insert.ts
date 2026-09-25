import { v } from 'convex/values'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '../../../../src/modules/common/stable-hash'
import { enqueueDocumentRender } from './workpool'

export const documentEnvironment = v.union(v.literal('sandbox'), v.literal('production'))

type IssuedKind = Extract<Doc<'moneyDocuments'>['kind'],
  'funding_receipt' | 'service_fee_document' | 'adjustment' | 'tax_invoice'>
type DocumentInput = Readonly<{
  renderInput: StableHashValue
  accountRef: string
  kind: IssuedKind
  sourceTransactionRef: string
  amountUnits: string
  policyRefs: readonly string[]
  policyDigest: string
  environment: Doc<'moneyDocuments'>['environment']
  occurredAt: number
}>

export async function createAndQueueDocument(
  ctx: MutationCtx,
  documentRef: string,
  buildInput: () => DocumentInput,
): Promise<boolean> {
  const existing = await ctx.db.query('moneyDocuments')
    .withIndex('by_documentRef', (index) => index.eq('documentRef', documentRef))
    .unique()
  if (existing !== null) return false
  const input = buildInput()
  const renderInputJson = stableStringify(input.renderInput)
  const renderInputDigest = canonicalDigest(input.renderInput)
  const documentId = await ctx.db.insert('moneyDocuments', {
    documentRef,
    accountRef: input.accountRef,
    kind: input.kind,
    sourceTransactionRefs: [input.sourceTransactionRef],
    amountUnits: input.amountUnits,
    residualUnits: '0',
    policyRefs: [...input.policyRefs],
    policyDigest: input.policyDigest,
    templateVersion: 'ae.money-document:html:v1',
    renderInputJson,
    renderInputDigest,
    state: 'rendering',
    environment: input.environment,
    sourceCount: 1,
    snapshotDigest: renderInputDigest,
    createdAt: input.occurredAt,
  })
  const workId = await enqueueDocumentRender(ctx, documentRef)
  await ctx.db.patch(documentId, { workId })
  return true
}
