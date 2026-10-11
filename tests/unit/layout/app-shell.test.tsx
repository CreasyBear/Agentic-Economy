import { AeNavigationSafetyBoundary } from '@/components/ae/layout/AeNavigationSafetyBoundary'
/**
 * @vitest-environment jsdom
 */
import { getFunctionName, type FunctionReference } from 'convex/server'
import { useRef, useState, type ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import {
  RouterContextProvider,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import '../../setup/jsdom-dialog'

import type { OperatorSurface } from '@/lib/operator/operator-context'
import { rememberOperatorContext, rememberedOperatorContext } from '@/lib/operator/operator-context-memory'
import { ChatHeader } from '@/components/ae/chat/chat-session/components/ChatHeader'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeAppShell } from '@/components/ae/layout/AeAppShell'
import { ThemeProvider } from '@/components/ae/theme/ThemeProvider'

vi.mock('@/lib/observability/funnel-client', () => ({
  emitFunnelEventOnce: vi.fn(),
}))

const clerkSignedIn = vi.hoisted(() => ({ value: false, isLoaded: true, orgRole: 'org:admin', userId: 'user-current', sessionId: 'session-current', orgId: null as string | null }))
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
  useMutation: () => async () => null,
  useQuery: (query: FunctionReference<'query'>, args: unknown) => {
    if (args === 'skip') return undefined
    if (getFunctionName(query) === 'journeyEvents:viewerDistinctId') return undefined
    if (getFunctionName(query) !== 'operatorContext:readCurrent') throw new Error('Unexpected query')
    if (entitlement.throwOnRead) throw new Error('operator entitlement unavailable')
    return entitlement.result
  },
}))

vi.mock('@clerk/tanstack-react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@clerk/tanstack-react-start')>()),
  useAuth: () => ({ isSignedIn: clerkSignedIn.value, isLoaded: clerkSignedIn.isLoaded, userId: clerkSignedIn.value ? clerkSignedIn.userId : null, sessionId: clerkSignedIn.value ? clerkSignedIn.sessionId : null, orgId: clerkSignedIn.orgId, orgRole: clerkSignedIn.orgRole }),
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
  clerkSignedIn.orgRole = 'org:admin'
  clerkSignedIn.orgId = null
  clerkSignedIn.sessionId = 'session-current'
  vi.stubEnv('VITE_CONVEX_URL', 'http://127.0.0.1:3210')
  // clerk-js's browser global, kept equal to the mocked useAuth identity.
  Object.defineProperty(window, 'Clerk', { configurable: true, get: () => clerkSignedIn.value
    ? { user: { id: clerkSignedIn.userId }, session: { id: clerkSignedIn.sessionId },
      organization: clerkSignedIn.orgId === null ? null : { id: clerkSignedIn.orgId } }
    : { user: null, session: null, organization: null } })
})

afterEach(() => {
  vi.unstubAllEnvs()
  cleanup()
  entitlement.isAuthenticated = false
  entitlement.result = undefined
  entitlement.throwOnRead = false
})

describe('AeAppShell', () => {
  it('withholds private chat header portal controls during refresh and preserves the composer draft', async () => {
    clerkSignedIn.value = true
    const current = Promise.withResolvers<void>()
    const root = createRootRoute()
    const router = createRouter({ routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/t/new' })]), history: createMemoryHistory({ initialEntries: ['/t/new'] }) })
    await router.load()
    vi.spyOn(router, 'invalidate').mockReturnValue(current.promise)
    const fixture = () => <RouterContextProvider router={router}><ThemeProvider><AeAppShell>
      <ChatHeader authenticated threadId="private-thread" threadTitle="Alpha private thread" busy={false}
        shareState="active" sharePath={null} copied={false} balanceLabel="A$123.45" mobileHistory={null} mobileOpen={false}
        onMobileOpenChange={() => {}} onToggleHistory={() => {}} onNewChat={() => {}} onIssueShare={() => {}}
        onRevokeShare={() => {}} onCopyShare={() => {}} />
      <textarea aria-label="Current chat draft" defaultValue="Preserve my current work" />
    </AeAppShell></ThemeProvider></RouterContextProvider>
    const view = render(fixture())
    const draft = screen.getByRole('textbox', { name: 'Current chat draft' })
    expect(document.getElementById('ae-chat-actions')?.contains(screen.getByText('Alpha private thread'))).toBe(true)
    clerkSignedIn.orgRole = 'org:member'
    view.rerender(fixture())
    await waitFor(() => expect(router.invalidate).toHaveBeenCalledOnce())
    expect(document.getElementById('ae-chat-actions')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Available credit A$123.45' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'New chat' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Agentic Economy home' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Account menu' })).toBeTruthy()
    await act(async () => { current.resolve(); await current.promise })
    await waitFor(() => expect(screen.queryByTestId('workspace-transition-scrim')).toBeNull())
    expect(screen.getByRole('textbox', { name: 'Current chat draft' })).toBe(draft)
    expect((draft as HTMLTextAreaElement).value).toBe('Preserve my current work')
    expect(document.getElementById('ae-chat-actions')?.contains(screen.getByText('Alpha private thread'))).toBe(true)
  })

  it('withholds a previous Account private Tool title in the persistent header during reload', async () => {
    clerkSignedIn.value = true
    clerkSignedIn.orgId = 'org_alpha'
    const current = Promise.withResolvers<string>()
    const read = vi.fn<() => Promise<string>>().mockResolvedValueOnce('Alpha private Tool').mockImplementation(() => current.promise)
    const root = createRootRoute()
    const privateRoute = createRoute({ getParentRoute: () => root, path: '/owner/settings', loader: read,
      component: () => <AeOperatorPage operatorRole="owner" title={privateRoute.useLoaderData()} description="Private Tool" currentPath="/owner/settings"><p>Private record body</p></AeOperatorPage>,
    })
    const router = createRouter({ routeTree: root.addChildren([privateRoute]), history: createMemoryHistory({ initialEntries: ['/owner/settings'] }) })
    await router.load()
    const fixture = () => <RouterContextProvider router={router}><ThemeProvider><AeAppShell><RouterProvider router={router} /></AeAppShell></ThemeProvider></RouterContextProvider>
    const view = render(fixture())
    await screen.findByRole('heading', { name: 'Alpha private Tool' })
    clerkSignedIn.orgId = 'org_beta'
    view.rerender(fixture())
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
    try {
      expect(screen.getByTestId('workspace-transition-scrim')).toBeTruthy()
      expect(screen.queryByRole('heading', { name: 'Alpha private Tool' })?.textContent ?? null).toBeNull()
    } finally {
      await act(async () => { current.resolve('Current private Tool'); await Promise.resolve() })
    }
  })

  it('opens destinations in the header dropdown without adding a sidebar or replacing page content', async () => {
    // A preference left by the superseded release cannot resurrect a global rail.
    localStorage.setItem('ae-show-sidebar', 'true')
    clerkSignedIn.value = true
    renderAppShell('/market', <textarea aria-label="Current draft" defaultValue="Keep my work" />)
    const draft = screen.getByRole('textbox', { name: 'Current draft' })
    const trigger = screen.getByRole('button', { name: 'Workspace menu' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.querySelector('[data-slot="sidebar-gap"]')).toBeNull()
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const menu = await screen.findByRole('menu', { name: 'Workspace menu' })
    expect(within(menu).getByRole('menuitem', { name: 'Market' }).tagName).toBe('A')
    expect(within(menu).getByRole('menuitem', { name: 'Settings' }).getAttribute('href')).toBe('/owner/settings/workspace')
    expect(screen.queryByRole('menuitemcheckbox', { name: 'Show sidebar' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Current draft' })).toBe(draft)
    fireEvent.keyDown(menu, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true })
    expect(document.querySelector('[data-slot="sidebar"]')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Current draft' })).toBe(draft)
    localStorage.removeItem('ae-show-sidebar')
  })

  it('renders exactly one persistent app header with the skip link and public primary nav', () => {
    clerkSignedIn.value = false
    renderAppShell()

    expect(document.querySelectorAll('[data-shell="app-header"]')).toHaveLength(1)
    expect(screen.getByTestId('skip-to-content').getAttribute('href')).toBe('#main-content')

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(['Tools', 'Docs', 'For providers']).toEqual(
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
    expect(slot!.compareDocumentPosition(screen.getByRole('button', { name: 'Find tools' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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
      ['Tools', '/market'], ['Docs', '/developers/api'], ['For providers', '/for-providers'],
    ])
    expect(within(drawer).getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/sign-in')
    const close = within(drawer).getByRole('button', { name: 'Close public menu' })
    expect(close.tagName).toBe('BUTTON')
    fireEvent.click(close)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Public navigation' })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('offers current Account destinations through one header menu', () => {
    clerkSignedIn.value = true
    entitlement.isAuthenticated = true
    entitlement.result = authorized(['owner'])
    renderAppShell()

    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'App navigation' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Workspace menu' })).toBeTruthy()
    expect(screen.queryByRole('menu')).toBeNull()
    const nav = workspaceNavigation()
    expect(within(nav).getAllByRole('menuitem').map(link => link.textContent)).toEqual([
      'Market', 'Ask', 'Agents', 'Activity', 'Credit', 'Provider', 'Settings', 'Support', 'Status', 'Developer docs',
    ])
    expect(within(nav).getByRole('menuitem', { name: 'Settings' }).getAttribute('href')).toBe('/owner/settings/workspace')
    expect(within(nav).getByRole('menuitem', { name: 'Market' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getAllByTestId('org-switcher')).toHaveLength(1)
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
  })

  it('marks Settings as the active workspace destination', () => {
    clerkSignedIn.value = true
    entitlement.isAuthenticated = true
    renderAppShell('/owner/settings')
    expect(within(workspaceNavigation()).getByRole('menuitem', { name: 'Settings' }).getAttribute('aria-current')).toBe('page')
  })

  it('shows one Admin group on an owner page for the current authorized session', () => {
    clerkSignedIn.value = true
    entitlement.isAuthenticated = true
    entitlement.result = authorized(['owner', 'admin'])
    renderAppShell('/owner/operations')
    const nav = workspaceNavigation()
    expect(within(nav).getAllByText('Admin')).toHaveLength(1)
    expect(['Overview', 'Search', 'Exceptions', 'Providers', 'Metrics', 'Audit'].map(label =>
      within(roleNavigation('Admin')).getByRole('menuitem', { name: label }).textContent
    )).toEqual(['Overview', 'Search', 'Exceptions', 'Providers', 'Metrics', 'Audit'])
    expect(screen.queryByRole('navigation', { name: 'Owner primary navigation' })).toBeNull()
  })

  it('opens the Admin submenu on mouse hover, keeps it open through a click, and opens it from Enter', async () => {
    clerkSignedIn.value = true
    entitlement.isAuthenticated = true
    entitlement.result = authorized(['owner', 'admin'])
    renderAppShell('/owner/operations')
    let trigger = within(workspaceNavigation()).getByRole('menuitem', { name: 'Admin' })
    fireEvent.pointerEnter(trigger, { pointerType: 'mouse' })
    fireEvent.mouseEnter(trigger)
    fireEvent.pointerMove(trigger, { pointerType: 'mouse' })
    fireEvent.mouseMove(trigger)
    expect(within(await screen.findByRole('menu', { name: 'Admin' })).getByRole('menuitem', { name: 'Overview' }).getAttribute('href')).toBe('/admin')
    fireEvent.pointerDown(trigger, { pointerType: 'mouse', button: 0 })
    fireEvent.mouseDown(trigger, { button: 0 })
    fireEvent.pointerUp(trigger, { pointerType: 'mouse', button: 0 })
    fireEvent.mouseUp(trigger, { button: 0 })
    fireEvent.click(trigger, { button: 0 })
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(screen.getByRole('menu', { name: 'Admin' })).toBeTruthy()
    cleanup()
    renderAppShell('/owner/operations')
    trigger = within(workspaceNavigation()).getByRole('menuitem', { name: 'Admin' })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'Enter' })
    fireEvent.click(trigger, { detail: 0 })
    expect(await screen.findByRole('menu', { name: 'Admin' })).toBeTruthy()
  })

  it('keeps the remembered operator context equal to the live subscription for this session only', () => {
    rememberOperatorContext(undefined)
    clerkSignedIn.value = true
    entitlement.isAuthenticated = true
    entitlement.result = authorized(['owner', 'admin'])
    const view = renderAppShell('/owner/operations')
    expect(rememberedOperatorContext()).toEqual(authorized(['owner', 'admin']))
    entitlement.result = { ...authorized(['owner']), authScope: { organizationId: null, sessionId: 'session-other' } }
    view.rerenderShell()
    expect(rememberedOperatorContext()).toBeUndefined()
  })

  it('marks the active Admin destination inside its submenu', () => {
    clerkSignedIn.value = true
    entitlement.isAuthenticated = true
    entitlement.result = authorized(['owner', 'admin'])
    renderAppShell('/admin/metrics')
    expect(screen.queryByRole('navigation', { name: 'Admin primary navigation' })).toBeNull()
    const nav = workspaceNavigation()
    expect(within(nav).getAllByText('Admin')).toHaveLength(1)
    expect(within(roleNavigation('Admin')).getByRole('menuitem', { name: 'Metrics' }).getAttribute('aria-current')).toBe('page')
    expect(within(roleNavigation('Admin')).getByRole('menuitem', { name: 'Overview' }).getAttribute('aria-current')).toBeNull()
  })

  it('keeps contextual Developer navigation alongside one Admin group', () => {
    clerkSignedIn.value = true
    entitlement.isAuthenticated = true
    entitlement.result = authorized(['owner', 'admin', 'developer'])
    renderAppShell('/developers/discovery')
    const nav = workspaceNavigation()
    expect(within(nav).getAllByText('Admin')).toHaveLength(1)
    expect(within(nav).getAllByText('Developer')).toHaveLength(1)
    expect(within(roleNavigation('Developer')).getByRole('menuitem', { name: 'Discovery' })).toBeTruthy()
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
    expect(within(nav).queryByRole('menuitem', { name: 'Tools' })).toBeNull()
    expect(within(nav).queryByRole('menuitem', { name: 'Earnings' })).toBeNull()
    expect(within(nav).getByRole('menuitem', { name: 'Credit' })).toBeTruthy()
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
    expect(within(nav).getByRole('menuitem', { name: 'Market' })).toBeTruthy()
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


it.each([['signs out', false, 'session-current'], ['changes session', true, 'session-next']] as const)('forgets the remembered operator context and re-admits when Clerk %s', async (_label, signedIn, nextSession) => {
  clerkSignedIn.value = true
  clerkSignedIn.sessionId = 'session-current'
  const view = renderAppShell('/owner/settings')
  const invalidate = vi.spyOn(view.router, 'invalidate').mockResolvedValue(undefined)
  rememberOperatorContext({ kind: 'denied', reason: 'canonical_owner_required' })
  view.rerenderShell()
  expect(invalidate).not.toHaveBeenCalled()
  expect(rememberedOperatorContext()).toBeDefined()
  clerkSignedIn.value = signedIn
  clerkSignedIn.sessionId = nextSession
  view.rerenderShell()
  await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1))
  expect(rememberedOperatorContext()).toBeUndefined()
})

it('continues to use the existing leave confirmation instead of switching Account directly', async () => {
  clerkSignedIn.value = true
  renderAppShell('/owner/settings', <GuardedAccountChange mode="unknown" />)
  fireEvent.click(screen.getByRole('button', { name: 'Start guarded change' }))
  fireEvent.click(within(workspaceNavigation()).getByRole('menuitem', { name: 'Market' }))
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
  if (!screen.queryByRole('menu', { name: 'Workspace menu' })) fireEvent.click(screen.getByRole('button', { name: 'Workspace menu' }))
  const navs = screen.getAllByRole('menu', { name: 'Workspace menu' })
  expect(navs).toHaveLength(1)
  return navs[0]!
}

function roleNavigation(name: string) {
  if (!screen.queryByRole('menu', { name })) fireEvent.click(within(workspaceNavigation()).getByRole('menuitem', { name }))
  return screen.getByRole('menu', { name })
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

  const tree = () => <RouterContextProvider router={router}><ThemeProvider><AeAppShell>{children}</AeAppShell></ThemeProvider></RouterContextProvider>
  const view = render(tree())
  return { rerenderShell: () => view.rerender(tree()), unmount: view.unmount, router }
}
