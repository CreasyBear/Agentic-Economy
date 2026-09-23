import { AeSection } from '@/components/ae/layout/AeSection'
import { AeInvoiceHistoryTable } from '@/components/ae/console/AeInvoiceHistoryTable'

import type { AeOwnerCreditProps } from '../owner-credit.contracts'

export type CreditInvoicesPanelProps = Pick<
  AeOwnerCreditProps,
  'invoiceHistoryRows' | 'invoiceHistoryLoading' | 'onDownloadTaxInvoice' | 'onViewStripeReceipt'
>

export function CreditInvoicesPanel({
  invoiceHistoryRows,
  invoiceHistoryLoading = false,
  onDownloadTaxInvoice,
  onViewStripeReceipt,
}: CreditInvoicesPanelProps) {
  return (
    <AeSection
      id="invoices"
      title="Invoice & top-up history"
      description="Paid top-ups retain Stripe card receipts and Australian tax invoices when your workspace tax profile and environment policy allow issuance."
    >
      <AeInvoiceHistoryTable
        {...(invoiceHistoryRows === undefined ? {} : { rows: invoiceHistoryRows })}
        isLoading={invoiceHistoryLoading}
        {...(onDownloadTaxInvoice === undefined ? {} : { onDownloadTaxInvoice })}
        {...(onViewStripeReceipt === undefined ? {} : { onViewStripeReceipt })}
      />
    </AeSection>
  )
}
