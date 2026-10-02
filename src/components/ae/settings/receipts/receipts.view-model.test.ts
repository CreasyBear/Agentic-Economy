import { expect, it } from 'vitest'

import type { AeInvoiceHistoryRow } from '@/modules/money/invoice-history.view-model'

import { receiptDisplay, receiptExportRow } from './receipts.view-model'

const invoice: AeInvoiceHistoryRow = {
  commandRef: 'funding:test:paid',
  createdAt: 1_800_000_000_000,
  description: 'Account top-up',
  principalUnits: '5000000',
  serviceFeeUnits: '250000',
  taxUnits: '530000',
  totalUnits: '5780000',
  status: 'succeeded',
  appliedTransactionRef: 'transaction:paid',
  hasPaymentReceipt: true,
}

it('shows the stored top-up GST, not a second inclusive split of the payable total', () => {
  expect(receiptDisplay(invoice).gst).toBe('A$0.53 GST included')
  expect(receiptExportRow(invoice)).toMatchObject({
    amountAud: '5.780000',
    gstAud: '0.530000',
    netAud: '5.250000',
  })
})

it('exports a zero stored tax without inventing an inclusive split', () => {
  const zeroTax: AeInvoiceHistoryRow = {
    ...invoice,
    principalUnits: '9',
    serviceFeeUnits: '0',
    taxUnits: '0',
    totalUnits: '9',
  }
  expect(receiptExportRow(zeroTax)).toMatchObject({
    amountAud: '0.000009',
    gstAud: '0.000000',
    netAud: '0.000009',
  })
})

it('exports large stored principal, fee, and tax without losing integer-unit precision', () => {
  expect(receiptExportRow({
    ...invoice,
    principalUnits: '9007199254740992',
    serviceFeeUnits: '0',
    taxUnits: '1',
    totalUnits: '9007199254740993',
  })).toMatchObject({
    amountAud: '9007199254.740993',
    gstAud: '0.000001',
    netAud: '9007199254.740992',
  })
})

it('refuses malformed or inconsistent money units instead of emitting a misleading invoice', () => {
  expect(() => receiptExportRow({ ...invoice, totalUnits: 'not-units' })).toThrow('Invalid AUD invoice amount')
  expect(() => receiptExportRow({ ...invoice, taxUnits: '480000' })).toThrow('Invalid AUD invoice amount')
  expect(receiptDisplay({ ...invoice, taxUnits: '480000' }).gst).toBeUndefined()
})
