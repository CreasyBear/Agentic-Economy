/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AeSiteFooter } from '@/components/ae/website'
import { AECON_MARK_SRC } from '@/content/brand-assets'
import {
  isPublicPrimaryNavActive,
  publicFooterColumns,
  publicFooterCopyright,
  publicPrimaryNavItems,
} from '@/lib/public/website-nav'

afterEach(cleanup)

describe('public website footer', () => {
  it('keeps support, legal, and machine destinations in truthful groups', () => {
    expect(publicFooterColumns.map((column) => column.title)).toEqual([
      'Market',
      'Help',
      'Legal',
      'Machines',
    ])
    expect(
      publicFooterColumns.map((column) => [
        column.title,
        column.links.map((link) => link.label),
      ]),
    ).toEqual([
      ['Market', ['Discover', 'For agents', 'For suppliers', 'Calls', 'About']],
      ['Help', ['Get help', 'System status']],
      ['Legal', ['Privacy', 'Terms', 'Remove a listing']],
      ['Machines', ['llms.txt', 'SKILL.md', '.well-known/ucp']],
    ])
  })

  it('does not invent partners, customers, or unpublished destinations', () => {
    const serialized = JSON.stringify(publicFooterColumns)
    expect(serialized).not.toMatch(/logo wall|case study|customers|partners marketplace/i)
    expect(serialized).toContain('/about')
    expect(serialized).toContain('/for-providers')
    expect(serialized).toContain('/.well-known/ucp')
    expect(serialized.match(/\/for-providers/g)).toHaveLength(1)
    expect(serialized.match(/\/market/g)).toHaveLength(1)
  })

  it('renders independently named footer groups and their destinations', () => {
    render(<AeSiteFooter />)
    const footer = screen.getByRole('contentinfo')
    const help = within(footer).getByRole('region', { name: 'Help' })
    const legal = within(footer).getByRole('region', { name: 'Legal' })
    const machines = within(footer).getByRole('region', { name: 'Machines' })

    expect(within(help).getByRole('link', { name: 'Get help' }).getAttribute('href')).toBe('/support')
    expect(within(help).getByRole('link', { name: 'System status' }).getAttribute('href')).toBe('/status')
    expect(within(help).queryByRole('link', { name: 'Privacy' })).toBeNull()
    expect(within(legal).getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe('/privacy')
    expect(within(legal).getByRole('link', { name: 'Terms' }).getAttribute('href')).toBe('/terms')
    expect(within(machines).getByRole('link', { name: 'SKILL.md' }).getAttribute('href')).toBe('/SKILL.md')
  })

  it('mounts the notched contentinfo card with its brand and copyright line', () => {
    render(<AeSiteFooter />)
    const footer = screen.getByRole('contentinfo')
    expect(within(footer).getByRole('link', { name: 'About' }).getAttribute('href')).toBe('/about')
    expect(within(footer).getByRole('link', { name: 'Calls' }).getAttribute('href')).toBe('/activity')
    expect(within(footer).getByText(publicFooterCopyright(new Date().getFullYear()))).toBeTruthy()
    expect(within(footer).getByText('AECON')).toBeTruthy()
    expect(footer.querySelector(`img[src="${AECON_MARK_SRC}"]`)).toBeTruthy()
    expect(footer.querySelector('svg')).not.toBeNull()
  })
})

describe('public primary navigation', () => {
  it('keeps the compact working public destinations', () => {
    expect(publicPrimaryNavItems.map((item) => item.label)).toEqual([
      'Discover',
      'For agents',
      'For suppliers',
      'Calls',
    ])
    expect(publicPrimaryNavItems.map((item) => item.to)).toEqual([
      '/market',
      '/for-agents',
      '/for-providers',
      '/activity',
    ])
  })

  it('marks live destinations without lighting every link', () => {
    expect(isPublicPrimaryNavActive('/market', publicPrimaryNavItems[0]!)).toBe(true)
    expect(isPublicPrimaryNavActive('/for-providers', publicPrimaryNavItems[2]!)).toBe(true)
    expect(isPublicPrimaryNavActive('/about', publicPrimaryNavItems[0]!)).toBe(false)
    expect(isPublicPrimaryNavActive('/about', publicPrimaryNavItems[3]!)).toBe(false)
  })
})
