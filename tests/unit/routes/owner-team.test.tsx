/**
 * @vitest-environment jsdom
 */
import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const routeState = vi.hoisted(() => ({
  declaredPath: null as string | null,
  routeOptions: null as Record<string, unknown> | null,
  TeamRoute: null as ComponentType | null,
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (path: string) => (options: { component: ComponentType }) => {
    routeState.declaredPath = path
    routeState.routeOptions = options as Record<string, unknown>
    routeState.TeamRoute = options.component
    return {
      ...options,
      options,
    }
  },
  Outlet: () => null,
}))

vi.mock('@/lib/operator/route-options', () => ({
  operatorRouteOptions: {},
}))

vi.mock('@/components/ae/layout/AeOperatorPage', () => ({
  AeOperatorPage: ({ children, title }: { children: ReactNode; title: string }) => (
    <div data-testid="operator-page" data-title={title}>{children}</div>
  ),
}))


vi.mock('@/components/ae/settings/AeTeamDirectoryTable', () => ({
  AeTeamDirectoryTable: (props: { directory?: unknown }) => (
    <div
      data-testid="team-directory-table"
      data-has-directory={props.directory === undefined ? 'false' : 'true'}
    />
  ),
}))

vi.mock('convex/react', () => ({
  useQuery: () => undefined,
}))


import { Route } from '@/routes/_operator/owner.team'

function renderTeamRoute() {
  const Component = routeState.TeamRoute
  if (Component === null) throw new Error('owner_team_route_missing')
  return render(createElement(Component))
}

afterEach(() => {
  cleanup()
})

describe('/owner/team route (W-15)', () => {
  it('U1: route is declared for /_operator/owner/team', () => {
    expect(routeState.declaredPath).toBe('/_operator/owner/team')
    expect(Route).toBeDefined()
  })

  it('U2: Team remains a deep-link page, not a rail destination', () => {
    const nav = (routeState.routeOptions?.staticData as { nav?: Record<string, unknown> } | undefined)?.nav
    expect(nav).toEqual({ label: 'Team' })
  })


  it('U5: renders AeTeamDirectoryTable', () => {
    renderTeamRoute()
    expect(screen.getByTestId('team-directory-table')).toBeTruthy()
  })

  it('U6: contains no duplicate membership or hand-rolled membership controls', () => {
    renderTeamRoute()
    expect(screen.queryByTestId('organization-profile')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /invite/i })).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button', { name: /remove|change role/i })).toBeNull()
  })

  it('U7: head meta title mentions Team', () => {
    const head = routeState.routeOptions?.head as (() => { meta: Array<{ title?: string }> }) | undefined
    expect(head).toBeTypeOf('function')
    const meta = head?.().meta ?? []
    expect(meta.some((entry) => (entry.title ?? '').includes('Team'))).toBe(true)
  })


  it('U9: passes undefined directory while query is loading (no dummy placeholder)', () => {
    renderTeamRoute()
    const table = screen.getByTestId('team-directory-table')
    expect(table.getAttribute('data-has-directory')).toBe('false')
  })
})
