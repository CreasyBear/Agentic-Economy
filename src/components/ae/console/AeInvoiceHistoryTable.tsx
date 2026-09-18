'use client'

import { Download, ExternalLink } from 'lucide-react'

import { formatAudAmountString } from '@/components/ae/console/credit-top-up-format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { downloadCsv, formatCsvRow } from '@/lib/export/csv-export'
import { toast } from '@/lib/ui/toast'
import { formatTimestamp } from '@/lib/ui/format-time'
import { calculateAudGstSplit } from '@/modules/money/public'

const AUD_INCLUSIVE_GST_BPS = 1_000

const TACTILE_BUTTON_CLASS =
  'min-h-touch enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

const MONEY_SAFE_ERROR_DESCRIPTION =
  'A$0.00 charged — your account balance is unaffected. Please refresh the page or contact support if the issue persists.'

export interface AeInvoiceHistoryRow {
  commandRef: string
  createdAt: number
  description: string
  totalUnits: string
  status: 'succeeded' | 'reversed'
  appliedTransactionRef: string | null
  hasPaymentReceipt: boolean
  taxInvoice?:
    | { kind: 'issued'; documentRef: string }
    | { kind: 'withheld'; reason: string }
    | undefined
}

export interface AeInvoiceHistoryTableProps {
  rows?: readonly AeInvoiceHistoryRow[]
  isLoading?: boolean
  onDownloadTaxInvoice?: (row: AeInvoiceHistoryRow) => Promise<void> | void
  onViewStripeReceipt?: (row: AeInvoiceHistoryRow) => Promise<void> | void
}

function statusLabel(status: AeInvoiceHistoryRow['status']): string {
  return status === 'succeeded' ? 'Paid' : 'Reversed'
}

function unitsToAudDollarsFixed(units: string): string {
  if (!units) return '0.00'
  return (Number(units) / 1_000_000).toFixed(2)
}

function taxInvoiceCsvValue(row: AeInvoiceHistoryRow): string {
  const taxInvoice = row.taxInvoice
  if (taxInvoice?.kind === 'issued') return 'issued'
  if (taxInvoice?.kind === 'withheld') return `withheld:${taxInvoice.reason}`
  return 'unavailable'
}

function InvoiceHistoryLoadingSkeleton() {
  return (
    <div
      className="flex flex-col gap-3"
      aria-busy="true"
      role="status"
      aria-label="Loading invoice history"
    >
      <div className="flex justify-end">
        <Skeleton className="h-7 w-24" />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 3 }, (_, index) => (
            <TableRow key={`invoice-history-skeleton-${index}`}>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-40" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-14 rounded-full" />
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-8 w-36" />
                  <Skeleton className="h-8 w-32" />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function InvoiceHistoryEmptyState() {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4">
      <h3 className="text-sm font-medium text-foreground">No paid top-ups yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Paid top-ups will appear here with Stripe receipts and Australian tax invoices once your
        workspace tax profile allows issuance.
      </p>
    </div>
  )
}

function AmountCell({ totalUnits }: Readonly<{ totalUnits: string }>) {
  const split = calculateAudGstSplit(totalUnits, AUD_INCLUSIVE_GST_BPS)
  return (
    <div className="grid gap-0.5">
      <span className="font-mono tabular-nums">{formatAudAmountString(totalUnits)}</span>
      {split === undefined ? null : (
        <span className="text-xs text-muted-foreground">
          {formatAudAmountString(split.gstUnits)} GST included
        </span>
      )}
    </div>
  )
}

function StatusCell({ status }: Readonly<{ status: AeInvoiceHistoryRow['status'] }>) {
  if (status === 'succeeded') {
    return <Badge variant="secondary">Paid</Badge>
  }
  return <Badge variant="outline">Reversed</Badge>
}

function TaxInvoiceAction({
  row,
  onDownloadTaxInvoice,
}: Readonly<{
  row: AeInvoiceHistoryRow
  onDownloadTaxInvoice?: ((row: AeInvoiceHistoryRow) => Promise<void> | void) | undefined
}>) {
  const taxInvoice = row.taxInvoice

  const handleDownload = () => {
    void (async () => {
      try {
        await onDownloadTaxInvoice?.(row)
      } catch {
        toast.error('Could not open tax invoice.', {
          description: MONEY_SAFE_ERROR_DESCRIPTION,
        })
      }
    })()
  }

  if (taxInvoice?.kind === 'issued') {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={TACTILE_BUTTON_CLASS}
        disabled={onDownloadTaxInvoice === undefined}
        onClick={handleDownload}
      >
        <Download className="size-3.5 shrink-0" aria-hidden="true" />
        <span>Download Tax Invoice</span>
      </Button>
    )
  }
  if (taxInvoice?.kind === 'withheld' && taxInvoice.reason === 'customer_tax_facts_missing') {
    return (
      <div className="grid gap-1">
        <Button type="button" variant="secondary" size="sm" className={TACTILE_BUTTON_CLASS} disabled>
          <Download className="size-3.5 shrink-0" aria-hidden="true" />
          <span>Download Tax Invoice</span>
        </Button>
        <a href="/owner/workspace" className="text-xs text-primary underline-offset-4 hover:underline">
          Tax details missing — Add ABN in Workspace Settings to generate ATO-compliant invoices
        </a>
      </div>
    )
  }
  if (taxInvoice?.kind === 'withheld' && taxInvoice.reason === 'policy_disabled') {
    return (
      <p className="text-xs text-muted-foreground">
        Tax invoices are disabled for this environment.
      </p>
    )
  }
  if (taxInvoice?.kind === 'withheld' && taxInvoice.reason === 'tax_invoice_not_generated') {
    return (
      <p className="text-xs text-muted-foreground">Tax invoice pending generation.</p>
    )
  }
  return (
    <p className="text-xs text-muted-foreground">Tax invoice status unavailable.</p>
  )
}

function StripeReceiptButton({
  row,
  onViewStripeReceipt,
}: Readonly<{
  row: AeInvoiceHistoryRow
  onViewStripeReceipt?: ((row: AeInvoiceHistoryRow) => Promise<void> | void) | undefined
}>) {
  const disabled = !row.hasPaymentReceipt || onViewStripeReceipt === undefined

  const handleClick = () => {
    void (async () => {
      try {
        await onViewStripeReceipt?.(row)
      } catch {
        toast.error('Could not open Stripe receipt.', {
          description: MONEY_SAFE_ERROR_DESCRIPTION,
        })
      }
    })()
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={TACTILE_BUTTON_CLASS}
      disabled={disabled}
      onClick={handleClick}
    >
      <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
      <span>View Stripe Receipt</span>
    </Button>
  )
}

export function AeInvoiceHistoryTable({
  rows = [],
  isLoading = false,
  onDownloadTaxInvoice,
  onViewStripeReceipt,
}: AeInvoiceHistoryTableProps) {
  if (isLoading) {
    return <InvoiceHistoryLoadingSkeleton />
  }

  if (rows.length === 0) {
    return <InvoiceHistoryEmptyState />
  }

  const handleExportCsv = () => {
    const headers = formatCsvRow([
      'Date',
      'Command Ref',
      'Description',
      'Amount AUD',
      'GST AUD',
      'Net AUD',
      'Status',
      'Tax Invoice',
    ])
    const dataRows = rows.map((row) => {
      const split = calculateAudGstSplit(row.totalUnits, AUD_INCLUSIVE_GST_BPS)
      return formatCsvRow([
        row.createdAt ? new Date(row.createdAt).toISOString() : '',
        row.commandRef,
        row.description,
        unitsToAudDollarsFixed(row.totalUnits),
        split === undefined ? '' : unitsToAudDollarsFixed(split.gstUnits),
        split === undefined ? '' : unitsToAudDollarsFixed(split.netUnits),
        statusLabel(row.status),
        taxInvoiceCsvValue(row),
      ])
    })
    const csvContent = [headers, ...dataRows].join('\r\n')
    downloadCsv(`billing-topups-${new Date().toISOString().slice(0, 10)}.csv`, csvContent)
    toast.success('Invoice history exported to CSV')
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`h-7 text-xs ${TACTILE_BUTTON_CLASS}`}
          onClick={handleExportCsv}
        >
          Export CSV
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.commandRef}>
              <TableCell>{formatTimestamp(row.createdAt)}</TableCell>
              <TableCell>{row.description}</TableCell>
              <TableCell>
                <AmountCell totalUnits={row.totalUnits} />
              </TableCell>
              <TableCell>
                <StatusCell status={row.status} />
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-start gap-2">
                  <TaxInvoiceAction row={row} onDownloadTaxInvoice={onDownloadTaxInvoice} />
                  <StripeReceiptButton row={row} onViewStripeReceipt={onViewStripeReceipt} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
