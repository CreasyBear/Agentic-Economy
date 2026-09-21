/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const headerRoutes = [
  { to: '/market', label: 'Market', search: {}, order: 0, audience: 'always' as const },
  { to: '/for-agents', label: 'For agents', search: undefined, order: 1, audience: 'public' as const },
  { to: '/for-providers', label: 'For providers', search: undefined, order: 2, audience: 'public' as const },
  { to: '/activity', label: 'Calls', search: undefined, order: 2, audience: 'signed-in' as const },
  { to: '/agent-access', label: 'Agents', search: undefined, order: 1, audience: 'signed-in' as const },
  { to: '/owner/operations', label: 'My tools', search: undefined, order: 3, audience: 'signed-in' as const },
] as const

const clerkSignedIn = vi.hoisted(() => ({ value: false }))

vi.mock('@clerk/tanstack-react-start', () => ({
  useAuth: () => ({ isSignedIn: clerkSignedIn.value }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search,
    className,
    onClick,
    ...rest
  }: {
    children: ReactNode
    to: string
    search?: Record<string, string>
    className?: string
    onClick?: () => void
    'aria-current'?: 'page'
  }) => {
    const href = search === undefined || Object.keys(search).length === 0
      ? to
      : `${to}?${new URLSearchParams(search).toString()}`
    return <a href={href} className={className} onClick={onClick} {...rest}>{children}</a>
  },
  useRouter: () => ({
    routesByPath: Object.fromEntries(
      headerRoutes.map((route) => [
        route.to,
        {
          to: route.to,
          options: {
            staticData: {
              nav: {
                label: route.label,
                search: route.search,
                header: { order: route.order, audience: route.audience },
              },
            },
          },
        },
      ]),
    ),
  }),
  useMatchRoute: () => ({ to }: { to: string }) => (to === '/market' ? {} : false),
}))

import { AeSiteDrawerNav, AeSitePrimaryNav } from '@/components/ae/website'

afterEach(cleanup)

describe('Twenty-style public nav', () => {
  it('renders the public primary set with hairlines and an active catalogue mark', () => {
    clerkSignedIn.value = false
    render(<AeSitePrimaryNav />)

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Market' }).getAttribute('href')).toBe('/market')
    expect(within(nav).getByRole('link', { name: 'For agents' }).getAttribute('href')).toBe('/for-agents')
    expect(within(nav).getByRole('link', { name: 'For providers' }).getAttribute('href')).toBe('/for-providers')
    expect(within(nav).queryByRole('link', { name: 'Calls' })).toBeNull()
    expect(within(nav).getByRole('link', { name: 'Market' }).getAttribute('aria-current')).toBe('page')
    expect(within(nav).getByRole('link', { name: 'For agents' }).getAttribute('aria-current')).toBeNull()
    expect(nav.textContent).not.toMatch(/Product|Resources|Customers|Pricing/i)
  })

  it('renders signed-in primary destinations without public introduction links', () => {
    clerkSignedIn.value = true
    render(<AeSitePrimaryNav />)

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Market',
      'Agents',
      'Calls',
      'My tools',
    ])
    expect(within(nav).queryByRole('link', { name: 'For agents' })).toBeNull()
  })

  it('keeps compact drawer labels filtered by audience', () => {
    clerkSignedIn.value = false
    render(<AeSiteDrawerNav onNavigate={() => undefined} />)

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).queryByRole('link', { name: 'Calls' })).toBeNull()
    expect(within(nav).getAllByRole('link')).toHaveLength(3)
  })
})
