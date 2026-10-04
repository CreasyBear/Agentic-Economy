/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import { AeActivity } from '@/components/ae/activity/AeActivity'
import { toast } from '@/lib/ui/toast'
import { downloadCsv, downloadJson } from '@/lib/export/csv-export'

afterEach(cleanup)

const routerMocks = vi.hoisted(() => ({ navigate: vi.fn().mockResolvedValue(undefined), exportPeriod: vi.fn() }))
vi.mock('@/lib/server/durable-usage-report.functions', () => ({
  requestOwnerUsageReportServer:routerMocks.exportPeriod,
  listOwnerUsageReportsServer:vi.fn().mockResolvedValue({page:[],isDone:true,continueCursor:''}),
  readOwnerUsageReportServer:vi.fn().mockResolvedValue({kind:'refused',code:'usage_report_unavailable'}),
  readOwnerUsageReportPartsServer:vi.fn(),
}))

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
    Link: ({ children, to, 'aria-label': label }: { children: ReactNode; to: string; 'aria-label'?: string }) => <a href={to} aria-label={label}>{children}</a>,
    useRouter: () => ({ invalidate: vi.fn(), navigate: routerMocks.navigate, routesByPath: {} }),
    useMatches: () => [],
    useLocation: () => ({ pathname: '/activity', hash: '' }),
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

  const windowScope = { periodStartAt: sampleUsage.periodStartAt, periodEndAt: sampleUsage.periodEndAt, dateRangeFilter: '30d' as const }

  const renderActivity = (overrides?: { filteredAgent?: string }) => {
    render(
      <AeActivity
        result={{
          kind: 'available',
          calls: sampleCalls,
          usage: sampleUsage,
          spend: sampleSpend,
          periodStart: '2026-09', ...windowScope,
          ...(overrides?.filteredAgent === undefined ? {} : { filteredAgent: overrides.filteredAgent }),
        }}
      />,
    )
  }

  beforeEach(() => {
    routerMocks.exportPeriod.mockReset()
    routerMocks.navigate.mockClear()
    vi.mocked(downloadCsv).mockClear()
    vi.mocked(downloadJson).mockClear()
    vi.mocked(toast.success).mockClear()
    vi.mocked(toast.error).mockClear()
  })

  it('shows time to outcome and no charge for a released reservation', () => {
    renderActivity()

    expect(screen.getAllByText('Australian Tax Calculator')).toHaveLength(1)
    expect(screen.getAllByText('Postal Address Lookup')).toHaveLength(1)
    expect(screen.getByText('agent:alpha').getAttribute('title')).toBe('agent:alpha')
    expect(screen.getByText('agent:beta').getAttribute('title')).toBe('agent:beta')
    expect(screen.getAllByText('142 ms')).toHaveLength(1)
    expect(screen.getAllByText('85 ms')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Time to outcome/u })).toBeTruthy()
    const releasedRow = screen.getByRole('row', { name: /Postal Address Lookup/u })
    expect(within(releasedRow).getByText('No charge')).toBeTruthy()
    expect(within(releasedRow).queryByText('A$0.05')).toBeNull()
  })

  it.each([
    [15_001, '15.0 s'], [65_432, '1 min 5 s'], [3_665_432, '1 hr 1 min'],
  ])('formats a %i ms Call without exposing a raw millisecond count', (latencyMs, expected) => {
    render(<AeActivity result={{ kind: 'available', calls: { ...sampleCalls, page: [{ ...sampleCalls.page[0]!, latencyMs }] },
      usage: sampleUsage, spend: sampleSpend, periodStart: '2026-09', ...windowScope }} />)
    expect(screen.getAllByText(expected)).toHaveLength(1)
  })

  it('keeps a Call needing review reachable and does not imply a zero charge', () => {
    const call = { ...sampleCalls.page[0]!, state: 'outcome_unknown' as const,
      deliveryState: 'unknown' as const, paymentState: 'unknown' as const, audAmountUnits: '0' }
    const result = { kind: 'available' as const, calls: { ...sampleCalls, page: [call] },
      usage: sampleUsage, spend: sampleSpend, periodStart: '2026-09', ...windowScope }
    const view = render(<AeActivity result={result} />)
    expect(screen.getAllByText('Needs review').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Not confirmed').length).toBeGreaterThan(0)
    expect(screen.queryByText('A$0.00')).toBeNull()
    expect(screen.getAllByRole('link', { name: 'Review Australian Tax Calculator' })[0]?.getAttribute('href')).toBe('/calls/call%3A1?returnRange=30d')
    view.rerender(<AeActivity result={{ ...result, calls: { ...sampleCalls, page: [sampleCalls.page[0]!] } }} />)
    expect(screen.queryByText('Needs review')).toBeNull()
    expect(screen.getAllByRole('link', { name: 'View receipt for Australian Tax Calculator' })).toHaveLength(1)
  })

  it('shows status chips with counts from loaded calls', () => {
    renderActivity()

    expect(screen.getByRole('button', { name: /All\s+2/u })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Completed\s+1/u })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Refused\s+1/u })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Outcome unknown\s+0/u })).toBeTruthy()
  })

  it('shows date range chips with labels and aria-pressed', () => {
    renderActivity()

    const thisMonth = screen.getByRole('button', { name: 'This month (UTC)' })
    const today = screen.getByRole('button', { name: 'Today (UTC)' })
    const sevenDay = screen.getByRole('button', { name: 'Last 7 days' })
    const thirtyDay = screen.getByRole('button', { name: 'Last 30 days' })

    expect(thisMonth.getAttribute('aria-pressed')).toBe('false')
    expect(today.getAttribute('aria-pressed')).toBe('false')
    expect(sevenDay.getAttribute('aria-pressed')).toBe('false')
    expect(thirtyDay.getAttribute('aria-pressed')).toBe('true')
  })

  it('moves selection and focus by keyboard within each filter group', () => {
    renderActivity()
    const status = screen.getByRole('group', { name: 'Call status' })
    const dates = screen.getByRole('group', { name: 'Call date range' })
    const all = within(status).getByRole('button', { name: /All\s+2/u })
    all.focus()
    fireEvent.keyDown(all, { key: 'ArrowRight' })
    const completed = within(status).getByRole('button', { name: /Completed\s+1/u })
    expect(document.activeElement).toBe(completed)
    expect(completed.getAttribute('aria-pressed')).toBe('true')
    expect(within(status).getAllByRole('button').filter(button => button.tabIndex === 0)).toEqual([completed])
    expect(screen.queryByText('Postal Address Lookup')).toBeNull()
    expect(within(dates).getByRole('button', { name: 'Last 30 days' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.keyDown(completed, { key: 'End' })
    const attention = within(status).getByRole('button', { name: /Outcome unknown\s+0/u })
    expect(document.activeElement).toBe(attention)
    expect(screen.getByRole('button', { name: /^Loaded CSV$/u })).toHaveProperty('disabled', true)
    fireEvent.keyDown(attention, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(all)
    expect(screen.getAllByText('Postal Address Lookup')).toHaveLength(1)

    const thirtyDays = within(dates).getByRole('button', { name: 'Last 30 days' })
    fireEvent.keyDown(thirtyDays, { key: 'Home' })
    const today = within(dates).getByRole('button', { name: 'Today (UTC)' })
    expect(document.activeElement).toBe(today)
    expect(routerMocks.navigate).toHaveBeenCalledWith({ to: '/activity', search: { range: 'today' } })
  })

  it('filters loaded calls by status and requests a fresh server range for dates', async () => {
    renderActivity()
    fireEvent.click(screen.getByRole('button', { name: /Completed\s+1/u }))
    expect(screen.getAllByText('Australian Tax Calculator')).toHaveLength(1)
    expect(screen.queryByText('Postal Address Lookup')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /All\s+2/u }))
    fireEvent.click(screen.getByRole('button', { name: 'Today (UTC)' }))
    await waitFor(() => expect(routerMocks.navigate).toHaveBeenCalledWith({ to: '/activity', search: { range: 'today' } }))
    expect(screen.getAllByText('Postal Address Lookup')).toHaveLength(1)
  })

  it('resets status and date filters', () => {
    renderActivity()

    fireEvent.click(screen.getByRole('button', { name: /Completed\s+1/u }))
    expect(screen.queryByText('Postal Address Lookup')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    expect(screen.getAllByText('Postal Address Lookup')).toHaveLength(1)
  })

  it('renders status and purchase status badges with payment line', () => {
    renderActivity()

    expect(screen.getAllByText('Completed').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Refused').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Resolved — delivered').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Resolved — refunded').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Payment: Settled')).toBeTruthy()
    expect(screen.getAllByText('Payment: Released')).toBeTruthy()
  })

  it('shows export preview text for loaded record count', () => {
    renderActivity()

    expect(screen.getByText('Exporting 2 records')).toBeTruthy()
  })

  it('exports usage CSV with seven columns and no unproven tax fields, tool labels, and count-aware success toast', () => {
    renderActivity()

    fireEvent.click(screen.getByRole('button', { name: /^Loaded CSV$/u }))

    expect(downloadCsv).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('Exported 2 records to CSV')

    const csvArg = vi.mocked(downloadCsv).mock.calls[0]?.[1]
    expect(typeof csvArg).toBe('string')
    const headerLine = (csvArg as string).split('\r\n')[0] ?? ''
    const columns = headerLine.split(',')
    expect(columns).toHaveLength(7)
    expect(columns).not.toContain('Net AUD')
    expect(columns).not.toContain('GST AUD')
    expect(csvArg).toContain('Australian Tax Calculator')
  })

  it('exports JSON with export document and count-aware success toast', () => {
    renderActivity()

    fireEvent.click(screen.getByRole('button', { name: /^Loaded JSON$/u }))

    expect(downloadJson).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('Exported 2 records to JSON')
    const payload = vi.mocked(downloadJson).mock.calls[0]?.[1] as {
      exportKind: string
      recordCount: number
    }
    expect(payload.exportKind).toBe('call-usage')
    expect(payload.recordCount).toBe(2)
  })

  it('rounds buyer display up only after exact spend aggregation while exports retain six-place amounts', () => {
    const calls = {
      ...sampleCalls,
      page: [
        { ...sampleCalls.page[0]!, audAmountUnits: '6' },
        { ...sampleCalls.page[1]!, paymentState: 'settled' as const, audAmountUnits: '6' },
      ],
    }
    render(<AeActivity result={{ kind: 'available', calls, usage: sampleUsage,
      spend: { ...sampleSpend, spendUnits: '12' }, periodStart: '2026-09', ...windowScope }} />)

    expect(screen.getByText('Gross settled charges').parentElement?.textContent).toContain('A$0.01')
    expect(screen.getAllByText('A$0.01').length).toBeGreaterThan(1)
    fireEvent.click(screen.getByRole('button', { name: /^Loaded CSV$/u }))
    const csv = vi.mocked(downloadCsv).mock.calls[0]?.[1]
    expect(csv).toContain('call:1,Australian Tax Calculator,prov:1,agent:alpha,0.000006,')

    fireEvent.click(screen.getByRole('button', { name: /^Loaded JSON$/u }))
    const document = vi.mocked(downloadJson).mock.calls[0]?.[1] as {
      records: readonly { costAud: string }[]
    }
    expect(document.records[0]).toMatchObject({ costAud: '0.000006' })
  })

  it('exports only booked AUD amounts; refunded and unknown Calls do not become charges', () => {
    const calls = {
      ...sampleCalls,
      page: [
        { ...sampleCalls.page[0]!, audAmountUnits: '9007199254740993' },
        { ...sampleCalls.page[1]!, paymentState: 'released' as const, audAmountUnits: '50000' },
        { ...sampleCalls.page[1]!, callRef: 'call:unknown', paymentState: 'unknown' as const,
          state: 'outcome_unknown' as const, audAmountUnits: '80000' },
        { ...sampleCalls.page[0]!, callRef: 'call:pending', paymentState: 'not_applicable' as const,
          state: 'outcome_unknown' as const, deliveryState: 'unknown' as const, audAmountUnits: '80000' },
      ],
    }
    render(<AeActivity result={{ kind: 'available', calls, usage: sampleUsage,
      spend: sampleSpend, periodStart: '2026-09', ...windowScope }} />)
    fireEvent.click(screen.getByRole('button', { name: /^Loaded JSON$/u }))
    const document = vi.mocked(downloadJson).mock.calls[0]?.[1] as {
      records: readonly { callRef: string; costAud: string }[]
    }
    expect(document.records[0]?.costAud).toBe('9007199254.740993')
    expect(document.records[1]).toMatchObject({ costAud: '0.000000' })
    expect(document.records[2]).toMatchObject({ costAud: 'Not confirmed' })
    expect(document.records[3]).toMatchObject({ costAud: 'Not confirmed' })
    const booked = document.records[0]!
    expect(BigInt(booked.costAud.replace('.', ''))).toBe(9007199254740993n)
    expect(booked).not.toHaveProperty('gstAud')
    expect(booked).not.toHaveProperty('netAud')
    fireEvent.click(screen.getByRole('button', { name: /^Loaded CSV$/u }))
    const csv = vi.mocked(downloadCsv).mock.calls[0]?.[1]
    expect(csv).toContain('9007199254.740993')
    expect(csv).toContain('call:unknown,Postal Address Lookup,prov:2,agent:beta,Not confirmed,')
    expect(csv).toContain('call:pending,Australian Tax Calculator,prov:1,agent:alpha,Not confirmed,')
  })

  it('refuses to export an invalid booked amount instead of substituting a display placeholder', () => {
    const calls = { ...sampleCalls, page: [{ ...sampleCalls.page[0]!, audAmountUnits: 'not-a-number' }] }
    render(<AeActivity result={{ kind: 'available', calls, usage: sampleUsage,
      spend: sampleSpend, periodStart: '2026-09', ...windowScope }} />)
    fireEvent.click(screen.getByRole('button', { name: /^Loaded CSV$/u }))
    fireEvent.click(screen.getByRole('button', { name: /^Loaded JSON$/u }))
    expect(downloadCsv).not.toHaveBeenCalled()
    expect(downloadJson).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledTimes(2)
  })

  it('exports a terminal no-delivery refusal as zero while a completed Call without payment evidence stays unconfirmed', () => {
    const calls = { ...sampleCalls, page: [
      { ...sampleCalls.page[0]!, paymentState: 'not_applicable' as const },
      { ...sampleCalls.page[1]!, paymentState: 'not_applicable' as const },
    ] }
    render(<AeActivity result={{ kind: 'available', calls, usage: sampleUsage, spend: sampleSpend,
      periodStart: 'Test range', ...windowScope }} />)
    const completed = screen.getByRole('row', { name: /Australian Tax Calculator/u })
    expect(within(completed).getByText('Not confirmed')).toBeTruthy()
    const refused = screen.getByRole('row', { name: /Postal Address Lookup/u })
    expect(within(refused).getByText('No charge')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^Loaded JSON$/u }))
    const exported = vi.mocked(downloadJson).mock.calls[0]?.[1] as { records: readonly { costAud: string }[] }
    expect(exported.records.map(({ costAud }) => costAud)).toEqual(['Not confirmed', '0.000000'])
  })

  it('disables CSV and JSON export when no calls match filters', () => {
    renderActivity()

    fireEvent.click(screen.getByRole('button', { name: /Outcome unknown\s+0/u }))

    expect(screen.getByRole('button', { name: /^Loaded CSV$/u })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: /^Loaded JSON$/u })).toHaveProperty('disabled', true)
  })

  it('shows loaded-only preview when more history is available', () => {
    render(
      <AeActivity
        result={{
          kind: 'available',
          calls: {
            ...sampleCalls,
            isDone: false,
            continueCursor: 'cursor:next',
          },
          usage: sampleUsage,
          spend: sampleSpend,
          periodStart: '2026-09', ...windowScope,
        }}
      />,
    )

    expect(screen.getByText('Exporting 2 loaded records')).toBeTruthy()
  })

  it('sorts numeric amounts, duration and timestamps instead of their display text', () => {
    const first = sampleCalls.page[0]!
    const calls = { ...sampleCalls, page: [
      { ...first, callRef: 'call:large', toolLabel: 'Larger', audAmountUnits: '10000000', latencyMs: 10_000, createdAt: Date.UTC(2026, 11, 1) },
      { ...first, callRef: 'call:small', toolLabel: 'Smaller', audAmountUnits: '2000000', latencyMs: 2_000, createdAt: Date.UTC(2026, 0, 1) },
    ] }
    render(<AeActivity result={{ kind: 'available', calls, usage: sampleUsage, spend: sampleSpend,
      periodStart: 'Test range', ...windowScope }} />)
    for (const label of ['Amount', 'Time to outcome', 'When']) {
      const control = screen.getByRole('button', { name: new RegExp(label, 'u') })
      fireEvent.click(control)
      if (control.closest('th')?.getAttribute('aria-sort') !== 'ascending') fireEvent.click(control)
      const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
      expect(rows[0]?.textContent).toContain('Smaller')
      expect(rows[1]?.textContent).toContain('Larger')
    }
  })

  it('keeps exact unit ordering beyond Number precision and unknown amounts last', () => {
    const first = sampleCalls.page[0]!
    const { audAmountUnits: omittedAmount, ...withoutAmount } = first
    void omittedAmount
    const calls = { ...sampleCalls, page: [
      { ...first, callRef: 'call:large', toolLabel: 'Larger', audAmountUnits: '9007199254740993' },
      { ...first, callRef: 'call:small', toolLabel: 'Smaller', audAmountUnits: '9007199254740992' },
      { ...withoutAmount, callRef: 'call:missing', toolLabel: 'Missing' },
    ] }
    render(<AeActivity result={{ kind: 'available', calls, usage: sampleUsage, spend: sampleSpend,
      periodStart: 'Test range', ...windowScope }} />)
    fireEvent.click(screen.getByRole('button', { name: /Amount/u }))
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows[0]?.textContent).toContain('Smaller')
    expect(rows[1]?.textContent).toContain('Larger')
    expect(rows[2]?.textContent).toContain('Missing')
  })

  it('shows filter empty message when no calls match', () => {
    renderActivity()

    fireEvent.click(screen.getByRole('button', { name: /Outcome unknown\s+0/u }))

    expect(screen.getByText('No Calls match these filters')).toBeTruthy()
    const emptyState = screen.getByText('No Calls in this period have the selected status.').closest('[role="status"]') as HTMLElement
    expect(emptyState).toBeTruthy()
    fireEvent.click(within(emptyState).getByRole('button', { name: 'Reset filters' }))
    expect(screen.queryByText('No Calls match these filters')).toBeNull()
  })

  it('shows agent filter pill in the filter bar', () => {
    renderActivity({ filteredAgent: 'agent:alpha' })

    expect(screen.getByText(/Agent ·/u)).toBeTruthy()
    expect(within(screen.getByText(/Agent ·/u).parentElement as HTMLElement).getByText('agent:alpha')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear agent filter' }))
    expect(routerMocks.navigate).toHaveBeenCalledWith({ to: '/activity', search: { range: '30d' } })
  })

  it('requests the full filtered period and never simulates a download after a source failure', async () => {
    routerMocks.exportPeriod.mockRejectedValueOnce(new Error('call_export_source_changed'))
    renderActivity({ filteredAgent: 'agent:alpha' })
    fireEvent.click(screen.getByRole('button', { name: /Completed\s+1/u }))
    fireEvent.click(screen.getByRole('button', { name: 'Full period JSON' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not export the full period.', expect.any(Object)))
    expect(routerMocks.exportPeriod).toHaveBeenCalledWith({ data: {
      reportRef:expect.stringMatching(/^call-usage-export:/u),
      periodStartAt: windowScope.periodStartAt, periodEndAt: windowScope.periodEndAt,
      status: 'completed', principalRef: 'agent:alpha',
    } })
    expect(downloadJson).not.toHaveBeenCalled()
    expect(downloadCsv).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Full period JSON' })).not.toHaveProperty('disabled', true)
  })
})
