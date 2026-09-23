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
  WorkspaceRoute: null as ComponentType | null,
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (path: string) => (options: { component: ComponentType }) => {
    routeState.declaredPath = path
    routeState.routeOptions = options as Record<string, unknown>
    routeState.WorkspaceRoute = options.component
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

vi.mock('@/components/ae/website/clerk-appearance', () => ({
  clerkEmbeddedProfileAppearance: { cssLayerName: 'clerk' },
}))


vi.mock('@/components/ae/settings/workspace-danger-zone/WorkspaceDangerZone', () => ({
  WorkspaceDangerZone: () => <div data-testid="workspace-danger-zone" />,
}))

vi.mock('convex/react', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}))

vi.mock('@clerk/tanstack-react-start', () => {
  const OrganizationProfilePage = ({ label }: { label: string }) => {
    return <div data-testid={`organization-profile-page-${label}`} data-label={label} />
  }
  const OrganizationProfile = (props: Record<string, unknown>) => {
    return (
      <div
        data-testid="organization-profile"
        data-routing={String(props.routing ?? '')}
        data-after-leave={String(props.afterLeaveOrganizationUrl ?? '')}
      >
        {props.children as ReactNode}
      </div>
    )
  }
  OrganizationProfile.Page = OrganizationProfilePage
  return {
    OrganizationProfile,
    OrganizationSwitcher: () => <div data-testid="organization-switcher" />,
    UserProfile: () => <div data-testid="user-profile" />,
  }
})

import { Route } from '@/routes/_operator/owner.workspace'

function renderWorkspaceRoute() {
  const Component = routeState.WorkspaceRoute
  if (Component === null) throw new Error('owner_workspace_route_missing')
  return render(createElement(Component))
}

afterEach(() => {
  cleanup()
})

describe('/owner/workspace route (W-12)', () => {
  it('U1: route is declared for /_operator/owner/workspace', () => {
    expect(routeState.declaredPath).toBe('/_operator/owner/workspace')
    expect(Route).toBeDefined()
  })

  it('U2: Workspace remains a deep-link page, not a route-declared rail destination', () => {
    expect(routeState.routeOptions?.staticData).toBeUndefined()
  })

  it('U3: renders OrganizationProfile from Clerk inside min-h-96 shell', () => {
    renderWorkspaceRoute()
    expect(screen.getByTestId('organization-profile')).toBeTruthy()
    expect(document.querySelector('.min-h-96')).toBeTruthy()
  })

  it('U4: passes hash routing and afterLeaveOrganizationUrl', () => {
    renderWorkspaceRoute()
    const profile = screen.getByTestId('organization-profile')
    expect(profile.getAttribute('data-routing')).toBe('hash')
    expect(profile.getAttribute('data-after-leave')).toBe('/market')
  })

  it('U5: includes OrganizationProfile.Page label general', () => {
    renderWorkspaceRoute()
    const page = screen.getByTestId('organization-profile-page-general')
    expect(page).toBeTruthy()
    expect(page.getAttribute('data-label')).toBe('general')
  })

  it('U6: keeps billing and Credit controls separate from Workspace settings', () => {
    renderWorkspaceRoute()

    expect(screen.queryByRole('heading', { name: 'Billing & tax' })).toBeNull()
    expect(screen.queryByText(/Credit/i)).toBeNull()
    expect(screen.queryByTestId('tax-profile-form-section')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Danger zone' })).toBeTruthy()
    expect(screen.getByTestId('workspace-danger-zone')).toBeTruthy()
    expect(document.querySelector('.ae-owner-workspace.grid.gap-8')).toBeTruthy()
  })

  it('U7: head meta title mentions Workspace', () => {
    const head = routeState.routeOptions?.head as (() => { meta: Array<{ title?: string }> }) | undefined
    expect(head).toBeTypeOf('function')
    const meta = head?.().meta ?? []
    expect(meta.some((entry) => (entry.title ?? '').includes('Workspace'))).toBe(true)
  })
})
