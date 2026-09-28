/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { type ReactNode } from 'react'
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterContextProvider } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  action: vi.fn(async () => ({ kind: 'applied', message: 'ok' })),
  invalidate: vi.fn(async () => undefined),
}))

vi.mock('@/components/ae/offerings/provider-workspace.functions', () => ({
  readProviderWorkspaceIdentityDetailServer: vi.fn(),
  readProviderToolStatusServer: vi.fn(),
}))
vi.mock('@/components/ae/layout/AeOperatorPage', async () => {
  const React = await import('react')
  return {
    AeOperatorPage: ({ children, title }: { children: ReactNode; title: string }) => React.createElement(
      'main',
      null,
      React.createElement('h1', null, title),
      children,
    ),
  }
})
vi.mock('@/components/ae/supply/AeProviderToolDetail', async () => {
  const React = await import('react')
  return {
    AeProviderToolDetail: ({ name }: { name: string }) => React.createElement('div', { 'data-testid': 'tool-detail' }, name),
  }
})
vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-start')>()),
  useServerFn: () => mocks.action,
}))
vi.mock('@clerk/tanstack-react-start', () => ({ useReverification: (fn: unknown) => fn }))
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const React = await import('react')
  return {
    ...(await importOriginal<typeof import('@tanstack/react-router')>()),
    Link: ({ to, children }: { to: string; children: ReactNode }) => React.createElement('a', { href: to }, children),
    useRouter: () => ({ invalidate: mocks.invalidate }),
  }
})

import { readProviderWorkspaceIdentityDetailServer } from '@/components/ae/offerings/provider-workspace.functions'
import { Route as OwnerSupplyDetailRoute } from '@/routes/_operator/owner.operations.$toolRef'
import { Route as OwnerSupplyIndexRoute } from '@/routes/_operator/owner.operations'
import { Route as OwnerSupplyNewRoute } from '@/routes/_operator/owner.operations.new'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  mocks.action.mockClear()
  mocks.invalidate.mockClear()
})

function createTestRouter() {
  const rootRoute = createRootRoute()
  return createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

describe('owner supply routes', () => {
  it('uses Tools as the Provider document title without route-declared navigation', () => {
    expect(OwnerSupplyIndexRoute.options.staticData).toBeUndefined()
    expect(OwnerSupplyIndexRoute.options.head?.({} as never)).toEqual({
      meta: [{ title: 'Tools | Agentic Economy' }, { name: 'robots', content: 'noindex' }],
    })
  })

  it('exports the authenticated publisher host', () => {
    expect(OwnerSupplyDetailRoute).toBeDefined()
  })

  it('sends only missing provider identity to setup before reading source connections', async () => {
    vi.mocked(readProviderWorkspaceIdentityDetailServer).mockResolvedValueOnce({ kind: 'not_applicable' })
    const loader = OwnerSupplyNewRoute.options.loader
    if (typeof loader !== 'function') throw new Error('add_tool_loader_missing')
    await expect(loader({ deps: {} } as never)).rejects.toMatchObject({
      options: { to: '/owner/operations', hash: 'add-tool' },
    })
  })
  it('renders an available Tool only for the matching owner readback', () => {
    const Component = OwnerSupplyDetailRoute.options.component
    if (Component === undefined) throw new Error('owner_supply_detail_component_missing')
    const router = createTestRouter()
    const renderDetail = (businessRef: string) => {
      vi.spyOn(OwnerSupplyDetailRoute, 'useParams').mockReturnValue({ toolRef: 'offering:one' } as never)
      vi.spyOn(OwnerSupplyDetailRoute, 'useLoaderData').mockReturnValue({
        identity: { kind: 'available', businessId: 'business:one', slug: 'provider-one' },
        status: {
          kind: 'available',
          tool: { offeringRef: 'offering:one', name: 'Reference lookup' },
          status: {
            businessRef,
            state: 'Published',
            observedAt: Date.UTC(2026, 8, 20),
            routeability: { available: true },
          },
        },
      } as never)
      render(
        <RouterContextProvider router={router}>
          <Component />
        </RouterContextProvider>,
      )
    }

    renderDetail('business:one')
    expect(screen.getByTestId('tool-detail').textContent).toBe('Reference lookup')
    cleanup()
    renderDetail('business:other')
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Return to Tools' }).getAttribute('href')).toBe('/owner/operations')
    expect(screen.queryByTestId('tool-detail')).toBeNull()
  })

  it.each([
    [{ kind: 'not_found' as const }, 'Page not found'],
    [{ kind: 'unavailable' as const }, 'Tool status unavailable'],
  ])('keeps %s readback refusal at the render boundary', (status, title) => {
    const Component = OwnerSupplyDetailRoute.options.component
    if (Component === undefined) throw new Error('owner_supply_detail_component_missing')
    vi.spyOn(OwnerSupplyDetailRoute, 'useParams').mockReturnValue({ toolRef: 'offering:one' } as never)
    vi.spyOn(OwnerSupplyDetailRoute, 'useLoaderData').mockReturnValue({
      identity: { kind: 'available', businessId: 'business:one', slug: 'provider-one' },
      status,
    } as never)
    render(
      <RouterContextProvider router={createTestRouter()}>
        <Component />
      </RouterContextProvider>,
    )
    expect(screen.getByText(title)).toBeTruthy()
    if (status.kind === 'not_found') {
      expect(screen.getByRole('link', { name: 'Return to Tools' }).getAttribute('href')).toBe('/owner/operations')
    }
  })
})
