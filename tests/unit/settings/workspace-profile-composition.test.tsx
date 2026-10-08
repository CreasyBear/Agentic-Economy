/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const source = vi.hoisted(() => ({
  workspacePending: false,
  workspace: { accountRef: 'account:buyer', displayName: 'Buyer workspace', accountRevision: 1, clerkOrgId: null, callerIsOwner: false },
  rename: vi.fn(),
}))
vi.mock('convex/react', () => ({ useQuery: () => source.workspacePending ? undefined : source.workspace, useMutation: () => source.rename }))
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate: vi.fn().mockResolvedValue(undefined) }),
  useBlocker: () => ({ status: 'idle' }),
  Link: ({ to, ...props }: { to: string; children: ReactNode }) => <a href={to} {...props} />,
}))
// Offboarding is an independent guarded flow; this review tests its placement only.
vi.mock('@/components/ae/settings/workspace-danger-zone/WorkspaceDangerZone', () => ({ WorkspaceDangerZone: () => <p>Workspace closure controls</p> }))
import { WorkspaceProfileSettings } from '@/components/ae/settings/WorkspaceProfileSettings'

afterEach(() => {
  cleanup()
  source.workspacePending = false
})

describe('workspace settings composition', () => {
  it('shows one named busy status without workspace controls until the binding loads', () => {
    source.workspacePending = true
    const page = render(<WorkspaceProfileSettings identity={{ kind: 'not_applicable' }} status={{ kind: 'not_applicable' }} defaultName={null} />)

    expect(screen.getAllByRole('status', { name: 'Loading workspace name' })).toHaveLength(1)
    expect(screen.getByRole('status', { name: 'Loading workspace name' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('textbox')).toBeNull()

    source.workspacePending = false
    page.rerender(<WorkspaceProfileSettings identity={{ kind: 'not_applicable' }} status={{ kind: 'not_applicable' }} defaultName={null} />)

    expect(screen.queryByRole('status', { name: 'Loading workspace name' })).toBeNull()
    expect(screen.getByText('Buyer workspace')).toBeVisible()
  })

  it('leads with real workspace identity without provider setup noise for a buyer account', () => {
    render(<WorkspaceProfileSettings identity={{ kind: 'not_applicable' }} status={{ kind: 'not_applicable' }} defaultName={null} />)
    expect(screen.getAllByRole('heading', { level: 1 }).map(heading => heading.textContent)).toEqual(['Business profile'])
    expect(screen.getByText('Buyer workspace')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Public provider profile' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'View Tools' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Open Tools' })).toBeNull()
    expect(screen.getByText('Workspace closure controls')).toBeVisible()
    expect(source.rename).not.toHaveBeenCalled()
  })

  it('retains the real public provider controls separately from the workspace name', () => {
    render(<WorkspaceProfileSettings identity={{ kind: 'available', businessId: 'business:provider', name: 'Public Provider', slug: 'public-provider', publicStatus: 'published' }} status={{ kind: 'not_applicable' }} defaultName={null} />)
    expect(screen.getByText('Buyer workspace')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Public provider profile' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Public Provider name' })).toHaveValue('Public Provider')
    expect(screen.getByText('/public-provider')).toBeVisible()
    expect(screen.getByRole('link', { name: 'View Tools' })).toHaveAttribute('href', '/owner/operations')
    expect(source.rename).not.toHaveBeenCalled()
  })

  it('keeps unavailable provider facts explicit while the workspace remains usable', () => {
    render(<WorkspaceProfileSettings identity={{ kind: 'unavailable' }} status={{ kind: 'unavailable' }} defaultName={null} />)
    expect(screen.getByText('Buyer workspace')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Provider profile unavailable' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
    expect(screen.queryByRole('textbox', { name: 'Public Provider name' })).toBeNull()
  })
})
