import { expect, it } from 'vitest'

import type { AeInvoiceHistoryRow } from '@/modules/money/invoice-history.view-model'

import { receiptExportRow } from './receipts.view-model'

const invoice: AeInvoiceHistoryRow = {
  commandRef: 'funding:test:paid',
  createdAt: 1_800_000_000_000,
  description: 'Account top-up',
  totalUnits: '1',
  status: 'succeeded',
  appliedTransactionRef: 'transaction:paid',
  hasPaymentReceipt: true,
}

it('exports distinct sub-cent invoice amounts and their exact integer-unit GST splits', () => {
  expect(receiptExportRow(invoice)).toMatchObject({
    amountAud: '0.000001',
    gstAud: '0.000000',
    netAud: '0.000001',
  })
  expect(receiptExportRow({ ...invoice, totalUnits: '9' })).toMatchObject({
    amountAud: '0.000009',
    gstAud: '0.000001',
    netAud: '0.000008',
  })
})

it('exports large gross, GST, and net without losing integer-unit precision', () => {
  expect(receiptExportRow({ ...invoice, totalUnits: '9007199254740993' })).toMatchObject({
    amountAud: '9007199254.740993',
    gstAud: '818836295.885545',
    netAud: '8188362958.855448',
  })
})

it('refuses malformed money units instead of emitting an invoice with misleading amounts', () => {
  expect(() => receiptExportRow({ ...invoice, totalUnits: 'not-units' })).toThrow('Invalid AUD invoice amount')
})
