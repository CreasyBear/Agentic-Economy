import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  ownerSettingsChrome,
  ownerSettingsCurrentForPath,
  ownerSettingsNavGroups,
  ownerSettingsNavItems,
  ownerSettingsNavRegistry,
  ownerSettingsPathForCurrent,
  settingsNavAppliesToRole,
  type OwnerSettingsNavRegistryEntry,
} from '@/lib/operator/settings-navigation'

function declaredRoutePaths(): ReadonlySet<string> {
  const genPath = fileURLToPath(new URL('../../src/routeTree.gen.ts', import.meta.url))
  const source = readFileSync(genPath, 'utf8')
  const LITERAL_DOT = '\u0000'
  const fileIds = [...source.matchAll(/from '\.\/routes\/([^']+)'/g)]
    .flatMap((match) => (match[1] === undefined ? [] : [match[1]]))
  const encodedIds = fileIds.map((fileId) => fileId.replaceAll('[.]', LITERAL_DOT))
  const paths = encodedIds.map((encoded) => {
    const parts = encoded.split(/[./]/)
      .filter((segment) => segment !== '' && segment !== '_operator' && !segment.startsWith('$'))
      .map((segment) => segment.replaceAll(LITERAL_DOT, '.'))
    return parts.join('/')
  })
  return new Set(paths.filter((path) => path !== '').map((path) => `/${path}`))
}

function duplicates(values: readonly string[]): string[] {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))]
}

function unmatchedHrefs(
  entries: readonly Pick<OwnerSettingsNavRegistryEntry, 'id' | 'href'>[],
  knownRoutes: ReadonlySet<string>,
): readonly { id: string; href: string }[] {
  return entries
    .filter((entry) => !knownRoutes.has(entry.href))
    .map(({ id, href }) => ({ id, href }))
}

describe('owner settings navigation registry', () => {
  it('registers one row per tab with unique ids, labels, and testids', () => {
    const entries = ownerSettingsNavRegistry
    expect(entries.length).toBe(ownerSettingsNavItems().length)
    expect(duplicates(entries.map((entry) => entry.id)), 'duplicate registry ids').toEqual([])
    expect(duplicates(entries.map((entry) => entry.label)), 'duplicate nav labels').toEqual([])
    expect(duplicates(entries.map((entry) => entry.testid)), 'duplicate nav testids').toEqual([])
    for (const entry of entries) {
      expect(entry.testid).toBe(`settings-tab-${entry.id}`)
    }
  })

  it('keeps display order stable across registry, groups, and flat projections', () => {
    const orders = ownerSettingsNavRegistry.map((entry) => entry.order)
    expect(orders, 'registry orders must be strictly increasing').toEqual([...orders].sort((a, b) => a - b))
    expect(new Set(orders).size).toBe(orders.length)
    expect(ownerSettingsNavGroups.map((group) => group.id)).toEqual(['user', 'workspace', 'developers'])
    expect(ownerSettingsNavGroups.flatMap((group) => group.label)).toEqual(['User', 'Workspace', 'Developers'])
    expect(ownerSettingsNavGroups.flatMap((group) => group.items.map((item) => item.id))).toEqual([
      'profile',
      'workspace',
      'members',
      'connections',
      'credit',
      'payouts',
      'developers',
    ])
    expect(ownerSettingsNavItems().length).toBe(ownerSettingsNavRegistry.length)
  })

  it('points every registry href at a declared route in routeTree.gen.ts', () => {
    const offenders = unmatchedHrefs(ownerSettingsNavRegistry, declaredRoutePaths())
    expect(offenders, `nav advertises undeclared routes: ${offenders.map(({ id, href }) => `${id} -> ${href}`).join(', ')}`).toEqual([])
  })

  it('names an offender when a registry href matches no declared route (fixture)', () => {
    const known = new Set(['/owner/settings'])
    const fixture = [
      { id: 'profile' as const, label: 'Profile', href: '/owner/settings', group: 'user' as const, order: 1, testid: 'settings-tab-profile' },
      { id: 'members' as const, label: 'Members', href: '/owner/settings/ghost', group: 'workspace' as const, order: 2, testid: 'settings-tab-members' },
    ]
    expect(unmatchedHrefs(fixture, known)).toEqual([{ id: 'members', href: '/owner/settings/ghost' }])
    expect(unmatchedHrefs(fixture.slice(0, 1), known)).toEqual([])
  })
})

describe('owner settings navigation', () => {
  it('points every settings destination at a real owner or public route', () => {
    const advertised = ownerSettingsNavItems().map((item) => item.to)
    const known = declaredRoutePaths()
    const missing = advertised.filter((href) => !known.has(href))
    expect(missing, `settings nav advertises routes that do not exist: ${missing.join(', ')}`).toEqual([])
  })

  it('does not turn settings into a CRM directory', () => {
    const labels = ownerSettingsNavItems().map((item) => item.label).join(' ')
    expect(labels).not.toMatch(/People|Companies|Opportunities|Pipeline|CRM/i)
    expect(settingsNavAppliesToRole('owner')).toBe(true)
    expect(settingsNavAppliesToRole('admin')).toBe(false)
    expect(ownerSettingsPathForCurrent('credit')).toBe('/owner/credit')
    expect(ownerSettingsPathForCurrent('profile')).toBe('/owner/settings')
    expect(ownerSettingsCurrentForPath('/owner/settings/workspace')).toBe('workspace')
    expect(ownerSettingsCurrentForPath('/owner/credit')).toBe('credit')
  })

  it('keeps one Settings title across every settings tab', () => {
    expect(ownerSettingsChrome.title).toBe('Settings')
    expect(ownerSettingsChrome.description).toBe('Account, workspace, callers, and connections.')
  })
})
