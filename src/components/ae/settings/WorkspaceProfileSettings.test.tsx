// @vitest-environment jsdom
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushSync } from 'react-dom'
import type { ComponentProps, ReactNode } from 'react'
import type { UseWorkspaceDangerZoneResult } from './workspace-danger-zone/workspace-danger-zone.contracts'
const boundary = vi.hoisted(() => ({ closed: false, query: vi.fn() }))
const binding = { accountRef: 'account:1', displayName: 'Acme', accountRevision: 4, callerIsOwner: true, clerkOrgId: 'org_1', ownerDisplayName: 'Owner', ownerClerkUserId: 'user_owner' }
vi.mock('convex/react', () => ({ useQuery: (_ref: unknown, args: unknown) => {
  boundary.query(args)
  if (args === 'skip') return undefined
  if (boundary.closed) throw new Error('active account read after close')
  return binding
} }))
vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ invalidate: vi.fn() }), Link: ({ children }: { children: ReactNode }) => <span>{children}</span> }))
vi.mock('./WorkspaceNameEditor', () => ({ WorkspaceNameEditor: ({ name }: { name: string }) => <span>{name}</span> }))
vi.mock('./ProviderNameEditor', () => ({ ProviderNameEditor: () => null }))
vi.mock('@/lib/server/owner-workspace.functions', () => ({ renameProviderDisplayNameServer: vi.fn() }))
vi.mock('./settings-shell/components/SettingsSections', () => ({
  SettingsPage: ({ children, title }: { children: ReactNode; title: string }) => <section><h1>{title}</h1>{children}</section>,
  SettingsGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SettingsRow: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SettingsDangerZone: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SettingsEmptyState: () => null,
}))
vi.mock('./workspace-danger-zone/WorkspaceDangerZone', () => ({ WorkspaceDangerZone: ({ confirmedCompletion, onReadPausedChange, onCompletion }: {
  confirmedCompletion?: UseWorkspaceDangerZoneResult['completion']; onReadPausedChange?: (paused: boolean) => void;
  onCompletion?: (completion: NonNullable<UseWorkspaceDangerZoneResult['completion']>) => void;
}) => confirmedCompletion === undefined ? <>
  <button type="button" onClick={() => { flushSync(() => onReadPausedChange?.(true)); boundary.closed = true; onCompletion?.({ kind: 'closed', accountRef: 'account:1', displayName: 'Acme' }) }}>Complete close</button>
  <button type="button" onClick={() => { flushSync(() => onReadPausedChange?.(true)); boundary.closed = true }}>Unconfirmed close</button>
</> : <p>Confirmed closure of {confirmedCompletion.accountRef}</p> }))
import { WorkspaceProfileSettings } from './WorkspaceProfileSettings'
const props = {
  identity: { kind: 'not_applicable' }, status: { kind: 'unavailable' }, defaultName: null,
} as ComponentProps<typeof WorkspaceProfileSettings>
beforeEach(() => { boundary.closed = false; boundary.query.mockClear() })
afterEach(cleanup)
it('keeps confirmed completion mounted after the workspace source can no longer be read', () => {
  render(<WorkspaceProfileSettings {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Complete close' }))
  expect(screen.getByRole('heading', { name: 'Workspace change complete' })).toBeTruthy()
  expect(screen.getByText('Confirmed closure of account:1')).toBeTruthy()
  expect(boundary.query).toHaveBeenLastCalledWith('skip')
})
it('retains the confirmed workspace projection and prevents new active-account reads for an unknown outcome', () => {
  render(<WorkspaceProfileSettings {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Unconfirmed close' }))
  expect(screen.getByText('Acme')).toBeTruthy()
  expect(boundary.query).toHaveBeenLastCalledWith('skip')
  expect(screen.getByText('Acme').closest('[inert]')).toBeTruthy()
})
