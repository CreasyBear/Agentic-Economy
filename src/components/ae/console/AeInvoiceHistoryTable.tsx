'use client'

import { formatAudAmountString } from '@/components/ae/console/credit-top-up-format'
import { Button } from '@/components/ui/button'
import { downloadCsv, formatCsvRow } from '@/lib/export/csv-export'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatTimestamp } from '@/lib/ui/format-time'

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

function TaxInvoiceAction({
  row,
  onDownloadTaxInvoice,
}: Readonly<{
  row: AeInvoiceHistoryRow
  onDownloadTaxInvoice?: ((row: AeInvoiceHistoryRow) => Promise<void> | void) | undefined
}>) {
  const taxInvoice = row.taxInvoice
  if (taxInvoice?.kind === 'issued') {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={onDownloadTaxInvoice === undefined}
        onClick={() => { void onDownloadTaxInvoice?.(row) }}
      >
        Download Tax Invoice
      </Button>
    )
  }
  if (taxInvoice?.kind === 'withheld' && taxInvoice.reason === 'customer_tax_facts_missing') {
    return (
      <div className="grid gap-1">
        <Button type="button" variant="secondary" size="sm" disabled>
          Download Tax Invoice
        </Button>
        <a href="/owner/workspace" className="text-sm text-primary underline-offset-4 hover:underline">
          Add tax details in Workspace Settings
        </a>
      </div>
    )
  }
  if (taxInvoice?.kind === 'withheld' && taxInvoice.reason === 'policy_disabled') {
    return (
      <p className="text-sm text-muted-foreground">
        Tax invoices are not enabled in this environment.
      </p>
    )
  }
  if (taxInvoice?.kind === 'withheld' && taxInvoice.reason === 'tax_invoice_not_generated') {
    return (
      <p className="text-sm text-muted-foreground">
        Tax invoice is not available for this payment yet.
      </p>
    )
  }
  return null
}

export function AeInvoiceHistoryTable({
  rows = [],
  isLoading = false,
  onDownloadTaxInvoice,
  onViewStripeReceipt,
}: AeInvoiceHistoryTableProps) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground" aria-busy="true">Loading invoice history…</p>
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No paid top-ups yet</p>
  }

  const handleExportCsv = () => {
    const headers = formatCsvRow(['Date', 'Command Ref', 'Description', 'Amount AUD', 'Status'])
    const dataRows = rows.map((r) =>
      formatCsvRow([
        r.createdAt ? new Date(r.createdAt).toISOString() : '',
        r.commandRef,
        r.description,
        r.totalUnits ? (Number(r.totalUnits) / 1_000_000).toFixed(2) : '0.00',
        statusLabel(r.status),
      ])
    )
    const csvContent = [headers, ...dataRows].join('\r\n')
    downloadCsv(`billing-topups-${new Date().toISOString().slice(0, 10)}.csv`, csvContent)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
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
              <TableCell className="font-mono tabular-nums">{formatAudAmountString(row.totalUnits)}</TableCell>
              <TableCell>{statusLabel(row.status)}</TableCell>
              <TableCell>
                <div className="flex flex-wrap items-start gap-2">
                  <TaxInvoiceAction row={row} onDownloadTaxInvoice={onDownloadTaxInvoice} />
                  {row.hasPaymentReceipt ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={onViewStripeReceipt === undefined}
                      onClick={() => { void onViewStripeReceipt?.(row) }}
                    >
                      View Stripe Receipt
                    </Button>
                  ) : (
                    <Button type="button" variant="outline" size="sm" disabled>
                      View Stripe Receipt
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
