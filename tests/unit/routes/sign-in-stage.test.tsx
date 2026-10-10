/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react'
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
  // AePublicPage renders AePublicSiteFooter, which reads the route table via
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

    expect(screen.getByRole('heading', { name: 'Sign in to connect an Agent' })).toBeTruthy()
    expect(screen.getByText(/return to the Agent connection you started/)).toBeTruthy()
    expect(screen.queryByText('/sign-in')).toBeNull()
    expect(screen.getByRole('navigation', { name: 'Account help' })).toBeTruthy()
    expect(screen.getByText('clerk-sign-in')).toBeTruthy()
    expect(document.querySelector('[data-slot="ae-site-auth-clerk-well"]')).toBeTruthy()
  })

  it('passes accessible loading and help with decorative placeholders to SignIn', () => {
    const Component = routeState.SignIn
    if (Component === undefined || Component === null) throw new Error('Sign-in route was not captured.')
    render(<Component />)

    expect(routeState.signInProps?.fallback).toBeTruthy()
    const { container } = render(<>{routeState.signInProps?.fallback as ReactNode}</>)
    const fallback = container.querySelector('[data-slot="ae-site-auth-clerk-fallback"]')
    expect(fallback?.getAttribute('aria-hidden')).not.toBe('true')
    expect(fallback?.querySelector('[aria-hidden="true"]')).toBeTruthy()
    expect(within(container).getByRole('status').textContent).toContain('Loading the secure account form')
    expect(within(container).getByRole('link', { name: 'Get help' }).getAttribute('href')).toBe('/support')
    expect(within(container).getByRole('link', { name: 'System status' }).getAttribute('href')).toBe('/status')
    expect(container.querySelector('button, input')).toBeNull()
  })

  it('names the preserved destination and uses Market only when that is the return', () => {
    const Component = routeState.SignIn
    if (Component === undefined || Component === null) throw new Error('Sign-in route was not captured.')

    routeState.search = { redirect: '/owner/settings' }
    const settings = render(<Component />)
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(screen.queryByText(/return to your Provider Workspace/)).toBeNull()
    expect(screen.getByText(/continue on Settings/)).toBeTruthy()
    expect(screen.queryByText(/continue on Market/)).toBeNull()
    settings.unmount()

    routeState.search = { redirect: '/owner/credit?funding=cancelled' }
    const credit = render(<Component />)
    expect(screen.getByText(/continue on Credit/)).toBeTruthy()
    credit.unmount()

    routeState.search = { redirect: '/admin/exceptions' }
    const admin = render(<Component />)
    expect(screen.getByText(/continue on Exceptions/)).toBeTruthy()
    expect(screen.queryByText(/continue on Market/)).toBeNull()
    admin.unmount()

    routeState.search = { redirect: '/admin' }
    const overview = render(<Component />)
    expect(screen.getByText(/continue on Admin/)).toBeTruthy()
    overview.unmount()

    routeState.search = { redirect: undefined }
    render(<Component />)
    expect(screen.getByText(/continue on Market/)).toBeTruthy()
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

  it('exports visible sign-in loading and help without fabricated auth controls', () => {
    const { container } = render(<SignInClerkFallback />)
    const fallback = container.querySelector('[data-slot="ae-site-auth-clerk-fallback"]')
    expect(fallback?.getAttribute('aria-hidden')).not.toBe('true')
    expect(fallback?.querySelector('[aria-hidden="true"]')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Loading the secure account form')
    expect(screen.getByRole('link', { name: 'Get help' }).getAttribute('href')).toBe('/support')
    expect(screen.getByRole('link', { name: 'System status' }).getAttribute('href')).toBe('/status')
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
