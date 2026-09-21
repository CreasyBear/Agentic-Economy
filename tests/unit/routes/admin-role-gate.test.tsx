/** @vitest-environment jsdom */
import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const mocks = vi.hoisted(() => ({
  requireOperatorBeforeLoad: vi.fn(),
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  SignOutButton: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
  useLocation: () => ({ pathname: '/admin/index-health' }),
  useRouter: () => ({ invalidate: vi.fn() }),
}))
vi.mock('@/components/ae/layout/AeOperatorPage', () => ({
  AeOperatorPage: ({ title, description, children }: { title: string; description: string; children: ReactNode }) => (
    <main><h1>{title}</h1><p>{description}</p>{children}</main>
  ),
  useOperatorShellChrome: () => null,
}))
vi.mock('@/lib/server/require-operator-session', () => ({
  requireOperatorBeforeLoad: mocks.requireOperatorBeforeLoad,
}))

import { OperatorRouteForbidden } from '@/components/ae/layout/AeRouteError'
import { AeAdminReadbackPanel } from '@/components/ae/readback/AeAdminReadbackPanel'
import { OperatorSurfaceForbiddenError } from '@/lib/operator/operator-context'
import { operatorLayoutRouteOptions } from '@/lib/operator/route-options'
import { formatTimestamp } from '@/lib/ui/format-time'

afterEach(() => {
  cleanup()
  mocks.requireOperatorBeforeLoad.mockReset()
})

describe('admin role gate', () => {
  it('renders the Admin denial once with one heading and both recovery paths', () => {
    render(<OperatorRouteForbidden surface="admin" />)

    expect(screen.getAllByRole('heading', { level: 1, name: 'Admin access required' })).toHaveLength(1)
    expect(screen.getAllByText('Your account does not have the Admin role for this page.')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Ask an Admin for access' }).getAttribute('href')).toBe('/support')
    expect(screen.getByRole('link', { name: 'Return to Market' }).getAttribute('href')).toBe('/market')
  })

  it('returns an expected forbidden route context instead of throwing', async () => {
    mocks.requireOperatorBeforeLoad.mockRejectedValueOnce(new OperatorSurfaceForbiddenError('admin'))

    await expect(operatorLayoutRouteOptions.beforeLoad({ location: { href: '/admin/index-health' } }))
      .resolves.toEqual({ kind: 'forbidden', surface: 'admin' })
  })

  it('keeps unexpected admission failures on the error path', async () => {
    const failure = new Error('operator source unavailable')
    mocks.requireOperatorBeforeLoad.mockRejectedValueOnce(failure)

    await expect(operatorLayoutRouteOptions.beforeLoad({ location: { href: '/admin/index-health' } }))
      .rejects.toBe(failure)
  })
})

describe('admin readback tables', () => {
  it('shows the exposed filter, timestamp, and one next step for each failed index row', () => {
    const staleAt = Date.UTC(2026, 0, 1, 3)
    render(
      <AeAdminReadbackPanel
        title="Catalog readback"
        description="Index health."
        readback={{
          kind: 'allowed',
          httpStatus: 200,
          surface: 'index_health',
          generatedAt: staleAt,
          actorRef: 'admin:test',
          summary: { queued: 0, attention: 1, stale: 1, suppressed: 0 },
          rows: [
            {
              rowId: 'row:index:stale',
              rowType: 'index_surface',
              objectRef: 'tool:stale',
              rowState: 'stale',
              surface: 'index_health',
              readbackState: 'guarded',
              repairAction: 'regenerate_projection',
              repairResult: 'failed',
              updatedAt: staleAt,
            },
            {
              rowId: 'row:index:auth',
              rowType: 'index_surface',
              objectRef: 'source:unauthorized',
              rowState: 'guarded',
              surface: 'index_health',
              readbackState: 'unavailable',
              repairAction: 'source_auth_required',
              repairResult: 'failed',
              updatedAt: staleAt + 1,
            },
          ],
        }}
      />,
    )

    expect(screen.getByPlaceholderText('Filter by object, state, or correlation…')).toBeTruthy()
    expect(screen.getAllByText(formatTimestamp(staleAt)).length).toBeGreaterThan(0)
    expect(screen.getByText('Regenerate the projection')).toBeTruthy()
    expect(screen.getByText('Restore source authorization')).toBeTruthy()
  })
})
