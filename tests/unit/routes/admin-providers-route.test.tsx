/** @vitest-environment jsdom */
import { createElement, type ComponentType, type ReactNode } from 'react'
import { getFunctionName, type FunctionReference } from 'convex/server'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import '../../setup/jsdom-platform'

const runtime = vi.hoisted((): {
  routes: Record<string, ComponentType>
  search: { filter?: 'all' | 'suppressed' }
  slug: string
  access: { kind: 'allowed'; role: 'owner_admin' | 'support' | 'reviewer' } | { kind: 'refused'; code: string }
  providers: unknown[]
  providerView: unknown
  paginationStatus: string
  loadMore: Mock
  navigate: Mock
} => ({
  routes: {},
  search: {},
  slug: 'provider-one',
  access: { kind: 'allowed', role: 'owner_admin' },
  providers: [],
  providerView: undefined,
  paginationStatus: 'Exhausted',
  loadMore: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (path: string) => (options: { component: ComponentType }) => {
    runtime.routes[path] = options.component
    return {
      ...options,
      useSearch: () => runtime.search,
      useParams: () => ({ slug: runtime.slug }),
      useNavigate: () => runtime.navigate,
    }
  },
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
  useLocation: () => ({ pathname: '/admin/providers', hash: '' }),
}))
vi.mock('convex/react', () => ({
  useQuery: (query: FunctionReference<'query'>) => (
    getFunctionName(query) === 'adminConsoleAudit:readAdminAuditAccess'
      ? runtime.access
      : runtime.providerView
  ),
  usePaginatedQuery: (_query: unknown, args: unknown) => args === 'skip'
    ? { results: [], status: 'LoadingFirstPage', loadMore: runtime.loadMore }
    : { results: runtime.providers, status: runtime.paginationStatus, loadMore: runtime.loadMore },
}))
vi.mock('@/lib/operator/route-options', () => ({ operatorRouteOptions: {} }))
vi.mock('@/components/ae/layout/AeOperatorPage', () => ({
  AeOperatorPage: ({ title, children, actions, contentOwnsHeading }: { title: string; children: ReactNode; actions?: ReactNode; contentOwnsHeading?: boolean }) => (
    <main>{contentOwnsHeading ? null : <h1>{title}</h1>}{actions}{children}</main>
  ),
}))
vi.mock('@/components/ae/layout/AeRouteNotFound', () => ({
  OperatorRouteNotFoundRecovery: ({ recoveryHref, recoveryLabel }: {
    recoveryHref: string
    recoveryLabel: string
  }) => <a href={recoveryHref}>{recoveryLabel}</a>,
}))
vi.mock('@/components/ae/admin/provider-object/SourceAuthorityReviewPanel', () => ({
  SourceAuthorityReviewPanel: () => <section>Source authority review</section>,
}))
vi.mock('@/components/ae/admin/actions/AdminActionSheet', () => ({
  AdminActionSheet: () => null,
}))

import '@/routes/_operator/admin.providers.index'
import '@/routes/_operator/admin.providers.$slug'

function renderRoute(path: string) {
  const Component = runtime.routes[path]
  if (Component === undefined) throw new Error(`admin_provider_route_missing:${path}`)
  return render(createElement(Component))
}

beforeEach(() => {
  runtime.search = {}
  runtime.slug = 'provider-one'
  runtime.access = { kind: 'allowed', role: 'owner_admin' }
  runtime.providers = []
  runtime.providerView = undefined
  runtime.paginationStatus = 'Exhausted'
})

afterEach(() => {
  cleanup()
  runtime.loadMore.mockReset()
  runtime.navigate.mockReset()
})

describe('admin Provider routes', () => {
  it('renders a Provider slug link in the list', () => {
    runtime.providers = [{
      slug: 'provider-one',
      publicStatus: 'published',
      trustTier: 'listed',
      suppressedAt: null,
      updatedAt: Date.UTC(2026, 8, 22),
    }]

    renderRoute('/_operator/admin/providers/')

    expect(screen.getByRole('link', { name: 'provider-one' }).getAttribute('href'))
      .toBe('/admin/providers/provider-one')
  })

  it('renders the Provider detail header', () => {
    runtime.providerView = {
      kind: 'provider',
      slug: 'provider-one',
      businessId: 'business-id:provider-one',
      publicStatus: 'published',
      trustTier: 'listed',
      suppressedAt: null,
      publications: [],
      connections: [],
      admissionCases: [],
      removalDisputes: [{ disputeRef: 'dispute:provider-one', status: 'opened', updatedAt: Date.UTC(2026, 8, 22) }],
      payout: 'unavailable',
    }

    renderRoute('/_operator/admin/providers/$slug')

    expect(screen.getAllByRole('heading', { level: 1 }).map(node => node.textContent)).toEqual(['Provider provider-one'])
    expect(screen.getByRole('button', { name: 'Copy Reference' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Suppress' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close dispute' })).toBeTruthy()

    cleanup()
    runtime.access = { kind: 'allowed', role: 'support' }
    renderRoute('/_operator/admin/providers/$slug')
    expect(screen.queryByRole('button', { name: 'Suppress' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Close dispute' })).toBeNull()
  })

  it('mounts source authority review when the view carries safe review material', () => {
    runtime.providerView = {
      kind: 'provider',
      slug: 'provider-one',
      publicStatus: 'published',
      businessId: 'business-id:provider-one',
      trustTier: 'listed',
      suppressedAt: null,
      publications: [{
        ref: `operation:v1:${'a'.repeat(64)}`,
        revision: 1,
        disposition: 'current',
        sourceAuthorityState: 'review_required',
        sourceAuthorityReview: {
          publicationRef: 'publication:provider-one',
          expectedRevision: 1,
          expectedSourceDigest: `sha256:${'b'.repeat(64)}`,
          operationRef: `operation:v1:${'a'.repeat(64)}`,
          sourceKind: 'x402',
          sourceUrl: 'https://provider.example/tool',
        },
      }],
      connections: [],
      admissionCases: [],
      removalDisputes: [],
      payout: 'unavailable',
    }

    renderRoute('/_operator/admin/providers/$slug')

    expect(screen.getByText('Source authority review')).toBeTruthy()
  })

  it('recovers to Search when the Provider does not exist', () => {
    runtime.providerView = { kind: 'object_not_found' }

    renderRoute('/_operator/admin/providers/$slug')

    expect(screen.getByRole('link', { name: 'Back to Search' }).getAttribute('href')).toBe('/admin/search')
  })
})
