import { formatAudAmountString } from '@/components/ae/console/credit-top-up-format'
import type { InvoiceExportRow } from '@/lib/export/csv-export'
import { formatTimestamp } from '@/lib/ui/format-time'
import { getStatusPresentation } from '@/lib/ui/status-presentation'
import type { AeInvoiceHistoryRow } from '@/modules/money/invoice-history.view-model'
import { formatExactAmount } from '@/modules/money/public'

const AUD_UNITS = /^(?:0|[1-9]\d*)$/u

function recordedFundingAmounts(row: AeInvoiceHistoryRow) {
  const parts = [row.principalUnits, row.serviceFeeUnits, row.taxUnits, row.totalUnits]
  if (!parts.every((units) => AUD_UNITS.test(units))) return undefined
  const principal = BigInt(row.principalUnits)
  const fee = BigInt(row.serviceFeeUnits)
  const tax = BigInt(row.taxUnits)
  const total = BigInt(row.totalUnits)
  if (principal + fee + tax !== total) return undefined
  return { principal, fee, tax, total, net: principal + fee }
}

function exactAud(units: bigint) {
  return formatExactAmount({ currency: 'AUD', exponent: 6, units: units.toString() })
}

export function receiptDisplay(row: AeInvoiceHistoryRow) {
  const recorded = recordedFundingAmounts(row)
  return {
    date: formatTimestamp(row.createdAt),
    amount: formatAudAmountString(row.totalUnits),
    gst: recorded === undefined ? undefined : `${formatAudAmountString(recorded.tax.toString())} GST included`,
    status: row.status === 'succeeded'
      ? getStatusPresentation('billing_paid').compactLabel
      : getStatusPresentation('protected_action_reversed').compactLabel,
  }
}

export function receiptExportRow(row: AeInvoiceHistoryRow): InvoiceExportRow {
  const recorded = recordedFundingAmounts(row)
  const amountAud = recorded && exactAud(recorded.total)
  const gstAud = recorded && exactAud(recorded.tax)
  const netAud = recorded && exactAud(recorded.net)
  if (amountAud === undefined || gstAud === undefined || netAud === undefined) {
    throw new RangeError('Invalid AUD invoice amount')
  }
  return {
    date: row.createdAt ? new Date(row.createdAt).toISOString() : '',
    commandRef: row.commandRef,
    description: row.description,
    amountAud,
    gstAud,
    netAud,
    status: receiptDisplay(row).status,
    taxInvoice: row.taxInvoice?.kind === 'issued' ? 'issued'
      : row.taxInvoice?.kind === 'withheld' ? `withheld:${row.taxInvoice.reason}` : 'unavailable',
  }
}
