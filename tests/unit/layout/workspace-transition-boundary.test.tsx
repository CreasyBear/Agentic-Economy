/**
 * @vitest-environment jsdom
 */
import type { ReactNode } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import {
  type AnyRouter,
  RouterContextProvider,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Drawer, DrawerContent } from '@/components/ae/shared/base-ui/drawer/drawer'
import { AeConfirmDialog } from '@/components/ae/feedback/AeConfirmDialog'
import { fireEvent } from '@testing-library/react'
import { TeamInviteDialog } from '@/components/ae/settings/team-roles/TeamInviteDialog'
import { useInviteTeamMember } from '@/components/ae/settings/team-roles/useInviteTeamMember'
import { WorkspaceTransitionBoundary } from '@/components/ae/layout/WorkspaceTransitionBoundary'
import '../../setup/jsdom-platform'

const authState = vi.hoisted(() => ({
  orgId: 'org_alpha' as string | null | undefined,
  orgRole: 'org:admin',
  isLoaded: true,
  isSignedIn: true,
  userId: 'user_fixture' as string | null,
  sessionId: 'session_fixture' as string | null,
}))


vi.mock('@clerk/tanstack-react-start', () => ({
  useAuth: () => ({
    isLoaded: authState.isLoaded,
    orgId: authState.orgId,
    orgRole: authState.orgRole,
    userId: authState.userId,
    sessionId: authState.sessionId,
    isSignedIn: authState.isSignedIn,
  }),
}))

afterEach(() => {
  vi.useRealTimers()
  cleanup()
  authState.orgId = 'org_alpha'
  authState.orgRole = 'org:admin'
  authState.isLoaded = true
  authState.isSignedIn = true
  authState.userId = 'user_fixture'
  authState.sessionId = 'session_fixture'
})


describe('WorkspaceTransitionBoundary (S-12)', () => {
  it.each(['drawer', 'confirmation'] as const)('withholds an open private %s during a role refresh', async kind => {
    const router = await createBoundaryRouter('/owner/operations')
    const fresh = Promise.withResolvers<void>()
    vi.spyOn(router, 'invalidate').mockReturnValue(fresh.promise)
    const fixture = () => <BoundaryFixture router={router}>{kind === 'drawer'
      ? <Drawer defaultOpen><DrawerContent title="Private workspace detail"><p>Account-only draft facts</p></DrawerContent></Drawer>
      : <AeConfirmDialog open onOpenChange={() => {}} title="Confirm private workspace change" description="Account-only draft facts" confirmLabel="Confirm" onConfirm={() => {}} />
    }</BoundaryFixture>
    const view = render(fixture())
    await screen.findByText('Account-only draft facts')
    expect(screen.getByRole(kind === 'drawer' ? 'dialog' : 'alertdialog')).toBeTruthy()
    authState.orgRole = 'org:member'
    view.rerender(fixture())
    await waitFor(() => expect(router.invalidate).toHaveBeenCalledOnce())
    expect(screen.queryByRole(kind === 'drawer' ? 'dialog' : 'alertdialog')).toBeNull()
    expect(screen.queryByText('Account-only draft facts')).toBeNull()
    await act(async () => { fresh.resolve(); await fresh.promise })
    await screen.findByText('Account-only draft facts')
  })

  it('hides a maintained invitation dialog during a role refresh and restores its open draft', async () => {
    const router = await createBoundaryRouter('/owner/operations')
    const fresh = Promise.withResolvers<void>()
    vi.spyOn(router, 'invalidate').mockReturnValue(fresh.promise)
    function InvitationOwner() {
      const invitation = useInviteTeamMember(false, 'account_alpha')
      return <TeamInviteDialog invitation={invitation} onObserve={() => {}} />
    }
    const fixture = () => <><button type="button">Persistent Account control</button><BoundaryFixture router={router}><InvitationOwner /></BoundaryFixture></>
    const view = render(fixture())
    fireEvent.click(screen.getByRole('button', { name: 'Invite a member' }))
    await screen.findByRole('dialog', { name: 'Invite a member' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), { target: { value: 'private@example.com' } })
    authState.orgRole = 'org:member'
    view.rerender(fixture())
    await waitFor(() => expect(router.invalidate).toHaveBeenCalledOnce())
    try {
      expect(screen.queryByRole('dialog', { name: 'Invite a member' })).toBeNull()
      expect(screen.queryByRole('textbox', { name: 'Email address' })).toBeNull()
      const accountControl = screen.getByRole('button', { name: 'Persistent Account control' })
      accountControl.focus()
      expect(document.activeElement).toBe(accountControl)
    } finally { await act(async () => { fresh.resolve(); await fresh.promise }) }
    await screen.findByRole('dialog', { name: 'Invite a member' })
    expect((screen.getByRole('textbox', { name: 'Email address' }) as HTMLInputElement).value).toBe('private@example.com')
  })

  it('retires an open invitation portal and its private email draft on identity change', async () => {
    const router = await createBoundaryRouter('/owner/operations')
    const fresh = Promise.withResolvers<void>()
    vi.spyOn(router, 'invalidate').mockReturnValue(fresh.promise)
    function InvitationOwner() {
      const invitation = useInviteTeamMember(false, 'account_alpha')
      return <TeamInviteDialog invitation={invitation} onObserve={() => {}} />
    }
    const fixture = () => <BoundaryFixture router={router}><InvitationOwner /></BoundaryFixture>
    const view = render(fixture())
    fireEvent.click(screen.getByRole('button', { name: 'Invite a member' }))
    await screen.findByRole('dialog', { name: 'Invite a member' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Email address' }), { target: { value: 'private@example.com' } })
    authState.orgId = 'org_beta'
    view.rerender(fixture())
    await waitFor(() => expect(router.invalidate).toHaveBeenCalledOnce())
    expect(screen.queryByRole('dialog', { name: 'Invite a member' })).toBeNull()
    await act(async () => { fresh.resolve(); await fresh.promise })
    fireEvent.click(screen.getByRole('button', { name: 'Invite a member' }))
    await screen.findByRole('dialog', { name: 'Invite a member' })
    expect((screen.getByRole('textbox', { name: 'Email address' }) as HTMLInputElement).value).toBe('')
  })

  it('hides a changed role until current access reloads without discarding same-Account work', async () => {
    const router = await createBoundaryRouter('/owner/operations/tool_acme_123')
    let finish!: () => void
    const invalidate = vi.spyOn(router, 'invalidate').mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const view = render(<BoundaryFixture router={router}><input aria-label="Draft" defaultValue="Retained draft" /></BoundaryFixture>)
    const draft = screen.getByRole('textbox', { name: 'Draft' })
    authState.orgRole = 'org:member'
    view.rerender(<BoundaryFixture router={router}><input aria-label="Draft" defaultValue="Retained draft" /></BoundaryFixture>)
    expect(screen.queryByRole('textbox', { name: 'Draft' })).toBeNull()
    await waitFor(() => expect(invalidate).toHaveBeenCalledOnce())
    expect(router.state.location.pathname).toBe('/owner/operations/tool_acme_123')
    finish()
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(draft))
    invalidate.mockRestore()
  })

  it.each(['account', 'role', 'logout-login'] as const)('does not reveal cached private records on return after %s changes', async change => {
    let finish!: (value: string) => void
    const fresh = new Promise<string>(resolve => { finish = resolve })
    const read = vi.fn<() => Promise<string>>()
      .mockResolvedValueOnce('Alpha private record').mockImplementation(() => fresh)
    const root = createRootRoute()
    const privateRoute = createRoute({
      getParentRoute: () => root, path: '/owner/operations/$toolRef',
      loader: () => read(),
      component: () => <p>{privateRoute.useLoaderData()}</p>,
    })
    const router = createRouter({
      routeTree: root.addChildren([
        createRoute({ getParentRoute: () => root, path: '/activity', component: () => <p>Activity</p> }),
        createRoute({ getParentRoute: () => root, path: '/market', component: () => <p>Market</p> }),
        createRoute({ getParentRoute: () => root, path: '/owner/operations', component: () => <p>Operations</p> }),
        privateRoute,
      ]), history: createMemoryHistory({ initialEntries: ['/owner/operations/private'] }),
    })
    await router.load()
    const fixture = () => <BoundaryFixture router={router}><RouterProvider router={router} /></BoundaryFixture>
    const view = render(fixture())
    await screen.findByText('Alpha private record')
    // Account changes exercise the active route becoming cached during redirect;
    // role and logout/login changes exercise an already departed route's cache.
    if (change !== 'account') await act(async () => { await router.navigate({ to: '/activity' }) })
    if (change === 'role') authState.orgRole = 'org:member'
    else if (change === 'account') authState.orgId = 'org_beta'
    else {
      authState.userId = null; authState.sessionId = null; authState.orgId = null; authState.isSignedIn = false
      view.rerender(fixture())
      await waitFor(() => expect(router.state.location.pathname).toBe('/market'))
      await waitFor(() => expect(screen.queryByTestId('workspace-transition-scrim')).toBeNull())
      authState.userId = 'user_beta'; authState.sessionId = 'session_beta'; authState.orgId = 'org_beta'; authState.isSignedIn = true
    }
    view.rerender(fixture())
    await waitFor(() => expect(screen.queryByTestId('workspace-transition-scrim')).toBeNull())
    let navigation!: Promise<void>
    act(() => { navigation = router.navigate({ to: '/owner/operations/$toolRef', params: { toolRef: 'private' } }) })
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
    try {
      expect(screen.queryByText('Alpha private record')).toBeNull()
    } finally {
      await act(async () => { finish('Current private record'); await navigation })
    }
    await screen.findByText('Current private record')
  })

  it('retires an old-scope preload even when its read ignores cancellation and completes late', async () => {
    let finishOld!: (value: string) => void
    let finishCurrent!: (value: string) => void
    const old = new Promise<string>(resolve => { finishOld = resolve })
    const current = new Promise<string>(resolve => { finishCurrent = resolve })
    const signals: AbortSignal[] = []
    const read = vi.fn<(signal: AbortSignal) => Promise<string>>()
      .mockImplementationOnce(signal => { signals.push(signal); return old })
      .mockImplementation(signal => { signals.push(signal); return current })
    const root = createRootRoute()
    const privateRoute = createRoute({
      getParentRoute: () => root, path: '/owner/operations/$toolRef',
      loader: ({ abortController }) => read(abortController.signal),
    })
    const router = createRouter({ routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/owner/operations' }), privateRoute,
    ]), history: createMemoryHistory({ initialEntries: ['/owner/operations'] }) })
    await router.load()
    const view = render(<BoundaryFixture router={router} />)
    const preload = router.preloadRoute({ to: '/owner/operations/$toolRef', params: { toolRef: 'private' } })
    await waitFor(() => expect(read).toHaveBeenCalledOnce())
    authState.orgId = 'org_beta'
    view.rerender(<BoundaryFixture router={router} />)
    await waitFor(() => expect(screen.queryByTestId('workspace-transition-scrim')).toBeNull())
    expect(signals[0]?.aborted).toBe(true)
    const navigation = router.navigate({ to: '/owner/operations/$toolRef', params: { toolRef: 'private' } })
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
    await act(async () => { finishOld('Alpha private record'); await preload })
    expect(router.state.matches.at(-1)?.loaderData).not.toBe('Alpha private record')
    await act(async () => { finishCurrent('Current private record'); await navigation })
    expect(router.state.matches.at(-1)?.loaderData).toBe('Current private record')
  })

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
  router: AnyRouter
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
      path: '/owner/operations/$toolRef',
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
