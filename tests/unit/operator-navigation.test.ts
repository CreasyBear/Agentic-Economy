import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  formatOperatorNavBadge,
  isOperatorPathActive,
  navGroupsForContext,
  navGroupsForRole,
  ownerWorkspaceOwnerForPath,
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
    expect(routePaths.has(roleHomeHref[role]) || publicDestinations.has(roleHomeHref[role])).toBe(true)
  })

  it('keeps the gated owner sidebar to the core working set', () => {
    const labels = navGroupsForRole('owner', { advanced: false })
      .flatMap((group) => group.items.map((item) => item.label))

    expect(labels).toEqual([
      'Calls',
      'Agents',
      'Credit',
      'Tools',
      'Account & security',
    ])
  })

  it('assigns every compatibility entrance to one explicit workspace owner', () => {
    expect(ownerWorkspaceOwnerForPath('/owner/offerings')).toBe('operations')
    expect(ownerWorkspaceOwnerForPath('/owner/offerings/new')).toBe('operations')
    expect(ownerWorkspaceOwnerForPath('/owner/supply')).toBe('operations')
    expect(ownerWorkspaceOwnerForPath('/owner/supply/offering:one')).toBe('operations')
    expect(ownerWorkspaceOwnerForPath('/owner/status')).toBe('operations')
    expect(ownerWorkspaceOwnerForPath('/owner/settings/workspace')).toBe('operations')
    expect(ownerWorkspaceOwnerForPath('/owner/settings/connections')).toBe('operations')
    expect(ownerWorkspaceOwnerForPath('/owner/settings/payouts')).toBe('operations')
    expect(ownerWorkspaceOwnerForPath('/owner/settings')).toBe('account')
    expect(ownerWorkspaceOwnerForPath('/owner/settings/developers')).toBe('agent-setup')
    expect(ownerWorkspaceOwnerForPath('/owner/settings/unknown')).toBeUndefined()
  })

  it('projects destinations only for surfaces authorized by operator context', () => {
    const ownerContext = {
      kind: 'authorized' as const,
      userId: 'user_owner',
      principalRef: 'prn_owner',
      accountRef: 'acc_owner',
      allowedSurfaces: ['owner', 'developer'] as const,
    }

    expect(navGroupsForContext(ownerContext, 'owner').flatMap((group) => group.items).length).toBeGreaterThan(0)
    expect(navGroupsForContext(ownerContext, 'developer').flatMap((group) => group.items).length).toBeGreaterThan(0)
    expect(navGroupsForContext(ownerContext, 'admin')).toEqual([])
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
    expect(resolveOperatorNavItem('owner', '/owner/offerings')?.label).toBe('Tools')
    expect(resolveOperatorNavItem('owner', '/owner/settings/connections')?.label).toBe('Tools')
    expect(resolveOperatorNavItem('owner', '/owner/settings')?.label).toBe('Account & security')
    expect(resolveOperatorNavItem('owner', '/owner/settings/unknown')).toBeUndefined()
    expect(resolveOperatorNavItem('owner', '/activity')?.label).toBe('Calls')
    expect(resolveOperatorNavItem('admin', '/admin/audit-events')?.label).toBe('Audit')
  })

  it('exposes public utility links for operator sidebar footers', () => {
    expect(operatorUtilityItemsForRole('owner').map((item) => [item.label, item.href]))
      .toEqual([
        ['Catalog', '/market'],
        ['Agent setup', '/for-agents'],
        ['Help', '/support'],
      ])
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
