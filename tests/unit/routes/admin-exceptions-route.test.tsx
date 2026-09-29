/** @vitest-environment jsdom */
import { getFunctionName } from 'convex/server'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const mocks = vi.hoisted(() => ({ query: vi.fn(), paginated: vi.fn(), loadMore: vi.fn() }))
vi.mock('convex/react', () => ({ useQuery: mocks.query, usePaginatedQuery: mocks.paginated }))

import { AdminExceptionsPage } from '@/components/ae/admin/exceptions/AdminExceptionsPage'
import type { AdminExceptionsSearch } from '@/components/ae/admin/exceptions/exceptions.contracts'
import { parseBusinessSlug } from '@/modules/business/public'

const parsedSlug = parseBusinessSlug('exception-provider')
if (parsedSlug.kind === 'malformed') throw new Error('admin_exception_fixture_slug_invalid')
const callRef = `operation-invocation:v1:${'a'.repeat(64)}`
const toolRef = `operation:v1:${'b'.repeat(64)}`
const call = { kind: 'uncertain_call' as const, callRef, since: Date.now() - 60_000 }
const source = { kind: 'source_authority_review' as const, publicationRef: toolRef, businessSlug: parsedSlug.slug, since: Date.now() - 60_000 }
const dispute = { kind: 'removal_dispute' as const, disputeRef: 'dispute:route-test', businessSlug: parsedSlug.slug, since: Date.now() - 60_000, state: 'contested' as const }

function renderPage(search: AdminExceptionsSearch = {}, onSearchChange = vi.fn()) {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin/exceptions' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin/providers/$slug' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin/calls/$callRef' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin/tools/$toolRef' }),
  ])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  render(<RouterContextProvider router={router}><AdminExceptionsPage search={search} onSearchChange={onSearchChange} /></RouterContextProvider>)
  return { navigate: onSearchChange, router }
}

afterEach(() => { cleanup(); vi.resetAllMocks() })

describe('/admin/exceptions', () => {
  it('changes kind/partition without claiming an exact total and loads subsequent cursor pages', () => {
    mocks.query.mockImplementation((query, args) => args === 'skip' ? undefined
      : getFunctionName(query) === 'adminConsoleExceptions:readAdminExceptionOverview'
        ? [
            { kind: 'removal_dispute', partition: 'opened', observed: 0, complete: true, unavailable: false },
            { kind: 'removal_dispute', partition: 'updated', observed: 0, complete: true, unavailable: false },
            { kind: 'removal_dispute', partition: 'contested', observed: 20, complete: false, unavailable: false },
          ]
        : getFunctionName(query) === 'adminConsoleExceptions:readAdminException' ? dispute : [])
    mocks.paginated.mockReturnValue({ status: 'CanLoadMore', results: [dispute], loadMore: mocks.loadMore })
    const { navigate } = renderPage({ kind: 'removal_dispute', partition: 'contested' })
    expect(screen.getByRole('button', { name: 'Removal disputes (≥20)' })).toBeTruthy()
    expect(screen.getByText(/1 loaded \(partial\)/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(mocks.loadMore).toHaveBeenCalledWith(50)
    fireEvent.click(screen.getByRole('button', { name: 'Opened (0)' }))
    expect(navigate).toHaveBeenCalledWith({ kind: 'removal_dispute', partition: 'opened' })
    const refLink = screen.getByRole('link', { name: dispute.disputeRef })
    expect(refLink.getAttribute('href')).toContain('partition=contested&ref=dispute%3Aroute-test')
    fireEvent.click(screen.getByRole('button', { name: `View details: ${dispute.disputeRef}` }))
    expect(navigate).toHaveBeenCalledWith({ kind: 'removal_dispute', partition: 'contested', ref: dispute.disputeRef })
  })

  it.each([
    { row: call, kind: 'uncertain_call', partition: 'reconciliation_required', href: `/admin/calls/${encodeURIComponent(callRef)}`, ref: call.callRef },
    { row: source, kind: 'source_authority_review', partition: 'review_required', href: `/admin/tools/${encodeURIComponent(toolRef)}`, ref: source.publicationRef },
  ] as const)('opens $kind details at the durable object route, not a cursor-bound ref sheet', async ({ row, kind, partition, href, ref }) => {
    mocks.query.mockImplementation((query, args) => args === 'skip' ? undefined : getFunctionName(query) === 'adminConsoleExceptions:readAdminExceptionOverview'
      ? [{ kind, partition, observed: 1, complete: true, unavailable: false }]
      : [])
    mocks.paginated.mockReturnValue({ status: 'Exhausted', results: [row], loadMore: mocks.loadMore })
    const { navigate, router } = renderPage({ kind, partition })
    expect(screen.getByRole('link', { name: ref }).getAttribute('href')).toBe(href)
    fireEvent.click(screen.getByRole('button', { name: `View details: ${ref}` }))
    await waitFor(() => expect(router.state.location.pathname).toBe(href))
    expect(navigate).not.toHaveBeenCalled()
  })

  it('opens an exact admission case outside the loaded page and links its Provider record', () => {
    const admission = { kind: 'admission_case' as const, caseRef: 'case:route-test', businessSlug: parsedSlug.slug, since: Date.now() - 60_000, state: 'completed' as const }
    mocks.query.mockImplementation((query, args) => args === 'skip' ? undefined
      : getFunctionName(query) === 'adminConsoleExceptions:readAdminExceptionOverview'
        ? [{ kind: 'admission_case', partition: 'submitted', observed: 0, complete: true, unavailable: false }]
        : getFunctionName(query) === 'adminConsoleExceptions:readAdminException' ? admission : [])
    mocks.paginated.mockReturnValue({ status: 'Exhausted', results: [], loadMore: mocks.loadMore })
    renderPage({ kind: 'admission_case', ref: admission.caseRef })
    expect(screen.getByText(admission.caseRef)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open object record' }).getAttribute('href'))
      .toBe('/admin/providers/exception-provider')
  })

  it('counts the selected partition separately from the kind total', () => {
    mocks.query.mockImplementation((query, args) => args === 'skip' ? undefined : getFunctionName(query) === 'adminConsoleExceptions:readAdminExceptionOverview'
      ? [
          { kind: 'source_authority_review', partition: 'review_required', observed: 0, complete: true, unavailable: false },
          { kind: 'source_authority_review', partition: 'unset', observed: 20, complete: false, unavailable: false },
        ]
      : getFunctionName(query) === 'adminConsoleExceptions:listRecentPurchaseResolutions'
        ? [
            { callRef: `${callRef}`, terminalState: 'released', resolvedAt: Date.now() },
            { callRef: `operation-invocation:v1:${'c'.repeat(64)}`, terminalState: 'completed', resolvedAt: Date.now() },
            { callRef: `operation-invocation:v1:${'d'.repeat(64)}`, terminalState: 'refunded', resolvedAt: Date.now() },
            { callRef: `operation-invocation:v1:${'e'.repeat(64)}`, terminalState: 'disputed', resolvedAt: Date.now() },
          ]
        : [])
    mocks.paginated.mockReturnValue({ status: 'CanLoadMore', results: [], loadMore: mocks.loadMore })
    const { navigate } = renderPage({ kind: 'source_authority_review', partition: 'review_required', loaded: 100 })
    expect(screen.getByRole('button', { name: 'Source authority reviews (0)' })).toBeTruthy()
    expect(screen.getByText('All states (≥20)')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Review required (0)' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Legacy unset (≥20)' })).toBeTruthy()
    expect(screen.getByText('Released')).toBeTruthy()
    expect(screen.getByText('Completed')).toBeTruthy()
    expect(screen.getByText('Refunded')).toBeTruthy()
    expect(screen.getByText('Disputed')).toBeTruthy()
    expect(screen.queryByText('released')).toBeNull()
    expect(mocks.paginated).toHaveBeenCalledWith(expect.anything(), expect.anything(), { initialNumItems: 100 })
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(mocks.loadMore).toHaveBeenCalledWith(50)
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'source_authority_review',
      partition: 'review_required',
      loaded: 150,
    }))
  })

  it('marks a source unavailable rather than presenting its unknown count as zero', () => {
    mocks.query.mockImplementation((query, args) => args === 'skip' ? undefined : getFunctionName(query) === 'adminConsoleExceptions:readAdminExceptionOverview'
      ? [{ kind: 'admission_case', partition: 'submitted', observed: 0, complete: false, unavailable: true }]
      : [])
    mocks.paginated.mockReturnValue({ status: 'Exhausted', results: [], loadMore: mocks.loadMore })
    renderPage({ kind: 'admission_case' })
    expect(screen.getByRole('button', { name: 'Admission cases (Unavailable)' })).toBeTruthy()
    expect(screen.getAllByText('Exception source unavailable.').length).toBeGreaterThan(0)
  })
})
