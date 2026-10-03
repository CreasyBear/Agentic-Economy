/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Outlet, RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { Route } from '@/routes/_operator/owner.settings'

afterEach(cleanup)

describe('settings entry', () => {
  it.each(['/owner/settings', '/owner/settings/', '/owner/settings/team', '/owner/settings/account/security'])('opens useful content without a settings directory or redirect loop from %s', async entry => {
    const beforeLoad = Route.options.beforeLoad
    if (beforeLoad === undefined) throw new Error('Settings entry is unavailable')
    const root = createRootRoute()
    const settings = createRoute({
      getParentRoute: () => root,
      path: '/owner/settings',
      beforeLoad: context => beforeLoad(context as never),
      component: Outlet,
    })
    const router = createRouter({
      routeTree: root.addChildren([settings.addChildren([
        createRoute({ getParentRoute: () => settings, path: 'workspace', component: () => <h1>Business profile</h1> }),
        createRoute({ getParentRoute: () => settings, path: 'team', component: () => <h1>Team & roles</h1> }),
        createRoute({ getParentRoute: () => settings, path: 'account/security', component: () => <h1>Security</h1> }),
      ])]),
      history: createMemoryHistory({ initialEntries: ['/market', entry], initialIndex: 1 }),
    })
    render(<RouterProvider router={router} />)
    const target = entry.includes('/team') ? ['Team & roles', entry] as const
      : entry.includes('/account/security') ? ['Security', entry] as const
        : ['Business profile', '/owner/settings/workspace'] as const
    expect(await screen.findByRole('heading', { name: target[0] })).toBeVisible()
    expect(router.state.location.pathname).toBe(target[1])
    expect(router.history.length).toBe(2)
    expect(router.history.location.state.__TSR_index).toBe(1)
  })
})
