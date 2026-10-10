/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from '@tanstack/react-router'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { formatTimestamp } from '@/lib/ui/format-time'

const mocks = vi.hoisted(() => ({
  detailProps: vi.fn(),
  action: vi.fn(async () => ({ kind: 'applied', message: 'ok' })),
  invalidate: vi.fn(async () => undefined),
}))

vi.mock('@/components/ae/offerings/provider-workspace.functions', () => ({
  readOwnerToolBySlugServer: vi.fn(),
  readProviderToolStatusServer: vi.fn(),
  readProviderWorkspaceIdentityDetailServer: vi.fn(),
}))
vi.mock('@/components/ae/layout/AeOperatorPage', () => ({
  AeOperatorPage: ({ children, title, actions }: { children: ReactNode; title: string; actions?: ReactNode }) => createElement(
    'main',
    null,
    createElement('h1', null, title),
    actions,
    children,
  ),
}))
vi.mock('@/components/ae/supply/AeProviderToolDetail', () => ({
  AeProviderToolDetail: (props: { name: string; resumeHref?: string }) => { mocks.detailProps(props); return createElement('div', { 'data-testid': 'tool-detail' }, props.name) },
}))
vi.mock('@/modules/capability-supply/supply-funnel.functions', () => ({
  recheckOwnerCapabilityServer: vi.fn(),
  republishOwnerCapabilityServer: vi.fn(),
  withdrawOwnerCapabilityServer: vi.fn(),
}))
vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-start')>()),
  useServerFn: () => mocks.action,
}))
vi.mock('@clerk/tanstack-react-start', () => ({ useReverification: (fn: unknown) => fn }))
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useRouter: () => ({ invalidate: mocks.invalidate }),
}))

import { Route as OwnerToolDetailRoute } from '@/routes/_operator/owner.operations.$toolRef'

function createTestRouter(path = '/owner/operations/weather') {
  const rootRoute = createRootRoute()
  return createRouter({
    routeTree: rootRoute.addChildren([createRoute({ getParentRoute: () => rootRoute, path: '/' })]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
}

function renderRoute(loaderData: unknown, toolRef = 'weather', inventorySearch: Record<string, string> = {}) {
  const Component = OwnerToolDetailRoute.options.component
  if (Component === undefined) throw new Error('owner_tool_detail_component_missing')
  vi.spyOn(OwnerToolDetailRoute, 'useSearch').mockReturnValue(inventorySearch as never)
  vi.spyOn(OwnerToolDetailRoute, 'useParams').mockReturnValue({ toolRef } as never)
  vi.spyOn(OwnerToolDetailRoute, 'useLoaderData').mockReturnValue(loaderData as never)
  render(
    <RouterContextProvider router={createTestRouter(`/owner/operations/${toolRef}`)}>
      <Component />
    </RouterContextProvider>,
  )
}

const status = {
  schemaVersion: 'provider_tools:v1',
  businessRef: 'business:one',
  providerRef: 'provider:one',
  toolRef: 'operation:one',
  revision: 2,
  state: 'Published',
  reasonCodes: [],
  observedAt: Date.UTC(2026, 8, 20, 3, 15),
  source: { kind: 'openapi', revision: 'openapi:one', digest: `sha256:${'a'.repeat(64)}` },
  routeability: { available: true, reasonCodes: [] },
  authority: { kind: 'public' },
  health: {
    connection: 'not_required',
    validation: 'passed',
    publication: 'published',
    freshness: 'current',
    delivery: { kind: 'unobserved', reason: 'no_calls' },
    usefulOutcome: { kind: 'unobserved', reason: 'no_calls' },
    operationalConditions: [],
  },
} as const

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('owner Tool detail route', () => {
  it('shows the carried price, status, Calls, updated time, and public buyer preview', () => {
    renderRoute({
      identity: { kind: 'available', businessId: 'business:one', slug: 'weather-provider' },
      status: {
        kind: 'available',
        tool: {
          offeringRef: 'offering:one',
          name: 'Weather lookup',
          slug: 'weather',
          pricingLabel: 'A$0.10 / call',
          callsCount: 24,
        },
        status,
      },
    })

    expect(screen.getByText('A$0.10 / call')).toBeTruthy()
    expect(screen.getByText('Published')).toBeTruthy()
    expect(screen.getByText('24 Calls')).toBeTruthy()
    expect(screen.getByText(formatTimestamp(status.observedAt))).toBeTruthy()
    expect(screen.getByRole('link', { name: 'View public Tool page' }).getAttribute('href'))
      .toBe('/tools/weather-provider/weather')
  })

  it('uses the operator not-found state with recovery to Tools for a missing reference', () => {
    renderRoute({
      identity: { kind: 'available', businessId: 'business:one', slug: 'weather-provider' },
      status: { kind: 'not_found' },
    }, 'not-a-ref')

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Return to Tools' }).getAttribute('href')).toBe('/owner/operations')
  })
  it('retains inventory context in the visible Tools breadcrumb and saved-draft continuation', () => {
    const inventorySearch = { inventoryQ: 'weather forecast', inventorySort: 'relevance', inventoryCursor: 'opaque:+/=' }
    renderRoute({ identity: { kind: 'available', businessId: 'business:one', slug: 'weather-provider' }, status: { kind: 'available', tool: { offeringRef: 'offering:one', name: 'Weather lookup', slug: 'weather' }, status, resumeCandidateRef: 'sha256:exact-draft' } }, 'weather', inventorySearch)
    const back = new URL(screen.getByRole('link', { name: 'Tools' }).getAttribute('href')!, 'https://aecon.test')
    expect(back.pathname).toBe('/owner/operations')
    expect(back.searchParams.get('q')).toBe('weather forecast')
    expect(back.searchParams.get('sort')).toBe('relevance')
    expect(back.searchParams.get('cursor')).toBe('opaque:+/=')
    const resume = new URL(mocks.detailProps.mock.calls.at(-1)![0].resumeHref, 'https://aecon.test')
    expect(resume.searchParams.get('draft')).toBe('sha256:exact-draft')
    expect(Object.fromEntries(resume.searchParams)).toMatchObject(inventorySearch)
  })

  it('retains unfiltered name order/cursor in the unavailable recovery link', () => {
    renderRoute({ identity: { kind: 'available', businessId: 'business:one' }, status: { kind: 'unavailable' } }, 'offering:business:exact', { inventorySort: 'name_desc', inventoryCursor: 'opaque:page-two' })
    const back = new URL(screen.getByRole('link', { name: 'Return to Tools' }).getAttribute('href')!, 'https://aecon.test')
    expect(back.pathname).toBe('/owner/operations')
    expect(back.searchParams.get('sort')).toBe('name_desc')
    expect(back.searchParams.get('cursor')).toBe('opaque:page-two')
  })

})
