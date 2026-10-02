/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import '../../../../../tests/setup/jsdom-platform'

import * as invoiceExport from '@/lib/export/csv-export'
import type { AeInvoiceHistoryRow } from '@/modules/money/invoice-history.view-model'
import { ReceiptsSettings } from './ReceiptsSettings'

vi.mock('@/lib/export/csv-export', async (importOriginal) => ({
  ...await importOriginal<typeof invoiceExport>(),
  downloadCsv: vi.fn(),
  downloadJson: vi.fn(),
}))
vi.mock('@/lib/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const topUp: AeInvoiceHistoryRow = {
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
  taxInvoice: { kind: 'issued', documentRef: 'money-document:tax:paid' },
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

it('renders real top-up receipt actions and exports invoice rows without linking funding to a Call', async () => {
  const onDownloadTaxInvoice = vi.fn(async () => {})
  const onViewStripeReceipt = vi.fn(async () => {})
  const { container } = render(<ReceiptsSettings
    invoiceHistoryRows={[topUp]}
    invoiceHistoryLoading={false}
    onDownloadTaxInvoice={onDownloadTaxInvoice}
    onViewStripeReceipt={onViewStripeReceipt}
  />)

  expect(screen.getByText('Account top-up')).toBeInTheDocument()
  expect(screen.getByText('A$5.78')).toBeInTheDocument()
  expect(screen.getByText('A$0.53 GST included')).toBeInTheDocument()
  expect(screen.getByText('Paid')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Trust centre (opens in a new tab)' }))
    .toHaveAttribute('href', '/trust#receipts')
  expect(container.querySelector('a[href^="/calls/"]')).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Tax invoice' }))
  expect(onDownloadTaxInvoice).toHaveBeenCalledWith(topUp)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Stripe receipt' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
  expect(invoiceExport.downloadCsv).toHaveBeenCalledOnce()
  const csv = vi.mocked(invoiceExport.downloadCsv).mock.calls[0]?.[1] ?? ''
  expect(csv).toContain('GST AUD,Net AUD')
  expect(csv).toContain('funding:test:paid')
  fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }))
  expect(invoiceExport.downloadJson).toHaveBeenCalledOnce()
  const document = vi.mocked(invoiceExport.downloadJson).mock.calls[0]?.[1]
  expect(document).toMatchObject({ exportKind: 'billing-topups', recordCount: 1, records: [{ commandRef: topUp.commandRef, taxInvoice: 'issued' }] })

  fireEvent.click(screen.getByRole('button', { name: 'Stripe receipt' }))
  expect(onViewStripeReceipt).toHaveBeenCalledWith(topUp)
})

it('distinguishes reversed funding and withheld invoices without exposing unavailable actions', () => {
  const reversed: AeInvoiceHistoryRow = {
    ...topUp,
    commandRef: 'funding:test:reversed',
    status: 'reversed',
    hasPaymentReceipt: false,
    taxInvoice: { kind: 'withheld', reason: 'policy_disabled' },
  }
  render(<ReceiptsSettings
    invoiceHistoryRows={[reversed]}
    invoiceHistoryLoading={false}
    onDownloadTaxInvoice={vi.fn(async () => {})}
    onViewStripeReceipt={vi.fn(async () => {})}
  />)

  expect(screen.getByText('Reversed')).toBeInTheDocument()
  expect(screen.getByText('Tax invoices are disabled for this environment.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Tax invoice' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Stripe receipt' })).not.toBeInTheDocument()
})

it('offers older receipts even when the first bounded page has only unsettled commands', () => {
  const onLoadMore = vi.fn()
  const callbacks = {
    onLoadMore,
    onDownloadTaxInvoice: vi.fn(async () => {}),
    onViewStripeReceipt: vi.fn(async () => {}),
  }
  const view = render(<ReceiptsSettings invoiceHistoryRows={[]} invoiceHistoryLoading={false}
    invoiceHistoryHasMore {...callbacks} />)
  expect(screen.queryByText('No top-up receipts yet')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Load older top-ups' }))
  expect(onLoadMore).toHaveBeenCalledOnce()
  view.rerender(<ReceiptsSettings invoiceHistoryRows={[topUp]} invoiceHistoryLoading={false}
    invoiceHistoryHasMore {...callbacks} />)
  expect(screen.getByText('Account top-up')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Export shown CSV' })).toBeInTheDocument()
})
