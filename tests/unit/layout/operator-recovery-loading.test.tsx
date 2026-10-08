/** @vitest-environment jsdom */
import type { ReactNode } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

const loading = vi.hoisted(() => {
  let reject!: (error: Error) => void
  const promise = new Promise<never>((_resolve, rejectPromise) => { reject = rejectPromise })
  return { imported: vi.fn(), promise, reject }
})
vi.mock('@/components/ae/admin/actions/AdminCommandRecoveryPanel', async () => {
  loading.imported()
  return loading.promise
})
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('@/lib/observability/capture-client-exception', () => ({ captureClientExceptionOnClient: vi.fn() }))
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { adminCommandRecoveryScope, retainAdminCommandRecovery, readAdminCommandRecovery } from '@/components/ae/admin/actions/admin-command-recovery'

afterEach(() => { cleanup(); window.localStorage.clear() })

it('defers recovery until an admin render and contains a chunk failure without hiding the page or deleting identities', async () => {
  const scope = adminCommandRecoveryScope('actor:a')
  const identity = { action: 'set_payments_paused' as const, operationKey: 'admin:original', correlationId: 'admin:original:correlation' }
  retainAdminCommandRecovery(scope, identity)
  const page = (role: 'owner' | 'admin') => <AeOperatorPage operatorRole={role} title="Activity" description="Recorded outcomes" currentPath={role === 'admin' ? '/admin/activity' : '/activity'}>
    <p>Recorded Call receipt remains available</p>
  </AeOperatorPage>
  const view = render(page('owner'))
  await act(async () => { await Promise.resolve() })
  expect(loading.imported).not.toHaveBeenCalled()
  view.rerender(page('admin'))
  expect(screen.getByText('Loading command recovery…')).toBeTruthy()
  expect(screen.getByText('Recorded Call receipt remains available')).toBeTruthy()
  await act(async () => { loading.reject(new Error('recovery_chunk_unavailable')); await Promise.resolve() })
  expect(loading.imported).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('region', { name: 'Command recovery unavailable' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Reload command recovery' })).toBeTruthy()
  expect(screen.getByText('Recorded Call receipt remains available')).toBeTruthy()
  expect(readAdminCommandRecovery(scope)).toEqual([identity])
})
