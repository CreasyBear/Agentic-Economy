// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { cleanup, render, waitFor } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  pathname: '/t/new',
  isAuthenticated: true,
  materialize: vi.fn(async () => true),
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({ isLoaded: true, isSignedIn: runtime.isAuthenticated }),
}))

vi.mock('convex/react-clerk', () => ({
  ConvexProviderWithClerk: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('convex/react', () => ({
  ConvexReactClient: class ConvexReactClient {
    constructor(readonly url: string) {}
  },
  useConvexAuth: () => ({ isAuthenticated: runtime.isAuthenticated }),
  useMutation: () => runtime.materialize,
}))

vi.mock('@tanstack/react-router', () => ({
  HeadContent: () => null,
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
vi.mock('@/components/ae/feedback/AeObservabilityErrorBoundary', () => ({
  AeObservabilityErrorBoundary: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('@/lib/observability/boot-client-observability', () => ({
  bootClientObservability: vi.fn(),
}))
vi.mock('@/lib/client/local-e2e-auth', () => ({
  isLocalE2EAuthBypassEnabled: () => false,
}))

import { Route, requiresChatProviders } from '@/routes/__root'

const source = readFileSync(
  resolve(process.cwd(), 'src/routes/__root.tsx'),
  'utf8',
)

beforeEach(() => {
  runtime.pathname = '/t/new'
  runtime.isAuthenticated = true
  runtime.materialize.mockReset().mockResolvedValue(true)
  vi.stubEnv('VITE_CONVEX_URL', 'https://runtime-authority.convex.test')
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('operation chat provider boundary', () => {
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

  it('does not bypass chat providers in local E2E mode', () => {
    expect(source).toMatch(/const content = requiresChatProviders\(pathname\)[\s\S]*: isLocalE2EAuthBypassEnabled\(\)/u)
  })

  it('constructs Convex lazily and renders an accessible missing-config state', () => {
    expect(source).toContain("const convexUrl = import.meta.env.VITE_CONVEX_URL?.trim()")
    expect(source).toContain('useState(() => new ConvexReactClient(convexUrl))')
    expect(source).toContain('role="status"')
    expect(source).toContain('Chat is unavailable')
    expect(source).toContain('The chat service is not configured.')
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
