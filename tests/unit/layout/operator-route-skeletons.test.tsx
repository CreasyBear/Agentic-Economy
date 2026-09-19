/**
 * @vitest-environment jsdom
 */
import type { ReactElement } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import {
  inferOperatorSkeletonPreset,
  OperatorRoutePending,
  type OperatorRouteSkeletonPreset,
} from '@/components/ae/layout/AeRouteStates'

vi.mock('@clerk/tanstack-react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@clerk/tanstack-react-start')>()),
  useUser: () => ({
    isLoaded: true,
    isSignedIn: true,
    user: {
      id: 'user_test',
      fullName: 'Test User',
      primaryEmailAddress: { emailAddress: 'test@example.com' },
    },
    sessionId: 'session_test',
  }),
  UserButton: () => <button type="button" aria-label="Account menu" />,
  OrganizationSwitcher: () => <div data-testid="organization-switcher" />,
  SignOutButton: ({ children }: { children: ReactElement }) => children,
  Show: ({ children }: { children: ReactElement }) => children,
}))

afterEach(() => {
  cleanup()
})

const PRESETS: OperatorRouteSkeletonPreset[] = [
  'table',
  'overview-cards',
  'split-console',
  'form-record',
  'default',
]

function renderPending(
  preset: OperatorRouteSkeletonPreset | undefined,
  pathname = '/owner/operations',
) {
  const ui = (
    <AeOperatorPage
      operatorRole="owner"
      title="Tools"
      description="Publish the exact tools agents can inspect and call."
      currentPath={pathname}
    >
      <OperatorRoutePending {...(preset === undefined ? {} : { preset })} />
    </AeOperatorPage>
  )
  return renderAt(ui, pathname)
}

function renderAt(ui: ReactElement, pathname: string) {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/owner' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/workspace' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/market' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/operations' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/operations/new' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/settings' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/settings/connections' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/credit' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/activity' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/console' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/t/tool_slug' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/team' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [pathname] }),
  })
  return render(<RouterContextProvider router={router}>{ui}</RouterContextProvider>)
}

function skeletonRoot() {
  return screen.getByLabelText('Loading workspace')
}

describe('inferOperatorSkeletonPreset', () => {
  it('maps overview landing paths to overview-cards', () => {
    expect(inferOperatorSkeletonPreset('/owner')).toBe('overview-cards')
    expect(inferOperatorSkeletonPreset('/owner/workspace')).toBe('overview-cards')
    expect(inferOperatorSkeletonPreset('/owner/market')).toBe('overview-cards')
  })

  it('maps list and activity paths to table', () => {
    expect(inferOperatorSkeletonPreset('/owner/operations')).toBe('table')
    expect(inferOperatorSkeletonPreset('/activity')).toBe('table')
    expect(inferOperatorSkeletonPreset('/owner/credit')).toBe('table')
    expect(inferOperatorSkeletonPreset('/owner/supply/table')).toBe('table')
  })

  it('does not map /operations/new to table', () => {
    expect(inferOperatorSkeletonPreset('/owner/operations/new')).toBe('form-record')
  })

  it('maps settings and /new paths to form-record', () => {
    expect(inferOperatorSkeletonPreset('/owner/settings')).toBe('form-record')
    expect(inferOperatorSkeletonPreset('/owner/settings/connections')).toBe('form-record')
  })

  it('maps console and tool detail paths to split-console', () => {
    expect(inferOperatorSkeletonPreset('/owner/console')).toBe('split-console')
    expect(inferOperatorSkeletonPreset('/owner/t/tool_slug')).toBe('split-console')
  })

  it('falls back to default for unmatched paths', () => {
    expect(inferOperatorSkeletonPreset('/owner/team')).toBe('default')
  })
})

describe('OperatorRoutePending skeleton presets (S-02)', () => {
  for (const preset of PRESETS) {
    it(`renders ${preset} preset with accessibility and data attribute`, () => {
      renderPending(preset)

      const root = skeletonRoot()
      expect(root.getAttribute('aria-busy')).toBe('true')
      expect(root.getAttribute('data-skeleton-preset')).toBe(preset)
    })
  }

  it('renders table structure for table preset', () => {
    renderPending('table')

    const table = screen.getByTestId('skeleton-table')
    expect(table).toBeTruthy()
    expect(within(table).getAllByTestId('skeleton-table-row')).toHaveLength(5)
    expect(within(table).getAllByTestId('skeleton-table-cell')).toHaveLength(20)
  })

  it('renders metric cards for overview-cards preset', () => {
    renderPending('overview-cards')

    expect(screen.getAllByTestId('skeleton-metric-card')).toHaveLength(3)
    expect(screen.getByTestId('skeleton-overview-primary')).toBeTruthy()
  })

  it('renders split columns for split-console preset', () => {
    renderPending('split-console')

    expect(screen.getByTestId('skeleton-split-rail')).toBeTruthy()
    expect(screen.getByTestId('skeleton-split-panel')).toBeTruthy()
  })

  it('renders form fields for form-record preset', () => {
    renderPending('form-record')

    expect(screen.getAllByTestId('skeleton-form-field')).toHaveLength(4)
    expect(screen.getByTestId('skeleton-form-action')).toBeTruthy()
  })

  it('renders default multi-row skeleton', () => {
    renderPending('default')

    expect(screen.getByTestId('skeleton-default-body')).toBeTruthy()
  })

  it('infers preset from pathname when preset prop is omitted', () => {
    renderPending(undefined, '/owner/market')

    expect(skeletonRoot().getAttribute('data-skeleton-preset')).toBe('overview-cards')
  })
})
