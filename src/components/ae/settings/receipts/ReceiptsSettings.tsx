'use client'

import { useState } from 'react'
import { Download, ExternalLink } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { SettingsEmptyState, SettingsPage } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { UsageBillingInvoices, type UsageBillingInvoice } from '@/components/ae/shared/arc-pro/usage-billing/usage-billing'
import { Button } from '@/components/arc/button/button'
import { Skeleton } from '@/components/arc/skeleton/skeleton'
import {
  downloadCsv, downloadJson, EXPORT_ERROR_IMPACT, EXPORT_ERROR_WHAT,
  formatExportSuccessToast, generateInvoicesCsv, toExportDocument,
} from '@/lib/export/csv-export'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { toast } from '@/lib/ui/toast'
import type { AeInvoiceHistoryRow, AeInvoiceHistoryTaxInvoice, InvoiceDownloadOptions } from '@/modules/money/invoice-history.view-model'

import { receiptDisplay, receiptExportRow, taxDocumentStatusMessage } from './receipts.view-model'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import './ReceiptsComposition.css'

export type ReceiptsSettingsProps = Readonly<{
  invoiceHistoryRows?: readonly AeInvoiceHistoryRow[] | undefined
  invoiceHistoryLoading: boolean
  invoiceHistoryHasMore?: boolean
  invoiceHistoryLoadingMore?: boolean
  onLoadMore?: () => void
  onDownloadTaxInvoice: (row: AeInvoiceHistoryRow, options?: InvoiceDownloadOptions) => Promise<void>
  onGenerateTaxInvoice?: (row: AeInvoiceHistoryRow) => Promise<void>
  onViewStripeReceipt: (row: AeInvoiceHistoryRow) => Promise<void>
}>

export function ReceiptsSettings({
  invoiceHistoryRows, invoiceHistoryLoading, invoiceHistoryHasMore = false,
  invoiceHistoryLoadingMore = false, onLoadMore,
  onDownloadTaxInvoice, onGenerateTaxInvoice, onViewStripeReceipt,
}: ReceiptsSettingsProps) {
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const rows = invoiceHistoryRows ?? []
  const receiptsStatus = invoiceHistoryLoading
    ? 'Loading receipts.'
    : invoiceHistoryLoadingMore
      ? 'Loading older top-ups.'
      : rows.length === 0 && invoiceHistoryHasMore
        ? 'No receipts on this page. Older top-ups are still available.'
        : rows.length === 0
          ? 'No top-up receipts yet.'
          : `${rows.length} top-up receipt${rows.length === 1 ? '' : 's'}.${invoiceHistoryHasMore ? ' More top-ups are available.' : ''}`

  const exportHistory = (format: 'CSV' | 'JSON') => {
    try {
      const exportRows = rows.map(receiptExportRow)
      const filename = `billing-topups-${new Date().toISOString().slice(0, 10)}`
      if (format === 'CSV') downloadCsv(`${filename}.csv`, generateInvoicesCsv(exportRows))
      else downloadJson(`${filename}.json`, toExportDocument('billing-topups', exportRows))
      toast.success(formatExportSuccessToast(exportRows.length, format))
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      toast.error(EXPORT_ERROR_WHAT, { description: EXPORT_ERROR_IMPACT })
    }
  }

  const performAction = async (row: AeInvoiceHistoryRow, action: string, run: () => Promise<void>) => {
    setPendingAction(`${row.commandRef}:${action}`)
    try {
      await run()
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      toast.error(action === 'generate' ? 'Could not generate document.' : 'Could not open document.', {
        description: action === 'generate' && cause instanceof Error
          ? taxDocumentStatusMessage(cause.message) : 'Try again or contact support if the issue persists.',
      })
    } finally {
      setPendingAction(null)
    }
  }

  const documentDetail = (status: AeInvoiceHistoryTaxInvoice | undefined, label: string) => {
    if (status === undefined || status.kind === 'ready') return null
    if (status.kind === 'issued') return <span className="arc-receipt-note">
      {label} {status.documentNumber} · Issued {new Date(status.issuedAt).toISOString().slice(0, 10)}
    </span>
    if (status.kind === 'rendering') return <span className="arc-receipt-note" role="status">Generating {label.toLowerCase()}…</span>
    if (status.kind === 'retryable') return <span className="arc-receipt-note">{label} generation failed. Retry to continue.</span>
    return <span className="arc-receipt-note">
      {taxDocumentStatusMessage(status.reason)}{' '}
      {['customer_tax_facts_missing', 'customer_abn_invalid', 'customer_identity_mismatch'].includes(status.reason)
        && <Link to="/owner/settings/tax" className="arc-receipt-link">Update tax details</Link>}
    </span>
  }

  const documentActions = (row: AeInvoiceHistoryRow, document: 'invoice' | 'adjustment') => {
    const status = document === 'invoice' ? row.taxInvoice : row.adjustmentNote
    const label = document === 'invoice' ? 'invoice' : 'adjustment note'
    if (status?.kind === 'ready' || status?.kind === 'retryable') return onGenerateTaxInvoice === undefined ? null
      : <Button type="button" variant="secondary" size="md" disabled={pendingAction !== null}
        aria-busy={pendingAction === `${row.commandRef}:generate`}
        onClick={() => void performAction(row, 'generate', () => onGenerateTaxInvoice(row))}>
        {status.kind === 'retryable' ? 'Retry' : 'Generate'} {label}
      </Button>
    if (status?.kind !== 'issued') return null
    return <>
      <Button type="button" variant="secondary" size="md" disabled={pendingAction !== null}
        aria-busy={pendingAction === `${row.commandRef}:${document}:html`}
        onClick={() => void performAction(row, `${document}:html`, () => onDownloadTaxInvoice(row, { document, format: 'html' }))}>
        <ExternalLink aria-hidden="true" />Open / print {label}
      </Button>
      <Button type="button" variant="secondary" size="md" disabled={pendingAction !== null}
        aria-busy={pendingAction === `${row.commandRef}:${document}:csv`}
        onClick={() => void performAction(row, `${document}:csv`, () => onDownloadTaxInvoice(row, { document, format: 'csv' }))}>
        <Download aria-hidden="true" />{document === 'invoice' ? 'Invoice CSV' : 'Adjustment CSV'}
      </Button>
    </>
  }

  const invoices: readonly UsageBillingInvoice[] = invoiceHistoryLoading ? [] : rows.map(row => {
    const display = receiptDisplay(row)
    const stripePending = pendingAction === `${row.commandRef}:stripe`
    return {
      id: row.commandRef,
      anchorId: `funding-receipt-${row.commandRef}`,
      description: row.description,
      date: display.date,
      amount: display.amount,
      status: { label: display.status, tone: row.status === 'succeeded' ? 'paid' : 'reversed' },
      detail: <>
        {display.gst && <span className="arc-receipt-note">{display.gst}</span>}
        {documentDetail(row.taxInvoice, 'Tax invoice')}
        {documentDetail(row.adjustmentNote, 'Adjustment note')}
      </>,
      actions: <div className="arc-receipt-actions">
        {documentActions(row, 'invoice')}
        {documentActions(row, 'adjustment')}
        {row.hasPaymentReceipt && <Button type="button" variant="secondary" size="md" disabled={pendingAction !== null} aria-busy={stripePending}
          onClick={() => void performAction(row, 'stripe', () => onViewStripeReceipt(row))}><ExternalLink aria-hidden="true" />Stripe receipt</Button>}
      </div>,
    }
  })

  return <SettingsPage
    title="Receipts & invoices"
    description="Payment receipts, printable tax invoices and refund adjustment notes for account credit top-ups."
    action={rows.length > 0 && !invoiceHistoryLoading ? <div className="arc-receipt-actions">
      <Button type="button" variant="secondary" size="md" onClick={() => exportHistory('CSV')}><Download aria-hidden="true" />{invoiceHistoryHasMore ? 'Export shown CSV' : 'Export CSV'}</Button>
      <Button type="button" variant="secondary" size="md" onClick={() => exportHistory('JSON')}><Download aria-hidden="true" />{invoiceHistoryHasMore ? 'Export shown JSON' : 'Export JSON'}</Button>
    </div> : undefined}
  >
    <UsageBillingInvoices
      title="Top-up history"
      description="Paid and reversed account funding. Open an issued invoice to print it or save as PDF; CSV contains the same recorded facts."
      invoices={invoices}
      state={<>
        <p className="sr-only" role="status" aria-live="polite">{receiptsStatus}</p>
        {invoiceHistoryLoading ? <div aria-busy="true" className="grid gap-4 py-4">
        {[0, 1, 2].map(index => <div key={index} className="grid gap-2 border-b border-border pb-4 last:border-b-0">
          <div aria-hidden="true"><Skeleton lines={2} /></div>
        </div>)}
      </div> : rows.length === 0 && !invoiceHistoryHasMore && !invoiceHistoryLoadingMore ? <SettingsEmptyState
        title="No top-up receipts yet"
        description="When you add credit, your payment receipts and eligible tax invoices will appear here."
        action={<Link to="/owner/credit" className={actionLinkClassName('secondary', 'md')}>Add credit</Link>}
        /> : null}
      </>}
      continuation={(invoiceHistoryHasMore || invoiceHistoryLoadingMore) ? <div className="arc-receipt-pagination">
        <Button type="button" variant="secondary" size="md" disabled={invoiceHistoryLoadingMore} onClick={onLoadMore}>
          {invoiceHistoryLoadingMore ? 'Loading older top-ups…' : 'Load older top-ups'}
        </Button>
      </div> : null}
    />
    <p className="text-sm text-muted-foreground">
      <a href="/trust#receipts" target="_blank" rel="noreferrer" aria-label="Trust centre (opens in a new tab)"
        className="arc-receipt-link">Trust centre</a>
    </p>
  </SettingsPage>
}
