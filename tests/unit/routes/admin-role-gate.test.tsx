/** @vitest-environment jsdom */
import type { ReactNode } from 'react'
import { getFunctionName, type FunctionReference } from 'convex/server'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import '../../setup/jsdom-platform'

const mocks = vi.hoisted((): {
  requireOperatorBeforeLoad: Mock
  auditAccess: { kind: string; code?: string }
  proposals: unknown[]
  events: unknown[]
  paginationStatus: string
  loadMore: Mock
  onSearchChange: Mock
} => ({
  requireOperatorBeforeLoad: vi.fn(),
  auditAccess: { kind: 'allowed' },
  proposals: [],
  events: [],
  paginationStatus: 'Exhausted',
  loadMore: vi.fn(),
  onSearchChange: vi.fn(),
}))

vi.mock('convex/react', () => ({
  useQuery: (query: FunctionReference<'query'>, args: unknown) => {
    if (args === 'skip') return undefined
    return getFunctionName(query) === 'adminConsoleAudit:readAdminAuditAccess'
      ? mocks.auditAccess
      : mocks.proposals
  },
  usePaginatedQuery: (_query: unknown, args: unknown) => args === 'skip'
    ? { results: [], status: 'LoadingFirstPage', loadMore: mocks.loadMore }
    : { results: mocks.events, status: mocks.paginationStatus, loadMore: mocks.loadMore },
}))
vi.mock('@clerk/tanstack-react-start', () => ({
  SignOutButton: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
  useLocation: () => ({ pathname: '/admin/index-health' }),
  useRouter: () => ({ invalidate: vi.fn() }),
}))
vi.mock('@/components/ae/layout/AeOperatorPage', () => ({
  AeOperatorPage: ({ title, description, children }: { title: string; description: string; children: ReactNode }) => (
    <main><h1>{title}</h1><p>{description}</p>{children}</main>
  ),
  useOperatorShellChrome: () => null,
}))
vi.mock('@/lib/server/require-operator-session', () => ({
  requireOperatorBeforeLoad: mocks.requireOperatorBeforeLoad,
}))

import { OperatorRouteForbidden } from '@/components/ae/layout/AeRouteError'
import { AdminAuditPage } from '@/components/ae/admin/audit/AdminAuditPage'
import { OperatorSurfaceForbiddenError } from '@/lib/operator/operator-context'
import { operatorLayoutRouteOptions } from '@/lib/operator/route-options'

beforeEach(() => {
  mocks.auditAccess = { kind: 'allowed' }
  mocks.proposals = []
  mocks.events = []
  mocks.paginationStatus = 'Exhausted'
})

afterEach(() => {
  cleanup()
  mocks.requireOperatorBeforeLoad.mockReset()
  mocks.loadMore.mockReset()
  mocks.onSearchChange.mockReset()
})

describe('admin role gate', () => {
  it('renders the Admin denial once with one heading and both recovery paths', () => {
    render(<OperatorRouteForbidden surface="admin" />)

    expect(screen.getAllByRole('heading', { level: 1, name: 'Admin access required' })).toHaveLength(1)
    expect(screen.getAllByText('Your account does not have the Admin role for this page.')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Ask an Admin for access' }).getAttribute('href')).toBe('/support')
    expect(screen.getByRole('link', { name: 'Browse Tools' }).getAttribute('href')).toBe('/market')
  })

  it('returns an expected forbidden route context instead of throwing', async () => {
    mocks.requireOperatorBeforeLoad.mockRejectedValueOnce(new OperatorSurfaceForbiddenError('admin'))

    await expect(operatorLayoutRouteOptions.beforeLoad({ location: { href: '/admin/index-health' } }))
      .resolves.toEqual({ kind: 'forbidden', surface: 'admin' })
  })

  it('keeps unexpected admission failures on the error path', async () => {
    const failure = new Error('operator source unavailable')
    mocks.requireOperatorBeforeLoad.mockRejectedValueOnce(failure)

    await expect(operatorLayoutRouteOptions.beforeLoad({ location: { href: '/admin/index-health' } }))
      .rejects.toBe(failure)
  })
})


describe('admin audit page', () => {
  it('shows the explicit refusal for a non-admin caller', () => {
    mocks.auditAccess = { kind: 'refused', code: 'missing_membership' }

    render(<AdminAuditPage search={{}} onSearchChange={mocks.onSearchChange} />)

    expect(screen.getByText('Your account does not have the Admin role for this action.')).toBeTruthy()
  })

  it('renders audit events for an allowed admin', () => {
    mocks.events = [{
      id: 'audit-row-1',
      createdAt: Date.UTC(2026, 8, 22, 8),
      eventType: 'admin.action_denied',
      actorRef: 'principal:admin',
      targetType: 'business',
      targetRef: 'provider-one',
      outcome: 'refused',
      correlationId: 'correlation:audit-1',
      admin: {
        permission: 'suppress_business',
        reasonCode: 'policy_violation',
        evidenceRefs: ['evidence:ticket-1'],
        beforeState: null,
        afterState: null,
      },
    }]

    render(<AdminAuditPage search={{}} onSearchChange={mocks.onSearchChange} />)

    expect(screen.getAllByText('admin.action_denied').length).toBeGreaterThan(0)
    expect(screen.getByText('policy_violation')).toBeTruthy()
  })

  it('renders an event-type chip and clears all URL filters', () => {
    render(
      <AdminAuditPage
        search={{ eventType: 'admin.action_denied' }}
        onSearchChange={mocks.onSearchChange}
      />,
    )

    expect(screen.getAllByText('Event type').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(mocks.onSearchChange).toHaveBeenCalledWith({})
  })
})
