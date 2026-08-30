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
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  SignIn: () => <div>clerk-sign-in</div>,
}))

vi.mock('@/lib/client/local-e2e-auth', () => ({
  isLocalE2EAuthBypassEnabled: () => true,
}))

vi.mock('@/components/ae/layout/AePublicShell', () => ({
  AePublicShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))

import '@/routes/sign-in.$'

afterEach(cleanup)

describe('sign-in site stage', () => {
  it('keeps the local preview heading inside site chrome, not a Clerk card', () => {
    const Component = routeState.SignIn
    if (Component === undefined || Component === null) throw new Error('Sign-in route was not captured.')
    render(<Component />)

    expect(screen.getByRole('heading', { name: 'Local preview sign-in is off' })).toBeTruthy()
    expect(screen.getByText(/Nothing is signed in or authorized/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open agent access preview' })).toBeTruthy()
    expect(document.querySelector('[data-slot="ae-site-browser"]')?.textContent).toContain('/sign-in')
    expect(screen.queryByText('clerk-sign-in')).toBeNull()
  })
})
