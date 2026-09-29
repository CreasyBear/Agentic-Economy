export type AeInvoiceHistoryTaxInvoice =
  | Readonly<{ kind: 'issued'; documentRef: string }>
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
}>
