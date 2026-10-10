/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const clerkSignedIn = vi.hoisted(() => ({ value: false }))
const routerLocation = vi.hoisted(() => ({ pathname: '/market', hash: '' }))

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
  useLocation: () => routerLocation,
}))

import { AeSiteDrawerNav, AeSitePrimaryNav } from '@/components/ae/website'

afterEach(cleanup)

describe('canonical public navigation', () => {
  it('renders the public primary set with hairlines and an active Tools mark', () => {
    clerkSignedIn.value = false
    routerLocation.pathname = '/market'
    routerLocation.hash = ''
    render(<AeSitePrimaryNav />)

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Tools' }).getAttribute('href')).toBe('/market')
    expect(within(nav).getByRole('link', { name: 'Docs' }).getAttribute('href')).toBe('/developers/api')
    expect(within(nav).getByRole('link', { name: 'For providers' }).getAttribute('href')).toBe('/for-providers')
    expect(within(nav).queryByRole('link', { name: 'Calls' })).toBeNull()
    expect(within(nav).getByRole('link', { name: 'Tools' }).getAttribute('aria-current')).toBe('page')
    expect(within(nav).getByRole('link', { name: 'Docs' }).getAttribute('aria-current')).toBeNull()
    expect(nav.textContent).not.toMatch(/Product|Resources|Customers|Pricing/i)
  })

  it('renders no destination row when signed in', () => {
    clerkSignedIn.value = true
    render(<AeSitePrimaryNav />)

    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull()
  })

  it('keeps compact drawer labels filtered by audience', () => {
    clerkSignedIn.value = false
    routerLocation.pathname = '/for-providers'
    routerLocation.hash = ''
    render(<AeSiteDrawerNav onNavigate={() => undefined} />)

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).queryByRole('link', { name: 'Calls' })).toBeNull()
    expect(within(nav).getAllByRole('link')).toHaveLength(3)
    expect(within(nav).getByRole('link', { name: 'For providers' }).getAttribute('aria-current')).toBe('page')
  })

  it('renders no drawer destination row when signed in', () => {
    clerkSignedIn.value = true
    render(<AeSiteDrawerNav onNavigate={() => undefined} />)

    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull()
  })

  it('marks Tools current for Tool detail routes owned by Market', () => {
    clerkSignedIn.value = false
    routerLocation.pathname = '/tools/example'
    routerLocation.hash = ''
    render(<AeSitePrimaryNav />)

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Tools' }).getAttribute('aria-current')).toBe('page')
    expect(within(nav).getByRole('link', { name: 'Docs' }).getAttribute('aria-current')).toBeNull()
  })
})
