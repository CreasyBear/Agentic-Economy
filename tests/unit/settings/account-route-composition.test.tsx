/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const location = vi.hoisted(() => ({ pathname: '/owner/settings/account' }))
vi.mock('@tanstack/react-router', async importOriginal => ({
  ...await importOriginal<typeof import('@tanstack/react-router')>(),
  useLocation: () => location,
}))
vi.mock('@clerk/tanstack-react-start', () => ({
  UserProfile: Object.assign(({ path, routing }: { path: string; routing: string }) => <div data-testid="live-profile" data-path={path} data-routing={routing}>Live account controls</div>, { Page: () => null }),
}))
import { Route } from '@/routes/_operator/owner.settings.account.$'

afterEach(cleanup)

describe('account settings composition', () => {
  it.each([
    ['/owner/settings/account', 'Profile'],
    ['/owner/settings/account/', 'Profile'],
    ['/owner/settings/account/security-preferences', 'Profile'],
    ['/owner/settings/account/security', 'Security'],
    ['/owner/settings/account/security/', 'Security'],
    ['/owner/settings/account/security/mfa', 'Security'],
  ])('gives %s the correct single page title and live Clerk content', (pathname, title) => {
    location.pathname = pathname
    const Component = Route.options.component
    if (Component === undefined) throw new Error('Account page is unavailable')
    render(<Component />)
    expect(screen.getAllByRole('heading', { level: 1 }).map(heading => heading.textContent)).toEqual([title])
    expect(screen.getByTestId('live-profile')).toHaveAttribute('data-path', '/owner/settings/account')
    expect(screen.getByTestId('live-profile')).toHaveAttribute('data-routing', 'path')
    expect(screen.queryByRole('navigation', { name: 'Account pages' })).toBeNull()
  })
})
