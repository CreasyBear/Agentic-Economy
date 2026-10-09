/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ access: { kind: 'allowed', role: 'owner_admin', actorRef: 'actor:a' }, observation: { kind: 'unrecorded' } as unknown, accessError: null as Error | null, query: vi.fn() }))
vi.mock('convex/react', () => ({ useQuery: (query: unknown, args: unknown) => {
  mocks.query(query, args)
  if (args === 'skip') return undefined
  if (getFunctionName(query as Parameters<typeof getFunctionName>[0]) === 'adminConsoleAudit:readAdminAuditAccess' && mocks.accessError !== null) throw mocks.accessError
  return getFunctionName(query as Parameters<typeof getFunctionName>[0]) === 'adminConsoleAudit:readAdminAuditAccess' ? mocks.access : mocks.observation
} }))
vi.mock('@/components/ae/layout/AeRecordSheet', () => ({
  AeRecordSheet: ({ open, children, action }: { open: boolean; children: ReactNode; action: ReactNode }) => open ? <section>{children}{action}</section> : null,
}))
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AdminCommandRecoveryPanel } from '@/components/ae/admin/actions/AdminCommandRecoveryPanel'
import {
  adminCommandRecoveryScope, readAdminCommandRecovery, retainAdminCommandRecovery, forgetAdminCommandRecovery,
} from '@/components/ae/admin/actions/admin-command-recovery'
import { useAdminCommandRecovery, useAdminCommandObservation } from '@/components/ae/admin/actions/useAdminCommandRecovery'

vi.mock('@tanstack/react-router', () => ({ Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a> }))

const identity = { action: 'set_payments_paused' as const, operationKey: 'admin:original', correlationId: 'admin:original:correlation' }
afterEach(() => { cleanup(); window.localStorage.clear(); vi.clearAllMocks(); vi.unstubAllEnvs(); mocks.access = { kind: 'allowed', role: 'owner_admin', actorRef: 'actor:a' }; mocks.observation = { kind: 'unrecorded' }; mocks.accessError = null })

describe('admin command recovery identity', () => {
  it('retains the same actor journal across a verified backend migration without moving or replaying it', async () => {
    const predecessor = 'https://original.convex.cloud'
    vi.stubEnv('VITE_CONVEX_URL', predecessor)
    vi.stubEnv('VITE_AE_ADMIN_RECOVERY_DEPLOYMENT_URL', '')
    const scope = adminCommandRecoveryScope('actor:a')
    retainAdminCommandRecovery(scope, identity)

    vi.stubEnv('VITE_CONVEX_URL', 'https://replacement.ap-southeast-2.convex.cloud')
    vi.stubEnv('VITE_AE_ADMIN_RECOVERY_DEPLOYMENT_URL', predecessor)
    expect(adminCommandRecoveryScope('actor:a')).toBe(scope)
    expect(readAdminCommandRecovery(adminCommandRecoveryScope('actor:b'))).toEqual([])
    const hook = renderHook(() => useAdminCommandRecovery())
    await waitFor(() => expect(hook.result.current.entries).toEqual([identity]))
    expect(window.localStorage.length).toBe(1)
    expect(retainAdminCommandRecovery(scope, { ...identity, correlationId: 'admin:replacement' })).toBe(false)
    expect(mocks.query.mock.calls.every(([query]) => getFunctionName(query) === 'adminConsoleAudit:readAdminAuditAccess')).toBe(true)
  })

  it('contains a recovery access failure, retains saved identity, and retries only recovery reads', async () => {
    const scope = adminCommandRecoveryScope('actor:a')
    retainAdminCommandRecovery(scope, identity)
    mocks.accessError = new Error('recovery_access_unavailable')
    render(<><p>Recorded Call receipt remains available</p><AdminCommandRecoveryPanel /></>)
    expect(screen.getByText('Recorded Call receipt remains available')).toBeTruthy()
    expect(screen.getByText('Command recovery could not be read. Saved recovery identities are retained.')).toBeTruthy()
    expect(readAdminCommandRecovery(scope)).toEqual([identity])
    mocks.accessError = null
    fireEvent.click(screen.getByRole('button', { name: 'Check command recovery' }))
    await screen.findByRole('button', { name: 'Inspect command' })
    expect(screen.queryByText('Command recovery could not be read. Saved recovery identities are retained.')).toBeNull()
    expect(screen.getByText('Recorded Call receipt remains available')).toBeTruthy()
    expect(readAdminCommandRecovery(scope)).toEqual([identity])
    expect(mocks.query.mock.calls.every(([query]) => ['adminConsoleAudit:readAdminAuditAccess', 'adminConsoleAudit:readAdminCommandReceipt'].includes(getFunctionName(query)))).toBe(true)
  })

  it('persists only validated identity before navigation and restores it after remount', async () => {
    const scope = adminCommandRecoveryScope('actor:a')
    expect(retainAdminCommandRecovery(scope, { ...identity, input: { secret: 'never-save' } } as typeof identity)).toBe(false)
    expect(retainAdminCommandRecovery(scope, identity)).toBe(true)
    expect(window.localStorage.getItem(scope)).toBe(JSON.stringify([identity]))
    const mounted = renderHook(() => useAdminCommandRecovery())
    await waitFor(() => expect(mounted.result.current.entries).toEqual([identity]))
    mounted.unmount()
    const restored = renderHook(() => useAdminCommandRecovery())
    await waitFor(() => expect(restored.result.current.entries).toEqual([identity]))
    expect(mocks.query.mock.calls.every(([query]) => getFunctionName(query) === 'adminConsoleAudit:readAdminAuditAccess')).toBe(true)
  })

  it('isolates deployment and actors and hides the old actor immediately', async () => {
    const scope = adminCommandRecoveryScope('actor:a')
    retainAdminCommandRecovery(scope, identity)
    expect(readAdminCommandRecovery(adminCommandRecoveryScope('actor:b'))).toEqual([])
    expect(adminCommandRecoveryScope('actor:a', 'source:one')).not.toBe(adminCommandRecoveryScope('actor:a', 'source:two'))
    const hook = renderHook(() => useAdminCommandRecovery())
    await waitFor(() => expect(hook.result.current.entries).toEqual([identity]))
    act(() => { mocks.access = { ...mocks.access, actorRef: 'actor:b' }; hook.rerender() })
    expect(hook.result.current.entries).toEqual([])
    expect(readAdminCommandRecovery(scope)).toEqual([identity])
  })

  it.each([{ kind: 'unrecorded' }, { kind: 'unavailable' }, { kind: 'refused', code: 'missing_membership' }, undefined])('retains unresolved identity after a $kind read', observation => {
    const scope = adminCommandRecoveryScope('actor:a')
    retainAdminCommandRecovery(scope, identity)
    mocks.observation = observation
    const hook = renderHook(() => useAdminCommandObservation(scope, identity))
    expect(hook.result.current.canAcknowledge).toBe(false)
    expect(hook.result.current.acknowledge()).toBe(false)
    expect(readAdminCommandRecovery(scope)).toEqual([identity])
  })

  it('observes pending and terminal receipts read-only, clearing only on explicit acknowledgement', () => {
    const scope = adminCommandRecoveryScope('actor:a')
    retainAdminCommandRecovery(scope, identity)
    const receipt = { kind: 'pending', action: identity.action, effectRefs: ['grant:1'], auditEventRef: 'audit:1', correlationId: identity.correlationId }
    mocks.observation = { kind: 'recorded', receipt }
    const hook = renderHook(() => useAdminCommandObservation(scope, identity))
    expect(hook.result.current.acknowledge()).toBe(false)
    act(() => { mocks.observation = { kind: 'recorded', receipt: { ...receipt, kind: 'completed', code: 'payments_paused' } }; hook.rerender() })
    expect(readAdminCommandRecovery(scope)).toEqual([identity])
    act(() => { expect(hook.result.current.acknowledge()).toBe(true) })
    expect(readAdminCommandRecovery(scope)).toEqual([])
    expect(mocks.query.mock.calls.some(([query]) => getFunctionName(query) === 'adminConsoleAudit:readAdminCommandReceipt')).toBe(true)
  })

  it('refuses to overwrite a changed correlation or silently evict a full recovery list', () => {
    const scope = adminCommandRecoveryScope('actor:a')
    retainAdminCommandRecovery(scope, identity)
    expect(retainAdminCommandRecovery(scope, { ...identity, correlationId: 'admin:different' })).toBe(false)
    for (let index = 1; index < 20; index += 1) expect(retainAdminCommandRecovery(scope, { ...identity, operationKey: `admin:${index}` })).toBe(true)
    expect(retainAdminCommandRecovery(scope, { ...identity, operationKey: 'admin:overflow' })).toBe(false)
    expect(readAdminCommandRecovery(scope)).toHaveLength(20)
    expect(forgetAdminCommandRecovery(scope, { ...identity, correlationId: 'admin:different' })).toBe(true)
    expect(readAdminCommandRecovery(scope)).toHaveLength(20)
  })
  it('restores a read-only inspection entry without presenting a command replay action', async () => {
    const scope = adminCommandRecoveryScope('actor:a')
    retainAdminCommandRecovery(scope, identity)
    mocks.observation = { kind: 'unrecorded' }
    render(<AdminCommandRecoveryPanel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Inspect command' }))
    expect(screen.getByText(/No outcome has been confirmed/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Acknowledge receipt' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Retry|Submit|Replay/ })).toBeNull()
    expect(readAdminCommandRecovery(scope)).toEqual([identity])
  })
  it('requires explicit receipt acknowledgement to remove a completed recovery entry', async () => {
    const scope = adminCommandRecoveryScope('actor:a')
    retainAdminCommandRecovery(scope, identity)
    mocks.observation = { kind: 'recorded', receipt: { kind: 'completed', action: identity.action, code: 'payments_paused', effectRefs: [], auditEventRef: 'audit:1', correlationId: identity.correlationId } }
    render(<AdminCommandRecoveryPanel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Inspect command' }))
    expect(readAdminCommandRecovery(scope)).toEqual([identity])
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge receipt' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Command recovery' })).toBeNull())
    expect(readAdminCommandRecovery(scope)).toEqual([])
  })

})

it('restores scoped recovery through the admin lazy page seam and hides a changed actor without discarding identity', async () => {
  const scope = adminCommandRecoveryScope('actor:a')
  retainAdminCommandRecovery(scope, identity)
  mocks.observation = { kind: 'recorded', receipt: { kind: 'pending', action: identity.action, effectRefs: [], auditEventRef: 'audit:1', correlationId: identity.correlationId } }
  const page = <AeOperatorPage operatorRole="admin" title="Activity" description="Recorded outcomes" currentPath="/admin/activity"><p>Recorded Call receipt remains available</p></AeOperatorPage>
  const view = render(page)
  fireEvent.click(await screen.findByRole('button', { name: 'Inspect command' }))
  expect(screen.getAllByText('Pending').length).toBeGreaterThan(0)
  expect(screen.queryByRole('button', { name: 'Acknowledge receipt' })).toBeNull()
  expect(readAdminCommandRecovery(scope)).toEqual([identity])
  mocks.access = { ...mocks.access, actorRef: 'actor:b' }
  view.rerender(<AeOperatorPage operatorRole="admin" title="Activity" description="Changed actor" currentPath="/admin/activity"><p>Recorded Call receipt remains available</p></AeOperatorPage>)
  expect(screen.queryByRole('button', { name: 'Inspect command' })).toBeNull()
  expect(readAdminCommandRecovery(scope)).toEqual([identity])
  expect(screen.getByText('Recorded Call receipt remains available')).toBeTruthy()
})
