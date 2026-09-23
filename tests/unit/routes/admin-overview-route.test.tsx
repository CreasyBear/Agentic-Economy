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
  exceptions: {
    items: [], unavailable: [], total: 0, truncated: false,
    counts: { uncertain_call: 0, removal_dispute: 0, source_authority_review: 0, admission_case: 0 },
  } as Record<string, unknown>,
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
    if (name === 'adminConsoleExceptions:listAdminExceptions') return mocks.exceptions
    return mocks.metrics
  },
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
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
  mocks.exceptions = {
    items: [], unavailable: [], total: 0, truncated: false,
    counts: { uncertain_call: 0, removal_dispute: 0, source_authority_review: 0, admission_case: 0 },
  }
})
afterEach(() => cleanup())

describe('admin overview route', () => {
  it('renders configuration truth, headline cards, and the empty exception state', () => {
    render(<AdminOverviewPage formance="not_configured" />)
    expect(screen.getByText('Formance: Not configured')).toBeTruthy()
    expect(screen.getByText('Clerk MFA claim: Absent')).toBeTruthy()
    expect(screen.getByText('Settled Call value')).toBeTruthy()
    expect(screen.getByText('No settled usage')).toBeTruthy()
    expect(screen.getByText('Settled Calls')).toBeTruthy()
    expect(screen.getByText('Success rate')).toBeTruthy()
    expect(screen.getByText('Transacting Workspaces')).toBeTruthy()
    expect(screen.getByText('Nothing needs attention.')).toBeTruthy()
    expect(screen.getByText('View all (0)')).toBeTruthy()
  })

  it('shows only unavailable warning when an exception source failed', () => {
    mocks.exceptions = {
      items: [], unavailable: ['source_authority_review'], total: 0, truncated: false,
      counts: { uncertain_call: 0, removal_dispute: 0, source_authority_review: 0, admission_case: 0 },
    }
    render(<AdminOverviewPage formance="not_configured" />)
    expect(screen.getByText('Some exception sources are unavailable.')).toBeTruthy()
    expect(screen.queryByText('Nothing needs attention.')).toBeNull()
    expect(screen.getByText('View all (0)')).toBeTruthy()
  })

  it('renders refusal copy once when overview access is refused', () => {
    mocks.overview = { kind: 'refused', code: 'missing_membership' }
    render(<AdminOverviewPage formance="not_configured" />)
    expect(screen.getAllByText('Your account does not have the Admin role for this action.')).toHaveLength(1)
  })
})
