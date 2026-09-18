/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import { ActivityPage } from '@/routes/_operator/activity'
import { toast } from '@/lib/ui/toast'
import { downloadCsv, downloadJson } from '@/lib/export/csv-export'

afterEach(cleanup)

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

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
    useRouter: () => ({ invalidate: vi.fn(), navigate: vi.fn(), routesByPath: {} }),
    useMatches: () => [],
  }
})

describe('ActivityPage & Filtering (W-38)', () => {
  const sampleCalls = {
    page: [
      {
        callRef: 'call:1',
        accountRef: 'account:1',
        principalRef: 'agent:alpha',
        credentialRef: 'cred:1',
        applicationRef: 'app:1',
        toolRef: 'tool:1',
        providerRef: 'prov:1',
        toolLabel: 'Australian Tax Calculator',
        state: 'completed' as const,
        deliveryState: 'delivered' as const,
        paymentState: 'settled' as const,
        latencyMs: 142,
        audAmountUnits: '100000',
        createdAt: Date.now() - 3600 * 1000,
        updatedAt: Date.now() - 3600 * 1000,
      },
      {
        callRef: 'call:2',
        accountRef: 'account:1',
        principalRef: 'agent:beta',
        credentialRef: 'cred:2',
        applicationRef: 'app:2',
        toolRef: 'tool:2',
        providerRef: 'prov:2',
        toolLabel: 'Postal Address Lookup',
        state: 'refused' as const,
        deliveryState: 'not_delivered' as const,
        paymentState: 'released' as const,
        latencyMs: 85,
        audAmountUnits: '50000',
        createdAt: Date.now() - 86400 * 1000 * 10,
        updatedAt: Date.now() - 86400 * 1000 * 10,
      },
    ],
    continueCursor: '',
    isDone: true,
  }

  const sampleUsage = {
    kind: 'available' as const,
    dimensionKind: 'account' as const,
    dimensionRef: 'account:1',
    periodStartAt: Date.now() - 86400 * 1000 * 30,
    periodEndAt: Date.now(),
    callCountUnits: '2',
    completedCountUnits: '1',
    outcomeUnknownCountUnits: '0',
    updatedAt: Date.now(),
    source: 'convex_call_evidence' as const,
  }

  const sampleSpend = {
    kind: 'available' as const,
    currency: 'AUD' as const,
    exponent: 6 as const,
    spendUnits: '150000',
    transactionCountUnits: '2',
    periodStartAt: Date.now() - 86400 * 1000 * 30,
    periodEndAt: Date.now(),
    observedAt: Date.now(),
    source: 'formance_transaction_cursor' as const,
    authoritativeForConsequences: false as const,
  }

  const renderActivity = (overrides?: { filteredAgent?: string }) => {
    render(
      <ActivityPage
        result={{
          kind: 'available',
          calls: sampleCalls,
          usage: sampleUsage,
          spend: sampleSpend,
          periodStart: '2026-09',
          ...(overrides?.filteredAgent === undefined ? {} : { filteredAgent: overrides.filteredAgent }),
        }}
      />,
    )
  }

  beforeEach(() => {
    vi.mocked(downloadCsv).mockClear()
    vi.mocked(downloadJson).mockClear()
    vi.mocked(toast.success).mockClear()
  })

  it('renders table columns for Task, Caller Agent, Duration, Amount, and When', () => {
    renderActivity()

    expect(screen.getByText('Australian Tax Calculator')).toBeTruthy()
    expect(screen.getByText('Postal Address Lookup')).toBeTruthy()
    expect(screen.getByText('alpha')).toBeTruthy()
    expect(screen.getByText('beta')).toBeTruthy()
    expect(screen.getByText('142ms')).toBeTruthy()
    expect(screen.getByText('85ms')).toBeTruthy()
  })

  it('shows status chips with counts from loaded calls', () => {
    renderActivity()

    expect(screen.getByRole('button', { name: /All\s+2/u })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Completed\s+1/u })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Refused\s+1/u })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Needs Attention\s+0/u })).toBeTruthy()
  })

  it('shows date range chips with labels and aria-pressed', () => {
    renderActivity()

    const allTime = screen.getByRole('button', { name: 'All time' })
    const today = screen.getByRole('button', { name: 'Today' })
    const sevenDay = screen.getByRole('button', { name: '7d' })
    const thirtyDay = screen.getByRole('button', { name: '30d' })

    expect(allTime.getAttribute('aria-pressed')).toBe('true')
    expect(today.getAttribute('aria-pressed')).toBe('false')
    expect(sevenDay.getAttribute('aria-pressed')).toBe('false')
    expect(thirtyDay.getAttribute('aria-pressed')).toBe('false')
  })

  it('filters calls by status and date range', () => {
    renderActivity()

    fireEvent.click(screen.getByRole('button', { name: /Completed\s+1/u }))

    expect(screen.getByText('Australian Tax Calculator')).toBeTruthy()
    expect(screen.queryByText('Postal Address Lookup')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /All\s+2/u }))
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))

    expect(screen.getByText('Australian Tax Calculator')).toBeTruthy()
    expect(screen.queryByText('Postal Address Lookup')).toBeNull()
  })

  it('resets status and date filters', () => {
    renderActivity()

    fireEvent.click(screen.getByRole('button', { name: /Completed\s+1/u }))
    expect(screen.queryByText('Postal Address Lookup')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    expect(screen.getByText('Postal Address Lookup')).toBeTruthy()
  })

  it('renders status and purchase status badges with payment line', () => {
    renderActivity()

    expect(screen.getAllByText('Completed').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Refused').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Resolved — delivered')).toBeTruthy()
    expect(screen.getByText('Resolved — refunded')).toBeTruthy()
    expect(screen.getByText('Payment: Settled')).toBeTruthy()
    expect(screen.getByText('Payment: Released')).toBeTruthy()
  })

  it('shows export preview text for loaded record count', () => {
    renderActivity()

    expect(screen.getByText('Exporting 2 records')).toBeTruthy()
  })

  it('exports CSV with nine columns, tool labels, and count-aware success toast', () => {
    renderActivity()

    fireEvent.click(screen.getByRole('button', { name: /^CSV$/u }))

    expect(downloadCsv).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('Exported 2 records to CSV')

    const csvArg = vi.mocked(downloadCsv).mock.calls[0]?.[1]
    expect(typeof csvArg).toBe('string')
    const headerLine = (csvArg as string).split('\r\n')[0] ?? ''
    const columns = headerLine.split(',')
    expect(columns).toHaveLength(9)
    expect(columns).toContain('Net AUD')
    expect(csvArg).toContain('Australian Tax Calculator')
  })

  it('exports JSON with export document and count-aware success toast', () => {
    renderActivity()

    fireEvent.click(screen.getByRole('button', { name: /^JSON$/u }))

    expect(downloadJson).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('Exported 2 records to JSON')
    const payload = vi.mocked(downloadJson).mock.calls[0]?.[1] as {
      exportKind: string
      recordCount: number
    }
    expect(payload.exportKind).toBe('activity-calls')
    expect(payload.recordCount).toBe(2)
  })

  it('disables CSV and JSON export when no calls match filters', () => {
    renderActivity()

    fireEvent.click(screen.getByRole('button', { name: /Needs Attention\s+0/u }))

    expect(screen.getByRole('button', { name: /^CSV$/u })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: /^JSON$/u })).toHaveProperty('disabled', true)
  })

  it('shows loaded-only preview when more history is available', () => {
    render(
      <ActivityPage
        result={{
          kind: 'available',
          calls: {
            ...sampleCalls,
            isDone: false,
            continueCursor: 'cursor:next',
          },
          usage: sampleUsage,
          spend: sampleSpend,
          periodStart: '2026-09',
        }}
      />,
    )

    expect(screen.getByText('Exporting 2 loaded records')).toBeTruthy()
  })

  it('shows filter empty message when no calls match', () => {
    renderActivity()

    fireEvent.click(screen.getByRole('button', { name: /Needs Attention\s+0/u }))

    expect(screen.getByText('No calls match these filters')).toBeTruthy()
    expect(screen.getByText('No calls match the current filter criteria.')).toBeTruthy()
  })

  it('shows agent filter pill in the filter bar', () => {
    renderActivity({ filteredAgent: 'agent:alpha' })

    expect(screen.getByText(/Agent ·/u)).toBeTruthy()
    expect(within(screen.getByText(/Agent ·/u).parentElement as HTMLElement).getByText('alpha')).toBeTruthy()
    const dismissLinks = screen.getAllByRole('link').filter((link) => link.getAttribute('href') === '/activity')
    expect(dismissLinks.length).toBeGreaterThanOrEqual(1)
  })
})
