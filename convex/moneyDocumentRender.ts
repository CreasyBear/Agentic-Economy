"use node";

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { v } from 'convex/values'
import { makeFunctionReference } from 'convex/server'

import { action, internalAction, type ActionCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { isRecord } from '../src/modules/common/is-record'
import { degradeBackend } from '../src/lib/observability/degrade-backend'
import { formatAbnDisplay, formatExactAmount, parseTaxDocumentSnapshot, type TaxDocumentSnapshot } from '../src/modules/money/public'

type RenderDocument = Readonly<{
  documentRef: string
  renderInputJson: string
  renderInputDigest: string
  templateVersion: string
  state: 'rendering' | 'awaiting_signature' | 'issued'
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
  'accountRef', 'environment', 'kind', 'currency', 'exponent', 'periodStart', 'periodEnd', 'snapshotCutoffAt',
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
    case 'daily_close': return 'Account daily close'
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
  if (parsed.kind === 'statement' || parsed.kind === 'daily_close') {
    rows.push(['Scope', 'Account settled Tool purchases: non-reverted sale and GST postings in the stated UTC period, as recorded at the snapshot cutoff. Funding, refunds, treasury and chain reconciliation are outside this report.'])
    if (parsed.kind === 'daily_close') rows.push(['Signature', 'Review these frozen bytes before signing. The owner signature and evidence digest are recorded separately in the Account document record.'])
    if (isRecord(parsed.policyAdmission) && parsed.policyAdmission.kind === 'not_admitted') {
      rows.push(['Commercial approval at capture', 'Not admitted. This report grants no payment or adjustment authority.'])
      if (typeof parsed.policyAdmission.refusalCode === 'string') rows.push(['Approval check', parsed.policyAdmission.refusalCode])
    }
  }
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
      createElement('p', { className: 'meta' }, title === 'Account daily close'
        ? 'Prepared by Agentic Economy from immutable Account settlement evidence.'
        : 'Issued by Agentic Economy from immutable commercial evidence.'),
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

function invoiceAud(units: string): string {
  const formatted = formatExactAmount({ currency: 'AUD', exponent: 2, units: (BigInt(units) / 10_000n).toString() })
  if (formatted === undefined) throw new Error('tax_invoice_amount_invalid')
  return `A$${formatted}`
}

const invoiceDate = (value: number) => new Date(value).toISOString().slice(0, 10)

function taxDocumentRows(snapshot: TaxDocumentSnapshot): DisplayRow[] {
  const rows: DisplayRow[] = [
    ['Document', snapshot.kind === 'tax_invoice' ? 'Tax invoice' : 'Adjustment note'],
    ['Document number', snapshot.documentNumber], ['Date issued (UTC)', invoiceDate(snapshot.issuedAt)],
    ['Seller', snapshot.seller.legalName], ['Seller ABN', formatAbnDisplay(snapshot.seller.abn)],
  ]
  if (snapshot.customer.kind === 'identified') {
    if (snapshot.customer.legalName !== null) rows.push(['Customer', snapshot.customer.legalName])
    if (snapshot.customer.abn !== null) rows.push(['Customer ABN', formatAbnDisplay(snapshot.customer.abn)])
    if (snapshot.customer.addressLines.length > 0) rows.push(['Customer address', snapshot.customer.addressLines.join(', ')])
  }
  rows.push(['Currency', 'AUD'], ['Supply', snapshot.supply.description], ['Quantity', '1'],
    ['Account credit (excluding GST)', invoiceAud(snapshot.supply.principalUnits)],
    ['Service fee (excluding GST)', invoiceAud(snapshot.supply.serviceFeeUnits)],
    ['Subtotal (excluding GST)', invoiceAud(snapshot.supply.netUnits)], ['GST rate', '10%'],
    ['GST', invoiceAud(snapshot.supply.gstUnits)], ['Total (including GST)', invoiceAud(snapshot.supply.totalUnits)],
    ['Date paid (UTC)', invoiceDate(snapshot.source.occurredAt)], ['Funding reference', snapshot.source.commandRef])
  if (snapshot.kind === 'adjustment') rows.push(
    ['Original invoice', snapshot.original.documentNumber], ['Original invoice date (UTC)', invoiceDate(snapshot.original.issuedAt)],
    ['Adjustment reason', snapshot.refund.reason], ['Effect', 'Credit to customer; decrease in price and GST'],
    ['Price decrease (including GST)', invoiceAud(snapshot.supply.totalUnits)],
    ['GST decrease', invoiceAud(snapshot.supply.gstUnits)], ['Price after full refund', 'A$0.00'],
    ['Date refunded (UTC)', invoiceDate(snapshot.refund.occurredAt)], ['Refund reference', snapshot.refund.refundRef],
  )
  return rows
}

function renderTaxHtml(snapshot: TaxDocumentSnapshot): string {
  const h = createElement
  const adjustment = snapshot.kind === 'adjustment'
  const title = adjustment ? 'Adjustment note' : 'Tax invoice'
  const amount = (units: string) => `${adjustment ? '−' : ''}${invoiceAud(units)}`
  const customer = snapshot.customer
  const markup = renderToStaticMarkup(h('html', { lang: 'en-AU' },
    h('head', null, h('meta', { charSet: 'utf-8' }), h('meta', { name: 'viewport', content: 'width=device-width,initial-scale=1' }),
      h('title', null, `${title} ${snapshot.documentNumber}`),
      h('style', null, 'body{font:15px/1.5 system-ui,sans-serif;color:#171717;max-width:900px;margin:48px auto;padding:0 24px}header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #171717;padding-bottom:24px}h1{font-size:30px;line-height:1.2;margin:0 0 12px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#555;margin:0 0 8px}p{margin:4px 0}.muted{color:#666;font-size:13px}.number{overflow-wrap:anywhere;max-width:410px}.parties{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin:32px 0}.items-scroll{max-width:100%;overflow-x:auto;margin:24px 0}.items-scroll:focus-visible{outline:2px solid #171717;outline-offset:4px}.scroll-hint{display:none}.items{border-collapse:collapse;width:100%}.items th,.items td{padding:12px 8px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}.items .amount{text-align:right;white-space:nowrap}.totals{margin-left:auto;max-width:340px}.total span:last-child{white-space:nowrap}.total{display:flex;justify-content:space-between;gap:24px;padding:6px 0}.grand{font-size:20px;font-weight:700;border-top:2px solid #171717;margin-top:8px;padding-top:12px}.evidence{border-top:1px solid #ddd;margin-top:32px;padding-top:16px;overflow-wrap:anywhere}@media screen and (max-width:620px){header{display:block}.parties{grid-template-columns:1fr}.items{font-size:13px;min-width:620px}.items th,.items td{padding:10px 8px}.items th:nth-child(2),.items td:nth-child(2){white-space:nowrap}.scroll-hint{display:block}.items-scroll{margin-top:8px}}@media print{body{max-width:none;margin:0;padding:0;font-size:11pt}.print-help,.scroll-hint{display:none}.items-scroll{overflow:visible}.items tr,.parties,.totals{break-inside:avoid}a{color:inherit;text-decoration:none}@page{size:A4;margin:18mm}}'),
    ),
    h('body', null,
      h('header', null,
        h('div', null, h('h1', null, title), h('p', { className: 'number' }, snapshot.documentNumber),
          h('p', { className: 'muted' }, `Date issued: ${invoiceDate(snapshot.issuedAt)} (UTC)`)),
        h('div', null, h('strong', null, 'Agentic Economy'), h('p', { className: 'muted' }, adjustment ? 'Full refund' : 'Payment received')),
      ),
      h('section', { className: 'parties' },
        h('div', null, h('h2', null, 'From'), h('p', null, snapshot.seller.legalName), h('p', null, `ABN ${formatAbnDisplay(snapshot.seller.abn)}`)),
        h('div', null, h('h2', null, 'Bill to'), customer.kind === 'identified'
          ? h('div', null, customer.legalName === null ? null : h('p', null, customer.legalName),
            customer.abn === null ? null : h('p', null, `ABN ${formatAbnDisplay(customer.abn)}`),
            ...customer.addressLines.map((line, index) => h('p', { key: index }, line)))
          : h('p', { className: 'muted' }, 'Account customer — identity not recorded on this invoice')),
      ),
      adjustment ? h('section', null, h('p', null, `Original invoice: ${snapshot.original.documentNumber}`),
        h('p', { className: 'muted' }, `Issued ${invoiceDate(snapshot.original.issuedAt)} (UTC). ${snapshot.refund.reason}.`)) : null,
      h('p', { className: 'scroll-hint muted', id: 'items-scroll-help' }, 'Scroll the item table horizontally to see every amount.'),
      h('div', { className: 'items-scroll', role: 'region', tabIndex: 0, 'aria-label': 'Invoice item amounts', 'aria-describedby': 'items-scroll-help' },
      h('table', { className: 'items' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Description'), h('th', { scope: 'col' }, 'Qty'),
          h('th', { scope: 'col', className: 'amount' }, 'Excl. GST'), h('th', { scope: 'col', className: 'amount' }, 'GST'), h('th', { scope: 'col', className: 'amount' }, 'Total AUD'))),
        h('tbody', null, h('tr', null,
          h('td', null, snapshot.supply.description,
            h('p', { className: 'muted' }, `Account credit ${invoiceAud(snapshot.supply.principalUnits)} + service fee ${invoiceAud(snapshot.supply.serviceFeeUnits)}, excluding GST.`)),
          h('td', null, '1'), h('td', { className: 'amount' }, amount(snapshot.supply.netUnits)),
          h('td', { className: 'amount' }, `${amount(snapshot.supply.gstUnits)} (10%)`), h('td', { className: 'amount' }, amount(snapshot.supply.totalUnits)))),
      )),
      h('section', { className: 'totals' },
        h('div', { className: 'total' }, h('span', null, 'Subtotal'), h('span', null, amount(snapshot.supply.netUnits))),
        h('div', { className: 'total' }, h('span', null, 'GST'), h('span', null, amount(snapshot.supply.gstUnits))),
        h('div', { className: 'total grand' }, h('span', null, adjustment ? 'Total credit' : 'Total paid'), h('span', null, amount(snapshot.supply.totalUnits))),
        adjustment ? h('p', { className: 'muted' }, 'Price and GST reduced in full. Price after refund: A$0.00.') : null,
      ),
      h('section', { className: 'evidence muted' },
        h('p', null, `Payment recorded ${invoiceDate(snapshot.source.occurredAt)} (UTC).`),
        adjustment ? h('p', null, `Refund recorded ${invoiceDate(snapshot.refund.occurredAt)} (UTC). Reference: ${snapshot.refund.refundRef}`) : null,
        h('p', null, `Funding reference: ${snapshot.source.commandRef}`),
        h('p', null, 'GST is recorded on this top-up. Subsequent use of this credit is reported separately.'),
        h('p', { className: 'print-help' }, 'Use your browser’s Print command to print or save a PDF copy.'),
      ),
    ),
  ))
  return `<!doctype html>${markup}`
}

function renderContents(document: RenderDocument): { html: string; csv: string } {
  const input: unknown = JSON.parse(document.renderInputJson)
  if (isRecord(input) && input.format === 'ae.tax-document:v1') {
    const snapshot = parseTaxDocumentSnapshot(input)
    if (snapshot === undefined || snapshot.documentRef !== document.documentRef
      || canonicalDigest(snapshot) !== document.renderInputDigest) throw new Error('tax_invoice_snapshot_invalid')
    return { html: renderTaxHtml(snapshot), csv: renderCsv(taxDocumentRows(snapshot)) }
  }
  if (isRecord(input) && input.kind === 'tax_invoice') throw new Error('tax_invoice_snapshot_unsupported')
  const { title, rows } = displayRows(document)
  return { html: renderHtml(document, title, rows), csv: renderCsv(rows) }
}

/** Requires IDs proven unattached by this attempt. Cleanup failure must never
 * turn a confirmed canonical attachment into a failed render. */
async function deleteUnattachedFiles(ctx: ActionCtx, fileIds: readonly Id<'_storage'>[]): Promise<void> {
  for (const fileId of fileIds) {
    try { await ctx.storage.delete(fileId) }
    catch (cause) { degradeBackend(cause, undefined, { site: 'moneyDocumentRenderCleanup', reason: 'source_unavailable' }) }
  }
}

/** Requires frozen render material. Ensures a canonical attachment or a visible
 * failure; unknown acknowledgement preserves every potentially attached byte.
 * Storage and the attachment mutation are separate commits: readback, not
 * rollback, resolves uncertainty. Existing Workpool retries read the same row. */
async function renderAndAttach(
  ctx: ActionCtx,
  document: RenderDocument,
): Promise<{ kind: 'available'; fileId: Id<'_storage'> }> {
  if (document.fileId !== undefined && document.csvFileId !== undefined) {
    return { kind: 'available' as const, fileId: document.fileId }
  }
  if (document.state !== 'rendering') throw new Error('money_document_attachment_incomplete')
  const { html, csv } = renderContents(document)
  const fileDigest = canonicalDigest(html)
  const csvFileDigest = canonicalDigest(csv)
  let fileId: Id<'_storage'> | undefined
  let csvFileId: Id<'_storage'>
  try {
    fileId = await ctx.storage.store(new Blob([html], { type: 'text/html;charset=utf-8' }))
    csvFileId = await ctx.storage.store(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  } catch (error) {
    // Nothing has been submitted to the document mutation yet.
    if (fileId !== undefined) await deleteUnattachedFiles(ctx, [fileId])
    throw error
  }
  let attached: AttachResult
  try {
    attached = await ctx.runMutation(attachRenderedFileRef, {
      documentRef: document.documentRef,
      renderInputDigest: document.renderInputDigest,
      fileId,
      fileDigest,
      csvFileId,
      csvFileDigest,
      renderedAt: Date.now(),
    })
  } catch (error) {
    const recorded = await ctx.runQuery(readQueuedForRenderRef, { documentRef: document.documentRef })
    if (recorded === null || recorded.renderInputDigest !== document.renderInputDigest
      || recorded.fileId === undefined || recorded.csvFileId === undefined
      || recorded.fileDigest !== fileDigest || recorded.csvFileDigest !== csvFileDigest) throw error
    attached = { kind: 'replayed', fileId: recorded.fileId, csvFileId: recorded.csvFileId }
  }
  if (attached.kind === 'refused') {
    await deleteUnattachedFiles(ctx, [fileId, csvFileId])
    throw new Error('money_document_render_conflict')
  }
  const canonical = attached
  await deleteUnattachedFiles(ctx, [fileId, csvFileId]
    .filter(candidate => candidate !== canonical.fileId && candidate !== canonical.csvFileId))
  return { kind: 'available' as const, fileId: canonical.fileId }
}

export const renderOwnerDocument = action({
  args: { documentRef: v.string() },
  returns: v.object({ kind: v.literal('available'), fileId: v.id('_storage') }),
  handler: async (ctx, args): Promise<{ kind: 'available'; fileId: Id<'_storage'> }> => {
    const document = await ctx.runQuery(readForRenderRef, args)
    if (document === null) throw new Error('money_document_not_found')
    return await renderAndAttach(ctx, document)
  },
})

export const renderQueuedDocument = internalAction({
  args: { documentRef: v.string() },
  returns: v.object({ kind: v.literal('available'), fileId: v.id('_storage') }),
  handler: async (ctx, args): Promise<{ kind: 'available'; fileId: Id<'_storage'> }> => {
    const document = await ctx.runQuery(readQueuedForRenderRef, args)
    if (document === null) throw new Error('money_document_not_ready')
    return await renderAndAttach(ctx, document)
  },
})
