/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

const headerRoutes = [
  { to: '/market', label: 'Market', search: {}, order: 0 },
  { to: '/for-agents', label: 'For agents', search: undefined, order: 1 },
  { to: '/for-providers', label: 'For providers', search: undefined, order: 2 },
  { to: '/activity', label: 'Calls', search: undefined, order: 3 },
] as const

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
  // AeSiteNav derives its items from the route table's `staticData.nav`.
  useRouter: () => ({
    routesByPath: Object.fromEntries(
      headerRoutes.map((route) => [
        route.to,
        { to: route.to, options: { staticData: { nav: { label: route.label, search: route.search, header: { order: route.order } } } } },
      ]),
    ),
  }),
  useMatchRoute: () => ({ to }: { to: string }) => (to === '/market' ? {} : false),
}))

import { AeSiteDrawerNav, AeSitePrimaryNav } from '@/components/ae/website'

describe('Twenty-style public nav', () => {
  it('renders the primary set with hairlines and an active catalogue mark', () => {
    render(<AeSitePrimaryNav />)

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Market' }).getAttribute('href')).toBe('/market')
    expect(within(nav).getByRole('link', { name: 'For agents' }).getAttribute('href')).toBe('/for-agents')
    expect(within(nav).getByRole('link', { name: 'For providers' }).getAttribute('href')).toBe('/for-providers')
    expect(within(nav).getByRole('link', { name: 'Calls' }).getAttribute('href')).toBe('/activity')
    expect(within(nav).getByRole('link', { name: 'Market' }).getAttribute('aria-current')).toBe('page')
    expect(within(nav).getByRole('link', { name: 'For agents' }).getAttribute('aria-current')).toBeNull()
    expect(nav.textContent).not.toMatch(/Product|Resources|Customers|Pricing/i)
  })

  it('keeps compact drawer labels and Public navigation name', () => {
    render(<AeSiteDrawerNav onNavigate={() => undefined} />)

    const nav = screen.getByRole('navigation', { name: 'Public navigation' })
    expect(within(nav).getByRole('link', { name: 'Calls' })).toBeTruthy()
    expect(within(nav).getAllByRole('link')).toHaveLength(4)
  })
})
