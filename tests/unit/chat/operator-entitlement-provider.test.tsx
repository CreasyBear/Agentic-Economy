// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { type ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  authenticated: true,
  query: vi.fn<(...args: unknown[]) => unknown>(() => undefined),
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  useAuth: () => ({ isSignedIn: runtime.authenticated, sessionId: 'session-1', sessionClaims: {} }),
}))
vi.mock('convex/react-clerk', () => ({
  ConvexProviderWithClerk: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('convex/react', () => ({
  ConvexReactClient: class ConvexReactClient {},
  useConvexAuth: () => ({ isAuthenticated: runtime.authenticated }),
  useQuery: (...args: unknown[]) => runtime.query(...args),
}))

import { SignedInConvexProvider } from '@/components/ae/layout/AeConvexProviders'
import { useOperatorEntitlement } from '@/components/ae/layout/app-shell/useOperatorEntitlement'

function EntitlementProbe() {
  const { canAccessAdmin } = useOperatorEntitlement()
  return <output data-testid="admin-entitlement">{String(canAccessAdmin)}</output>
}

beforeEach(() => {
  runtime.authenticated = true
  runtime.query.mockReset().mockReturnValue(undefined)
  vi.stubEnv('VITE_CONVEX_URL', 'https://runtime-authority.convex.test')
})

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

it('keeps the public shell usable when no Convex provider is configured', () => {
  vi.stubEnv('VITE_CONVEX_URL', '   ')
  render(<SignedInConvexProvider><EntitlementProbe /></SignedInConvexProvider>)
  expect(screen.getByTestId('admin-entitlement').textContent).toBe('false')
  expect(runtime.query).not.toHaveBeenCalled()
})

it('shows Admin only after authenticated operator membership resolves', () => {
  runtime.query.mockReturnValue({ kind: 'authorized', allowedSurfaces: ['admin'] })
  render(<SignedInConvexProvider><EntitlementProbe /></SignedInConvexProvider>)
  expect(screen.getByTestId('admin-entitlement').textContent).toBe('true')
  expect(runtime.query).toHaveBeenCalledWith(expect.anything(), {})
})

it('keeps Admin hidden without authenticated authority', () => {
  runtime.authenticated = false
  runtime.query.mockReturnValue({ kind: 'authorized', allowedSurfaces: ['admin'] })
  render(<SignedInConvexProvider><EntitlementProbe /></SignedInConvexProvider>)
  expect(screen.getByTestId('admin-entitlement').textContent).toBe('false')
  expect(runtime.query).toHaveBeenCalledWith(expect.anything(), 'skip')
})
