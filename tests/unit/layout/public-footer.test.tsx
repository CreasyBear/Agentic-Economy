/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AeSiteFooter } from '@/components/ae/website'
import { AECON_MARK_SRC } from '@/content/brand-assets'
import {
  isPublicPrimaryNavActive,
  publicFooterColumns,
  publicFooterCopyright,
  publicPrimaryNavItems,
} from '@/lib/public/website-nav'

describe('public website footer', () => {
  it('groups the market, the supplier door, legal, and machine files', () => {
    expect(publicFooterColumns.map((column) => column.title)).toEqual([
      'Market',
      'Suppliers',
      'Legal',
      'Machines',
    ])
    expect(publicFooterColumns.flatMap((column) => column.links.map((link) => link.label))).toEqual([
      'Ask',
      'Discover',
      'Connections',
      'Activity',
      'About',
      'List a tool',
      'Browse listed tools',
      'Privacy',
      'Terms',
      'Remove a listing',
      'llms.txt',
      'SKILL.md',
      '.well-known/ucp',
    ])
  })

  it('does not invent partners, customers, or unpublished destinations', () => {
    const serialized = JSON.stringify(publicFooterColumns)
    expect(serialized).not.toMatch(/logo wall|case study|customers|partners marketplace/i)
    expect(serialized).toContain('/about')
    expect(serialized).toContain('/for-providers')
    expect(serialized).toContain('/.well-known/ucp')
  })

  it('mounts those destinations inside a notched contentinfo card with a copyright line', () => {
    render(<AeSiteFooter />)
    const footer = screen.getByRole('contentinfo')
    expect(within(footer).getByRole('link', { name: 'About' }).getAttribute('href')).toBe('/about')
    expect(within(footer).getByRole('link', { name: 'Activity' }).getAttribute('href')).toBe('/activity')
    expect(within(footer).getByText(publicFooterCopyright(new Date().getFullYear()))).toBeTruthy()
    expect(within(footer).getByText('AECON')).toBeTruthy()
    expect(footer.querySelector(`img[src="${AECON_MARK_SRC}"]`)).toBeTruthy()
    expect(footer.querySelector('svg')).not.toBeNull()
  })
})

describe('public primary navigation', () => {
  it('keeps the compact Ask / Discover / Connections / Activity set', () => {
    expect(publicPrimaryNavItems.map((item) => item.label)).toEqual([
      'Ask',
      'Discover',
      'Connections',
      'Activity',
    ])
    expect(publicPrimaryNavItems.map((item) => item.to)).toEqual([
      '/t/new',
      '/market',
      '/for-agents',
      '/activity',
    ])
  })

  it('marks live catalogue and thread paths without lighting every link', () => {
    expect(isPublicPrimaryNavActive('/market', publicPrimaryNavItems[1]!)).toBe(true)
    expect(isPublicPrimaryNavActive('/t/abc', publicPrimaryNavItems[0]!)).toBe(true)
    expect(isPublicPrimaryNavActive('/about', publicPrimaryNavItems[0]!)).toBe(false)
    expect(isPublicPrimaryNavActive('/about', publicPrimaryNavItems[3]!)).toBe(false)
  })
})
