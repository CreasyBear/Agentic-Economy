/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  taxInvoice: { kind: 'issued', documentRef: 'money-document:tax:paid', documentNumber: 'AE-EXAMPLE', issuedAt: 1_800_000_000_000 },
}

afterEach(() => { cleanup(); vi.clearAllMocks() })

it('announces first-page loading once while keeping visual skeletons hidden from assistive technology', () => {
  const { container } = render(<ReceiptsSettings invoiceHistoryRows={[]} invoiceHistoryLoading
    onDownloadTaxInvoice={vi.fn(async () => {})}
    onViewStripeReceipt={vi.fn(async () => {})}
  />)

  expect(screen.getAllByRole('status')).toHaveLength(1)
  expect(screen.getByRole('status')).toHaveTextContent('Loading receipts.')
  expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
})

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
  const historyRow = screen.getByRole('row', { name: /Account top-up/u })
  expect(within(historyRow).getByText('A$5.78')).toBeInTheDocument()
  expect(within(historyRow).getByRole('button', { name: 'Open / print invoice' })).toBeInTheDocument()
  expect(within(historyRow).getByRole('button', { name: 'Stripe receipt' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Trust centre (opens in a new tab)' }))
    .toHaveAttribute('href', '/trust#receipts')
  expect(container.querySelector('a[href^="/calls/"]')).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Open / print invoice' }))
  expect(onDownloadTaxInvoice).toHaveBeenCalledWith(topUp, { document: 'invoice', format: 'html' })
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
  expect(screen.getByText('Tax invoice approval is pending. Contact support.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Open / print invoice' })).not.toBeInTheDocument()
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

  view.rerender(<ReceiptsSettings invoiceHistoryRows={[topUp]} invoiceHistoryLoading={false}
    invoiceHistoryHasMore invoiceHistoryLoadingMore {...callbacks} />)
  const existingRow = screen.getByRole('row', { name: /Account top-up/u })
  expect(within(existingRow).getByRole('button', { name: 'Stripe receipt' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Loading older top-ups…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Export shown CSV' })).toBeInTheDocument()
})


it('exposes explicit generation and retry, then the issued invoice and linked refund note formats', async () => {
  const onGenerateTaxInvoice = vi.fn(async () => {})
  const onDownloadTaxInvoice = vi.fn(async () => {})
  const callbacks = { onGenerateTaxInvoice, onDownloadTaxInvoice, onViewStripeReceipt: vi.fn(async () => {}) }
  const row: AeInvoiceHistoryRow = { ...topUp, taxInvoice: { kind: 'ready' } }
  const view = render(<ReceiptsSettings invoiceHistoryRows={[row]} invoiceHistoryLoading={false} {...callbacks} />)
  expect(screen.queryByRole('button', { name: 'Open / print invoice' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Generate invoice' }))
  await waitFor(() => expect(onGenerateTaxInvoice).toHaveBeenCalledWith(row))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate invoice' })).toBeEnabled())
  view.rerender(<ReceiptsSettings invoiceHistoryRows={[{ ...row, taxInvoice: { kind: 'rendering', documentRef: 'doc:test', documentNumber: 'AE-TEST' } }]}
    invoiceHistoryLoading={false} {...callbacks} />)
  expect(screen.getByText('Generating tax invoice…')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Generate invoice' })).not.toBeInTheDocument()
  const refunded: AeInvoiceHistoryRow = { ...topUp, status: 'reversed', adjustmentNote: {
    kind: 'issued', documentRef: 'doc:refund', documentNumber: 'AE-CN-TEST', issuedAt: topUp.createdAt,
  } }
  view.rerender(<ReceiptsSettings invoiceHistoryRows={[refunded]} invoiceHistoryLoading={false} {...callbacks} />)
  expect(screen.getByText(/Tax invoice AE-EXAMPLE/u)).toBeInTheDocument()
  expect(screen.getByText(/Adjustment note AE-CN-TEST/u)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Adjustment CSV' }))
  await waitFor(() => expect(onDownloadTaxInvoice).toHaveBeenCalledWith(refunded, { document: 'adjustment', format: 'csv' }))
})
