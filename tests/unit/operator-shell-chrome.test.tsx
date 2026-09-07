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
import '../setup/jsdom-platform'

const shellMocks = vi.hoisted(() => ({
  readAgentKeys: vi.fn(async (): Promise<unknown[]> => []),
  localPreview: false,
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
  useUser: shellMocks.useUser,
  UserButton: (props: unknown) => {
    shellMocks.userButton(props)
    return <button type="button" aria-label="Account menu" />
  },
  SignOutButton: ({ children }: { children: ReactElement }) => children,
}))
vi.mock('@/lib/client/local-e2e-auth', () => ({
  isLocalE2EAuthBypassEnabled: () => shellMocks.localPreview,
}))
vi.mock('@/components/ae/command-panel', () => ({
  CommandPanelProvider: ({ children }: { children: ReactElement }) => children,
  AeCommandPanel: () => null,
}))

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { OperatorRouteError, OperatorRouteNotFound, OperatorRoutePending } from '@/components/ae/layout/AeOperatorRouteStates'
import { AECON_MARK_SRC } from '@/content/brand-assets'
import { ownerSettingsChrome } from '@/lib/operator/settings-navigation'
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
  shellMocks.localPreview = false
  shellMocks.useUser.mockClear()
  shellMocks.userButton.mockClear()
})

describe('operator shell nested chrome', () => {
  it('moves focus to committed content only after a pathname change', async () => {
    renderAt(<FocusTransitionHarness />, '/owner/offerings')

    const calls = await screen.findByRole('link', { name: 'Open Calls' })
    const main = screen.getByTestId('operator-content').parentElement
    if (!(main instanceof HTMLElement)) throw new Error('operator_main_missing')
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
    renderAt(<FocusTransitionHarness />, '/owner/offerings')

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
      <AeOperatorShell
        operatorRole="owner"
        title="Operator workspace"
        description="Loading the latest operator view."
        currentPath="/agent-access/unknown"
      >
        <OperatorRouteNotFound />
      </AeOperatorShell>,
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

  it('puts AECON on the operator mark and drops the nested settings record icon', async () => {
    renderAt(
      <AeOperatorShell
        operatorRole="owner"
        title="Workspace"
        description="Loading your latest marketplace activity."
        currentPath="/owner/settings"
      >
        <AeOperatorShell
          operatorRole="owner"
          title={ownerSettingsChrome.title}
          description={ownerSettingsChrome.description}
          currentPath="/owner/settings"
        >
          <div>Settings body</div>
        </AeOperatorShell>
      </AeOperatorShell>,
      '/owner/settings',
    )

    const heading = await screen.findByRole('heading', { level: 1, name: 'Account & security' })
    expect(heading.parentElement?.previousElementSibling).toBeNull()
    expect(screen.getByText('AECON')).toBeTruthy()
    expect(document.querySelector(`img[src="${AECON_MARK_SRC}"]`)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Operations home' })).toBeTruthy()
    expect(screen.getAllByText('Buy and supply').length).toBeGreaterThan(0)
  })

  it('drops the record-header icon on operator lists', async () => {
    renderAt(
      <AeOperatorShell
        operatorRole="owner"
        title="Operations"
        description="Publish the exact tools agents can inspect and call."
        currentPath="/owner/offerings"
      >
        <div>Operations body</div>
      </AeOperatorShell>,
      '/owner/offerings',
    )

    const heading = await screen.findByRole('heading', { level: 1, name: 'Operations' })
    expect(heading.parentElement?.previousElementSibling).toBeNull()
  })

  it('keeps parent chrome while a nested pending state loads', async () => {
    renderAt(
      <AeOperatorShell
        operatorRole="owner"
        title="Operations"
        description="Publish the exact tools agents can inspect and call."
        currentPath="/owner/offerings"
      >
        <OperatorRoutePending />
      </AeOperatorShell>,
      '/owner/settings/workspace',
    )

    expect(await screen.findByRole('heading', { level: 1, name: 'Operations' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Loading workspace' })).toBeNull()
    expect(screen.getByLabelText('Loading workspace')).toBeTruthy()
  })

  it('keeps parent chrome when a nested route fails to load', async () => {
    renderAt(
      <AeOperatorShell
        operatorRole="owner"
        title="Operations"
        description="Publish the exact tools agents can inspect and call."
        currentPath="/owner/offerings"
      >
        <OperatorRouteError error={new Error('unavailable')} />
      </AeOperatorShell>,
      '/owner/settings/connections',
    )

    expect(await screen.findByRole('heading', { level: 1, name: 'Operations' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Couldn’t load this page' })).toBeNull()
    expect(screen.getByText('Couldn’t load this page')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Check system status' }).getAttribute('href')).toBe('/status')
  })

  it('keeps a safe correlation reference visible on route failure', async () => {
    renderAt(
      <AeOperatorShell
        operatorRole="owner"
        title="Settings"
        description="Account settings."
        currentPath="/owner/settings"
      >
        <OperatorRouteError error={{ correlationRef: 'corr_operator_route_123' }} />
      </AeOperatorShell>,
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
    expect(screen.getByRole('link', { name: 'Return to market' }).getAttribute('href')).toBe('/market?window=30d')
    expect(screen.getByRole('link', { name: 'Get help' }).getAttribute('href')).toBe('/support')
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

  it('renders forbidden recovery without requiring Clerk in the local auth preview', async () => {
    shellMocks.localPreview = true
    renderAt(
      <OperatorRouteError error={new OperatorSurfaceForbiddenError('admin')} />,
      '/admin/index-health',
    )

    expect(await screen.findByText('You don’t have access to this workspace')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Return home' }).getAttribute('href')).toBe('/')
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Catalog health' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Audit' })).toBeNull()
  })

})

describe('owner mobile navigation', () => {
  it('moves between workspace routes without a document navigation', async () => {
    renderOperatorShell('owner', '/owner/offerings')

    const mobileNav = await screen.findByRole('navigation', { name: 'Owner primary navigation' })
    const calls = within(mobileNav).getByRole('link', { name: 'Calls' })
    fireEvent.click(calls)

    await waitFor(() => expect(calls.getAttribute('data-status')).toBe('active'))
  })

  it('renders the exact owner shortcuts from the shared navigation model in order', async () => {
    renderOperatorShell('owner', '/owner/offerings')

    const mobileNav = await screen.findByRole('navigation', { name: 'Owner primary navigation' })
    const links = within(mobileNav).getAllByRole('link')

    expect(links.map((link) => link.textContent)).toEqual(['Calls', 'Agents', 'Operations'])
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/activity',
      '/agent-access',
      '/owner/offerings',
    ])
    expect(links.filter((link) => link.getAttribute('aria-current') === 'page').map((link) => link.textContent))
      .toEqual(['Operations'])
    expect(mobileNav.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(3)
  })

  it('does not mislabel secondary owner routes as a buyer shortcut', async () => {
    const descendant = renderOperatorShell('owner', '/owner/offerings/new')
    const descendantNav = await screen.findByRole('navigation', { name: 'Owner primary navigation' })

    expect(within(descendantNav).getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
      .map((link) => link.textContent))
      .toEqual(['Operations'])

    descendant.unmount()
    renderOperatorShell('owner', '/owner/settings')
    const unrelatedNav = await screen.findByRole('navigation', { name: 'Owner primary navigation' })

    expect(within(unrelatedNav).getAllByRole('link')
      .filter((link) => link.hasAttribute('aria-current')))
      .toEqual([])
  })

  it('is owner-only while preserving the full sidebar navigation', async () => {
    const owner = renderOperatorShell('owner', '/owner/offerings')
    const sidebarNav = await screen.findByRole('navigation', { name: 'Operator navigation' })

    expect(within(sidebarNav).getByRole('link', { name: 'Operations' })).toBeTruthy()
    expect(within(sidebarNav).getByRole('link', { name: 'Catalog' })).toBeTruthy()
    expect(within(sidebarNav).getByRole('link', { name: 'Calls' })).toBeTruthy()
    expect(within(sidebarNav).getByRole('link', { name: 'Agents' })).toBeTruthy()
    expect(within(sidebarNav).getByRole('link', { name: 'Credit' })).toBeTruthy()
    expect(within(sidebarNav).queryByRole('link', { name: 'Provider' })).toBeNull()
    expect(within(sidebarNav).queryByRole('link', { name: 'Publish' })).toBeNull()
    expect(within(sidebarNav).getByRole('link', { name: 'Account & security' })).toBeTruthy()

    owner.unmount()
    renderOperatorShell('admin', '/admin')

    expect(screen.queryByRole('navigation', { name: 'Owner primary navigation' })).toBeNull()
    expect(await screen.findByRole('navigation', { name: 'Operator navigation' })).toBeTruthy()
  })

  it('hides at md, clears mobile content, preserves desktop padding, and respects the safe area', async () => {
    renderOperatorShell('owner', '/owner/offerings')

    const mobileNav = await screen.findByRole('navigation', { name: 'Owner primary navigation' })
    const content = screen.getByTestId('operator-content')

    expect(mobileNav.classList.contains('md:hidden')).toBe(true)
    expect(mobileNav.classList.contains('pb-[env(safe-area-inset-bottom,0px)]')).toBe(true)
    expect(
      content.classList.contains(
        'pb-[calc(var(--spacing-touch)+env(safe-area-inset-bottom,0px))]',
      ),
    ).toBe(true)
    expect(content.classList.contains('md:pb-related')).toBe(true)
    for (const link of within(mobileNav).getAllByRole('link')) {
      expect(link.classList.contains('min-h-touch')).toBe(true)
      expect(link.classList.contains('min-w-touch')).toBe(true)
      expect(link.classList.contains('focus-visible:ring-2')).toBe(true)
    }
  })
})

describe('owner account identity', () => {
  it('keeps the active account and maintained Clerk menu visible in expanded owner chrome', async () => {
    renderOperatorShell('owner', '/owner/offerings')

    const account = await screen.findByRole('group', { name: 'Signed in as ada@supply.example' })
    expect(within(account).getByText('ada@supply.example').classList.contains('sr-only')).toBe(false)
    expect(within(account).getByRole('button', { name: 'Account menu' })).toBeTruthy()
    expect(shellMocks.userButton).toHaveBeenCalledOnce()
    expect(shellMocks.userButton.mock.calls[0]?.[0]).toMatchObject({
      appearance: {
        elements: {
          avatarBox: 'size-6',
          userButtonTrigger: expect.stringContaining('focus-visible:ring-2'),
        },
      },
      userProfileMode: 'modal',
    })
    expect(document.body.textContent).not.toContain('user_private_ada')
    expect(document.body.textContent).not.toContain('session_private_ada')
  })

  it('retains identity semantics when the desktop sidebar is collapsed', async () => {
    renderOperatorShell('owner', '/owner/offerings')

    fireEvent.click(await screen.findByRole('button', { name: 'Collapse navigation' }))

    const account = screen.getByRole('group', { name: 'Signed in as ada@supply.example' })
    expect(within(account).getByText('ada@supply.example').classList.contains('sr-only')).toBe(true)
    expect(within(account).getByRole('button', { name: 'Account menu' })).toBeTruthy()
  })

  it('falls back to the human name only when the primary email is absent', async () => {
    shellMocks.useUser.mockReturnValueOnce({
      isLoaded: true,
      isSignedIn: true,
      user: {
        id: 'user_private_ada',
        fullName: 'Ada Lovelace',
        primaryEmailAddress: null,
      },
      sessionId: 'session_private_ada',
    })

    renderOperatorShell('owner', '/owner/offerings')

    const account = await screen.findByRole('group', { name: 'Signed in as Ada Lovelace' })
    expect(within(account).getByText('Ada Lovelace')).toBeTruthy()
    expect(document.body.textContent).not.toContain('user_private_ada')
  })

  it('keeps the identity visible inside the mobile drawer', async () => {
    const desktopWidth = window.innerWidth
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })

    try {
      renderOperatorShell('owner', '/owner/offerings')
      fireEvent.click(await screen.findByRole('button', { name: 'Open operator navigation' }))

      const account = await screen.findByRole('group', { name: 'Signed in as ada@supply.example' })
      expect(within(account).getByText('ada@supply.example').classList.contains('sr-only')).toBe(false)
      expect(within(account).getByRole('button', { name: 'Account menu' })).toBeTruthy()
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: desktopWidth })
    }
  })

  it('renders an explicit local context without invoking Clerk identity primitives', async () => {
    shellMocks.localPreview = true

    renderOperatorShell('owner', '/owner/offerings')

    const account = await screen.findByRole('group', { name: 'Local preview account context' })
    expect(within(account).getByText('Local preview')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Account menu' })).toBeNull()
    expect(shellMocks.useUser).not.toHaveBeenCalled()
    expect(shellMocks.userButton).not.toHaveBeenCalled()
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
  const navBadges = useMemo(() => ({ '/admin/audit-events': version === 'one' ? 2 : 5 }), [version])

  return (
    <AeOperatorShell
      operatorRole="admin"
      title="Outer shell"
      description="Outer shell description"
      currentPath="/admin"
    >
      <button type="button" onClick={() => setVersion('two')}>Update chrome</button>
      <AeOperatorShell
        operatorRole="admin"
        title="Nested shell"
        description="Nested shell description"
        currentPath="/admin/audit-events"
        actions={actions}
        breadcrumbs={breadcrumbs}
        navBadges={navBadges}
      >
        <div>Nested content</div>
      </AeOperatorShell>
    </AeOperatorShell>
  )
}

function FocusTransitionHarness() {
  const { pathname } = useLocation()
  const calls = pathname === '/activity'

  return (
    <AeOperatorShell
      operatorRole="owner"
      title="Outer workspace"
      description="Outer workspace."
      currentPath="/owner/offerings"
    >
      <Link to="/activity">Open Calls</Link>
      <Link to="/owner/offerings" hash="earnings">Open earnings</Link>
      <AeOperatorShell
        operatorRole="owner"
        title={calls ? 'Calls' : 'Operations'}
        description={calls ? 'Review calls.' : 'Manage Operations.'}
        currentPath={pathname}
      >
        <div>{calls ? 'Calls content' : 'Operations content'}</div>
      </AeOperatorShell>
    </AeOperatorShell>
  )
}

function renderOperatorShell(operatorRole: 'owner' | 'admin', currentPath: string) {
  return renderAt(
    <AeOperatorShell
      operatorRole={operatorRole}
      title="Operator workspace"
      description="Operator workspace content."
      currentPath={currentPath}
    >
      <div>Workspace body</div>
    </AeOperatorShell>,
    currentPath,
  )
}

function renderAt(ui: ReactElement, pathname: string) {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/admin' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin/audit-events' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/agent-access' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/agent-access/$' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/offerings/new' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/offerings' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/settings' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/settings/workspace' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/settings/connections' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/supply' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/activity' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [pathname] }),
  })

  return render(<RouterContextProvider router={router}>{ui}</RouterContextProvider>)
}
