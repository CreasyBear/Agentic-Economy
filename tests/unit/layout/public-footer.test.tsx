/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AeSiteFooter } from '@/components/ae/website'
import { publicFooterColumns } from '@/lib/public/website-nav'

describe('public website footer', () => {
  it('groups real destinations instead of a flat link row', () => {
    expect(publicFooterColumns.map((column) => column.title)).toEqual([
      'Product',
      'Suppliers',
      'Company',
      'Legal',
      'Machines',
    ])
    expect(publicFooterColumns.flatMap((column) => column.links.map((link) => link.label))).toEqual([
      'Ask',
      'Discover',
      'Connections',
      'Activity',
      'List a capability',
      'Browse listed tools',
      'About',
      'Privacy',
      'Terms',
      'Remove a listing',
      'llms.txt',
      'SKILL.md',
    ])
  })

  it('does not invent partners, customers, or unpublished destinations', () => {
    const serialized = JSON.stringify(publicFooterColumns)
    expect(serialized).not.toMatch(/logo wall|case study|customers|partners marketplace/i)
    expect(serialized).toContain('/about')
    expect(serialized).toContain('/for-providers')
  })

  it('mounts those destinations inside a notched contentinfo card', () => {
    render(<AeSiteFooter />)
    const footer = screen.getByRole('contentinfo')
    expect(within(footer).getByRole('link', { name: 'About' }).getAttribute('href')).toBe('/about')
    expect(within(footer).getByRole('link', { name: 'Activity' }).getAttribute('href')).toBe('/activity')
    expect(footer.querySelector('svg')).not.toBeNull()
  })
})
