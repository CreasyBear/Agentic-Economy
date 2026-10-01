/** @vitest-environment jsdom */
import type { ReactNode } from 'react'
import { getFunctionName, type FunctionReference } from 'convex/server'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { emptyMarketplaceFunding } from '@/modules/observability/public'
import { PAYMENT_READINESS_CHECK_KEYS, type PaymentReadinessChecks, type PaymentReadinessView } from '@/modules/money/payment-readiness'

const mocks = vi.hoisted(() => ({
  overview: {
    paymentReadiness: null,
  } as Record<string, unknown>,
  exceptions: [] as Array<{ kind: string; partition: string; observed: number; complete: boolean; unavailable: boolean }> | Error,
  metrics: {
    days: [], latestDay: null,
    headline: { settledCallValue: null, money: 'no_settled_usage', settledCalls: 0, successRate: null, transactingWorkspaces: 0 },
    ratios: { successRate: null, quoteConversion: null, returningWorkspaceRate: null, resolutionCoverage: null, takeRate: null },
    wow: { settledCalls: null, attemptedCalls: null, completedCalls: null, transactingWorkspaces: null, quotesCreated: null },
  } as Record<string, unknown> | Error,
}))

vi.mock('convex/react', () => ({
  usePaginatedQuery: () => ({ results: [], status: 'Exhausted', loadMore: vi.fn() }),
  useQuery: (query: FunctionReference<'query'>) => {
    const name = getFunctionName(query)
    if (name === 'adminConsoleAudit:readAdminAuditAccess') return { kind: 'allowed' }
    if (name === 'adminConsoleOverview:readAdminOverview') return mocks.overview
    if (name === 'adminConsoleExceptions:readAdminExceptionOverview') {
      if (mocks.exceptions instanceof Error) throw mocks.exceptions
      return mocks.exceptions
    }
    if (mocks.metrics instanceof Error) throw mocks.metrics
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

function passingReadiness(expiresAt: number): PaymentReadinessView {
  const passed = { kind: 'passed' as const, validUntil: expiresAt }
  return { kind: 'ready', environment: 'production', checkedAt: Date.now(), expiresAt, code: null,
    checks: { web_configuration: passed, formance: passed, cdp_custody: passed, base_rpc: passed,
      reference_rate: passed, sanctions: passed, commercial_policy: passed, treasury: passed } }
}

beforeEach(() => {
  mocks.overview = { paymentReadiness: null }
  mocks.exceptions = []
  mocks.metrics = {
    days: [], latestDay: null,
    headline: { settledCallValue: null, money: 'no_settled_usage', settledCalls: 0, successRate: null, transactingWorkspaces: 0 },
    ratios: { successRate: null, quoteConversion: null, returningWorkspaceRate: null, resolutionCoverage: null },
    wow: { settledCalls: null, attemptedCalls: null, completedCalls: null, transactingWorkspaces: null, quotesCreated: null },
  }
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('admin overview route', () => {
  it('links each observed partition to its own queue rather than the default partition', () => {
    mocks.exceptions = [
      { kind: 'removal_dispute', partition: 'opened', observed: 0, complete: true, unavailable: false },
      { kind: 'removal_dispute', partition: 'contested', observed: 20, complete: false, unavailable: false },
      { kind: 'admission_case', partition: 'submitted', observed: 0, complete: false, unavailable: true },
    ]
    render(<AdminOverviewPage />)
    expect(screen.getByRole('link', { name: 'Removal dispute · Contested' }).getAttribute('href'))
      .toBe('/admin/exceptions?kind=removal_dispute&partition=contested')
    expect(screen.queryByRole('link', { name: 'Removal dispute · Opened' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Admission case · Submitted' }).getAttribute('href'))
      .toBe('/admin/exceptions?kind=admission_case&partition=submitted')
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0)
  })


  it('contains a failed metrics read to its shelf while exception navigation and readiness remain visible', () => {
    mocks.metrics = new Error('injected_metrics_read_rejection')
    mocks.exceptions = [
      { kind: 'removal_dispute', partition: 'contested', observed: 1, complete: true, unavailable: false },
    ]
    render(<AdminOverviewPage />)
    expect(within(screen.getByRole('status', { name: 'Payment readiness status' })).getByText('Not ready')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Removal dispute · Contested' })).toBeTruthy()
    expect(screen.getByText('Metrics unavailable. Open Metrics to try again.')).toBeTruthy()
  })
  it('contains a failed exception read to its shelf while metrics remain usable', () => {
    mocks.exceptions = new Error('injected_exceptions_read_rejection')
    mocks.metrics = {
      coverageComplete: true, days: [], latestDay: null,
      funding: { ...emptyMarketplaceFunding('production'), buyingAccounts: 2, completedCustomerFundedCalls: 4, repeatBuyingAccounts: 1, accountCoverageComplete: true },
      headline: { settledCallValue: null, money: 'no_settled_usage', settledCalls: 4, successRate: 0.75, transactingWorkspaces: 2 },
    }
    render(<AdminOverviewPage />)
    expect(screen.getByText('Some exception sources are unavailable.')).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy()
    expect(within(screen.getByRole('tab', { name: /Buying Accounts/ })).getByText('2')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open queues' })).toBeTruthy()
  })


  it('renders refusal copy once when overview access is refused', () => {
    mocks.overview = { kind: 'refused', code: 'missing_membership' }
    render(<AdminOverviewPage />)
    expect(screen.getAllByText('Your account does not have the Admin role for this action.')).toHaveLength(1)
  })

  it('shows undeclared environment and eight failures without guessing a money world', () => {
    render(<AdminOverviewPage />)
    expect(screen.getByText('Environment: Not declared')).toBeTruthy()
    expect(screen.getByText('The deployment money environment is missing or invalid.')).toBeTruthy()
    expect(screen.getAllByText('Failed')).toHaveLength(8)
    expect(screen.queryByText('Ready')).toBeNull()
    expect(screen.queryByText('Environment: Sandbox · Base Sepolia')).toBeNull()
  })

  it('shows missing stored evidence as not ready in the explicit environment', () => {
    const failed = { kind: 'failed' as const, code: 'readiness_evidence_missing' }
    const checks: PaymentReadinessChecks = { web_configuration: failed, formance: failed, cdp_custody: failed,
      base_rpc: failed, reference_rate: failed, sanctions: failed, commercial_policy: failed, treasury: failed }
    mocks.overview = { paymentReadiness: { kind: 'not_ready', environment: 'sandbox',
      checkedAt: null, expiresAt: null, code: 'readiness_evidence_missing', checks } }
    render(<AdminOverviewPage />)
    expect(screen.getByText('Environment: Sandbox · Base Sepolia')).toBeTruthy()
    expect(screen.getAllByText('No current readiness evidence is available.')).toHaveLength(9)
    expect(screen.getAllByText('Failed')).toHaveLength(8)
    expect(screen.queryByText('Ready')).toBeNull()
  })

  it('shows a failed screening reason alongside proven provider checks without exposing machine codes', () => {
    const readiness = passingReadiness(Date.now() + 60_000)
    readiness.checks.sanctions = { kind: 'failed', code: 'trm_tenant_contract_unavailable' }
    mocks.overview = { paymentReadiness: { ...readiness, kind: 'not_ready', code: 'trm_tenant_contract_unavailable' } }
    render(<AdminOverviewPage />)
    expect(screen.getAllByText('Passed')).toHaveLength(7)
    expect(screen.getAllByText('Failed')).toHaveLength(1)
    expect(within(screen.getByText('Sanctions screening').closest('div')!).getByText(
      'The verified TRM Wallet Screening tenant contract is not connected.')).toBeTruthy()
    expect(screen.queryByText('trm_tenant_contract_unavailable')).toBeNull()
    expect(screen.queryByText('Clerk MFA claim')).toBeNull()
    expect(screen.queryByText('Ready')).toBeNull()
  })

  it('expires at the exact evidence deadline without a new database response', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'))
    const readiness = passingReadiness(Date.now() + 1_000)
    mocks.overview = { paymentReadiness: readiness }
    render(<AdminOverviewPage />)
    expect(screen.getByText('Ready')).toBeTruthy()
    expect(screen.getAllByText('Passed')).toHaveLength(PAYMENT_READINESS_CHECK_KEYS.length)
    act(() => vi.advanceTimersByTime(999))
    expect(screen.getByText('Ready')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByText('Ready')).toBeNull()
    expect(screen.getAllByText('Failed')).toHaveLength(8)
    expect(screen.getByText('Not ready')).toBeTruthy()
    expect(mocks.overview.paymentReadiness).toBe(readiness)
  })

  it('replaces an old expiry timer when fresh backend evidence arrives', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'))
    mocks.overview = { paymentReadiness: passingReadiness(Date.now() + 1_000) }
    const view = render(<AdminOverviewPage />)
    act(() => vi.advanceTimersByTime(500))
    mocks.overview = { paymentReadiness: passingReadiness(Date.now() + 2_000) }
    view.rerender(<AdminOverviewPage />)
    act(() => vi.advanceTimersByTime(500))
    expect(screen.getByText('Ready')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1_500))
    expect(screen.getByText('Not ready')).toBeTruthy()
  })

  it('rechecks expiry when a suspended tab regains focus', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'))
    mocks.overview = { paymentReadiness: passingReadiness(Date.now() + 1_000) }
    render(<AdminOverviewPage />)
    vi.setSystemTime(new Date('2026-10-01T00:00:02Z'))
    act(() => window.dispatchEvent(new Event('focus')))
    expect(screen.queryByText('Ready')).toBeNull()
    expect(screen.getByText('Not ready')).toBeTruthy()
  })
})
