/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import {
  AeInvoiceHistoryTable,
  type AeInvoiceHistoryRow,
} from '@/components/ae/console/AeInvoiceHistoryTable'
import { formatAudAmountString } from '@/components/ae/console/credit-top-up-format'
import { downloadCsv, downloadJson } from '@/lib/export/csv-export'
import { toast } from '@/lib/ui/toast'
import { formatTimestamp } from '@/lib/ui/format-time'
import { calculateAudGstSplit } from '@/modules/money/public'

vi.mock('@/lib/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('@/lib/export/csv-export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/export/csv-export')>()
  return {
    ...actual,
    downloadCsv: vi.fn(),
    downloadJson: vi.fn(),
  }
})

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

const withheldPendingRow: AeInvoiceHistoryRow = {
  commandRef: 'funding:w24:u5:pending',
  createdAt,
  description: 'Account top-up',
  totalUnits: '5280000',
  status: 'succeeded',
  appliedTransactionRef: 'formance:tx:w24:u5',
  hasPaymentReceipt: true,
  taxInvoice: {
    kind: 'withheld',
    reason: 'tax_invoice_not_generated',
  },
}

const reversedRow: AeInvoiceHistoryRow = {
  ...paidRow,
  commandRef: 'funding:w24:u6:reversed',
  status: 'reversed',
}

const noReceiptRow: AeInvoiceHistoryRow = {
  ...paidRow,
  commandRef: 'funding:w24:u4:no-receipt',
  hasPaymentReceipt: false,
}

function renderTable(
  props: Readonly<{
    rows?: readonly AeInvoiceHistoryRow[]
    isLoading?: boolean
    onDownloadTaxInvoice?: (row: AeInvoiceHistoryRow) => void | Promise<void>
    onViewStripeReceipt?: (row: AeInvoiceHistoryRow) => void | Promise<void>
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
        {...(props.isLoading === undefined ? {} : { isLoading: props.isLoading })}
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
    const workspaceLink = screen.getByRole('link', { name: /tax details missing/i })
    expect(workspaceLink).toHaveAttribute('href', '/owner/workspace')
    expect(workspaceLink.textContent).toMatch(/abn/i)
  })

  it('U3: withheld row for policy disabled does not blame missing ABN', () => {
    renderTable({ rows: [withheldPolicyRow] })

    expect(screen.queryByText(/abn/i)).not.toBeInTheDocument()
    expect(screen.getByText(/disabled for this environment/i)).toBeInTheDocument()
  })

  it('U4: row without hasPaymentReceipt disables or hides View Stripe Receipt', () => {
    renderTable({ rows: [noReceiptRow] })

    const receiptButton = screen.queryByRole('button', { name: 'View Stripe Receipt' })
    expect(receiptButton === null || receiptButton.hasAttribute('disabled')).toBe(true)
  })

  it('U5: empty history displays no paid top-ups yet', () => {
    renderTable({ rows: [] })

    expect(screen.getByRole('heading', { name: 'No paid top-ups yet' })).toBeInTheDocument()
    expect(screen.getByText(/workspace tax profile allows issuance/i)).toBeInTheDocument()
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

  it('loading skeleton renders table structure, export toolbar placeholders, and 3 skeleton rows', () => {
    const { container } = renderTable({ isLoading: true })

    expect(screen.getByRole('status', { name: 'Loading invoice history' })).toHaveAttribute(
      'aria-busy',
      'true',
    )
    const toolbar = container.querySelector('.min-h-touch.flex-wrap.items-center.justify-end')
    expect(toolbar).toBeTruthy()
    expect(toolbar?.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText('Date')).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()
    const table = screen.getByRole('table')
    const bodyRows = within(table).getAllByRole('row').slice(1)
    expect(bodyRows).toHaveLength(3)
  })

  it('empty state renders structured empty card', () => {
    const { container } = renderTable({ rows: [] })

    const card = container.querySelector('.rounded-lg.border')
    expect(card).toBeTruthy()
    expect(within(card as HTMLElement).getByRole('heading')).toHaveTextContent('No paid top-ups yet')
  })

  it('amount shows GST included line when split is available', () => {
    renderTable()
    const split = calculateAudGstSplit('5280000', 1_000)
    expect(split).toBeDefined()
    if (split === undefined) return
    expect(
      screen.getByText(`${formatAudAmountString(split.gstUnits)} GST included`),
    ).toBeInTheDocument()
  })

  it('badges are used for Paid and Reversed', () => {
    renderTable({ rows: [paidRow, reversedRow] })

    expect(screen.getByText('Paid').closest('[data-slot="badge"]')).toBeTruthy()
    expect(screen.getByText('Reversed').closest('[data-slot="badge"]')).toBeTruthy()
  })

  it('tax invoice pending generation copy for tax_invoice_not_generated', () => {
    renderTable({ rows: [withheldPendingRow] })

    expect(screen.getByText(/tax invoice pending generation/i)).toBeInTheDocument()
  })

  it('shows export preview text for row count', () => {
    renderTable()

    expect(screen.getByText('Exporting 1 record')).toBeInTheDocument()
  })

  it('export CSV produces 8 columns including GST AUD and Net AUD, and count-aware toast', () => {
    renderTable()

    fireEvent.click(screen.getByRole('button', { name: /^CSV$/u }))

    expect(downloadCsv).toHaveBeenCalledOnce()
    const csvContent = vi.mocked(downloadCsv).mock.calls[0]?.[1] ?? ''
    const headerLine = csvContent.split('\r\n')[0] ?? ''
    expect(headerLine).toContain('GST AUD')
    expect(headerLine).toContain('Net AUD')
    expect(headerLine.split(',')).toHaveLength(8)
    expect(toast.success).toHaveBeenCalledWith('Exported 1 record to CSV')
  })

  it('export JSON downloads billing-topups document and count-aware toast', () => {
    renderTable()

    fireEvent.click(screen.getByRole('button', { name: /^JSON$/u }))

    expect(downloadJson).toHaveBeenCalledOnce()
    expect(vi.mocked(downloadJson).mock.calls[0]?.[0]).toMatch(/billing-topups-.*\.json/u)
    const payload = vi.mocked(downloadJson).mock.calls[0]?.[1] as {
      exportKind: string
      recordCount: number
    }
    expect(payload.exportKind).toBe('billing-topups')
    expect(payload.recordCount).toBe(1)
    expect(toast.success).toHaveBeenCalledWith('Exported 1 record to JSON')
  })

  it('download Tax Invoice failure triggers toast.error with Rule 4 money safety description', async () => {
    const onDownloadTaxInvoice = vi.fn().mockRejectedValue(new Error('network'))
    renderTable({ onDownloadTaxInvoice })

    fireEvent.click(screen.getByRole('button', { name: 'Download Tax Invoice' }))

    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Could not open tax invoice.',
        expect.objectContaining({
          description: expect.stringMatching(/A\$0\.00 charged/i),
        }),
      )
    })
  })

  it('view Stripe Receipt failure triggers toast.error with Rule 4 money safety description', async () => {
    const onViewStripeReceipt = vi.fn().mockRejectedValue(new Error('network'))
    renderTable({ onViewStripeReceipt })

    fireEvent.click(screen.getByRole('button', { name: 'View Stripe Receipt' }))

    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Could not open Stripe receipt.',
        expect.objectContaining({
          description: expect.stringMatching(/A\$0\.00 charged/i),
        }),
      )
    })
  })
})
