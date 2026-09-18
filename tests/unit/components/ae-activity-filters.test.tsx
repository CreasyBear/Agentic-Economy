/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import { ActivityPage } from '@/routes/_operator/activity'

afterEach(cleanup)

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
    useRouter: () => ({ invalidate: vi.fn(), routesByPath: {} }),
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

  it('renders table columns for Task, Caller Agent, Duration, Amount, and When', () => {
    render(
      <ActivityPage
        result={{
          kind: 'available',
          calls: sampleCalls,
          usage: sampleUsage,
          spend: sampleSpend,
          periodStart: '2026-09',
        }}
      />,
    )

    expect(screen.getByText('Australian Tax Calculator')).toBeTruthy()
    expect(screen.getByText('Postal Address Lookup')).toBeTruthy()
    expect(screen.getByText('alpha')).toBeTruthy()
    expect(screen.getByText('beta')).toBeTruthy()
    expect(screen.getByText('142ms')).toBeTruthy()
    expect(screen.getByText('85ms')).toBeTruthy()
  })

  it('filters calls by status and date range', () => {
    render(
      <ActivityPage
        result={{
          kind: 'available',
          calls: sampleCalls,
          usage: sampleUsage,
          spend: sampleSpend,
          periodStart: '2026-09',
        }}
      />,
    )

    // Filter by completed status
    const completedFilter = screen.getByRole('button', { name: /^completed$/i })
    fireEvent.click(completedFilter)

    expect(screen.getByText('Australian Tax Calculator')).toBeTruthy()
    expect(screen.queryByText('Postal Address Lookup')).toBeNull()

    // Filter by date range: today
    const allStatus = screen.getByRole('button', { name: /^all$/i })
    fireEvent.click(allStatus)
    const todayFilter = screen.getByRole('button', { name: /^today$/i })
    fireEvent.click(todayFilter)

    expect(screen.getByText('Australian Tax Calculator')).toBeTruthy()
    expect(screen.queryByText('Postal Address Lookup')).toBeNull()
  })
})
