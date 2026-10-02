'use client'

import { useState } from 'react'
import { Download, ExternalLink } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { SettingsEmptyState, SettingsPage } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { UsageBillingInvoices, type UsageBillingInvoice } from '@/components/arc/blocks/usage-billing/usage-billing'
import { Button } from '@/components/arc/button/button'
import buttonStyles from '@/components/arc/button/button.module.css'
import { Skeleton } from '@/components/ui/skeleton'
import {
  downloadCsv, downloadJson, EXPORT_ERROR_IMPACT, EXPORT_ERROR_WHAT,
  formatExportSuccessToast, generateInvoicesCsv, toExportDocument,
} from '@/lib/export/csv-export'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { toast } from '@/lib/ui/toast'
import type { AeInvoiceHistoryRow } from '@/modules/money/invoice-history.view-model'

import { receiptDisplay, receiptExportRow } from './receipts.view-model'
import './ReceiptsComposition.css'

export type ReceiptsSettingsProps = Readonly<{
  invoiceHistoryRows?: readonly AeInvoiceHistoryRow[] | undefined
  invoiceHistoryLoading: boolean
  invoiceHistoryHasMore?: boolean
  invoiceHistoryLoadingMore?: boolean
  onLoadMore?: () => void
  onDownloadTaxInvoice: (row: AeInvoiceHistoryRow) => Promise<void>
  onViewStripeReceipt: (row: AeInvoiceHistoryRow) => Promise<void>
}>

export function ReceiptsSettings({
  invoiceHistoryRows, invoiceHistoryLoading, invoiceHistoryHasMore = false,
  invoiceHistoryLoadingMore = false, onLoadMore,
  onDownloadTaxInvoice, onViewStripeReceipt,
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

  const openDocument = async (row: AeInvoiceHistoryRow, kind: 'tax' | 'stripe') => {
    setPendingAction(`${row.commandRef}:${kind}`)
    try {
      if (kind === 'tax') await onDownloadTaxInvoice(row)
      else await onViewStripeReceipt(row)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      toast.error(kind === 'tax' ? 'Could not open tax invoice.' : 'Could not open Stripe receipt.', {
        description: 'Try again or contact support if the issue persists.',
      })
    } finally {
      setPendingAction(null)
    }
  }

  const invoices: readonly UsageBillingInvoice[] = invoiceHistoryLoading ? [] : rows.map(row => {
    const display = receiptDisplay(row)
    const taxInvoice = row.taxInvoice
    const taxPending = pendingAction === `${row.commandRef}:tax`
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
        {taxInvoice?.kind === 'withheld' && <span className="arc-receipt-note">
          {taxInvoice.reason === 'customer_tax_facts_missing' ? <>
            Tax details missing. <Link to="/owner/settings/tax" className="arc-receipt-link">Update tax details</Link> to obtain an eligible invoice.
          </> : taxInvoice.reason === 'tax_invoice_not_generated' ? 'Tax invoice pending generation.'
            : taxInvoice.reason === 'policy_disabled' ? 'Tax invoices are disabled for this environment.'
              : 'Tax invoice unavailable.'}
        </span>}
      </>,
      actions: <div className="arc-receipt-actions">
        {taxInvoice?.kind === 'issued' && <Button type="button" variant="secondary" size="md" disabled={pendingAction !== null} aria-busy={taxPending}
          onClick={() => void openDocument(row, 'tax')}><Download aria-hidden="true" />Tax invoice</Button>}
        {row.hasPaymentReceipt && <Button type="button" variant="secondary" size="md" disabled={pendingAction !== null} aria-busy={stripePending}
          onClick={() => void openDocument(row, 'stripe')}><ExternalLink aria-hidden="true" />Stripe receipt</Button>}
      </div>,
    }
  })

  return <SettingsPage
    title="Receipts & invoices"
    description="Receipts for account credit top-ups, with tax invoices where available."
    action={rows.length > 0 && !invoiceHistoryLoading ? <div className="arc-receipt-actions">
      <Button type="button" variant="secondary" size="md" onClick={() => exportHistory('CSV')}><Download aria-hidden="true" />{invoiceHistoryHasMore ? 'Export shown CSV' : 'Export CSV'}</Button>
      <Button type="button" variant="secondary" size="md" onClick={() => exportHistory('JSON')}><Download aria-hidden="true" />{invoiceHistoryHasMore ? 'Export shown JSON' : 'Export JSON'}</Button>
    </div> : undefined}
  >
    <UsageBillingInvoices
      title="Top-up history"
      description="Paid and reversed account funding. Tax invoices depend on your tax profile and the payment policy."
      invoices={invoices}
      state={<>
        <p className="sr-only" role="status" aria-live="polite">{receiptsStatus}</p>
        {invoiceHistoryLoading ? <div aria-busy="true" className="grid gap-4 py-4">
        {[0, 1, 2].map(index => <div key={index} className="grid gap-2 border-b border-border pb-4 last:border-b-0">
          <Skeleton className="h-4 w-40 max-w-full" /><Skeleton className="h-4 w-28 max-w-full" />
        </div>)}
      </div> : rows.length === 0 && !invoiceHistoryHasMore && !invoiceHistoryLoadingMore ? <SettingsEmptyState
        title="No top-up receipts yet"
        description="When you add credit, your payment receipts and eligible tax invoices will appear here."
        action={<Link to="/owner/credit" className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md}`}>Add credit</Link>}
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
