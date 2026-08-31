import {
  createMemoryHistory,
  createRouter,
  isRedirect,
  type AnyRedirect,
} from '@tanstack/react-router'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readPublicBusinessRouteServer: vi.fn(async () => ({
    kind: 'not_found' as const,
    reason: 'business_not_found' as const,
  })),
}))

vi.mock('@/lib/server/public-business-route.functions', () => mocks)

import { Route as ContactRoute } from '@/routes/contact'
import { Route as HelpRoute } from '@/routes/help'
import { Route as SupportRoute } from '@/routes/support'
import { routeTree } from '@/routeTree.gen'
import { buildSitemapXml } from '@/modules/discovery/public'
import { createFixtureDiscoverySourceState } from '../../helpers/discovery-fixture-source-state'

const aliases = [
  ['/help', HelpRoute],
  ['/contact', ContactRoute],
] as const

describe('support aliases', () => {
  it.each(aliases)('%s redirects GET and HEAD to canonical support with query and hash', async (path, route) => {
    const beforeLoad = route.options.beforeLoad
    if (beforeLoad === undefined) throw new Error(`${path} redirect is unavailable`)

    for (const method of ['GET', 'HEAD'] as const) {
      let caught: unknown
      try {
        beforeLoad({
          context: { request: new Request(`https://ae.example${path}?source=guess#faq`, { method }) },
          location: {
            pathname: path,
            search: { source: 'guess' },
            hash: 'faq',
          },
        } as never)
      } catch (error) {
        caught = error
      }

      expect(isRedirect(caught)).toBe(true)
      const redirect = caught as AnyRedirect
      expect(redirect.status).toBe(307)
      expect(redirect.options).toMatchObject({
        to: '/support',
        search: { source: 'guess' },
        hash: 'faq',
      })
      await expect(redirect.text()).resolves.toBe('')
    }
  })

  it.each(aliases)('%s wins over the supplier slug route without a business read', (path) => {
    mocks.readPublicBusinessRouteServer.mockClear()
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/support'] }),
    })

    const routeIds = router.matchRoutes(path).map(({ routeId }) => routeId)
    expect(routeIds).toContain(path)
    expect(routeIds).not.toContain('/$slug')
    expect(mocks.readPublicBusinessRouteServer).not.toHaveBeenCalled()
  })

  it('keeps support canonical without a redirect loop and unknown slugs on supplier lookup', async () => {
    expect(SupportRoute.options.beforeLoad).toBeUndefined()
    mocks.readPublicBusinessRouteServer.mockClear()
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/not-a-real-supplier'] }),
    })

    await router.load()

    expect(router.state.matches.map(({ routeId }) => routeId)).toContain('/$slug')
    expect(mocks.readPublicBusinessRouteServer).toHaveBeenCalledExactlyOnceWith({
      data: { slug: 'not-a-real-supplier' },
    })
  })

  it('keeps only canonical support in the sitemap', () => {
    const sitemap = buildSitemapXml(createFixtureDiscoverySourceState(), {
      canonicalBaseUrl: 'https://ae.example',
      now: 0,
    }).body

    expect(sitemap).toContain('<loc>https://ae.example/support</loc>')
    expect(sitemap).not.toContain('<loc>https://ae.example/help</loc>')
    expect(sitemap).not.toContain('<loc>https://ae.example/contact</loc>')
  })
})
