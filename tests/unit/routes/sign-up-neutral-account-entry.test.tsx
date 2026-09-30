/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'

import { SignUpClerkFallback } from '@/routes/sign-up.$'
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
  it('S1: returns an unqualified sign-up to the market', () => {
    const Component = routeState.SignUp
    if (Component === null) throw new Error('Sign-up route was not captured.')

    render(<Component />)

    expect(screen.getByRole('heading', { name: 'Create an account' })).toBeTruthy()
    expect(screen.getByText(/you’ll set up your Workspace/)).toBeTruthy()
    expect(document.body.textContent?.toLowerCase()).not.toContain('supplier')
    expect(document.body.textContent).not.toContain('manage Operations')
    expect(document.body.textContent).toContain('Workspace')
    expect(routeState.clerkProps).toMatchObject({
      fallbackRedirectUrl: '/market',
      forceRedirectUrl: '/market',
      signInFallbackRedirectUrl: '/owner/settings',
      signInUrl: '/sign-in',
    })
    expect(routeState.clerkProps?.fallback).toBeTruthy()
    const { container } = render(<>{routeState.clerkProps?.fallback as ReactNode}</>)
    expect(container.querySelector('[data-slot="ae-site-auth-clerk-fallback"]')).toBeTruthy()
    expect(container.querySelectorAll('.min-h-touch').length).toBeGreaterThanOrEqual(4)
  })

  it('S2: preserves supplier copy and returns to the requested destination', () => {
    routeState.search = { redirect: '/owner/supply' }
    const Component = routeState.SignUp
    if (Component === null) throw new Error('Sign-up route was not captured.')

    render(<Component />)

    expect(screen.getByRole('heading', { name: 'Create an account' })).toBeTruthy()
    expect(screen.getByText(/Tool publishing Workspace/)).toBeTruthy()
    expect(routeState.clerkProps).toMatchObject({
      fallbackRedirectUrl: '/owner/supply',
      forceRedirectUrl: '/owner/supply',
      signInFallbackRedirectUrl: '/owner/supply',
      signInUrl: '/sign-in',
    })
  })

  it('S3: preserves agent-connect copy and returns to the requested destination', () => {
    routeState.search = { redirect: '/agent-access' }
    const Component = routeState.SignUp
    if (Component === null) throw new Error('Sign-up route was not captured.')

    render(<Component />)

    expect(screen.getByRole('heading', { name: 'Create an account' })).toBeTruthy()
    expect(screen.getByText(/Agent connection you started/)).toBeTruthy()
    expect(routeState.clerkProps).toMatchObject({
      fallbackRedirectUrl: '/agent-access',
      forceRedirectUrl: '/agent-access',
      signInFallbackRedirectUrl: '/agent-access',
      signInUrl: '/sign-in',
    })
  })

  it('S4: exports a sign-up fallback skeleton with reserved height', () => {
    const { container } = render(<SignUpClerkFallback />)
    const fallback = container.querySelector('[data-slot="ae-site-auth-clerk-fallback"]')
    expect(fallback?.className).toContain('min-h-96')
    expect(fallback?.className).toContain('gap-related')
  })
})
