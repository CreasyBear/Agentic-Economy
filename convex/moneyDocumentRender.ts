"use node";

import { v } from 'convex/values'
import { makeFunctionReference } from 'convex/server'

import { action } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { canonicalDigest } from '../src/modules/common/canonical-digest'

type RenderDocument = Readonly<{
  documentRef: string
  renderInputJson: string
  renderInputDigest: string
  templateVersion: string
  fileId?: Id<'_storage'>
  fileDigest?: string
}>

type AttachResult =
  | Readonly<{ kind: 'attached' | 'replayed'; fileId: Id<'_storage'> }>
  | Readonly<{ kind: 'refused' }>

const readForRenderRef = makeFunctionReference<'query', { documentRef: string }, RenderDocument | null>(
  'moneyDocuments:readForRender',
)
const attachRenderedFileRef = makeFunctionReference<'mutation', {
  documentRef: string
  renderInputDigest: string
  fileId: Id<'_storage'>
  fileDigest: string
  renderedAt: number
}, AttachResult>('moneyDocuments:attachRenderedFile')

export const renderOwnerDocument = action({
  args: { documentRef: v.string() },
  returns: v.object({ kind: v.literal('available'), fileId: v.id('_storage') }),
  handler: async (ctx, args): Promise<{ kind: 'available'; fileId: Id<'_storage'> }> => {
    const document = await ctx.runQuery(readForRenderRef, args)
    if (document === null) throw new Error('money_document_not_found')
    if (document.fileId !== undefined) return { kind: 'available' as const, fileId: document.fileId }
    const body = [
      'Agentic Economy financial document',
      `Template: ${document.templateVersion}`,
      `Reference: ${document.documentRef}`,
      '',
      document.renderInputJson,
      '',
    ].join('\n')
    const fileDigest = canonicalDigest(body)
    const fileId = await ctx.storage.store(new Blob([body], { type: 'text/plain;charset=utf-8' }))
    const attached = await ctx.runMutation(attachRenderedFileRef, {
      documentRef: document.documentRef,
      renderInputDigest: document.renderInputDigest,
      fileId,
      fileDigest,
      renderedAt: Date.now(),
    })
    if (attached.kind === 'refused') {
      await ctx.storage.delete(fileId)
      throw new Error('money_document_render_conflict')
    }
    if (attached.fileId !== fileId) await ctx.storage.delete(fileId)
    return { kind: 'available' as const, fileId: attached.fileId }
  },
})
