export type AeInvoiceHistoryTaxInvoice =
  | Readonly<{ kind: 'issued'; documentRef: string; documentNumber: string; issuedAt: number }>
  | Readonly<{ kind: 'rendering'; documentRef: string; documentNumber: string }>
  | Readonly<{ kind: 'retryable'; documentRef: string; documentNumber: string }>
  | Readonly<{ kind: 'ready' }>
  | Readonly<{ kind: 'withheld'; reason: string }>

export type AeInvoiceHistoryRow = Readonly<{
  commandRef: string
  createdAt: number
  description: string
  principalUnits: string
  serviceFeeUnits: string
  taxUnits: string
  totalUnits: string
  status: 'succeeded' | 'reversed'
  appliedTransactionRef: string | null
  hasPaymentReceipt: boolean
  taxInvoice?: AeInvoiceHistoryTaxInvoice | undefined
  adjustmentNote?: AeInvoiceHistoryTaxInvoice | undefined
}>

export type InvoiceDownloadOptions = Readonly<{ format: 'html' | 'csv'; document: 'invoice' | 'adjustment' }>
