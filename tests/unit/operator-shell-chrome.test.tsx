// @vitest-environment jsdom

import type * as ConvexReactModule from 'convex/react'
import { getFunctionName } from 'convex/server'
import { useMemo, useState, type ReactElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import {
  Link,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useLocation,
} from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Boxes as NavIcon } from 'lucide-react'
import '../setup/jsdom-platform'

// Vitest hoists the mock factory, so its shared helper must be loaded inside it.
vi.mock('convex/react', async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexReactModule>()),
  useConvexAuth: () => ({ isAuthenticated: shellMocks.useUser().isSignedIn }),
  useQuery: (query: Parameters<typeof getFunctionName>[0], args: unknown) => args === 'skip' || getFunctionName(query) !== 'operatorContext:readCurrent' ? undefined : {
    kind: 'authorized', userId: 'user_private_ada', accountRef: 'account-current',
    authScope: { organizationId: null, sessionId: 'session_private_ada' },
    allowedSurfaces: shellMocks.canAccessAdmin ? ['owner', 'admin'] : ['owner'],
  },
}))

const shellMocks = vi.hoisted(() => ({
  canAccessAdmin: false,
  readAgentKeys: vi.fn(async (): Promise<unknown[]> => []),
  useUser: vi.fn(() => ({
    isLoaded: true,
    isSignedIn: true,
    user: {
      id: 'user_private_ada',
      fullName: 'Ada Lovelace',
      primaryEmailAddress: { emailAddress: 'ada@supply.example' } as { emailAddress: string } | null,
    },
    sessionId: 'session_private_ada',
  })),
  userButton: vi.fn((_props: unknown) => undefined),
}))

vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-start')>()),
  useServerFn: () => shellMocks.readAgentKeys,
}))
vi.mock('@clerk/tanstack-react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@clerk/tanstack-react-start')>()),
  useAuth: () => ({ isSignedIn: shellMocks.useUser().isSignedIn === true, isLoaded: true, userId: 'user_private_ada', sessionId: 'session_private_ada', orgId: null }),
  useUser: shellMocks.useUser,
  UserButton: (props: unknown) => {
    shellMocks.userButton(props)
    return <button type="button" aria-label="Account menu" />
  },
  OrganizationSwitcher: () => <div data-testid="organization-switcher" />,
  SignOutButton: ({ children }: { children: ReactElement }) => children,
  Show: ({ when, children, fallback }: { when: string; children: ReactElement; fallback?: ReactElement }) =>
    when === 'signed-out' ? (shellMocks.useUser().isSignedIn ? (fallback ?? null) : children)
      : (shellMocks.useUser().isSignedIn ? children : (fallback ?? null)),
}))
vi.mock('@/components/ae/command-panel', () => ({
  CommandPanelProvider: ({ children }: { children: ReactElement }) => children,
  AeCommandPanel: () => null,
}))


import { AeAppShell } from '@/components/ae/layout/AeAppShell'
import { ThemeProvider } from '@/components/ae/theme/ThemeProvider'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { OperatorChromeProvider, useOperatorFrameChrome } from '@/components/ae/layout/OperatorChromeContext'
import { OperatorRouteError, OperatorRouteNotFound, OperatorRoutePending } from '@/components/ae/layout/AeRouteStates'
import {
  OPERATOR_SURFACE_FORBIDDEN_MESSAGE,
  OperatorSurfaceForbiddenError,
} from '@/lib/operator/operator-context'
import { Route as OperatorLayoutRoute } from '@/routes/_operator'
import { Route as AgentAccessRoute } from '@/routes/_operator/agent-access'


beforeEach(() => {
  vi.stubEnv('VITE_CONVEX_URL', 'http://127.0.0.1:3210')
})

afterEach(() => {
  vi.unstubAllEnvs()
  cleanup()
  shellMocks.readAgentKeys.mockReset()
  shellMocks.readAgentKeys.mockResolvedValue([])
  shellMocks.useUser.mockClear()
  shellMocks.userButton.mockClear()
  shellMocks.canAccessAdmin = false
})

describe('operator shell nested chrome', () => {
  it('moves focus to committed content only after a pathname change', async () => {
    renderAt(<FocusTransitionHarness />, '/owner/operations')

    const calls = await screen.findByRole('link', { name: 'Open Calls' })
    const main = screen.getByTestId('operator-content')
    const descriptionsAtFocus: string[] = []
    main.addEventListener('focus', () => {
      descriptionsAtFocus.push(
        within(screen.getByTestId('operator-page-stack')).getByText('Review calls.').textContent ?? '',
      )
    })
    expect(document.activeElement).not.toBe(main)
    fireEvent.click(calls)

    await waitFor(() => expect(document.activeElement).toBe(main))
    expect(descriptionsAtFocus).toEqual(['Review calls.'])
  })

  it('does not move focus for hash-only navigation', async () => {
    renderAt(<FocusTransitionHarness />, '/owner/operations')

    const earnings = await screen.findByRole('link', { name: 'Open earnings' })
    earnings.focus()
    fireEvent.click(earnings)

    await waitFor(() => expect(earnings.getAttribute('data-status')).toBe('active'))
    expect(document.activeElement).toBe(earnings)
  })

  it('updates operator actions when nested route chrome changes', async () => {
    renderAt(<OperatorShellHarness />, '/admin')

    expect(await screen.findByText('Action one')).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull()
    expect(screen.queryByText('First crumb')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Update chrome' }))

    expect(await screen.findByText('Action two')).toBeTruthy()
    expect(screen.queryByText('Action one')).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull()
    expect(screen.queryByText('Second crumb')).toBeNull()
  })

  it('uses the existing operator shell for unmatched assistant descendants', async () => {
    expect(OperatorLayoutRoute.options.notFoundComponent).toBe(OperatorRouteNotFound)
    expect(AgentAccessRoute.options.notFoundComponent).toBe(OperatorRouteNotFound)

    renderAt(
      <AeAppShell>
        <AeOperatorPage
          operatorRole="owner"
          title="Operator workspace"
          description="Loading the latest operator view."
          currentPath="/agent-access/unknown"
        >
          <OperatorRouteNotFound />
        </AeOperatorPage>
      </AeAppShell>,
      '/agent-access/unknown',
    )

    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 1 }).map(({ textContent }) => textContent)).toEqual(['Page not found'])
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getAllByTestId('skip-to-content')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Workspace menu' })).toHaveLength(1)
    expect(screen.queryByRole('navigation', { name: 'App navigation' })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull()

    const recovery = screen.getByRole('link', { name: 'Back to Agents' })
    expect(recovery.getAttribute('href')).toBe('/agent-access')
  })


  it('drops the record-header icon on operator lists', async () => {
    renderAt(
      <AeOperatorPage
        operatorRole="owner"
        title="Tools"
        description="Publish the exact tools agents can inspect and call."
        currentPath="/owner/operations"
      >
        <div>Tools body</div>
      </AeOperatorPage>,
      '/owner/operations',
    )

    const stack = await screen.findByTestId('operator-page-stack')
    expect(within(stack).getByText('Publish the exact tools agents can inspect and call.')).toBeTruthy()
    expect(within(stack).queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull()
  })

  it('derives resource breadcrumbs from canonical destination ownership', async () => {
    renderAt(
      <AeOperatorPage
        operatorRole="owner"
        title="Add Tool"
        description="Connect a Tool."
        currentPath="/owner/operations/new"
      >
        <div>New Tool body</div>
      </AeOperatorPage>,
      '/owner/operations/new',
    )

    const stack = screen.getByTestId('operator-page-stack')
    expect(within(stack).getByText('Connect a Tool.')).toBeTruthy()
    expect(within(stack).queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull()
  })

  it('keeps parent chrome while a nested pending state loads', async () => {
    renderAt(
      <AeOperatorPage
        operatorRole="owner"
        title="Tools"
        description="Publish the exact tools agents can inspect and call."
        currentPath="/owner/operations"
      >
        <OperatorRoutePending />
      </AeOperatorPage>,
      '/owner/settings/connections',
    )

    const stack = await screen.findByTestId('operator-page-stack')
    expect(within(stack).getByText('Publish the exact tools agents can inspect and call.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Loading workspace' })).toBeNull()
    expect(screen.getByLabelText('Loading workspace')).toBeTruthy()
  })

  it.each([['/agent-access', 'Agents'], ['/admin/audit-events', 'Audit']])('titles a first-entry pending state at %s after its destination', async (pathname, title) => {
    const FrameTitle = () => <output aria-label="Frame title">{useOperatorFrameChrome()?.title}</output>
    renderAt(<OperatorChromeProvider><FrameTitle /><OperatorRoutePending /></OperatorChromeProvider>, pathname)
    await waitFor(() => expect(screen.getByLabelText('Frame title').textContent).toBe(title))
  })

  it('keeps parent chrome when a nested route fails to load', async () => {
    renderAt(
      <AeOperatorPage
        operatorRole="owner"
        title="Tools"
        description="Publish the exact tools agents can inspect and call."
        currentPath="/owner/operations"
      >
        <OperatorRouteError error={new Error('unavailable')} />
      </AeOperatorPage>,
      '/owner/settings/connections',
    )

    const stack = await screen.findByTestId('operator-page-stack')
    expect(within(stack).getByText('Publish the exact tools agents can inspect and call.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Couldn’t load this page' })).toBeNull()
    expect(screen.getByText('Couldn’t load this page')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Check system status' }).getAttribute('href')).toBe('/status')
  })

  it('keeps a safe correlation reference visible on route failure', async () => {
    renderAt(
      <AeOperatorPage
        operatorRole="owner"
        title="Settings"
        description="Account settings."
        currentPath="/owner/settings"
      >
        <OperatorRouteError error={{ correlationRef: 'corr_operator_route_123' }} />
      </AeOperatorPage>,
      '/owner/settings',
    )

    expect(await screen.findByText('corr_operator_route_123')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy support reference' })).toBeTruthy()
  })

  it('keeps the shell and offers recovery when the signed-in account lacks the requested surface', async () => {
    renderAt(
      <OperatorRouteError error={new OperatorSurfaceForbiddenError('admin')} />,
      '/admin/providers',
    )

    const stack = await screen.findByTestId('operator-page-stack')
    expect(within(stack).getByText('Your account does not have the Admin role for this page.')).toBeTruthy()
    expect(within(stack).queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.getByRole('link', { name: 'Ask an Admin for access' }).getAttribute('href')).toBe('/support')
    expect(screen.getByRole('link', { name: 'Browse Tools' }).getAttribute('href')).toBe('/market')
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Providers' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Audit' })).toBeNull()
  })

  it('recognizes a forbidden error after server serialization strips its custom fields', async () => {
    renderAt(
      <OperatorRouteError error={{ name: 'Error', message: OPERATOR_SURFACE_FORBIDDEN_MESSAGE }} />,
      '/admin/providers',
    )

    const stack = await screen.findByTestId('operator-page-stack')
    expect(within(stack).getByText('Your account does not have the Admin role for this page.')).toBeTruthy()
    expect(within(stack).queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.queryByText('Couldn’t load this page')).toBeNull()
  })

  it('renders forbidden recovery with a Clerk sign-out control', async () => {
    renderAt(
      <OperatorRouteError error={new OperatorSurfaceForbiddenError('admin')} />,
      '/admin/providers',
    )

    const stack = await screen.findByTestId('operator-page-stack')
    expect(within(stack).getByText('Your account does not have the Admin role for this page.')).toBeTruthy()
    expect(within(stack).queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Providers' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Audit' })).toBeNull()
  })

})

describe('header dropdown navigation', () => {
  function navigation() {
    if (!screen.queryByRole('menu', { name: 'Workspace menu' })) fireEvent.click(screen.getByRole('button', { name: 'Workspace menu' }))
    return screen.getByRole('menu', { name: 'Workspace menu' })
  }
  function providerNavigation() {
    if (!screen.queryByRole('menu', { name: 'Provider' })) fireEvent.click(within(navigation()).getByRole('menuitem', { name: 'Provider' }))
    return screen.getByRole('menu', { name: 'Provider' })
  }

  it('uses native route navigation and focuses committed main content', async () => {
    renderOperatorShell('owner', '/owner/operations')
    fireEvent.click(within(navigation()).getByRole('menuitem', { name: 'Activity' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('main')))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Workspace menu' })).toHaveLength(1)
  })

  it('marks the committed destination after navigation without a document reload', async () => {
    renderOperatorShell('owner', '/owner/operations')
    fireEvent.click(within(navigation()).getByRole('menuitem', { name: 'Activity' }))
    await waitFor(() => expect(within(navigation()).getByRole('menuitem', { name: 'Activity' }).getAttribute('aria-current')).toBe('page'))
    expect(within(providerNavigation()).getByRole('menuitem', { name: 'Tools' }).getAttribute('aria-current')).toBeNull()
  })

  it('keeps destinations in one menu with Provider maintenance in its submenu', () => {
    renderOperatorShell('owner', '/owner/operations')
    const links = Array.from(navigation().querySelectorAll('a'))
    expect(links.map(link => link.textContent)).toEqual(['Market', 'Ask', 'Agents', 'Activity', 'Credit', 'Settings', 'Support', 'Status', 'Developer docs'])
    expect(links.map(link => link.getAttribute('href'))).toEqual(['/market', '/t/new', '/agent-access', '/activity', '/owner/credit', '/owner/settings/workspace', '/support', '/status', '/developers/api'])
    expect(within(navigation()).getByRole('menuitem', { name: 'Settings' }).getAttribute('aria-current')).toBeNull()
    const provider = providerNavigation()
    expect(within(provider).getByRole('menuitem', { name: 'Tools' }).getAttribute('aria-current')).toBe('page')
    expect(within(provider).getByRole('menuitem', { name: 'Earnings' }).getAttribute('href')).toBe('/owner/operations#earnings')
    expect(document.querySelector('[data-slot="sidebar"]')).toBeNull()
  })

  it('uses one navigation owner for resources, receipts and authorized Admin pages', () => {
    const owner = renderOperatorShell('owner', '/owner/operations')
    expect(within(providerNavigation()).getByRole('menuitem', { name: 'Tools' }).getAttribute('aria-current')).toBe('page')
    owner.unmount()
    const receipt = renderOperatorShell('owner', '/calls/call_test_123')
    expect(within(navigation()).getByRole('menuitem', { name: 'Activity' }).getAttribute('aria-current')).toBe('page')
    receipt.unmount()
    shellMocks.canAccessAdmin = true
    renderOperatorShell('admin', '/admin')
    expect(within(navigation()).getByText('Admin')).toBeTruthy()
  })

  it('keeps native destinations keyboard reachable without the obsolete mobile inset', () => {
    renderOperatorShell('owner', '/owner/operations')
    const content = document.querySelector('[data-shell="app-content"]')
    expect(content?.classList.contains('pb-[calc(var(--ae-mobile-nav-height)+env(safe-area-inset-bottom,0px))]')).toBe(false)
    for (const link of Array.from(navigation().querySelectorAll('a'))) {
      expect(link.tagName).toBe('A')
      link.focus()
      expect(document.activeElement).toBe(link)
    }
  })
})

describe('owner account identity', () => {
  it('keeps the Clerk account menu in the app header on buyer owner routes', async () => {
    renderAt(
      <AeAppShell>
        <AeOperatorPage
          operatorRole="owner"
          title="Tools"
          description="Publish tools."
          currentPath="/owner/operations"
        >
          <div>Tools body</div>
        </AeOperatorPage>
      </AeAppShell>,
      '/owner/operations',
    )

    expect(await screen.findByRole('button', { name: 'Account menu' })).toBeTruthy()
    expect(shellMocks.userButton).toHaveBeenCalled()
    expect(shellMocks.userButton.mock.calls[0]?.[0]).toMatchObject({
      userProfileMode: 'navigation',
      userProfileUrl: '/owner/settings/account',
    })
    expect(screen.queryByRole('group', { name: /Signed in as/ })).toBeNull()
    expect(document.body.textContent).not.toContain('user_private_ada')
    expect(document.body.textContent).not.toContain('session_private_ada')
  })

})

function OperatorShellHarness() {
  const [version, setVersion] = useState<'one' | 'two'>('one')
  const actions = useMemo(() => <button type="button">Action {version}</button>, [version])
  const breadcrumbs = useMemo(() => [
    { label: version === 'one' ? 'First crumb' : 'Second crumb', href: `/admin/${version}` },
  ], [version])

  return (
        <AeOperatorPage
          operatorRole="admin"
          title="Outer shell"
          description="Outer shell description"
          currentPath="/admin"
        >
          <button type="button" onClick={() => setVersion('two')}>Update chrome</button>
          <AeOperatorPage
            operatorRole="admin"
            title="Nested shell"
            description="Nested shell description"
            currentPath="/admin/audit-events"
            actions={actions}
            breadcrumbs={breadcrumbs}
          >
            <div>Nested content</div>
          </AeOperatorPage>
        </AeOperatorPage>
  )
}

function FocusTransitionHarness() {
  const { pathname } = useLocation()
  const calls = pathname === '/activity'

  return (
    <OperatorChromeProvider>
      <AeOperatorPage
        operatorRole="owner"
        title="Outer workspace"
        description="Outer workspace."
        currentPath="/owner/operations"
      >
        <Link to="/activity">Open Calls</Link>
        <Link to="/owner/operations" hash="earnings">Open earnings</Link>
        <AeOperatorPage
          operatorRole="owner"
          title={calls ? 'Calls' : 'Tools'}
          description={calls ? 'Review calls.' : 'Manage Tools.'}
          currentPath={pathname}
        >
          <div>{calls ? 'Calls content' : 'Tools content'}</div>
        </AeOperatorPage>
      </AeOperatorPage>
    </OperatorChromeProvider>
  )
}

function renderOperatorShell(
  operatorRole: 'owner' | 'admin',
  currentPath: string,
) {
  return renderAt(
    <AeAppShell>
      <AeOperatorPage
        operatorRole={operatorRole}
        title="Operator workspace"
        description="Operator workspace content."
        currentPath={currentPath}
      >
        <div>Workspace body</div>
      </AeOperatorPage>
    </AeAppShell>,
    currentPath,
  )
}

function renderAt(ui: ReactElement, pathname: string) {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/admin' }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/admin/audit-events',
      staticData: { nav: { label: 'Audit', operator: { roles: ['admin'], group: 'Records', groupOrder: 0, order: 1, icon: NavIcon, tier: 'core' } } },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/agent-access',
      staticData: { nav: { label: 'Agents', operator: { roles: ['owner'], group: 'Buy', groupOrder: 0, order: 1, icon: NavIcon, tier: 'core', mobilePrimary: true, mobileOrder: 20 } } },
    }),
    createRoute({ getParentRoute: () => rootRoute, path: '/agent-access/$' }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/owner',
      staticData: { nav: { label: 'Overview', operator: { roles: ['owner'], group: 'Workspace', groupOrder: -1, order: 0, icon: NavIcon, tier: 'core', mobilePrimary: true, mobileOrder: 0 } } },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/market',
      staticData: { nav: { label: 'Market', operator: { roles: ['owner'], group: 'Buy', groupOrder: 0, order: 0, icon: NavIcon, tier: 'core', mobilePrimary: true, mobileOrder: 0 } } },
    }),
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/operations/new' }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/owner/operations',
      staticData: { nav: { label: 'Tools', operator: { roles: ['owner'], group: 'Supply', groupOrder: 1, order: 0, icon: NavIcon, tier: 'core', mobilePrimary: true, mobileOrder: 30 } } },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/owner/workspace',
      staticData: { nav: { label: 'Workspace', operator: { roles: ['owner'], group: 'Workspace', groupOrder: 0, order: 1, icon: NavIcon, tier: 'core' } } },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/owner/team',
      staticData: { nav: { label: 'Team', operator: { roles: ['owner'], group: 'Workspace', groupOrder: 0, order: 2, icon: NavIcon, tier: 'core' } } },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/owner/settings',
      staticData: { nav: { label: 'Account & security', operator: { roles: ['owner'], group: 'Account', groupOrder: 2, order: 0, icon: NavIcon, tier: 'core' } } },
    }),
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/settings/connections' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/supply' }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/owner/credit',
      staticData: { nav: { label: 'Balance', operator: { roles: ['owner'], group: 'Buy', groupOrder: 0, order: 2, icon: NavIcon, tier: 'core' } } },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/activity',
      staticData: { nav: { label: 'Calls', operator: { roles: ['owner'], group: 'Buy', groupOrder: 0, order: 0, icon: NavIcon, tier: 'core', mobilePrimary: true, mobileOrder: 10 } } },
    }),
    createRoute({ getParentRoute: () => rootRoute, path: '/calls/$callRef' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [pathname] }),
  })

  return render(<RouterContextProvider router={router}><ThemeProvider>{ui}</ThemeProvider></RouterContextProvider>)
}
