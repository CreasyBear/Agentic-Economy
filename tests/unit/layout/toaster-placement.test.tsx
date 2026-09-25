/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import '../../setup/jsdom-platform'

vi.mock('@tanstack/react-router', () => ({
  ClientOnly: ({ children }: { children: ReactNode }) => children,
  HeadContent: () => null,
  Outlet: () => null,
  Scripts: () => null,
  createRootRoute: (options: unknown) => ({ options }),
  useRouter: () => ({}),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: '/market' } }),
}))
vi.mock('@clerk/tanstack-react-start', () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('@/components/ae/layout/AeConvexProviders', () => ({
  ChatConvexProvider: ({ children }: { children: ReactNode }) => children,
  SignedInConvexProvider: ({ children }: { children: ReactNode }) => children,
  requiresChatProviders: () => false,
}))
vi.mock('@/components/ae/layout/AeAppShell', () => ({
  AeAppShell: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('@/components/ae/theme/ThemeProvider', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('@/components/ae/layout/AeRouteProgressBar', () => ({ RouteProgressBar: () => null }))
vi.mock('@/components/ae/feedback/AeObservabilityErrorBoundary', () => ({
  AeObservabilityErrorBoundary: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('@/lib/observability/boot-client-observability', () => ({ bootClientObservability: vi.fn() }))
vi.mock('sonner', () => ({
  Toaster: ({ position, offset }: { position: string; offset: string }) => (
    <div data-testid="sonner-toaster" data-position={position} data-offset={offset} />
  ),
}))

import { Route } from '@/routes/__root'

// The route mock retains the live root component in its options.
const rootRoute = Route as unknown as { options: { component: ComponentType } }
const Root = rootRoute.options.component
const originalInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth')

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
}

afterEach(() => {
  cleanup()
  if (originalInnerWidth) Object.defineProperty(window, 'innerWidth', originalInnerWidth)
  else Reflect.deleteProperty(window, 'innerWidth')
})

describe('root toaster placement', () => {
  it('places mobile toasts at the top right with a 72px offset', async () => {
    setViewportWidth(390)
    render(<Root />, { container: document })

    await waitFor(() => {
      const toaster = screen.getByTestId('sonner-toaster')
      expect(toaster.getAttribute('data-position')).toBe('top-right')
      expect(toaster.getAttribute('data-offset')).toBe('72px')
    })
  })

  it('places desktop toasts at the bottom right with a 16px offset', async () => {
    setViewportWidth(1024)
    render(<Root />, { container: document })

    await waitFor(() => {
      const toaster = screen.getByTestId('sonner-toaster')
      expect(toaster.getAttribute('data-position')).toBe('bottom-right')
      expect(toaster.getAttribute('data-offset')).toBe('16px')
    })
  })
})
