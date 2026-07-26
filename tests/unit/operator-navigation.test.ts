import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  formatOperatorNavBadge,
  isOperatorPathActive,
  listOperatorCommandDestinations,
  navGroupsForRole,
  operatorUtilityItemsForRole,
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

/** Public destinations are not operator routes; they are validated separately. */
const publicDestinations = new Set(['/', '/registry', '/help'])

describe('operator navigation', () => {
  const routePaths = operatorRoutePaths()

  it.each(operatorRoles)('advertises only real routes to a %s', (role) => {
    const advertised = navGroupsForRole(role, { advanced: true })
      .flatMap((group) => group.items.map((item) => item.href))

    const missing = advertised.filter((href) => !routePaths.has(href))
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

  it('offers exactly the sidebar destinations plus public ones', () => {
    const sidebar = navGroupsForRole('owner')
      .flatMap((group) => group.items.map((item) => item.href))
    const command = listOperatorCommandDestinations('owner')
      .flatMap((group) => group.items.map((item) => item.href))

    expect(command.filter((href) => !publicDestinations.has(href))).toEqual(sidebar)
  })

  it('keeps the gated owner sidebar to the core working set', () => {
    const labels = navGroupsForRole('owner', { advanced: false })
      .flatMap((group) => group.items.map((item) => item.label))

    expect(labels).toEqual(['Business page', 'Offerings', 'Inquiries', 'Settings'])
  })

  it('marks nested paths active for their nav root', () => {
    expect(isOperatorPathActive('/owner/offerings/off_1', '/owner/offerings')).toBe(true)
    expect(isOperatorPathActive('/owner/offerings', '/owner/offerings')).toBe(true)
    expect(isOperatorPathActive('/owner/offeringsx', '/owner/offerings')).toBe(false)
  })

  it('exposes public utility links for operator sidebar footers', () => {
    expect(operatorUtilityItemsForRole('owner').map((item) => item.href))
      .toEqual(['/', '/registry', '/help'])
  })

  it('formats operator nav badges without showing empty counts', () => {
    expect(formatOperatorNavBadge(undefined)).toBeUndefined()
    expect(formatOperatorNavBadge(0)).toBeUndefined()
    expect(formatOperatorNavBadge(7)).toBe('7')
    expect(formatOperatorNavBadge(142)).toBe('99+')
    expect(formatOperatorNavBadge('needs review')).toBe('needs review')
  })
})
