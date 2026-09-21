// @vitest-environment jsdom

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
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Boxes as NavIcon } from 'lucide-react'
import '../setup/jsdom-platform'

const shellMocks = vi.hoisted(() => ({
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
  useAuth: () => ({ isSignedIn: shellMocks.useUser().isSignedIn === true }),
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
import { AeOperatorPage, OperatorChromeProvider } from '@/components/ae/layout/AeOperatorPage'
import { AeOperatorSidebar } from '@/components/ae/layout/AeOperatorSidebar'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { OperatorRouteError, OperatorRouteNotFound, OperatorRoutePending } from '@/components/ae/layout/AeRouteStates'
import { AECON_MARK_SRC } from '@/content/brand-assets'
import { ownerSettingsChrome } from '@/lib/operator/settings-navigation'
import { shouldMountOperatorSidebar } from '@/lib/operator/roles'
import {
  OPERATOR_SURFACE_FORBIDDEN_MESSAGE,
  OperatorSurfaceForbiddenError,
} from '@/lib/operator/operator-context'
import { Route as OperatorLayoutRoute } from '@/routes/_operator'
import { Route as AgentAccessRoute } from '@/routes/_operator/agent-access'


afterEach(() => {
  cleanup()
  shellMocks.readAgentKeys.mockReset()
  shellMocks.readAgentKeys.mockResolvedValue([])
  shellMocks.useUser.mockClear()
  shellMocks.userButton.mockClear()
})

describe('operator shell nested chrome', () => {
  it('moves focus to committed content only after a pathname change', async () => {
    renderAt(<FocusTransitionHarness />, '/owner/operations')

    const calls = await screen.findByRole('link', { name: 'Open Calls' })
    const main = screen.getByTestId('operator-content')
    const titlesAtFocus: string[] = []
    main.addEventListener('focus', () => {
      titlesAtFocus.push(screen.getByRole('heading', { level: 1 }).textContent ?? '')
    })
    expect(document.activeElement).not.toBe(main)
    fireEvent.click(calls)

    await waitFor(() => expect(document.activeElement).toBe(main))
    expect(titlesAtFocus).toEqual(['Calls'])
  })

  it('does not move focus for hash-only navigation', async () => {
    renderAt(<FocusTransitionHarness />, '/owner/operations')

    const earnings = await screen.findByRole('link', { name: 'Open earnings' })
    earnings.focus()
    fireEvent.click(earnings)

    await waitFor(() => expect(earnings.getAttribute('data-status')).toBe('active'))
    expect(document.activeElement).toBe(earnings)
  })

  it('replaces actions, breadcrumbs, and badges when nested route chrome changes', async () => {
    renderAt(<OperatorShellHarness />, '/admin')

    expect(await screen.findByText('Action one')).toBeTruthy()
    expect(screen.getAllByText('First crumb').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Update chrome' }))

    expect(await screen.findByText('Action two')).toBeTruthy()
    expect(screen.queryByText('Action one')).toBeNull()
    expect(screen.getAllByText('Second crumb').length).toBeGreaterThan(0)
    expect(screen.queryByText('First crumb')).toBeNull()
    expect(screen.getAllByText('5').length).toBeGreaterThan(0)
  })

  it('uses the existing operator shell for unmatched assistant descendants', async () => {
    expect(OperatorLayoutRoute.options.notFoundComponent).toBe(OperatorRouteNotFound)
    expect(AgentAccessRoute.options.notFoundComponent).toBe(OperatorRouteNotFound)

    renderAt(
      <AeAppShell>
        <SidebarProvider className="contents" defaultOpen>
          <OperatorChromeProvider
            sidebar={<AeOperatorSidebar operatorRole="owner" currentPath="/agent-access/unknown" />}
          >
            <AeOperatorPage
              operatorRole="owner"
              title="Operator workspace"
              description="Loading the latest operator view."
              currentPath="/agent-access/unknown"
            >
              <OperatorRouteNotFound />
            </AeOperatorPage>
          </OperatorChromeProvider>
        </SidebarProvider>
      </AeAppShell>,
      '/agent-access/unknown',
    )

    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 1 }).map(({ textContent }) => textContent)).toEqual(['Page not found'])
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getAllByTestId('skip-to-content')).toHaveLength(1)
    expect(screen.getAllByRole('navigation', { name: 'Operator navigation' })).toHaveLength(1)
    expect(screen.queryByRole('navigation', { name: 'Public navigation' })).toBeNull()

    const recovery = screen.getByRole('link', { name: 'Back to Agents' })
    expect(recovery.getAttribute('href')).toBe('/agent-access')
  })

  it('uses slim records rail for admin without duplicating app-header chrome', async () => {
    renderAt(
      <SidebarProvider>
        <OperatorChromeProvider
          sidebar={<AeOperatorSidebar operatorRole="admin" currentPath="/admin" slimChrome />}
        >
          <AeOperatorPage
            operatorRole="admin"
            title="Administration"
            description="Catalog and audit records."
            currentPath="/admin"
          >
            <div>Admin body</div>
          </AeOperatorPage>
        </OperatorChromeProvider>
      </SidebarProvider>,
      '/admin',
    )

    expect(await screen.findByRole('navigation', { name: 'Operator navigation' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Administration home' })).toBeNull()
    expect(screen.queryByRole('group', { name: /Signed in as/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Account menu' })).toBeNull()
    expect(document.querySelectorAll(`img[src="${AECON_MARK_SRC}"]`).length).toBe(0)
  })

  it('drops the nested settings record icon on owner account pages', async () => {
    renderAt(
      <AeOperatorPage
        operatorRole="owner"
        title={ownerSettingsChrome.title}
        description={ownerSettingsChrome.description}
        currentPath="/owner/settings"
      >
        <div>Settings body</div>
      </AeOperatorPage>,
      '/owner/settings',
    )

    const heading = await screen.findByRole('heading', { level: 1, name: 'Account & security' })
    expect(heading.parentElement?.previousElementSibling).toBeNull()
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

    const heading = await screen.findByRole('heading', { level: 1, name: 'Tools' })
    expect(heading.parentElement?.previousElementSibling).toBeNull()
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

    expect(await screen.findByRole('heading', { level: 1, name: 'Tools' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Loading workspace' })).toBeNull()
    expect(screen.getByLabelText('Loading workspace')).toBeTruthy()
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

    expect(await screen.findByRole('heading', { level: 1, name: 'Tools' })).toBeTruthy()
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
      '/admin/index-health',
    )

    expect(await screen.findByText('You don’t have access to this workspace')).toBeTruthy()
    expect(screen.getByText('Your account does not have the Admin role for this page.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ask an Admin for access' }).getAttribute('href')).toBe('/support')
    expect(screen.getByRole('link', { name: 'Return to Market' }).getAttribute('href')).toBe('/market')
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Catalog health' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Audit' })).toBeNull()
  })

  it('recognizes a forbidden error after server serialization strips its custom fields', async () => {
    renderAt(
      <OperatorRouteError error={{ name: 'Error', message: OPERATOR_SURFACE_FORBIDDEN_MESSAGE }} />,
      '/admin/index-health',
    )

    expect(await screen.findByText('You don’t have access to this workspace')).toBeTruthy()
    expect(screen.queryByText('Couldn’t load this page')).toBeNull()
  })

  it('renders forbidden recovery with a Clerk sign-out control', async () => {
    renderAt(
      <OperatorRouteError error={new OperatorSurfaceForbiddenError('admin')} />,
      '/admin/index-health',
    )

    expect(await screen.findByText('You don’t have access to this workspace')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Catalog health' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Audit' })).toBeNull()
  })

})

describe('owner mobile navigation', () => {
  it('moves between workspace routes without a document navigation', async () => {
    renderOperatorShell('owner', '/owner/operations')

    const mobileNav = await screen.findByRole('navigation', { name: 'Owner primary navigation' })
    const calls = within(mobileNav).getByRole('link', { name: 'Calls' })
    fireEvent.click(calls)

    await waitFor(() => expect(calls.getAttribute('data-status')).toBe('active'))
  })

  it('renders the exact owner shortcuts from the shared navigation model in order', async () => {
    renderOperatorShell('owner', '/owner/operations')

    const mobileNav = await screen.findByRole('navigation', { name: 'Owner primary navigation' })
    const links = within(mobileNav).getAllByRole('link')

    expect(links.map((link) => link.textContent)).toEqual(['Market', 'Agents', 'Calls', 'Tools'])
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/market',
      '/agent-access',
      '/activity',
      '/owner/operations',
    ])
    expect(links.filter((link) => link.getAttribute('aria-current') === 'page').map((link) => link.textContent))
      .toEqual(['Tools'])
    expect(mobileNav.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(4)
  })

  it('does not mislabel secondary owner routes as a buyer shortcut', async () => {
    const descendant = renderOperatorShell('owner', '/owner/operations/new')
    const descendantNav = await screen.findByRole('navigation', { name: 'Owner primary navigation' })

    expect(within(descendantNav).getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
      .map((link) => link.textContent))
      .toEqual(['Tools'])

    descendant.unmount()
    renderOperatorShell('owner', '/owner/settings')
    const unrelatedNav = await screen.findByRole('navigation', { name: 'Owner primary navigation' })

    expect(within(unrelatedNav).getAllByRole('link')
      .filter((link) => link.hasAttribute('aria-current')))
      .toEqual([])
  })

  it('keeps buyer owner routes on header and mobile nav without the workspace sidebar', async () => {
    const owner = renderOperatorShell('owner', '/owner/operations')

    expect(screen.queryByRole('navigation', { name: 'Operator navigation' })).toBeNull()
    expect(await screen.findByRole('navigation', { name: 'Owner primary navigation' })).toBeTruthy()

    owner.unmount()
    const receipt = renderOperatorShell('owner', '/calls/call_test_123')
    expect(screen.queryByRole('navigation', { name: 'Operator navigation' })).toBeNull()
    expect(await screen.findByRole('navigation', { name: 'Owner primary navigation' })).toBeTruthy()
    receipt.unmount()

    renderOperatorShell('admin', '/admin', { slimChrome: true })

    expect(screen.queryByRole('navigation', { name: 'Owner primary navigation' })).toBeNull()
    expect(await screen.findByRole('navigation', { name: 'Operator navigation' })).toBeTruthy()
  })

  it('hides at md, clears mobile content, preserves desktop padding, and respects the safe area', async () => {
    renderOperatorShell('owner', '/owner/operations')

    const mobileNav = await screen.findByRole('navigation', { name: 'Owner primary navigation' })
    const content = screen.getByTestId('operator-content')

    expect(mobileNav.classList.contains('md:hidden')).toBe(true)
    expect(mobileNav.classList.contains('pb-[env(safe-area-inset-bottom,0px)]')).toBe(true)
    expect(
      mobileNav.classList.contains('h-[calc(3.5rem+env(safe-area-inset-bottom,0px))]'),
    ).toBe(true)
    expect(
      content.classList.contains(
        'pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]',
      ),
    ).toBe(true)
    expect(content.classList.contains('md:pb-related')).toBe(true)
    expect(content.classList.contains('ae-rail')).toBe(true)
    const pageStack = screen.getByTestId('operator-page-stack')
    expect(pageStack.classList.contains('gap-section')).toBe(true)
    expect(pageStack.classList.contains('content-start')).toBe(true)
    for (const link of within(mobileNav).getAllByRole('link')) {
      expect(link.classList.contains('min-h-touch')).toBe(true)
      expect(link.classList.contains('min-w-touch')).toBe(true)
      expect(link.classList.contains('focus-visible:ring-2')).toBe(true)
    }
  })
})

describe('owner account identity', () => {
  it('keeps the Clerk account menu in the app header on buyer owner routes', async () => {
    renderAt(
      <AeAppShell>
        <OperatorChromeProvider>
          <AeOperatorPage
            operatorRole="owner"
            title="Tools"
            description="Publish tools."
            currentPath="/owner/operations"
          >
            <div>Tools body</div>
          </AeOperatorPage>
        </OperatorChromeProvider>
      </AeAppShell>,
      '/owner/operations',
    )

    expect(await screen.findByRole('button', { name: 'Account menu' })).toBeTruthy()
    expect(shellMocks.userButton).toHaveBeenCalled()
    expect(shellMocks.userButton.mock.calls[0]?.[0]).toMatchObject({
      userProfileMode: 'modal',
    })
    expect(screen.queryByRole('group', { name: /Signed in as/ })).toBeNull()
    expect(document.body.textContent).not.toContain('user_private_ada')
    expect(document.body.textContent).not.toContain('session_private_ada')
  })

  it('retains identity semantics on the full owner sidebar when mounted in isolation', async () => {
    renderAt(
      <SidebarProvider>
        <AeOperatorSidebar operatorRole="owner" currentPath="/owner/operations" />
      </SidebarProvider>,
      '/owner/operations',
    )

    const account = await screen.findByRole('group', { name: 'Signed in as ada@supply.example' })
    expect(within(account).getByRole('button', { name: 'Account menu' })).toBeTruthy()
    expect(shellMocks.userButton.mock.calls.at(-1)?.[0]).toMatchObject({
      userProfileMode: 'modal',
    })
  })

})

function OperatorShellHarness() {
  const [version, setVersion] = useState<'one' | 'two'>('one')
  const actions = useMemo(() => <button type="button">Action {version}</button>, [version])
  const breadcrumbs = useMemo(() => [
    { label: version === 'one' ? 'First crumb' : 'Second crumb', href: `/admin/${version}` },
  ], [version])
  const navBadges = useMemo(() => ({ '/admin/audit-events': version === 'one' ? 2 : 5 }), [version])

  return (
    <SidebarProvider>
      <OperatorChromeProvider
        sidebar={<AeOperatorSidebar operatorRole="admin" currentPath="/admin" />}
      >
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
            navBadges={navBadges}
          >
            <div>Nested content</div>
          </AeOperatorPage>
        </AeOperatorPage>
      </OperatorChromeProvider>
    </SidebarProvider>
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
  options?: { slimChrome?: boolean },
) {
  const mountSidebar = shouldMountOperatorSidebar(operatorRole, currentPath)
  const slimChrome = options?.slimChrome === true

  return renderAt(
    <SidebarProvider>
      <OperatorChromeProvider
        mobileTrigger={
          mountSidebar
            ? <SidebarTrigger aria-label="Open operator navigation" className="md:hidden" />
            : undefined
        }
        sidebar={
          mountSidebar
            ? <AeOperatorSidebar operatorRole={operatorRole} currentPath={currentPath} slimChrome={slimChrome} />
            : undefined
        }
      >
        <AeOperatorPage
          operatorRole={operatorRole}
          title="Operator workspace"
          description="Operator workspace content."
          currentPath={currentPath}
        >
          <div>Workspace body</div>
        </AeOperatorPage>
      </OperatorChromeProvider>
    </SidebarProvider>,
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
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/owner/market',
      staticData: { nav: { label: 'Market', operator: { roles: ['owner'], group: 'Buy', groupOrder: 0, order: 0, icon: NavIcon, tier: 'core', mobilePrimary: true, mobileOrder: 10 } } },
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

  return render(<RouterContextProvider router={router}>{ui}</RouterContextProvider>)
}
