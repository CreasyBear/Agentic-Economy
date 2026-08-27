import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  formatOperatorNavBadge,
  isOperatorPathActive,
  listOperatorCommandDestinations,
  navGroupsForRole,
  operatorUtilityItemsForRole,
  resolveOperatorNavItem,
  roleHomeHref,
  type OperatorRole,
} from '@/lib/operator/navigation'

const operatorRoles: readonly OperatorRole[] = ['owner', 'admin', 'developer']

/**
 * Every `_operator` leaf route as a URL path. `owner.status.tsx` is
 * `/owner/status`; parameter and index segments are dropped because a nav
 * destination can never be one.
 */
function operatorRoutePaths(): ReadonlySet<string> {
  const directory = fileURLToPath(new URL('../../src/routes/_operator', import.meta.url))
  const paths = readdirSync(directory)
    .filter((entry) => entry.endsWith('.tsx'))
    .map((entry) => entry.replace(/\.tsx$/, ''))
    .filter((entry) => !entry.split('.').some((segment) => segment.startsWith('$')))
    .map((entry) => `/${entry.split('.').join('/')}`)
  return new Set(paths)
}

/**
 * Public destinations are not operator routes, but they still have to exist.
 * Derived from the public route files rather than hand-listed: a hand-listed
 * allowlist is what let `/help` stay in the sidebar after the route was gone.
 */
function publicRoutePaths(): ReadonlySet<string> {
  const directory = fileURLToPath(new URL('../../src/routes', import.meta.url))
  const paths = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tsx'))
    .map((entry) => entry.name.replace(/\.tsx$/, ''))
    .filter((entry) => !entry.startsWith('_') && !entry.split('.').some((segment) => segment.startsWith('$')))
    .map((entry) => (entry === 'index' ? '/' : `/${entry.split('.').join('/')}`))
  return new Set(paths)
}

const publicDestinations = publicRoutePaths()

describe('operator navigation', () => {
  const routePaths = operatorRoutePaths()

  it.each(operatorRoles)('advertises only real routes to a %s', (role) => {
    const advertised = navGroupsForRole(role, { advanced: true })
      .flatMap((group) => group.items.map((item) => item.href))

    const missing = advertised.filter(
      (href) => !routePaths.has(href) && !publicDestinations.has(href),
    )
    expect(missing, `navigation advertises routes that do not exist: ${missing.join(', ')}`)
      .toEqual([])
  })

  it.each(operatorRoles)('sends a %s home to a real route', (role) => {
    expect(routePaths.has(roleHomeHref[role])).toBe(true)
  })

  it.each(operatorRoles)('offers a %s only destinations that exist', (role) => {
    const advertised = listOperatorCommandDestinations(role)
      .flatMap((group) => group.items.map((item) => item.href))

    const missing = advertised.filter(
      (href) => !routePaths.has(href) && !publicDestinations.has(href),
    )
    expect(missing, `command menu advertises routes that do not exist: ${missing.join(', ')}`)
      .toEqual([])
  })

  it('offers the sidebar destinations plus catalog and public utilities', () => {
    const sidebar = navGroupsForRole('owner')
      .flatMap((group) => group.items.map((item) => item.href))
    const utilities = operatorUtilityItemsForRole('owner').map((item) => item.href)
    const command = listOperatorCommandDestinations('owner')
      .flatMap((group) => group.items.map((item) => item.href))

    expect(command).toEqual([...sidebar, ...utilities])
  })

  it('keeps the gated owner sidebar to the core working set', () => {
    const labels = navGroupsForRole('owner', { advanced: false })
      .flatMap((group) => group.items.map((item) => item.label))

    expect(labels).toEqual([
      'Operations',
      'Calls',
      'Keys',
      'Credit',
      'Supplier',
      'Publish',
      'Settings',
    ])
  })

  /** Admin carries the most surfaces, so it is the role where an untiered item
   *  quietly turns the sidebar into a directory of readbacks. */
  it('keeps the gated admin sidebar to the core working set', () => {
    const labels = navGroupsForRole('admin', { advanced: false })
      .flatMap((group) => group.items.map((item) => item.label))

    expect(labels).toEqual(['Catalog health', 'Audit'])
  })

  it('marks nested paths active for their nav root', () => {
    expect(isOperatorPathActive('/owner/offerings/off_1', '/owner/offerings')).toBe(true)
    expect(isOperatorPathActive('/owner/offerings', '/owner/offerings')).toBe(true)
    expect(isOperatorPathActive('/owner/offeringsx', '/owner/offerings')).toBe(false)
  })

  it('resolves the owning sidebar item for operator page headers', () => {
    expect(resolveOperatorNavItem('owner', '/owner/offerings')?.label).toBe('Operations')
    expect(resolveOperatorNavItem('owner', '/owner/settings/members')?.label).toBe('Settings')
    expect(resolveOperatorNavItem('owner', '/activity')?.label).toBe('Calls')
    expect(resolveOperatorNavItem('admin', '/admin/audit-events')?.label).toBe('Audit')
  })

  it('exposes public utility links for operator sidebar footers', () => {
    expect(operatorUtilityItemsForRole('owner').map((item) => item.href))
      .toEqual(['/market', '/', '/for-agents', '/privacy/remove-business'])
  })

  it('keeps administration destinations exclusive to the admin role', () => {
    const adminDestinations = navGroupsForRole('admin', { advanced: true })
      .flatMap((group) => group.items.map((item) => item.href))
    const ownerDestinations = navGroupsForRole('owner', { advanced: true })
      .flatMap((group) => group.items.map((item) => item.href))
    const developerDestinations = navGroupsForRole('developer', { advanced: true })
      .flatMap((group) => group.items.map((item) => item.href))

    expect(adminDestinations).toEqual(expect.arrayContaining([
      '/admin/index-health',
      '/admin/audit-events',
    ]))
    expect(adminDestinations).not.toContain('/admin/runs')
    expect(ownerDestinations.some((href) => href.startsWith('/admin/'))).toBe(false)
    expect(developerDestinations.some((href) => href.startsWith('/admin/'))).toBe(false)
  })


  it('formats operator nav badges without showing empty counts', () => {
    expect(formatOperatorNavBadge(undefined)).toBeUndefined()
    expect(formatOperatorNavBadge(0)).toBeUndefined()
    expect(formatOperatorNavBadge(7)).toBe('7')
    expect(formatOperatorNavBadge(142)).toBe('99+')
    expect(formatOperatorNavBadge('needs review')).toBe('needs review')
  })
})
