/** @vitest-environment jsdom */
import type { ReactNode } from 'react'
import { getFunctionName, type FunctionReference } from 'convex/server'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const mocks = vi.hoisted(() => ({
  overview: {
    x402Custody: 'not_configured' as const,
    clerkFva: 'absent' as const,
    convex: 'ok' as const,
  } as Record<string, unknown>,
  exceptions: [] as Array<{ kind: string; partition: string; observed: number; complete: boolean; unavailable: boolean }>,
  metrics: {
    days: [], latestDay: null,
    headline: { settledCallValue: null, money: 'no_settled_usage', settledCalls: 0, successRate: null, transactingWorkspaces: 0 },
    ratios: { successRate: null, quoteConversion: null, returningWorkspaceRate: null, resolutionCoverage: null, takeRate: null },
    wow: { settledCalls: null, attemptedCalls: null, completedCalls: null, transactingWorkspaces: null, quotesCreated: null },
  } as Record<string, unknown>,
}))

vi.mock('convex/react', () => ({
  useQuery: (query: FunctionReference<'query'>) => {
    const name = getFunctionName(query)
    if (name === 'adminConsoleOverview:readAdminOverview') return mocks.overview
    if (name === 'adminConsoleExceptions:readAdminExceptionOverview') return mocks.exceptions
    return mocks.metrics
  },
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useLocation: () => ({ pathname: '/admin', hash: '' }),
}))
vi.mock('@/components/ae/admin/object-search/useAdminObjectSearch', () => ({
  useAdminObjectSearch: () => ({ state: { kind: 'idle' }, submit: vi.fn() }),
}))
vi.mock('@/components/ae/layout/AeOperatorPage', () => ({
  AeOperatorPage: ({ title, children }: { title: string; children: ReactNode }) => <main><h1>{title}</h1>{children}</main>,
}))

import { AdminOverviewPage } from '@/components/ae/admin/overview/AdminOverviewPage'

beforeEach(() => {
  mocks.overview = { x402Custody: 'not_configured', clerkFva: 'absent', convex: 'ok' }
  mocks.exceptions = []
})
afterEach(() => cleanup())

describe('admin overview route', () => {
  it('links each observed partition to its own queue rather than the default partition', () => {
    mocks.exceptions = [
      { kind: 'removal_dispute', partition: 'opened', observed: 0, complete: true, unavailable: false },
      { kind: 'removal_dispute', partition: 'contested', observed: 20, complete: false, unavailable: false },
      { kind: 'admission_case', partition: 'submitted', observed: 0, complete: false, unavailable: true },
    ]
    render(<AdminOverviewPage formance="not_configured" />)
    expect(screen.getByRole('link', { name: 'Removal dispute · Contested' }).getAttribute('href'))
      .toBe('/admin/exceptions?kind=removal_dispute&partition=contested')
    expect(screen.queryByRole('link', { name: 'Removal dispute · Opened' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Admission case · Submitted' }).getAttribute('href'))
      .toBe('/admin/exceptions?kind=admission_case&partition=submitted')
    expect(screen.getByText('Unavailable')).toBeTruthy()
  })


  it('renders refusal copy once when overview access is refused', () => {
    mocks.overview = { kind: 'refused', code: 'missing_membership' }
    render(<AdminOverviewPage formance="not_configured" />)
    expect(screen.getAllByText('Your account does not have the Admin role for this action.')).toHaveLength(1)
  })
})
