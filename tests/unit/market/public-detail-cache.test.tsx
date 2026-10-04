/** @vitest-environment jsdom */
import { waitFor } from '@testing-library/react'
import { createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { Route as ToolRoute } from '@/routes/tools.$toolRef'
import { Route as DirectoryToolRoute } from '@/routes/tools.$providerHost.$slug'
import { Route as HostRoute } from '@/routes/providers.$providerHost'
import { Route as BusinessRoute } from '@/routes/$slug'

const destinations = [
  { name: 'admitted Tool', path: '/tools/$toolRef', first: '/tools/first', second: '/tools/second', options: ToolRoute.options },
  { name: 'directory Tool', path: '/tools/$providerHost/$slug', first: '/tools/example.com/first', second: '/tools/example.com/second', options: DirectoryToolRoute.options },
  { name: 'directory Host', path: '/providers/$providerHost', first: '/providers/first.example', second: '/providers/second.example', options: HostRoute.options },
  { name: 'published Business', path: '/$slug', first: '/first-business', second: '/second-business', options: BusinessRoute.options },
] as const

afterEach(() => vi.restoreAllMocks())

async function browsing(destination: typeof destinations[number]) {
  const read = vi.fn(async (params: Record<string, string>) => ({ ...params }))
  const root = createRootRoute()
  const detail = createRoute({
    getParentRoute: () => root,
    path: destination.path,
    loader: ({ params }) => read(params),
    // Exercise the real router with the production route's cache policy;
    // substitute only its external catalogue read.
    ...(destination.options.staleTime === undefined ? {} : { staleTime: destination.options.staleTime }),
    ...(destination.options.preloadStaleTime === undefined ? {} : { preloadStaleTime: destination.options.preloadStaleTime }),
  })
  const router = createRouter({
    routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/' }), detail]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return { router, read }
}

describe.each(destinations)('$name browsing cache', destination => {
  it('reuses a recent observation on return while isolating another destination', async () => {
    const { router, read } = await browsing(destination)
    await router.navigate({ href: destination.first })
    await router.navigate({ href: '/' })
    await router.navigate({ href: destination.second })
    await router.navigate({ href: '/' })
    await router.navigate({ href: destination.first })
    expect(read).toHaveBeenCalledTimes(2)
    expect(read.mock.calls[0]?.[0]).not.toEqual(read.mock.calls[1]?.[0])
    expect(router.state.matches.at(-1)?.loaderData).toEqual(read.mock.calls[0]?.[0])
  })

  it('explicit invalidation and an expired observation fetch fresh catalogue facts', async () => {
    const { router, read } = await browsing(destination)
    await router.navigate({ href: destination.first })
    await router.invalidate({ sync: true })
    expect(read).toHaveBeenCalledTimes(2)
    await router.navigate({ href: '/' })
    const later = Date.now() + 31_000
    vi.spyOn(Date, 'now').mockReturnValue(later)
    await router.navigate({ href: destination.first })
    await waitFor(() => expect(read).toHaveBeenCalledTimes(3))
  })

  it('shares an intent preload with navigation and a subsequent preload', async () => {
    const { router, read } = await browsing(destination)
    await router.preloadRoute({ to: destination.first })
    expect(read).toHaveBeenCalledTimes(1)
    await router.navigate({ href: destination.first })
    await router.navigate({ href: '/' })
    await router.preloadRoute({ to: destination.first })
    expect(read).toHaveBeenCalledTimes(1)
  })
})
