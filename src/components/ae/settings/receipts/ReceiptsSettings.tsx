'use client'

import { useState } from 'react'
import { Download, ExternalLink } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { SettingsEmptyState, SettingsGroup, SettingsPage, SettingsRow } from '@/components/ae/settings/settings-shell/components/SettingsSections'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { Skeleton } from '@/components/ui/skeleton'
import {
  downloadCsv, downloadJson, EXPORT_ERROR_IMPACT, EXPORT_ERROR_WHAT,
  formatExportSuccessToast, generateInvoicesCsv, toExportDocument,
} from '@/lib/export/csv-export'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { toast } from '@/lib/ui/toast'
import type { AeInvoiceHistoryRow } from '@/modules/money/invoice-history.view-model'

import { receiptDisplay, receiptExportRow } from './receipts.view-model'

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

  return <SettingsPage
    title="Receipts & invoices"
    description="Receipts for account credit top-ups, with tax invoices where available."
    action={rows.length > 0 && !invoiceHistoryLoading ? <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" onClick={() => exportHistory('CSV')}><Download aria-hidden="true" />{invoiceHistoryHasMore ? 'Export shown CSV' : 'Export CSV'}</Button>
      <Button type="button" variant="outline" onClick={() => exportHistory('JSON')}><Download aria-hidden="true" />{invoiceHistoryHasMore ? 'Export shown JSON' : 'Export JSON'}</Button>
    </div> : undefined}
  >
    <SettingsGroup title="Top-up history" description="Paid and reversed account funding. Tax invoices depend on your tax profile and the payment policy.">
      {invoiceHistoryLoading ? <div role="status" aria-busy="true" aria-label="Loading receipts" className="grid gap-4 py-4">
        <span className="sr-only">Loading receipts</span>
        {[0, 1, 2].map(index => <div key={index} className="grid gap-2 border-b border-border pb-4 last:border-b-0">
          <Skeleton className="h-4 w-40 max-w-full" /><Skeleton className="h-4 w-28 max-w-full" />
        </div>)}
      </div> : rows.length === 0 && !invoiceHistoryHasMore && !invoiceHistoryLoadingMore ? <SettingsEmptyState
        title="No top-up receipts yet"
        description="When you add credit, your payment receipts and eligible tax invoices will appear here."
        action={<Link to="/owner/credit" className={buttonVariants({ variant: 'outline' })}>Add credit</Link>}
      /> : rows.map(row => {
        const display = receiptDisplay(row)
        const taxInvoice = row.taxInvoice
        const taxPending = pendingAction === `${row.commandRef}:tax`
        const stripePending = pendingAction === `${row.commandRef}:stripe`
        return <SettingsRow key={row.commandRef} label={row.description} description={display.date}>
          <div className="flex min-w-0 flex-col gap-2 sm:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono tabular-nums">{display.amount}</span>
              <Badge variant={row.status === 'succeeded' ? 'secondary' : 'outline'}>{display.status}</Badge>
            </div>
            {display.gst && <span className="text-xs text-muted-foreground">{display.gst}</span>}
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
              {taxInvoice?.kind === 'issued' && <Button type="button" variant="outline" disabled={pendingAction !== null} aria-busy={taxPending}
                onClick={() => void openDocument(row, 'tax')}><Download aria-hidden="true" />Tax invoice</Button>}
              {row.hasPaymentReceipt && <Button type="button" variant="outline" disabled={pendingAction !== null} aria-busy={stripePending}
                onClick={() => void openDocument(row, 'stripe')}><ExternalLink aria-hidden="true" />Stripe receipt</Button>}
            </div>
            {taxInvoice?.kind === 'withheld' && <span className="text-xs text-muted-foreground">
              {taxInvoice.reason === 'customer_tax_facts_missing' ? <>
                Tax details missing. <Link to="/owner/settings/tax" className="text-primary underline underline-offset-4 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-brand">Update tax details</Link> to obtain an eligible invoice.
              </> : taxInvoice.reason === 'tax_invoice_not_generated' ? 'Tax invoice pending generation.'
                : taxInvoice.reason === 'policy_disabled' ? 'Tax invoices are disabled for this environment.'
                  : 'Tax invoice unavailable.'}
            </span>}
          </div>
        </SettingsRow>
      })}
    </SettingsGroup>
    {(invoiceHistoryHasMore || invoiceHistoryLoadingMore) && <div className="flex justify-center pt-4">
      <Button type="button" variant="outline" disabled={invoiceHistoryLoadingMore} onClick={onLoadMore}>
        {invoiceHistoryLoadingMore ? 'Loading older top-ups…' : 'Load older top-ups'}
      </Button>
    </div>}
  </SettingsPage>
}
