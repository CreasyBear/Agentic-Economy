// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  pathname: '/t/new',
  isAuthenticated: true,
  constructClient: vi.fn(),
  materialize: vi.fn(async () => true),
  renderClerkProvider: vi.fn(),
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => {
    runtime.renderClerkProvider(runtime.pathname)
    return children
  },
  useAuth: () => ({ isLoaded: true, isSignedIn: runtime.isAuthenticated }),
}))

vi.mock('convex/react-clerk', () => ({
  ConvexProviderWithClerk: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('convex/react', () => ({
  ConvexReactClient: class ConvexReactClient {
    constructor(readonly url: string) {
      runtime.constructClient(url)
    }
  },
  useConvexAuth: () => ({ isAuthenticated: runtime.isAuthenticated }),
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
  Outlet: () => null,
  Scripts: () => null,
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

import { Route, requiresChatProviders } from '@/routes/__root'

const source = readFileSync(
  resolve(process.cwd(), 'src/routes/__root.tsx'),
  'utf8',
)

beforeEach(() => {
  runtime.pathname = '/t/new'
  runtime.isAuthenticated = true
  runtime.constructClient.mockReset()
  runtime.materialize.mockReset().mockResolvedValue(true)
  runtime.renderClerkProvider.mockReset()
  vi.stubEnv('VITE_CONVEX_URL', 'https://runtime-authority.convex.test')
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('Tool chat provider boundary', () => {
  it('selects only thread and share routes', () => {
    expect(requiresChatProviders('/t/new')).toBe(true)
    expect(requiresChatProviders('/t/thread-1')).toBe(true)
    expect(requiresChatProviders(`/s/${'a'.repeat(64)}`)).toBe(true)
    expect(requiresChatProviders('/market')).toBe(false)
    expect(requiresChatProviders('/api/chat/anonymous')).toBe(false)
  })

  it('nests Convex inside Clerk using the installed integration', () => {
    expect(source).toContain("import { ClerkProvider, useAuth } from '@clerk/tanstack-react-start'")
    expect(source).toContain("import { ConvexProviderWithClerk } from 'convex/react-clerk'")
    expect(source).toMatch(/<ClerkProvider[^>]*>[\s\S]*<ChatConvexProvider>\{children\}<\/ChatConvexProvider>[\s\S]*<\/ClerkProvider>/u)
    expect(source).toContain('<ConvexProviderWithClerk client={client} useAuth={useAuth}>')
  })

  it('mounts Clerk at the application root for authentication routes', () => {
    runtime.pathname = '/sign-in'
    const Root = (Route as unknown as {
      options: { component: ComponentType }
    }).options.component

    render(<Root />, { container: document })

    expect(runtime.renderClerkProvider).toHaveBeenCalledWith('/sign-in')
    expect(runtime.constructClient).not.toHaveBeenCalled()
  })

  it('keeps public route transitions inside the same Clerk boundary', () => {
    runtime.pathname = '/market'
    const Root = (Route as unknown as {
      options: { component: ComponentType }
    }).options.component

    render(<Root />, { container: document })

    expect(runtime.renderClerkProvider).toHaveBeenCalledWith('/market')
    expect(runtime.constructClient).not.toHaveBeenCalled()
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

    await waitFor(() => expect(runtime.materialize).toHaveBeenCalledWith({}))
    expect(runtime.materialize).toHaveBeenCalledTimes(1)

    runtime.isAuthenticated = false
    view.rerender(<Root />)
    await Promise.resolve()
    expect(runtime.materialize).toHaveBeenCalledTimes(1)
  })

  it('keeps provider rendering available when lifecycle materialization refuses', async () => {
    runtime.materialize.mockRejectedValueOnce(new Error('credential_not_current'))
    const Root = (Route as unknown as {
      options: { component: ComponentType }
    }).options.component

    expect(() => render(<Root />, { container: document })).not.toThrow()
    await waitFor(() => expect(runtime.materialize).toHaveBeenCalledWith({}))
  })
})
