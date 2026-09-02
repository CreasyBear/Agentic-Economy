"use node";

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { v } from 'convex/values'
import { makeFunctionReference } from 'convex/server'

import { action, internalAction, type ActionCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { isRecord } from '../src/modules/common/is-record'

type RenderDocument = Readonly<{
  documentRef: string
  renderInputJson: string
  renderInputDigest: string
  templateVersion: string
  state: 'rendering' | 'issued'
  fileId?: Id<'_storage'>
  fileDigest?: string
  csvFileId?: Id<'_storage'>
  csvFileDigest?: string
}>

type AttachResult =
  | Readonly<{ kind: 'attached' | 'replayed'; fileId: Id<'_storage'>; csvFileId: Id<'_storage'> }>
  | Readonly<{ kind: 'refused' }>

const readForRenderRef = makeFunctionReference<'query', { documentRef: string }, RenderDocument | null>(
  'moneyDocuments:readForRender',
)
const readQueuedForRenderRef = makeFunctionReference<'query', { documentRef: string }, RenderDocument | null>(
  'moneyDocuments:readQueuedForRender',
)
const attachRenderedFileRef = makeFunctionReference<'mutation', {
  documentRef: string
  renderInputDigest: string
  fileId: Id<'_storage'>
  fileDigest: string
  csvFileId: Id<'_storage'>
  csvFileDigest: string
  renderedAt: number
}, AttachResult>('moneyDocuments:attachRenderedFile')

const DISPLAY_FIELDS = [
  'kind', 'currency', 'exponent', 'periodStart', 'periodEnd', 'snapshotCutoffAt',
  'exactCallUnits', 'roundedCallUnits', 'residualUnits', 'sourceCount', 'amountUnits',
  'principalUnits', 'serviceFeeUnits', 'taxUnits', 'totalUnits', 'direction',
  'reasonCode', 'transactionRef', 'occurredAt', 'policyDigest',
] as const

type DisplayRow = readonly [label: string, value: string]

function titleForKind(kind: string): string {
  switch (kind) {
    case 'funding_receipt': return 'Funding receipt'
    case 'service_fee_document': return 'Service fee document'
    case 'statement': return 'Account statement'
    case 'daily_close': return 'Signed daily close'
    case 'adjustment': return 'Adjustment document'
    case 'tax_invoice': return 'Tax invoice'
    default: return 'Financial document'
  }
}

function humanLabel(value: string): string {
  return value.replaceAll(/([a-z])([A-Z])/gu, '$1 $2').replaceAll('_', ' ')
}

function displayRows(document: RenderDocument): { title: string; rows: DisplayRow[] } {
  const parsed: unknown = JSON.parse(document.renderInputJson)
  if (!isRecord(parsed) || parsed.documentRef !== document.documentRef
    || typeof parsed.kind !== 'string'
    || canonicalDigest(parsed) !== document.renderInputDigest) {
    throw new Error('money_document_render_input_invalid')
  }
  const rows: DisplayRow[] = [['Reference', document.documentRef], ['Template', document.templateVersion]]
  for (const field of DISPLAY_FIELDS) {
    const value = parsed[field]
    if (typeof value === 'string' || typeof value === 'number') rows.push([humanLabel(field), String(value)])
  }
  if (isRecord(parsed.detail)) {
    for (const field of ['principalUnits', 'serviceFeeUnits', 'taxUnits', 'totalUnits'] as const) {
      const value = parsed.detail[field]
      if (typeof value === 'string') rows.push([humanLabel(field), value])
    }
  }
  return { title: titleForKind(parsed.kind), rows }
}

function renderHtml(document: RenderDocument, title: string, rows: DisplayRow[]): string {
  const tableRows = rows.map(([label, value]) => createElement('tr', { key: label },
    createElement('th', { scope: 'row' }, label),
    createElement('td', null, value),
  ))
  const markup = renderToStaticMarkup(createElement('html', { lang: 'en' },
    createElement('head', null,
      createElement('meta', { charSet: 'utf-8' }),
      createElement('meta', { name: 'viewport', content: 'width=device-width,initial-scale=1' }),
      createElement('title', null, title),
      createElement('style', null, 'body{font:14px/1.5 system-ui,sans-serif;color:#171717;max-width:800px;margin:48px auto;padding:0 24px}h1{font-size:24px}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;padding:10px;text-align:left;vertical-align:top}th{width:32%;color:#555}td{overflow-wrap:anywhere}.meta{color:#666}'),
    ),
    createElement('body', null,
      createElement('h1', null, title),
      createElement('p', { className: 'meta' }, 'Issued by Agentic Economy from immutable commercial evidence.'),
      createElement('table', null, createElement('tbody', null, tableRows)),
      createElement('p', { className: 'meta' }, `Content digest source: ${document.renderInputDigest}`),
    ),
  ))
  return `<!doctype html>${markup}`
}

function safeCsvCell(value: string): string {
  const protectedValue = /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value
  return `"${protectedValue.replaceAll('"', '""')}"`
}

function renderCsv(rows: DisplayRow[]): string {
  return ['field,value', ...rows.map(([label, value]) => `${safeCsvCell(label)},${safeCsvCell(value)}`)].join('\r\n') + '\r\n'
}

async function renderAndAttach(
  ctx: ActionCtx,
  document: RenderDocument,
): Promise<{ kind: 'available'; fileId: Id<'_storage'> }> {
  if (document.fileId !== undefined && document.csvFileId !== undefined) {
    return { kind: 'available' as const, fileId: document.fileId }
  }
  const { title, rows } = displayRows(document)
  const html = renderHtml(document, title, rows)
  const csv = renderCsv(rows)
  const fileDigest = canonicalDigest(html)
  const csvFileDigest = canonicalDigest(csv)
  let fileId: Id<'_storage'> | undefined
  let csvFileId: Id<'_storage'> | undefined
  try {
    fileId = await ctx.storage.store(new Blob([html], { type: 'text/html;charset=utf-8' }))
    csvFileId = await ctx.storage.store(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const attached = await ctx.runMutation(attachRenderedFileRef, {
      documentRef: document.documentRef,
      renderInputDigest: document.renderInputDigest,
      fileId,
      fileDigest,
      csvFileId,
      csvFileDigest,
      renderedAt: Date.now(),
    })
    if (attached.kind === 'refused') throw new Error('money_document_render_conflict')
    if (attached.fileId !== fileId) await ctx.storage.delete(fileId)
    if (attached.csvFileId !== csvFileId) await ctx.storage.delete(csvFileId)
    return { kind: 'available' as const, fileId: attached.fileId }
  } catch (error) {
    if (fileId !== undefined) await ctx.storage.delete(fileId)
    if (csvFileId !== undefined) await ctx.storage.delete(csvFileId)
    throw error
  }
}

export const renderOwnerDocument = action({
  args: { documentRef: v.string() },
  returns: v.object({ kind: v.literal('available'), fileId: v.id('_storage') }),
  handler: async (ctx, args) => {
    const document = await ctx.runQuery(readForRenderRef, args)
    if (document === null) throw new Error('money_document_not_found')
    return await renderAndAttach(ctx, document)
  },
})

export const renderQueuedDocument = internalAction({
  args: { documentRef: v.string() },
  returns: v.object({ kind: v.literal('available'), fileId: v.id('_storage') }),
  handler: async (ctx, args) => {
    const document = await ctx.runQuery(readQueuedForRenderRef, args)
    if (document === null) throw new Error('money_document_not_ready')
    return await renderAndAttach(ctx, document)
  },
})
