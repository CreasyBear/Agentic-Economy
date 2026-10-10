import { describe, expect, it } from 'vitest'

import {
  APP_NAVIGATION,
  PUBLIC_NAVIGATION,
  appDestination,
  mobileNavigation,
  resolveAppDestination,
} from '@/lib/navigation/app-navigation'

describe('app navigation', () => {
  it('keeps one ordered destination contract with unique labels and hrefs', () => {
    expect(APP_NAVIGATION.map(({ id }) => id)).toEqual([
      'market',
      'chat',
      'agents',
      'calls',
      'credit',
      'tools',
      'earnings',
      'settings',
      'support',
      'status',
    ])

    expect(new Set(APP_NAVIGATION.map(({ label }) => label)).size).toBe(APP_NAVIGATION.length)
    expect(new Set(APP_NAVIGATION.map(({ to, hash }) => `${to}${hash ?? ''}`)).size).toBe(APP_NAVIGATION.length)
    expect(APP_NAVIGATION.every(({ label, title }) => title === `${label} | Agentic Economy`)).toBe(true)
    expect(appDestination('credit')).toMatchObject({ label: 'Credit', to: '/owner/credit' })
  })

  it('keeps the public destinations in their canonical order', () => {
    expect(PUBLIC_NAVIGATION).toEqual([
      { id: 'market', label: 'Tools', to: '/market' },
      { id: 'docs', label: 'Docs', to: '/developers/api' },
      { id: 'for-providers', label: 'For providers', to: '/for-providers' },
    ])
  })

  it.each([
    ['/market', undefined, 'market'],
    ['/t/new', undefined, 'chat'],
    ['/t/thread-1', undefined, 'chat'],
    ['/s/share-token', undefined, null],
    ['/tools/blockrun.ai/x', undefined, 'market'],
    ['/agent-access', undefined, 'agents'],
    ['/agent-access/connect', undefined, 'agents'],
    ['/activity', undefined, 'calls'],
    ['/calls/abc', undefined, 'calls'],
    ['/owner/credit', undefined, 'credit'],
    ['/fund/cancelled', undefined, 'credit'],
    ['/owner/operations/new', undefined, 'tools'],
    ['/owner/supply/connections', undefined, 'tools'],
    ['/owner/operations', '#earnings', 'earnings'],
    ['/owner/operations', 'earnings', 'earnings'],
    ['/owner/settings', undefined, 'settings'],
    ['/owner/team', undefined, 'settings'],
    ['/owner/workspace', undefined, 'settings'],
    ['/support', undefined, 'support'],
    ['/status', undefined, 'status'],
    ['/owner', undefined, null],
    ['/admin/audit-events', undefined, null],
  ] as const)('resolves ownership for %s', (pathname, hash, destinationId) => {
    expect(resolveAppDestination(pathname, hash)).toBe(destinationId)
  })

  it('uses the same top-level destinations for every dropdown group and the mobile bar', () => {
    expect(mobileNavigation().map(({ label, to }) => [label, to])).toEqual([
      ['Market', '/market'],
      ['Ask', '/t/new'],
      ['Activity', '/activity'],
      ['Settings', '/owner/settings/workspace'],
    ])
    expect(new Set(mobileNavigation().map(({ group }) => group)).size).toBe(4)
  })
})
