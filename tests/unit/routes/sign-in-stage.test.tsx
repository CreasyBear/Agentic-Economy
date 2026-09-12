/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const routeState = vi.hoisted(() => ({
  SignIn: null as ComponentType | null,
  search: { redirect: '/agent-access' as string | undefined },
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
  SignIn: () => <div>clerk-sign-in</div>,
}))

import '@/routes/sign-in.$'

afterEach(cleanup)

describe('sign-in site stage', () => {
  it('renders the real Clerk sign-in card inside site chrome', () => {
    const Component = routeState.SignIn
    if (Component === undefined || Component === null) throw new Error('Sign-in route was not captured.')
    render(<Component />)

    expect(screen.getByRole('heading', { name: 'Sign in to connect an agent' })).toBeTruthy()
    expect(screen.getByText(/return to the agent connection you started/)).toBeTruthy()
    expect(document.querySelector('[data-slot="ae-site-browser"]')?.textContent).toContain('/sign-in')
    expect(screen.getByText('clerk-sign-in')).toBeTruthy()
  })
})
