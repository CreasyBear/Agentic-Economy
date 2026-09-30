// @vitest-environment jsdom


import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useCallback, useEffect, type ComponentType, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  pathname: '/t/new',
  isAuthenticated: true,
  isLoaded: true,
  sessionId: "session-1" as string | null,
  factorVerificationAge: [1, -1] as number[],
  constructClient: vi.fn(),
  setHttpAuth: vi.fn(),
  getToken: vi.fn(async () => 'verified-token'),
  refresh: null as null | (() => Promise<string | null>),
  materialize: vi.fn(async () => true),
  useQuery: vi.fn<(...args: unknown[]) => unknown>(() => undefined),
  renderClerkProvider: vi.fn(),
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => {
    runtime.renderClerkProvider(runtime.pathname)
    return children
  },
  useAuth: () => ({
    isLoaded: runtime.isLoaded,
    isSignedIn: runtime.isAuthenticated,
    sessionId: runtime.sessionId,
    userId: 'owner-1',
    orgId: null,
    sessionClaims: { fva: runtime.factorVerificationAge },
    getToken: runtime.getToken,
  }),
}))

vi.mock('convex/react-clerk', () => ({
  ConvexProviderWithClerk: ({
    children,
    useAuth,
  }: {
    children: ReactNode
    useAuth: () => {
      isSignedIn: boolean
      sessionId?: string | null
      getToken: () => Promise<string | null>
    }
  }) => {
    const { getToken, isSignedIn, sessionId } = useAuth()
    // Match Convex's Clerk adapter: only a session change reinstalls auth.
    // The getToken closure changing on its own does not restart authentication.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    const fetchAccessToken = useCallback(() => getToken(), [sessionId])
    runtime.refresh = fetchAccessToken
    useEffect(() => {
      if (isSignedIn) void fetchAccessToken()
    }, [fetchAccessToken, isSignedIn])
    return children
  },
}))

vi.mock('convex/browser', () => ({
  ConvexHttpClient: class ConvexHttpClient {
    setAuth(token: string) { runtime.setHttpAuth(token) }
    mutation = runtime.materialize
  },
}))

vi.mock('convex/react', () => ({
  ConvexReactClient: class ConvexReactClient {
    constructor(readonly url: string) {
      runtime.constructClient(url)
    }
  },
  useConvexAuth: () => ({ isAuthenticated: runtime.isAuthenticated }),
  useQuery: (...args: unknown[]) => runtime.useQuery(...args),
  useMutation: () => runtime.materialize,
}))

vi.mock('@tanstack/react-router', () => ({
  ClientOnly: ({ children }: { children: ReactNode }) => children,
  HeadContent: () => null,
  Link: ({
    to,
    search,
    hash,
    className,
    children,
  }: {
    to: string
    search?: Record<string, string>
    hash?: string
    className?: string
    children: ReactNode
  }) => {
    const query = search === undefined ? '' : `?${new URLSearchParams(search).toString()}`
    const fragment = hash === undefined ? '' : `#${hash}`
    return <a href={`${to}${query}${fragment}`} className={className}>{children}</a>
  },
  Outlet: () => <div>Chat ready<input aria-label="Draft" defaultValue="" /></div>,
  Scripts: () => null,
  ScriptOnce: ({ children }: { children?: ReactNode }) => children ?? null,
  createRootRoute: (options: unknown) => ({ options }),
  useRouter: () => ({}),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) => select({
    location: { pathname: runtime.pathname },
  }),
}))

vi.mock('sonner', () => ({ Toaster: () => null }))
vi.mock('@/components/ae/layout/AeRouteProgressBar', () => ({ RouteProgressBar: () => null }))
vi.mock('@/components/ae/layout/AeAppShell', () => ({
  AeAppShell: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('@/components/ae/feedback/AeObservabilityErrorBoundary', () => ({
  AeObservabilityErrorBoundary: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('@/components/ae/layout/AePageState', () => ({
  AePageState: ({
    title,
    description,
    tone,
    action,
  }: {
    title: string
    description: string
    tone: 'neutral' | 'warning' | 'danger'
    action?: ReactNode
  }) => (
    <section role={tone === 'danger' ? 'alert' : 'status'} data-tone={tone}>
      <h1>{title}</h1>
      <p>{description}</p>
      {action}
    </section>
  ),
}))
vi.mock('@/lib/observability/boot-client-observability', () => ({
  bootClientObservability: vi.fn(),
}))

import { requiresChatProviders, SignedInConvexProvider } from '@/components/ae/layout/AeConvexProviders'
import { Route } from '@/routes/__root'


beforeEach(() => {
  runtime.pathname = '/t/new'
  runtime.isLoaded = true
  runtime.isAuthenticated = true
  runtime.sessionId = "session-1"
  runtime.factorVerificationAge = [1, -1]
  runtime.getToken.mockReset().mockResolvedValue('verified-token')
  runtime.setHttpAuth.mockReset()
  runtime.constructClient.mockReset()
  runtime.materialize.mockReset().mockResolvedValue(true)
  runtime.useQuery.mockReset().mockReturnValue(undefined)
  runtime.refresh = null
  runtime.renderClerkProvider.mockReset()
  vi.stubEnv('VITE_CONVEX_URL', 'https://runtime-authority.convex.test')
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('Tool chat provider boundary', () => {
  it('selects only thread and share routes', () => {
    expect(requiresChatProviders('/t/new')).toBe(true)
    expect(requiresChatProviders('/t/thread-1')).toBe(true)
    expect(requiresChatProviders(`/s/${'a'.repeat(64)}`)).toBe(true)
    expect(requiresChatProviders('/market')).toBe(false)
    expect(requiresChatProviders('/api/chat/anonymous')).toBe(false)
  })


  it('mounts Clerk at the application root for authentication routes', () => {
    runtime.pathname = '/sign-in'
    const Root = (Route as unknown as {
      options: { component: ComponentType }
    }).options.component

    render(<Root />, { container: document })

    expect(runtime.renderClerkProvider).toHaveBeenCalledWith('/sign-in')
  })

  it('keeps public route transitions inside the same Clerk boundary', () => {
    runtime.pathname = '/market'
    const Root = (Route as unknown as {
      options: { component: ComponentType }
    }).options.component

    render(<Root />, { container: document })

    expect(runtime.renderClerkProvider).toHaveBeenCalledWith('/market')
  })

  it('renders a single catalogue continuation without constructing chat authority when configuration is missing', () => {
    vi.stubEnv('VITE_CONVEX_URL', '   ')
    const Root = (Route as unknown as {
      options: { component: ComponentType }
    }).options.component

    render(<Root />, { container: document })

    expect(screen.getAllByRole('heading', { level: 1, name: 'Chat is unavailable' })).toHaveLength(1)
    const status = screen.getByRole('status')
    expect(status.getAttribute('data-tone')).toBe('warning')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('Chat is not configured. The Tool catalogue remains available.')).not.toBeNull()

    const browseLinks = screen.getAllByRole('link', { name: 'Browse Tools' })
    expect(browseLinks).toHaveLength(1)
    expect(browseLinks[0]?.tagName).toBe('A')
    expect(browseLinks[0]?.getAttribute('href')).toBe('/market')
    expect(browseLinks[0]?.classList.contains('min-h-touch')).toBe(true)

    expect(screen.queryByRole('button', { name: /retry|try again/iu })).toBeNull()
    expect(screen.queryByRole('link', { name: /retry|try again/iu })).toBeNull()
    expect(screen.queryByRole('link', { name: /ask/iu })).toBeNull()
    expect(document.querySelector('a[href="/t/new"]')).toBeNull()
    expect(runtime.constructClient).not.toHaveBeenCalled()
    expect(runtime.materialize).not.toHaveBeenCalled()
  })

  it('runs the real chat provider composition and materializes only authenticated authority', async () => {
    const Root = (Route as unknown as {
      options: { component: ComponentType }
    }).options.component
    const view = render(<Root />, { container: document })

    await waitFor(() => expect(runtime.materialize).toHaveBeenCalledWith(expect.anything(), {}))
    expect(runtime.materialize).toHaveBeenCalledTimes(1)

    runtime.isAuthenticated = false
    view.rerender(<Root />)
    await Promise.resolve()
    expect(runtime.materialize).toHaveBeenCalledTimes(1)
  })

  it('waits for authority initialization before mounting authenticated chat', async () => {
    let finish!: (ready: boolean) => void
    runtime.materialize.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = resolve }))
    const Root = (Route as unknown as { options: { component: ComponentType } }).options.component
    render(<Root />, { container: document })
    expect(screen.queryByText('Chat ready')).toBeNull()
    await waitFor(() => expect(runtime.materialize).toHaveBeenCalled())
    await act(async () => { finish(true) })
    expect(screen.getByText('Chat ready')).toBeTruthy()
  })

  it.each(['refusal', 'rejection'])('keeps %s recoverable without mounting authenticated chat', async (failure) => {
    if (failure === 'refusal') runtime.materialize.mockResolvedValueOnce(false)
    else runtime.materialize.mockRejectedValueOnce(new Error('credential_not_current'))
    const Root = (Route as unknown as { options: { component: ComponentType } }).options.component
    render(<Root />, { container: document })
    await screen.findByRole('button', { name: 'Try again' })
    expect(screen.getByRole('link', { name: 'Browse Tools' }).getAttribute('href')).toBe('/market')
    expect(screen.queryByText('Chat ready')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('Chat ready')
    expect(runtime.materialize).toHaveBeenCalledTimes(2)
  })

  it('ignores initialization completed for a previous session', async () => {
    const pending: Array<(ready: boolean) => void> = []
    runtime.materialize.mockImplementation(() => new Promise<boolean>((resolve) => { pending.push(resolve) }))
    const Root = (Route as unknown as { options: { component: ComponentType } }).options.component
    const view = render(<Root />, { container: document })
    await waitFor(() => expect(pending).toHaveLength(1))
    runtime.sessionId = 'session-2'
    view.rerender(<Root />)
    await waitFor(() => expect(pending).toHaveLength(2))
    await act(async () => { pending[0]!(true) })
    expect(screen.queryByText('Chat ready')).toBeNull()
    await act(async () => { pending[1]!(true) })
    expect(screen.getByText('Chat ready')).toBeTruthy()
  })
  it('reinitializes renewed tokens before exposing authenticated chat again', async () => {
    const Root = (Route as unknown as { options: { component: ComponentType } }).options.component
    render(<Root />, { container: document })
    await screen.findByText('Chat ready')
    let finish!: (ready: boolean) => void
    runtime.getToken.mockResolvedValueOnce('renewed-token')
    runtime.materialize.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = resolve }))
    let renewal!: Promise<string | null>
    await act(async () => { renewal = runtime.refresh!() })
    expect(screen.getByText('Chat ready')).toBeTruthy()
    expect(runtime.setHttpAuth).toHaveBeenLastCalledWith('renewed-token')
    await act(async () => { finish(true); await renewal })
    expect(await renewal).toBe('renewed-token')
    expect(screen.getByText('Chat ready')).toBeTruthy()
  })

  it('renews active account authority without losing the draft and blocks on refusal', async () => {
    vi.useFakeTimers()
    const Root = (Route as unknown as { options: { component: ComponentType } }).options.component
    await act(async () => { render(<Root />, { container: document }) })
    fireEvent.change(screen.getByRole('textbox', { name: 'Draft' }), { target: { value: 'Keep my OCR request' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(40_000) })
    expect(runtime.materialize).toHaveBeenCalledTimes(3)
    expect(screen.getByDisplayValue('Keep my OCR request')).toBeTruthy()
    runtime.materialize.mockResolvedValueOnce(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
    expect(screen.queryByText('Chat ready')).toBeNull()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
  it('keeps the draft and composer during a Convex reconnect, but still blocks an explicit authority refusal', async () => {
    vi.useFakeTimers()
    const Root = (Route as unknown as { options: { component: ComponentType } }).options.component
    await act(async () => { render(<Root />, { container: document }) })
    fireEvent.change(screen.getByRole('textbox', { name: 'Draft' }), { target: { value: 'convert time between timezones' } })
    runtime.materialize.mockRejectedValueOnce(new Error('websocket_reconnecting'))
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
    expect(screen.getByText('Chat ready')).toBeTruthy()
    expect(screen.getByDisplayValue('convert time between timezones')).toBeTruthy()
    runtime.materialize.mockResolvedValueOnce(false)
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })
    expect(screen.queryByText('Chat ready')).toBeNull()
    expect(screen.getByRole('link', { name: 'Browse Tools' }).getAttribute('href')).toBe('/market')
  })

  it('installs a fresh verified token after network recovery without replacing the signed chat', async () => {
    const Root = (Route as unknown as { options: { component: ComponentType } }).options.component
    render(<Root />, { container: document })
    await screen.findByText('Chat ready')
    const draft = screen.getByRole('textbox', { name: 'Draft' })
    fireEvent.change(draft, { target: { value: 'Stay on the private thread' } })
    runtime.materialize.mockRejectedValueOnce(new Error('network_disconnected'))
    await act(async () => { expect(await runtime.refresh!()).toBeNull() })
    const callsBeforeRecovery = runtime.getToken.mock.calls.length

    await act(async () => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(runtime.getToken.mock.calls.length).toBe(callsBeforeRecovery + 1))
    expect(runtime.materialize).toHaveBeenCalledTimes(3)
    expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(draft)
    expect(draft).toHaveProperty('value', 'Stay on the private thread')
  })

  it.each(['/t/new', '/t/thread-1'])('keeps the same mounted draft across a temporary Clerk handshake on %s', async (pathname) => {
    runtime.pathname = pathname
    const Root = (Route as unknown as { options: { component: ComponentType } }).options.component
    const view = render(<Root />, { container: document })
    await screen.findByText('Chat ready')
    const draft = screen.getByRole('textbox', { name: 'Draft' })
    fireEvent.change(draft, { target: { value: 'A draft before reconnect' } })

    runtime.isLoaded = false
    runtime.sessionId = null
    view.rerender(<Root />)
    expect(screen.queryByRole('textbox', { name: 'Draft' })).toBeNull()
    expect(screen.getByRole('status')).toBeTruthy()

    runtime.isLoaded = true
    runtime.sessionId = 'session-1'
    view.rerender(<Root />)
    await screen.findByText('Chat ready')
    expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(draft)
    expect(draft).toHaveProperty('value', 'A draft before reconnect')

    runtime.sessionId = 'session-2'
    view.rerender(<Root />)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Draft' })).not.toBe(draft))
    expect(screen.getByRole('textbox', { name: 'Draft' })).toHaveProperty('value', '')
  })

  it('keeps the signed-in Convex boundary mounted while refreshing authority', async () => {
    runtime.isLoaded = false
    runtime.isAuthenticated = false
    const mounted = vi.fn()
    function Child() {
      useEffect(() => {
        mounted()
      }, [])
      return <div>Stable child</div>
    }
    const view = render(<SignedInConvexProvider><Child /></SignedInConvexProvider>)

    expect(mounted).toHaveBeenCalledTimes(1)

    runtime.isLoaded = true
    runtime.isAuthenticated = true
    view.rerender(<SignedInConvexProvider><Child /></SignedInConvexProvider>)
    await waitFor(() => expect(runtime.getToken).toHaveBeenCalledTimes(1))

    runtime.factorVerificationAge = [0, 0]
    view.rerender(<SignedInConvexProvider><Child /></SignedInConvexProvider>)
    // MFA is verified by the server; factor ages do not fabricate a new Convex session.
    expect(runtime.getToken).toHaveBeenCalledTimes(1)
    runtime.sessionId = 'session-2'
    view.rerender(<SignedInConvexProvider><Child /></SignedInConvexProvider>)
    await waitFor(() => expect(runtime.getToken).toHaveBeenCalledTimes(2))

    expect(mounted).toHaveBeenCalledTimes(1)
  })
})
