import { formatAudAmountString } from '@/components/ae/console/credit-top-up-format'
import type { InvoiceExportRow } from '@/lib/export/csv-export'
import { formatTimestamp } from '@/lib/ui/format-time'
import { getStatusPresentation } from '@/lib/ui/status-presentation'
import type { AeInvoiceHistoryRow } from '@/modules/money/invoice-history.view-model'
import { calculateAudGstSplit } from '@/modules/money/public'

const AUD_INCLUSIVE_GST_BPS = 1_000

export function receiptDisplay(row: AeInvoiceHistoryRow) {
  const split = calculateAudGstSplit(row.totalUnits, AUD_INCLUSIVE_GST_BPS)
  return {
    date: formatTimestamp(row.createdAt),
    amount: formatAudAmountString(row.totalUnits),
    gst: split === undefined ? undefined : `${formatAudAmountString(split.gstUnits)} GST included`,
    status: row.status === 'succeeded'
      ? getStatusPresentation('billing_paid').compactLabel
      : getStatusPresentation('protected_action_reversed').compactLabel,
  }
}

export function receiptExportRow(row: AeInvoiceHistoryRow): InvoiceExportRow {
  const split = calculateAudGstSplit(row.totalUnits, AUD_INCLUSIVE_GST_BPS)
  const dollars = (units: string) => (Number(units) / 1_000_000).toFixed(2)
  return {
    date: row.createdAt ? new Date(row.createdAt).toISOString() : '',
    commandRef: row.commandRef,
    description: row.description,
    amountAud: dollars(row.totalUnits),
    gstAud: split === undefined ? '' : dollars(split.gstUnits),
    netAud: split === undefined ? '' : dollars(split.netUnits),
    status: receiptDisplay(row).status,
    taxInvoice: row.taxInvoice?.kind === 'issued' ? 'issued'
      : row.taxInvoice?.kind === 'withheld' ? `withheld:${row.taxInvoice.reason}` : 'unavailable',
  }
}
