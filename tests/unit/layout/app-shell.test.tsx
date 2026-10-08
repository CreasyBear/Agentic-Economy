import { AeNavigationSafetyBoundary } from '@/components/ae/layout/AeNavigationSafetyBoundary'
/**
 * @vitest-environment jsdom
 */
import { getFunctionName, type FunctionReference } from 'convex/server'
import { useRef, useState, type ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import '../../setup/jsdom-dialog'

import type { OperatorSurface } from '@/lib/operator/operator-context'
import { ChatHeader } from '@/components/ae/chat/chat-session/components/ChatHeader'
import { AeAppShell } from '@/components/ae/layout/AeAppShell'

vi.mock('@/lib/observability/funnel-client', () => ({
  emitFunnelEventOnce: vi.fn(),
}))

const clerkSignedIn = vi.hoisted(() => ({ value: false, isLoaded: true, userId: 'user-current', sessionId: 'session-current', orgId: null as string | null }))
const entitlement = vi.hoisted<{
  isAuthenticated: boolean
  result: { kind: 'authorized'; allowedSurfaces: readonly OperatorSurface[]; userId: string; accountRef?: string; authScope: { organizationId: string | null; sessionId: string | null } } | { kind: 'denied' } | undefined
  throwOnRead: boolean
}>(() => ({
  isAuthenticated: false,
  throwOnRead: false,
  result: undefined,
}))

vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: entitlement.isAuthenticated }),
  useQuery: (query: FunctionReference<'query'>, args: unknown) => {
    if (args === 'skip') return undefined
    if (getFunctionName(query) !== 'operatorContext:readCurrent') throw new Error('Unexpected query')
    if (entitlement.throwOnRead) throw new Error('operator entitlement unavailable')
    return entitlement.result
  },
}))

vi.mock('@clerk/tanstack-react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@clerk/tanstack-react-start')>()),
  useAuth: () => ({ isSignedIn: clerkSignedIn.value, isLoaded: clerkSignedIn.isLoaded, userId: clerkSignedIn.value ? clerkSignedIn.userId : null, sessionId: clerkSignedIn.value ? clerkSignedIn.sessionId : null, orgId: clerkSignedIn.orgId }),
  useUser: () => ({ user: null }),
  Show: ({ when, children, fallback }: { when: string; children?: ReactNode; fallback?: ReactNode }) => {
    if (when === 'signed-out') return clerkSignedIn.value ? (fallback ?? null) : (children ?? null)
    if (when === 'signed-in') return clerkSignedIn.value ? (children ?? null) : null
    return children ?? null
  },
  UserButton: () => <button type="button" aria-label="Account menu" />,
  OrganizationSwitcher: () => <div data-testid="org-switcher" />,
}))

beforeEach(() => {
  clerkSignedIn.value = false
  clerkSignedIn.isLoaded = true
  clerkSignedIn.orgId = null
  vi.stubEnv('VITE_CONVEX_URL', 'http://127.0.0.1:3210')
})

afterEach(() => {
  vi.unstubAllEnvs()
  cleanup()
  entitlement.isAuthenticated = false
  entitlement.result = undefined
  entitlement.throwOnRead = false
})

describe('AeAppShell', () => {
  it('renders exactly one persistent app header with the skip link and public primary nav', () => {
    clerkSignedIn.value = false
    renderAppShell()

    expect(document.querySelectorAll('[data-shell="app-header"]')).toHaveLength(1)
    expect(screen.getByTestId('skip-to-content').getAttribute('href')).toBe('#main-content')

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(['Market', 'For agents', 'For providers']).toEqual(
      Array.from(nav.querySelectorAll('a')).map((link) => link.textContent),
    )
    expect(screen.getByRole('link', { name: 'Sign in' }).className).toMatch(/md:inline-flex/)
    expect(screen.queryByRole('button', { name: 'Workspace menu' })).toBeNull()
    expect(document.getElementById('ae-chat-actions')).toBeNull()
  })

  it('offers one app header slot for thread controls on chat', () => {
    clerkSignedIn.value = false
    renderAppShell('/t/new')

    expect(document.querySelectorAll('header')).toHaveLength(1)
    const slot = document.getElementById('ae-chat-actions')
    const brand = screen.getByRole('link', { name: 'Agentic Economy home' })
    expect(slot).not.toBeNull()
    expect(brand.compareDocumentPosition(slot!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(slot!.parentElement?.className ?? '').not.toMatch(/ms-auto/)
    expect(slot!.compareDocumentPosition(screen.getByRole('button', { name: 'Find Tools' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps chat controls connected and the draft focused as authentication replaces the header slot', () => {
    clerkSignedIn.value = false
    clerkSignedIn.isLoaded = false // Unresolved anonymous Clerk hydration is not a logout.
    const content = <><ChatHeader authenticated={false} threadId={null} threadTitle={null} busy={false}
      sharePath={null} copied={false} mobileHistory={null} mobileOpen={false} onMobileOpenChange={() => undefined}
      onToggleHistory={() => undefined} onNewChat={() => undefined} onIssueShare={() => undefined}
      onRevokeShare={() => undefined} onCopyShare={() => undefined} /><textarea aria-label="Draft" defaultValue="Keep this draft" /></>
    const view = renderAppShell('/t/new', content)
    const field = screen.getByRole('textbox', { name: 'Draft' }) as HTMLTextAreaElement
    const oldSlot = document.getElementById('ae-chat-actions')!
    field.focus()
    for (const signedIn of [true, false]) {
      clerkSignedIn.value = signedIn
      view.rerenderShell()
      const liveSlot = document.getElementById('ae-chat-actions')!
      expect(liveSlot.isConnected).toBe(true)
      expect(liveSlot.contains(screen.getByRole('button', { name: 'New chat' }))).toBe(true)
      expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(field)
      expect(field.value).toBe('Keep this draft')
      expect(document.activeElement).toBe(field)
    }
    expect(oldSlot.isConnected).toBe(false)
  })

  it('opens a named public drawer with exact destinations and restores trigger focus on close', async () => {
    clerkSignedIn.value = false
    renderAppShell()
    const trigger = screen.getByRole('button', { name: 'Open public menu' })
    trigger.focus()
    fireEvent.click(trigger)

    const drawer = await screen.findByRole('dialog', { name: 'Public navigation' })
    await waitFor(() => expect(drawer.contains(document.activeElement)).toBe(true))
    expect(screen.queryByRole('link', { name: 'Agentic Economy home' })).toBeNull()
    const nav = within(drawer).getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getAllByRole('link').map(link => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Market', '/market'], ['For agents', '/for-agents'], ['For providers', '/for-providers'],
    ])
    expect(within(drawer).getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/sign-in')
    const close = within(drawer).getByRole('button', { name: 'Close public menu' })
    expect(close.tagName).toBe('BUTTON')
    fireEvent.click(close)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Public navigation' })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('renders one persistent workspace sidebar with current Account Provider destinations', () => {
    clerkSignedIn.value = true
    entitlement.isAuthenticated = true
    entitlement.result = authorized(['owner'])
    renderAppShell()

    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'App navigation' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Workspace menu' })).toBeNull()
    expect(screen.queryByRole('menu')).toBeNull()
    const nav = workspaceNavigation()
    expect(within(nav).getAllByRole('link').map(link => link.textContent)).toEqual([
      'Market', 'Ask', 'Agents', 'Activity', 'Credit', 'Tools', 'Earnings', 'Settings', 'Support', 'Status',
    ])
    expect(within(nav).getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('/owner/settings')
    expect(within(nav).getByRole('link', { name: 'Market' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getAllByTestId('org-switcher')).toHaveLength(1)
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
  })

  it('marks Settings as the active workspace destination', () => {
    clerkSignedIn.value = true
    entitlement.isAuthenticated = true
    renderAppShell('/owner/settings')
    expect(within(workspaceNavigation()).getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBe('page')
  })

  it('shows one Admin group on an owner page for the current authorized session', () => {
    clerkSignedIn.value = true
    entitlement.isAuthenticated = true
    entitlement.result = authorized(['owner', 'admin'])
    renderAppShell('/owner/operations')
    const nav = workspaceNavigation()
    expect(within(nav).getAllByText('Admin')).toHaveLength(1)
    expect(['Overview', 'Search', 'Exceptions', 'Providers', 'Metrics', 'Audit'].map(label =>
      within(nav).getByRole('link', { name: label }).textContent
    )).toEqual(['Overview', 'Search', 'Exceptions', 'Providers', 'Metrics', 'Audit'])
    expect(screen.queryByRole('navigation', { name: 'Owner primary navigation' })).toBeNull()
  })

  it('uses one sidebar to mark the active Admin destination', () => {
    clerkSignedIn.value = true
    entitlement.isAuthenticated = true
    entitlement.result = authorized(['owner', 'admin'])
    renderAppShell('/admin/metrics')
    expect(screen.queryByRole('navigation', { name: 'Admin primary navigation' })).toBeNull()
    const nav = workspaceNavigation()
    expect(within(nav).getAllByText('Admin')).toHaveLength(1)
    expect(within(nav).getByRole('link', { name: 'Metrics' }).getAttribute('aria-current')).toBe('page')
    expect(within(nav).getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBeNull()
  })

  it('keeps contextual Developer navigation alongside one Admin group', () => {
    clerkSignedIn.value = true
    entitlement.isAuthenticated = true
    entitlement.result = authorized(['owner', 'admin', 'developer'])
    renderAppShell('/developers/discovery')
    const nav = workspaceNavigation()
    expect(within(nav).getAllByText('Admin')).toHaveLength(1)
    expect(within(nav).getAllByText('Developer')).toHaveLength(1)
    expect(within(nav).getByRole('link', { name: 'Discovery' })).toBeTruthy()
  })

  const deniedContexts: { label: string; result: typeof entitlement.result }[] = [
    { label: 'an owner without Admin entitlement', result: authorized(['owner']) },
    { label: 'an unresolved entitlement', result: undefined },
    { label: 'another user', result: { ...authorized(['owner', 'admin', 'developer']), userId: 'user-other' } },
    { label: 'another Account', result: { ...authorized(['owner', 'admin', 'developer']), authScope: { organizationId: 'org-other', sessionId: 'session-current' } } },
    { label: 'an earlier session', result: { ...authorized(['owner', 'admin', 'developer']), authScope: { organizationId: null, sessionId: 'session-old' } } },
  ]
  it.each(deniedContexts)('does not disclose Admin navigation for $label', ({ result }) => {
    clerkSignedIn.value = true
    entitlement.isAuthenticated = true
    entitlement.result = result
    renderAppShell('/admin/search')
    expect(screen.queryByRole('navigation', { name: 'Admin primary navigation' })).toBeNull()
    expect(within(workspaceNavigation()).queryByText('Admin')).toBeNull()
    if (result?.kind === 'authorized' && result.allowedSurfaces.includes('admin')) {
      expect(within(workspaceNavigation()).queryByText('Provider')).toBeNull()
    }
  })

  it('does not expose Provider destinations without an actual Account reference', () => {
    clerkSignedIn.value = true
    entitlement.isAuthenticated = true
    const { accountRef: _accountRef, ...withoutAccount } = authorized(['owner'])
    entitlement.result = withoutAccount
    renderAppShell()
    const nav = workspaceNavigation()
    expect(within(nav).queryByText('Provider')).toBeNull()
    expect(within(nav).queryByRole('link', { name: 'Tools' })).toBeNull()
    expect(within(nav).queryByRole('link', { name: 'Earnings' })).toBeNull()
    expect(within(nav).getByRole('link', { name: 'Credit' })).toBeTruthy()
  })

  it.each(['Convex authentication', 'Clerk hydration'])('withholds privileged destinations during unresolved %s', state => {
    clerkSignedIn.value = true
    clerkSignedIn.isLoaded = state !== 'Clerk hydration'
    entitlement.isAuthenticated = state !== 'Convex authentication'
    entitlement.result = authorized(['owner', 'admin', 'developer'])
    renderAppShell('/developers/discovery')
    const nav = workspaceNavigation()
    expect(within(nav).queryByText('Admin')).toBeNull()
    expect(within(nav).queryByText('Provider')).toBeNull()
    expect(within(nav).queryByText('Developer')).toBeNull()
  })

  it('keeps a public routed page and its workspace navigation usable when entitlement reading fails', () => {
    clerkSignedIn.value = true
    entitlement.isAuthenticated = true
    entitlement.result = authorized(['owner', 'admin'])
    entitlement.throwOnRead = true
    renderAppShell('/market')
    expect(screen.getByText('Page content')).toBeTruthy()
    const nav = workspaceNavigation()
    expect(within(nav).getByRole('link', { name: 'Market' })).toBeTruthy()
    expect(within(nav).queryByText('Admin')).toBeNull()
    expect(within(nav).queryByText('Provider')).toBeNull()
  })
})


it.each(['pending', 'unknown', 'dirty'] as const)('withholds the upstream Account selector while %s and restores it after the owner clears', async mode => {
  clerkSignedIn.value = true
  const view = renderAppShell('/owner/settings', <GuardedAccountChange mode={mode} />)
  expect(screen.getByTestId('org-switcher')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Start guarded change' }))
  expect(screen.queryByTestId('org-switcher')).toBeNull()
  expect(screen.getByText(/Finish or recheck the current change/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Review active change' }))
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Current change' }))
  fireEvent.click(screen.getByRole('button', { name: 'Clear guarded change' }))
  expect(screen.getByTestId('org-switcher')).toBeTruthy()
  view.rerenderShell()
  expect(screen.getAllByTestId('org-switcher')).toHaveLength(1)
})

it('external session revocation immediately removes the previous protected content despite an unknown owner', () => {
  clerkSignedIn.value = true
  const view = renderAppShell('/owner/settings', <GuardedAccountChange mode="unknown" />)
  fireEvent.click(screen.getByRole('button', { name: 'Start guarded change' }))
  const previous = screen.getByRole('textbox', { name: 'Protected operation context' })
  expect(screen.queryByTestId('org-switcher')).toBeNull()
  clerkSignedIn.value = false
  view.rerenderShell()
  expect(previous.isConnected).toBe(false)
  expect(screen.queryByRole('textbox', { name: 'Protected operation context' })).toBeNull()
})


it('continues to use the existing leave confirmation instead of switching Account directly', async () => {
  clerkSignedIn.value = true
  renderAppShell('/owner/settings', <GuardedAccountChange mode="unknown" />)
  fireEvent.click(screen.getByRole('button', { name: 'Start guarded change' }))
  fireEvent.click(within(workspaceNavigation()).getByRole('link', { name: 'Market' }))
  expect(await screen.findByRole('alertdialog')).toBeTruthy()
  expect(screen.queryByTestId('org-switcher')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Continue editing' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(screen.queryByTestId('org-switcher')).toBeNull()
})

it('retains another active owner and restores switching when the last owner unmounts', () => {
  clerkSignedIn.value = true
  renderAppShell('/owner/settings', <MultipleGuardOwners />)
  expect(screen.queryByTestId('org-switcher')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Clear first owner' }))
  expect(screen.queryByTestId('org-switcher')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Unmount last owner' }))
  expect(screen.getByTestId('org-switcher')).toBeTruthy()
})

function MultipleGuardOwners() {
  const [first, setFirst] = useState(true)
  const [second, setSecond] = useState(true)
  const heading = useRef<HTMLHeadingElement>(null)
  const action = useRef<HTMLButtonElement>(null)
  const boundaryProps = { title: 'Leave current change?', pendingTitle: 'Change pending', description: 'Review departure.', pendingDescription: 'Wait for completion.', headingRef: heading, saveActionRef: action }
  return <>
    <AeNavigationSafetyBoundary {...boundaryProps} state={{ dirty: first, pending: false, saveOutcome: 'idle' }}><h2 ref={heading}>First owner</h2></AeNavigationSafetyBoundary>
    {second ? <AeNavigationSafetyBoundary {...boundaryProps} state={{ dirty: true, pending: false, saveOutcome: 'outcome_unknown' }}><p>Last owner</p></AeNavigationSafetyBoundary> : null}
    <button type="button" onClick={() => setFirst(false)}>Clear first owner</button>
    <button type="button" onClick={() => setSecond(false)}>Unmount last owner</button>
  </>
}

function GuardedAccountChange({ mode }: { mode: 'pending' | 'unknown' | 'dirty' }) {
  const [active, setActive] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const actionRef = useRef<HTMLButtonElement>(null)
  return <AeNavigationSafetyBoundary state={{ dirty: active, pending: active && mode === 'pending', saveOutcome: active && mode === 'unknown' ? 'outcome_unknown' : 'idle' }}
    title="Leave the current change?" pendingTitle="Waiting for the current change" description="Confirm departure." pendingDescription="Wait for completion."
    headingRef={headingRef} saveActionRef={actionRef}>
    <h2 ref={headingRef} tabIndex={-1}>Current change</h2>
    <textarea aria-label="Protected operation context" defaultValue="Original Account operation" />
    <button type="button" onClick={() => setActive(true)}>Start guarded change</button>
    <button type="button" onClick={() => setActive(false)}>Clear guarded change</button>
  </AeNavigationSafetyBoundary>
}

function workspaceNavigation() {
  const navs = screen.getAllByRole('navigation', { name: 'Workspace navigation' })
  expect(navs).toHaveLength(1)
  return navs[0]!
}

function authorized(allowedSurfaces: readonly OperatorSurface[]) {
  return { kind: 'authorized' as const, allowedSurfaces, accountRef: 'account-current', userId: 'user-current',
    authScope: { organizationId: null, sessionId: 'session-current' } }
}

function renderAppShell(pathname = clerkSignedIn.value ? '/market' : '/', children: ReactNode = <p>Page content</p>) {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/t/new' }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/market',
      staticData: { nav: { label: 'Market', header: { order: 0, audience: 'always' } } },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/for-agents',
      staticData: { nav: { label: 'For agents', header: { order: 1, audience: 'public' } } },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/for-providers',
      staticData: { nav: { label: 'For providers', header: { order: 2, audience: 'public' } } },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/activity',
      staticData: { nav: { label: 'Calls', header: { order: 2, audience: 'signed-in' } } },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/agent-access',
      staticData: { nav: { label: 'Agents', header: { order: 1, audience: 'signed-in' } } },
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/owner/operations',
      staticData: { nav: { label: 'Tools', header: { order: 3, audience: 'signed-in' } } },
    }),
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/settings' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/developers/discovery' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/sign-in/$' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin/search' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin/exceptions' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin/providers' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin/metrics' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin/audit-events' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [pathname] }),
  })

  const tree = () => <RouterContextProvider router={router}><AeAppShell>{children}</AeAppShell></RouterContextProvider>
  const view = render(tree())
  return { rerenderShell: () => view.rerender(tree()) }
}
