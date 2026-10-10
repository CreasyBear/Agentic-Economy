/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SecuritySettings } from './security-settings'

type RouteOptions = {
  component: ComponentType
  beforeLoad: (context: { params: { _splat: string } }) => void
}

const routeState = vi.hoisted(() => ({
  pathname: '/owner/settings/account/security',
  options: undefined as RouteOptions | undefined,
  profileProps: undefined as Record<string, unknown> | undefined,
  redirect: vi.fn((options: Record<string, unknown>) => Object.assign(new Error('account_redirect'), { options })),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: RouteOptions) => {
    routeState.options = options
    return { options }
  },
  Link: ({ to, params, activeOptions: _activeOptions, ...props }: {
    to: string; params?: { _splat: string }; activeOptions?: unknown; children: ReactNode
  }) => <a href={to.replace('/$', params?._splat ? `/${params._splat}` : '')} {...props} />,
  useLocation: () => ({ pathname: routeState.pathname }),
  redirect: routeState.redirect,
}))

vi.mock('@/lib/operator/route-options', () => ({ operatorRouteOptions: {} }))

vi.mock('@clerk/tanstack-react-start', () => ({
  UserProfile: Object.assign(
    ({ children, ...props }: { children: ReactNode }) => {
      routeState.profileProps = props
      return <section aria-label="Live Clerk content">
        <button type="button">Clerk security control</button>
        {children}
      </section>
    },
    { Page: ({ label }: { label: string }) => <span data-clerk-page={label} /> },
  ),
}))

import '@/routes/_operator/owner.settings.account.$'

afterEach(() => {
  cleanup()
  routeState.pathname = '/owner/settings/account/security'
  routeState.profileProps = undefined
  routeState.redirect.mockClear()
})

function renderAccountRoute() {
  const Component = routeState.options?.component
  if (!Component) throw new Error('Account route was not captured')
  return render(<Component />)
}

describe('Arc security settings live composition', () => {
  it('frames only the real Clerk controls and preserves Clerk path routing and pages', () => {
    renderAccountRoute()

    const security = screen.getByRole('region', { name: 'Security' })
    expect(within(security).getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(within(security).getByRole('region', { name: 'Live Clerk content' })).toBeInTheDocument()
    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['Clerk security control'])
    expect(routeState.profileProps).toMatchObject({ routing: 'path', path: '/owner/settings/account' })
    expect([...document.querySelectorAll('[data-clerk-page]')].map(page => page.getAttribute('data-clerk-page')))
      .toEqual(['account', 'security', 'apiKeys'])
    expect(routeState.profileProps?.appearance).toMatchObject({
      elements: {
        headerTitle: { display: 'none' },
        navbar: { display: 'none' },
        navbarMobileMenuRow: { display: 'none !important' },
        navbarButton__apiKeys: { display: 'none' },
        card: { boxShadow: 'none', background: 'transparent' },
      },
    })
    expect(document.body.textContent).not.toMatch(/Fieldnote|246810|MacBook Pro|backup codes unused|Password updated/u)
  })

  it('keeps Profile under the shared settings heading on the native profile page', () => {
    routeState.pathname = '/owner/settings/account'
    renderAccountRoute()

    expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Security' })).toBeNull()
    expect(routeState.profileProps).toMatchObject({ routing: 'path', path: '/owner/settings/account' })
  })

  it('does not manufacture security data, controls or a save state when live content is absent', () => {
    const { rerender } = render(<SecuritySettings content={<p>Live provider content</p>} />)
    expect(screen.getByText('Live provider content')).toBeInTheDocument()

    rerender(<SecuritySettings content={null} />)
    expect(screen.queryByText('Live provider content')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.body.textContent).not.toMatch(/Two-factor authentication|Password|Active sessions|Signed out|saved/u)
  })

  it.each(['account', 'api-keys'])('preserves the canonical redirect for the old %s page', splat => {
    expect(() => routeState.options?.beforeLoad({ params: { _splat: splat } })).toThrow('account_redirect')
    expect(routeState.redirect).toHaveBeenCalledWith({
      to: '/owner/settings/account/$', params: { _splat: '' },
    })
  })

  it.each(['', 'security'])('lets Clerk handle the native %s page', splat => {
    expect(() => routeState.options?.beforeLoad({ params: { _splat: splat } })).not.toThrow()
    expect(routeState.redirect).not.toHaveBeenCalled()
  })
})
