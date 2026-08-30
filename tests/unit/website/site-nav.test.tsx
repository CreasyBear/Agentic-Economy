/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

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
    const href = search === undefined ? to : `${to}?${new URLSearchParams(search).toString()}`
    return <a href={href} className={className} onClick={onClick} {...rest}>{children}</a>
  },
  useLocation: () => ({ pathname: '/market' }),
}))

import { AeSiteDrawerNav, AeSitePrimaryNav } from '@/components/ae/website'

describe('Twenty-style public nav', () => {
  it('renders the primary set with hairlines and an active catalogue mark', () => {
    render(<AeSitePrimaryNav />)

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Ask' }).getAttribute('href')).toBe('/t/new')
    expect(within(nav).getByRole('link', { name: 'Discover' }).getAttribute('href')).toBe('/market?window=30d')
    expect(within(nav).getByRole('link', { name: 'Connections' }).getAttribute('href')).toBe('/for-agents')
    expect(within(nav).getByRole('link', { name: 'Activity' }).getAttribute('href')).toBe('/activity')
    expect(within(nav).getByRole('link', { name: 'Discover' }).getAttribute('aria-current')).toBe('page')
    expect(within(nav).getByRole('link', { name: 'Ask' }).getAttribute('aria-current')).toBeNull()
    expect(nav.textContent).not.toMatch(/Product|Resources|Customers|Pricing/i)
  })

  it('keeps compact drawer labels and Public navigation name', () => {
    render(<AeSiteDrawerNav onNavigate={() => undefined} />)

    const nav = screen.getByRole('navigation', { name: 'Public navigation' })
    expect(within(nav).getByRole('link', { name: 'Activity' })).toBeTruthy()
    expect(within(nav).getAllByRole('link')).toHaveLength(4)
  })
})
