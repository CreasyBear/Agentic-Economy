/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeSiteAuthPanel } from '@/components/ae/website/AeSiteAuthPanel'
import { SignInClerkFallback } from '@/routes/sign-in.$'

const routeState = vi.hoisted(() => ({
  SignIn: null as ComponentType | null,
  search: { redirect: '/agent-access' as string | undefined },
  signInProps: null as Record<string, unknown> | null,
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: { component: ComponentType }) => {
    routeState.SignIn = options.component
    return {
      ...options,
      options,
      useSearch: () => (routeState.search.redirect === undefined ? {} : { redirect: routeState.search.redirect }),
    }
  },
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
  // AePublicPage renders AeSiteFooter, which reads the route table via
  // useRouter(); an empty table is enough to render its (empty) columns.
  useRouter: () => ({ routesByPath: {} }),
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
  SignIn: (props: Record<string, unknown>) => {
    routeState.signInProps = props
    return <div>clerk-sign-in</div>
  },
}))

import '@/routes/sign-in.$'

afterEach(cleanup)

function mockDesktopMatchMedia(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: matches && query.includes('768'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe('sign-in site stage', () => {
  it('renders the real Clerk sign-in card inside site chrome', () => {
    const Component = routeState.SignIn
    if (Component === undefined || Component === null) throw new Error('Sign-in route was not captured.')
    render(<Component />)

    expect(screen.getByRole('heading', { name: 'Sign in to connect an agent' })).toBeTruthy()
    expect(screen.getByText(/Use email, Google, GitHub, or a passkey/)).toBeTruthy()
    expect(screen.getByText(/return to the agent connection you started/)).toBeTruthy()
    expect(document.querySelector('[data-slot="ae-site-browser"]')?.textContent).toContain('/sign-in')
    expect(screen.getByText('clerk-sign-in')).toBeTruthy()
    expect(document.querySelector('[data-slot="ae-site-auth-clerk-well"]')).toBeTruthy()
  })

  it('passes a zero-CLS Clerk fallback skeleton to SignIn', () => {
    const Component = routeState.SignIn
    if (Component === undefined || Component === null) throw new Error('Sign-in route was not captured.')
    render(<Component />)

    expect(routeState.signInProps?.fallback).toBeTruthy()
    const { container } = render(<>{routeState.signInProps?.fallback as ReactNode}</>)
    expect(container.querySelector('[data-slot="ae-site-auth-clerk-fallback"]')).toBeTruthy()
    expect(container.querySelectorAll('.min-h-touch').length).toBeGreaterThanOrEqual(4)
  })

  it('names supported auth methods for provider and default redirects', () => {
    routeState.search = { redirect: '/owner/settings' }
    const ProviderComponent = routeState.SignIn
    if (ProviderComponent === undefined || ProviderComponent === null) throw new Error('Sign-in route was not captured.')
    const { unmount } = render(<ProviderComponent />)
    expect(screen.getByText(/Use email, Google, GitHub, or a passkey/)).toBeTruthy()
    expect(screen.getByText(/return to your Provider workspace/)).toBeTruthy()
    unmount()

    routeState.search = { redirect: undefined }
    render(<ProviderComponent />)
    expect(screen.getByText(/return to where you left off/)).toBeTruthy()
  })

  it('autofocuses the first auth input on desktop when focus is still on body', async () => {
    mockDesktopMatchMedia(true)
    document.body.focus()

    render(
      <AeSiteAuthPanel
        eyebrow="Account"
        title="Sign in"
        titleId="sign-in-context-heading"
        body="Use email, Google, GitHub, or a passkey."
      >
        <label htmlFor="identifier">
          Email
          <input id="identifier" name="identifier" type="email" />
        </label>
      </AeSiteAuthPanel>,
    )

    const input = screen.getByLabelText('Email')
    expect(document.activeElement).toBe(input)
  })

  it('does not autofocus auth inputs on coarse mobile viewports', () => {
    mockDesktopMatchMedia(false)
    document.body.focus()

    render(
      <AeSiteAuthPanel
        eyebrow="Account"
        title="Sign in"
        titleId="sign-in-context-heading"
        body="Use email, Google, GitHub, or a passkey."
      >
        <label htmlFor="identifier-mobile">
          Email
          <input id="identifier-mobile" name="identifier" type="email" />
        </label>
      </AeSiteAuthPanel>,
    )

    expect(document.activeElement).toBe(document.body)
  })

  it('exports a sign-in fallback skeleton with reserved height', () => {
    const { container } = render(<SignInClerkFallback />)
    const fallback = container.querySelector('[data-slot="ae-site-auth-clerk-fallback"]')
    expect(fallback?.className).toContain('min-h-96')
    expect(fallback?.className).toContain('gap-related')
  })
})
