/**
 * @vitest-environment jsdom
 */
import type { ReactNode } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AeOrganizationSwitcher } from '@/components/ae/layout/AeOrganizationSwitcher'
import { WorkspaceTransitionBoundary } from '@/components/ae/layout/WorkspaceTransitionBoundary'
import '../../setup/jsdom-platform'

const authState = vi.hoisted(() => ({
  orgId: 'org_alpha' as string | null | undefined,
  isLoaded: true,
}))

const switcherState = vi.hoisted(() => ({
  lastProps: null as Record<string, unknown> | null,
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  useAuth: () => ({
    isLoaded: authState.isLoaded,
    orgId: authState.orgId,
  }),
  OrganizationSwitcher: (props: Record<string, unknown>) => {
    switcherState.lastProps = props
    return <div data-testid="organization-switcher" />
  },
}))

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  authState.orgId = 'org_alpha'
  authState.isLoaded = true
  switcherState.lastProps = null
})

describe('AeOrganizationSwitcher safe redirection (S-12)', () => {
  it('points Clerk organization lifecycle URLs at /owner/operations', () => {
    render(<AeOrganizationSwitcher />)

    expect(switcherState.lastProps?.afterSelectOrganizationUrl).toBe('/owner/operations')
    expect(switcherState.lastProps?.afterCreateOrganizationUrl).toBe('/owner/operations')
    expect(switcherState.lastProps?.afterLeaveOrganizationUrl).toBe('/owner/operations')
  })
})

describe('WorkspaceTransitionBoundary (S-12)', () => {
  it('shows a transition scrim when orgId changes', async () => {
    const router = await createBoundaryRouter('/owner/operations')
    authState.orgId = 'org_alpha'
    const { rerender } = render(<BoundaryFixture router={router} />)

    expect(document.querySelector('[data-slot="workspace-transition-scrim"]')).toBeNull()

    authState.orgId = 'org_beta'
    rerender(<BoundaryFixture router={router} />)

    await waitFor(() => {
      expect(document.querySelector('[data-slot="workspace-transition-scrim"]')).not.toBeNull()
      expect(screen.getByText('Switching workspace…')).toBeTruthy()
    })
  })

  it('redirects to /owner/operations when switching orgs on a deep tenant route', async () => {
    const router = await createBoundaryRouter('/owner/operations/tool_acme_123')
    authState.orgId = 'org_alpha'
    const { rerender } = render(<BoundaryFixture router={router} />)

    expect(router.state.location.pathname).toBe('/owner/operations/tool_acme_123')

    authState.orgId = 'org_beta'
    rerender(<BoundaryFixture router={router} />)

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/owner/operations')
    })
  })
})

function BoundaryFixture({
  router,
  children = <p>Operator content</p>,
}: {
  router: ReturnType<typeof createRouter>
  children?: ReactNode
}) {
  return (
    <RouterContextProvider router={router}>
      <WorkspaceTransitionBoundary>{children}</WorkspaceTransitionBoundary>
    </RouterContextProvider>
  )
}

async function createBoundaryRouter(initialPath: string) {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/owner/operations',
      component: () => <p>Operations</p>,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/owner/operations/$toolId',
      component: () => <p>Tool</p>,
    }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  await router.load()
  return router
}
