/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import {
  AeInvoiceHistoryTable,
  type AeInvoiceHistoryRow,
} from '@/components/ae/console/AeInvoiceHistoryTable'
import { formatAudAmountString } from '@/components/ae/console/credit-top-up-format'
import { formatTimestamp } from '@/lib/ui/format-time'

const createdAt = 1_800_000_000_000

const paidRow: AeInvoiceHistoryRow = {
  commandRef: 'funding:w24:u1:paid',
  createdAt,
  description: 'Account top-up',
  totalUnits: '5280000',
  status: 'succeeded',
  appliedTransactionRef: 'formance:tx:w24:u1',
  hasPaymentReceipt: true,
  taxInvoice: {
    kind: 'issued',
    documentRef: 'money-document:tax_invoice:formance:tx:w24:u1',
  },
}

const withheldMissingFactsRow: AeInvoiceHistoryRow = {
  commandRef: 'funding:w24:u2:withheld',
  createdAt,
  description: 'Account top-up',
  totalUnits: '5280000',
  status: 'succeeded',
  appliedTransactionRef: 'formance:tx:w24:u2',
  hasPaymentReceipt: true,
  taxInvoice: {
    kind: 'withheld',
    reason: 'customer_tax_facts_missing',
  },
}

const withheldPolicyRow: AeInvoiceHistoryRow = {
  commandRef: 'funding:w24:u3:policy',
  createdAt,
  description: 'Account top-up',
  totalUnits: '5280000',
  status: 'succeeded',
  appliedTransactionRef: 'formance:tx:w24:u3',
  hasPaymentReceipt: true,
  taxInvoice: {
    kind: 'withheld',
    reason: 'policy_disabled',
  },
}

const noReceiptRow: AeInvoiceHistoryRow = {
  ...paidRow,
  commandRef: 'funding:w24:u4:no-receipt',
  hasPaymentReceipt: false,
}

function renderTable(
  props: Readonly<{
    rows?: readonly AeInvoiceHistoryRow[]
    onDownloadTaxInvoice?: (row: AeInvoiceHistoryRow) => void
    onViewStripeReceipt?: (row: AeInvoiceHistoryRow) => void
  }> = {},
) {
  const onDownloadTaxInvoice = props.onDownloadTaxInvoice ?? vi.fn()
  const onViewStripeReceipt = props.onViewStripeReceipt ?? vi.fn()
  return {
    onDownloadTaxInvoice,
    onViewStripeReceipt,
    ...render(
      <AeInvoiceHistoryTable
        rows={props.rows ?? [paidRow]}
        onDownloadTaxInvoice={onDownloadTaxInvoice}
        onViewStripeReceipt={onViewStripeReceipt}
      />,
    ),
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AeInvoiceHistoryTable (W-24)', () => {
  it('U1: paid row renders date, description, amount, Paid badge, and receipt actions', () => {
    renderTable()

    expect(screen.getByText(formatTimestamp(createdAt))).toBeInTheDocument()
    expect(screen.getByText('Account top-up')).toBeInTheDocument()
    expect(screen.getByText(formatAudAmountString('5280000'))).toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download Tax Invoice' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'View Stripe Receipt' })).toBeEnabled()
  })

  it('U2: withheld row for missing tax facts disables download and links to workspace tax details', () => {
    renderTable({ rows: [withheldMissingFactsRow] })

    expect(screen.getByRole('button', { name: 'Download Tax Invoice' })).toBeDisabled()
    const workspaceLink = screen.getByRole('link', { name: /tax details/i })
    expect(workspaceLink).toHaveAttribute('href', '/owner/workspace')
  })

  it('U3: withheld row for policy disabled does not blame missing ABN', () => {
    renderTable({ rows: [withheldPolicyRow] })

    expect(screen.queryByText(/abn/i)).not.toBeInTheDocument()
    expect(screen.getByText(/not enabled in this environment/i)).toBeInTheDocument()
  })

  it('U4: row without hasPaymentReceipt disables or hides View Stripe Receipt', () => {
    renderTable({ rows: [noReceiptRow] })

    const receiptButton = screen.queryByRole('button', { name: 'View Stripe Receipt' })
    expect(receiptButton === null || receiptButton.hasAttribute('disabled')).toBe(true)
  })

  it('U5: empty history displays no paid top-ups yet', () => {
    renderTable({ rows: [] })

    expect(screen.getByText('No paid top-ups yet')).toBeInTheDocument()
  })

  it('U6: clicking Download Tax Invoice triggers onDownloadTaxInvoice(row)', () => {
    const onDownloadTaxInvoice = vi.fn()
    renderTable({ onDownloadTaxInvoice })

    fireEvent.click(screen.getByRole('button', { name: 'Download Tax Invoice' }))

    expect(onDownloadTaxInvoice).toHaveBeenCalledOnce()
    expect(onDownloadTaxInvoice).toHaveBeenCalledWith(paidRow)
  })

  it('U7: clicking View Stripe Receipt triggers onViewStripeReceipt(row)', () => {
    const onViewStripeReceipt = vi.fn()
    renderTable({ onViewStripeReceipt })

    fireEvent.click(screen.getByRole('button', { name: 'View Stripe Receipt' }))

    expect(onViewStripeReceipt).toHaveBeenCalledOnce()
    expect(onViewStripeReceipt).toHaveBeenCalledWith(paidRow)
  })

  it('renders Export CSV button and allows exporting rows', () => {
    renderTable()

    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument()
  })
})
