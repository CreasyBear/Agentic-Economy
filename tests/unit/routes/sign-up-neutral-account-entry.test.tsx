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

import '@/routes/sign-up.$'

afterEach(() => {
  cleanup()
  routeState.clerkProps = null
  routeState.search = {}
})

describe('sign-up account entry', () => {
  it('S1: returns an unqualified sign-up to workspace onboarding', () => {
    const Component = routeState.SignUp
    if (Component === null) throw new Error('Sign-up route was not captured.')

    render(<Component />)

    expect(screen.getByRole('heading', { name: 'Create an account' })).toBeTruthy()
    expect(screen.getByText('After you create your account, you’ll set up your workspace.')).toBeTruthy()
    expect(document.body.textContent?.toLowerCase()).not.toContain('supplier')
    expect(document.body.textContent).not.toContain('manage Operations')
    expect(document.body.textContent?.toLowerCase()).toContain('workspace')
    expect(routeState.clerkProps).toMatchObject({
      fallbackRedirectUrl: '/onboarding',
      forceRedirectUrl: '/onboarding',
      signInFallbackRedirectUrl: '/owner/settings',
      signInUrl: '/sign-in',
    })
  })

  it('S2: preserves supplier copy while continuing through onboarding with redirect', () => {
    routeState.search = { redirect: '/owner/supply' }
    const Component = routeState.SignUp
    if (Component === null) throw new Error('Sign-up route was not captured.')

    render(<Component />)

    expect(screen.getByRole('heading', { name: 'Create a Provider account' })).toBeTruthy()
    expect(screen.getByText('After you create your account, you’ll continue to the Tool publishing workspace.')).toBeTruthy()
    expect(routeState.clerkProps).toMatchObject({
      fallbackRedirectUrl: '/onboarding?redirect=%2Fowner%2Fsupply',
      forceRedirectUrl: '/onboarding?redirect=%2Fowner%2Fsupply',
      signInFallbackRedirectUrl: '/owner/supply',
      signInUrl: '/sign-in',
    })
  })

  it('S3: preserves agent-connect copy while continuing through onboarding with redirect', () => {
    routeState.search = { redirect: '/agent-access' }
    const Component = routeState.SignUp
    if (Component === null) throw new Error('Sign-up route was not captured.')

    render(<Component />)

    expect(screen.getByRole('heading', { name: 'Create an account to connect an agent' })).toBeTruthy()
    expect(screen.getByText('After you create your account, you’ll return to the agent connection you started.')).toBeTruthy()
    expect(routeState.clerkProps).toMatchObject({
      fallbackRedirectUrl: '/onboarding?redirect=%2Fagent-access',
      forceRedirectUrl: '/onboarding?redirect=%2Fagent-access',
      signInFallbackRedirectUrl: '/agent-access',
      signInUrl: '/sign-in',
    })
  })
})
