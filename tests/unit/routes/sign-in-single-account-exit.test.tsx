/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const routeState = vi.hoisted(() => ({
  SignIn: null as ComponentType | null,
  clerkProps: null as Record<string, unknown> | null,
  search: {} as { redirect?: string },
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: { component: ComponentType }) => {
    routeState.SignIn = options.component
    return {
      ...options,
      options,
      useSearch: () => routeState.search,
    }
  },
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  // AePublicPage renders AeSiteFooter, which reads the route table via
  // useRouter(); an empty table is enough to render its (empty) columns.
  useRouter: () => ({ routesByPath: {} }),
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
  SignIn: (props: Record<string, unknown>) => {
    routeState.clerkProps = props
    return (
      <div>
        Don’t have an account? <a href={String(props.signUpUrl)}>Sign up</a>
      </div>
    )
  },
}))

import '@/routes/sign-in.$'

afterEach(() => {
  cleanup()
  routeState.clerkProps = null
  routeState.search = {}
})

describe('sign-in account exit', () => {
  it('returns an unqualified sign-in to wherever the visitor left off', () => {
    const Component = routeState.SignIn
    if (Component === null) throw new Error('Sign-in route was not captured.')

    render(<Component />)

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(screen.getByText(/Use email, Google, GitHub, or a passkey/)).toBeTruthy()
    expect(screen.getByText(/return to where you left off/)).toBeTruthy()
    expect(document.body.textContent?.toLowerCase()).not.toContain('supplier')
    expect(document.body.textContent).not.toContain('manage Operations')
    expect(routeState.clerkProps).toMatchObject({
      fallbackRedirectUrl: '/market',
      signUpFallbackRedirectUrl: '/market',
      signUpUrl: '/sign-up',
    })
  })

  it('leaves account creation to Clerk and preserves the explicit supplier return target', () => {
    routeState.search = { redirect: '/owner/supply' }
    const Component = routeState.SignIn
    if (Component === null) throw new Error('Sign-in route was not captured.')

    render(<Component />)

    expect(screen.getByRole('heading', { name: 'Sign in to manage Tools' })).toBeTruthy()
    expect(screen.getByText(/return to your Provider Workspace/)).toBeTruthy()
    expect(screen.getAllByText(/Don’t have an account/)).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Sign up' }).getAttribute('href')).toBe('/sign-up')
    expect(screen.queryByRole('link', { name: 'Create one' })).toBeNull()
    expect(routeState.clerkProps).toMatchObject({
      fallbackRedirectUrl: '/owner/supply',
      signUpFallbackRedirectUrl: '/owner/supply',
      signUpUrl: '/sign-up',
    })
  })

  it('preserves the explicit agent-connect copy and return target', () => {
    routeState.search = { redirect: '/agent-access' }
    const Component = routeState.SignIn
    if (Component === null) throw new Error('Sign-in route was not captured.')

    render(<Component />)

    expect(screen.getByRole('heading', { name: 'Sign in to connect an Agent' })).toBeTruthy()
    expect(screen.getByText(/return to the Agent connection you started/)).toBeTruthy()
    expect(routeState.clerkProps).toMatchObject({
      fallbackRedirectUrl: '/agent-access',
      signUpFallbackRedirectUrl: '/agent-access',
      signUpUrl: '/sign-up',
    })
  })
})
