import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'

import { Route as StatusRoute } from '@/routes/_operator/owner.status'
import { Route as AccountSettingsRoute } from '@/routes/_operator/owner.settings'
import { Route as WorkspaceRoute } from '@/routes/_operator/owner.settings.workspace'
import { Route as ConnectionsRoute } from '@/routes/_operator/owner.settings.connections'
import { Route as PayoutsRoute } from '@/routes/_operator/owner.settings.payouts'
import { Route as DevelopersRoute } from '@/routes/_operator/owner.settings.developers'
import { Route as SupplyRoute } from '@/routes/_operator/owner.supply'

describe('Operations compatibility routes', () => {
  it('names the retained settings route only as Account & security', async () => {
    const head = await AccountSettingsRoute.options.head?.({} as never)
    expect(head?.meta).toEqual([
      { title: 'Account & security | Agentic Economy' },
      { name: 'description', content: 'Profile, authentication, sessions, recovery, and security.' },
      { name: 'robots', content: 'noindex' },
    ])
  })

  it.each([
    [StatusRoute, '/owner/offerings', undefined],
    [WorkspaceRoute, '/owner/offerings', 'supplier-identity'],
    [ConnectionsRoute, '/owner/offerings', 'supplier-connections'],
    [PayoutsRoute, '/owner/offerings', 'earnings'],
    [DevelopersRoute, '/for-agents', undefined],
  ] as const)('redirects without running a legacy loader', (route, to, hash) => {
    expect(route.options.loader).toBeUndefined()
    const beforeLoad = route.options.beforeLoad
    if (beforeLoad === undefined) throw new Error('compatibility_before_load_missing')
    let thrown: unknown
    try {
      void beforeLoad({} as never)
    } catch (error) {
      thrown = error
    }
    expect(isRedirect(thrown)).toBe(true)
    if (!isRedirect(thrown)) return
    expect(thrown.options.to).toBe(to)
    expect(thrown.options.replace).toBe(true)
    expect(thrown.options.hash).toBe(hash)
  })

  it('redirects query-bearing supplier landings and leaves detail and fragment-only routing to their owners', () => {
    const beforeLoad = SupplyRoute.options.beforeLoad
    if (beforeLoad === undefined) throw new Error('supply_before_load_missing')
    let thrown: unknown
    try {
      void beforeLoad({
        location: { pathname: '/owner/supply', searchStr: '?connect=return', hash: '' },
      } as never)
    } catch (error) {
      thrown = error
    }
    expect(isRedirect(thrown)).toBe(true)
    if (!isRedirect(thrown)) return
    expect(thrown.options).toMatchObject({
      to: '/owner/offerings',
      search: { connect: 'return' },
      hash: 'earnings',
      replace: true,
    })
    expect(() => beforeLoad({
      location: { pathname: '/owner/supply', searchStr: '', hash: 'earnings' },
    } as never)).not.toThrow()
    expect(() => beforeLoad({
      location: { pathname: '/owner/supply/offering:one', searchStr: '', hash: '' },
    } as never)).not.toThrow()
  })

  it('explicitly clears a rejected fragment at the HTTP redirect boundary', () => {
    const beforeLoad = SupplyRoute.options.beforeLoad
    if (beforeLoad === undefined) throw new Error('supply_before_load_missing')
    let thrown: unknown
    try {
      void beforeLoad({
        location: {
          pathname: '/owner/supply',
          searchStr: '?rebind=offering%3Aone&businessId=foreign',
          hash: 'provider-connection-connection:one',
        },
      } as never)
    } catch (error) {
      thrown = error
    }
    expect(isRedirect(thrown)).toBe(true)
    if (!isRedirect(thrown)) return
    expect(thrown.options).toMatchObject({ href: '/owner/offerings#', replace: true })
  })
})
