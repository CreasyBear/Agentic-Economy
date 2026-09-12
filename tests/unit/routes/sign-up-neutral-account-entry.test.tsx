/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const routeState = vi.hoisted(() => ({
  SignUp: null as ComponentType | null,
  clerkProps: null as Record<string, unknown> | null,
  search: {} as { redirect?: string },
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: { component: ComponentType }) => {
    routeState.SignUp = options.component
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
  SignUp: (props: Record<string, unknown>) => {
    routeState.clerkProps = props
    return <div>Clerk sign-up</div>
  },
}))

vi.mock('@/lib/client/local-e2e-auth', () => ({
  isLocalE2EAuthBypassEnabled: () => false,
}))

import '@/routes/sign-up.$'

afterEach(() => {
  cleanup()
  routeState.clerkProps = null
  routeState.search = {}
})

describe('sign-up account entry', () => {
  it('returns an unqualified sign-up to neutral account settings', () => {
    const Component = routeState.SignUp
    if (Component === null) throw new Error('Sign-up route was not captured.')

    render(<Component />)

    expect(screen.getByRole('heading', { name: 'Create an account' })).toBeTruthy()
    expect(screen.getByText('After you create your account, you’ll return to your account settings.')).toBeTruthy()
    expect(document.body.textContent?.toLowerCase()).not.toContain('supplier')
    expect(document.body.textContent).not.toContain('manage Operations')
    expect(routeState.clerkProps).toMatchObject({
      fallbackRedirectUrl: '/owner/settings',
      signInUrl: '/sign-in',
    })
  })

  it('preserves the explicit supplier copy and return target', () => {
    routeState.search = { redirect: '/owner/supply' }
    const Component = routeState.SignUp
    if (Component === null) throw new Error('Sign-up route was not captured.')

    render(<Component />)

    expect(screen.getByRole('heading', { name: 'Create a Provider account' })).toBeTruthy()
    expect(screen.getByText('After you create your account, you’ll continue to the Tool publishing workspace.')).toBeTruthy()
    expect(routeState.clerkProps).toMatchObject({
      fallbackRedirectUrl: '/owner/supply',
      signInUrl: '/sign-in',
    })
  })

  it('preserves the explicit agent-connect copy and return target', () => {
    routeState.search = { redirect: '/agent-access' }
    const Component = routeState.SignUp
    if (Component === null) throw new Error('Sign-up route was not captured.')

    render(<Component />)

    expect(screen.getByRole('heading', { name: 'Create an account to connect an agent' })).toBeTruthy()
    expect(screen.getByText('After you create your account, you’ll return to the agent connection you started.')).toBeTruthy()
    expect(routeState.clerkProps).toMatchObject({
      fallbackRedirectUrl: '/agent-access',
      signInUrl: '/sign-in',
    })
  })
})
