import { formatAudAmountString } from '@/components/ae/console/credit-top-up-format'
import type { InvoiceExportRow } from '@/lib/export/csv-export'
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
      : row.taxInvoice?.kind === 'withheld' ? `withheld:${row.taxInvoice.reason}` : row.taxInvoice?.kind ?? 'unavailable',
  }
}


export function taxDocumentStatusMessage(reason: string): string {
  switch (reason) {
    case 'policy_disabled': return 'Tax invoice approval is pending. Contact support.'
    case 'tax_policy_expired':
    case 'tax_policy_not_effective':
    case 'tax_policy_conflict': return 'Tax invoice approval needs review. Contact support.'
    case 'customer_tax_facts_missing': return 'Recipient name or ABN is required for payments of A$1,000 or more.'
    case 'customer_abn_invalid':
    case 'customer_identity_mismatch': return 'Your tax details need review before an invoice can be issued.'
    case 'original_invoice_not_issued': return 'Adjustment note will be available when the original invoice is issued.'
    case 'source_event_unconfirmed':
    case 'refund_event_unconfirmed': return 'Payment evidence is incomplete. Contact support to reconcile this payment.'
    case 'original_policy_unavailable':
    case 'original_tax_treatment_unsupported':
    case 'original_tax_facts_invalid':
    case 'seller_registration_not_effective': return 'Original tax evidence needs review. Contact support; the recorded payment has not changed.'
    default: return 'Document unavailable. Contact support to review this payment.'
  }
}
