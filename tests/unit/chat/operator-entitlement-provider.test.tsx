// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { type ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

const readOperatorContext = vi.hoisted(() => vi.fn(() => {
  throw new Error('operator subscription failed')
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  useAuth: () => ({ isSignedIn: true, sessionId: 'session-1', sessionClaims: {} }),
}))
vi.mock('convex/react-clerk', () => ({
  ConvexProviderWithClerk: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('convex/react', () => ({
  ConvexReactClient: class ConvexReactClient {},
  useQuery: readOperatorContext,
}))

import { SignedInConvexProvider } from '@/components/ae/layout/AeConvexProviders'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  readOperatorContext.mockClear()
})

it('renders a public page without subscribing to operator authority at the root', () => {
  vi.stubEnv('VITE_CONVEX_URL', 'https://runtime-authority.convex.test')
  render(<SignedInConvexProvider><main>Public market page</main></SignedInConvexProvider>)
  expect(screen.getByRole('main').textContent).toBe('Public market page')
  expect(readOperatorContext).not.toHaveBeenCalled()
})
