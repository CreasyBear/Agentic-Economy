/** @vitest-environment jsdom */
import { createElement, type ComponentType, type ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const runtime = vi.hoisted(() => ({
  param: 'quoteRef',
  ref: '',
  query: vi.fn(),
  routes: new Map<string, ComponentType>(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (path: string) => (options: { component: ComponentType }) => {
    runtime.routes.set(path, options.component)
    return {
      ...options,
      useParams: () => ({ [runtime.param]: runtime.ref }),
    }
  },
  useLocation: () => ({ pathname: '/admin/search', hash: '' }),
}))
vi.mock('convex/react', () => ({
  useQuery: runtime.query,
  usePaginatedQuery: () => ({ results: [], status: 'Exhausted', loadMore: vi.fn() }),
}))
vi.mock('@/lib/operator/route-options', () => ({ operatorRouteOptions: {} }))
vi.mock('@/components/ae/layout/AeOperatorPage', () => ({
  AeOperatorPage: ({ title, children }: { title: string; children: ReactNode }) => (
    <main><h1>{title}</h1>{children}</main>
  ),
}))
vi.mock('@/components/ae/layout/AeRouteNotFound', () => ({
  OperatorRouteNotFoundRecovery: ({ recoveryHref, recoveryLabel }: {
    recoveryHref: string
    recoveryLabel: string
  }) => <a href={recoveryHref}>{recoveryLabel}</a>,
}))
vi.mock('@/components/ae/data/AeCopyReference', () => ({
  AeCopyReference: ({ value }: { value: string }) => <code>{value}</code>,
}))

import '@/routes/_operator/admin.quotes.$quoteRef'
import '@/routes/_operator/admin.tools.$toolRef'
import '@/routes/_operator/admin.workspaces.$accountRef'
import '@/routes/_operator/admin.agents.$principalRef'

const quoteRef = `operation-commitment:v1:${'a'.repeat(64)}`
const toolRef = `operation:v1:${'b'.repeat(64)}`
const accountRef = 'acc_00000000000000000000000000000001'
const principalRef = 'prn_00000000000000000000000000000001'

const quoteCase = {
  path: '/_operator/admin/quotes/$quoteRef',
  param: 'quoteRef',
  ref: quoteRef,
  heading: 'Quote',
  view: {
    kind: 'quote', state: 'issued', ref: quoteRef, toolRef: null, workspaceRef: null,
    agentRef: null, createdAt: Date.UTC(2026, 8, 22), expiresAt: null, consumedCallRef: null,
  },
}

const cases = [
  quoteCase,
  {
    path: '/_operator/admin/tools/$toolRef',
    param: 'toolRef',
    ref: toolRef,
    heading: 'Tool version',
    view: {
      kind: 'tool_version', ref: toolRef, publicationRef: 'publication:one', revision: null,
      disposition: 'current', businessSlug: 'provider-one', sourceAuthorityState: 'verified',
      admissionCaseRef: null, readinessValidUntil: null,
    },
  },
  {
    path: '/_operator/admin/workspaces/$accountRef',
    param: 'accountRef',
    ref: accountRef,
    heading: 'Account',
    view: {
      kind: 'workspace', ref: accountRef, lifecycle: 'active', ownerCount: 1, memberCount: 2,
      createdAt: Date.UTC(2026, 8, 22), externalOrganizationBound: true,
      hasActiveSpendingPolicy: false,
    },
  },
  {
    path: '/_operator/admin/agents/$principalRef',
    param: 'principalRef',
    ref: principalRef,
    heading: 'Agent',
    view: {
      kind: 'agent', ref: principalRef, workspaceRef: accountRef, credentialLifecycle: 'active',
      spendingPolicyRef: null, recentCallRefs: [],
    },
  },
]

function renderRoute(path: string, param: string, ref: string, queryResult: unknown) {
  runtime.param = param
  runtime.ref = ref
  runtime.query.mockReturnValue(queryResult)
  const Component = runtime.routes.get(path)
  if (Component === undefined) throw new Error(`admin_object_route_missing:${path}`)
  return render(createElement(Component))
}

afterEach(() => {
  cleanup()
  runtime.query.mockReset()
})

describe('admin object page routes', () => {
  it.each(cases)('renders the $view.kind identity and copyable reference', ({ path, param, ref, view, heading }) => {
    renderRoute(path, param, ref, view)
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeTruthy()
    expect(screen.getByText(ref)).toBeTruthy()
  })

  it('recovers to Search when the object does not exist', () => {
    renderRoute(quoteCase.path, quoteCase.param, quoteCase.ref, { kind: 'object_not_found' })
    expect(screen.getByRole('link', { name: 'Back to Search' }).getAttribute('href')).toBe('/admin/search')
  })

  it('recovers to Search when the route parameter is malformed', () => {
    renderRoute(quoteCase.path, quoteCase.param, 'not-a-quote', undefined)
    expect(screen.getByRole('link', { name: 'Back to Search' }).getAttribute('href')).toBe('/admin/search')
    expect(runtime.query).not.toHaveBeenCalled()
  })
})
