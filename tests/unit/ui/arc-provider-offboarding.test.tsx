/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const calls = vi.hoisted(() => ({ start: vi.fn(), resume: vi.fn(), cancel: vi.fn(), read: vi.fn() }))
vi.mock('@/components/ae/offerings/provider-workspace.functions', () => ({
  startOwnerProviderOffboardingServer: calls.start,
  resumeOwnerProviderOffboardingServer: calls.resume,
  cancelOwnerProviderOffboardingServer: calls.cancel,
  readOwnerProviderOffboardingServer: calls.read,
}))
vi.mock('@tanstack/react-start', async (importOriginal) => ({ ...(await importOriginal<typeof import('@tanstack/react-start')>()), useServerFn: (fn: unknown) => fn }))
vi.mock('@clerk/tanstack-react-start', () => ({ useReverification: (fn: unknown) => fn }))

import { ProviderWorkspaceOffboardingSection } from '@/components/ae/offerings/ProviderWorkspaceOffboardingSection'
import type { OwnerProviderOffboardingResult } from '@/components/ae/offerings/provider-workspace.functions'
import type { ProviderOffboardingStatus } from '@/modules/capability-supply/provider-offboarding'

const status: ProviderOffboardingStatus = {
  schemaVersion: 'provider_offboarding:v1', caseRef: 'offboarding:exact-case', businessRef: 'business:one', providerRef: 'provider:one',
  revision: 7, state: 'Freezing', routeabilityFrozen: false, blockerCodes: [], observedAt: 0, retentionPolicyVersion: 'retention:v1',
}
async function show(result: OwnerProviderOffboardingResult, refreshWorkspace = vi.fn()) {
  let view: ReturnType<typeof render> | undefined
  await act(async () => { view = render(<ProviderWorkspaceOffboardingSection offboarding={Promise.resolve(result)} refreshWorkspace={refreshWorkspace} />) })
  return view!
}
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Arc Provider offboarding composition', () => {
  it('requires confirmation before freezing work and retains the trigger focus on cancellation', async () => {
    await show({ kind: 'not_found' })
    const trigger = await screen.findByRole('button', { name: 'Start Provider offboarding' })
    trigger.focus()
    fireEvent.click(trigger)
    expect(await screen.findByRole('alertdialog', { name: 'Start Provider offboarding?' })).toBeTruthy()
    expect(calls.start).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(document.activeElement).toBe(trigger))
    expect(calls.start).not.toHaveBeenCalled()
  })

  it('cancels only before routeability freezes and sends the authoritative case revision', async () => {
    calls.cancel.mockResolvedValue({ kind: 'available', status: { ...status, state: 'Cancelled', revision: 8 } })
    const refresh = vi.fn()
    await show({ kind: 'available', status }, refresh)
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel offboarding' }))
    await screen.findByRole('heading', { name: 'Cancelled' })
    expect(calls.cancel).toHaveBeenCalledWith({ data: { caseRef: status.caseRef, expectedRevision: 7, idempotencyKey: expect.stringMatching(/^provider-offboarding-cancel:/u) } })
    expect(refresh).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Cancel offboarding' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Refresh status' })).toBeNull()
  })

  it('shows the real unavailable resume outcome without claiming retirement', async () => {
    calls.resume.mockResolvedValue({ kind: 'unavailable' })
    const refresh = vi.fn()
    await show({ kind: 'available', status: { ...status, state: 'Action required', routeabilityFrozen: true, blockerCodes: ['obligations_remain'] } }, refresh)
    fireEvent.click(await screen.findByRole('button', { name: 'Resume offboarding' }))
    expect(await screen.findByText('The command outcome could not be confirmed. Read current offboarding status before another command.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Action required' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Read current offboarding status' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Resume offboarding' })).toBeNull()
    expect(calls.resume).toHaveBeenCalledWith({ data: { caseRef: status.caseRef, expectedRevision: 7, idempotencyKey: expect.stringMatching(/^provider-offboarding-resume:/u) } })
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Retired' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancel offboarding' })).toBeNull()
  })
  it('observes the same case after a lost response and uses its latest revision before another command', async () => {
    calls.resume.mockRejectedValueOnce(new Error('response lost')).mockResolvedValue({ kind: 'available', status: { ...status, state: 'Retired', routeabilityFrozen: true, revision: 10 } })
    calls.read.mockResolvedValueOnce({ kind: 'unavailable' }).mockResolvedValueOnce({ kind: 'available', status: { ...status, state: 'Action required', routeabilityFrozen: true, revision: 9 } })
    await show({ kind: 'available', status: { ...status, state: 'Action required', routeabilityFrozen: true } })
    fireEvent.click(await screen.findByRole('button', { name: 'Resume offboarding' }))
    const observe = await screen.findByRole('button', { name: 'Read current offboarding status' })
    expect(screen.queryByRole('button', { name: 'Resume offboarding' })).toBeNull()
    fireEvent.click(observe)
    await screen.findByText(/last confirmed case remains visible/)
    expect(screen.getByRole('heading', { name: 'Action required' })).toBeTruthy()
    expect(calls.resume).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Read current offboarding status' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Resume offboarding' }))
    await screen.findByRole('heading', { name: 'Retired' })
    expect(calls.resume.mock.calls[1]?.[0].data).toMatchObject({ caseRef: status.caseRef, expectedRevision: 9 })
    expect(calls.read).toHaveBeenCalledTimes(2)
  })

  it('clears prior case details on authority refusal and exposes a current-status read', async () => {
    calls.resume.mockResolvedValue({ kind: 'refused', reason: 'authorization_denied' })
    await show({ kind: 'available', status: { ...status, state: 'Action required', routeabilityFrozen: true } })
    fireEvent.click(await screen.findByRole('button', { name: 'Resume offboarding' }))
    await screen.findByText('Provider offboarding needs review')
    expect(screen.queryByRole('heading', { name: 'Action required' })).toBeNull()
    expect(screen.queryByText(new RegExp(status.caseRef))).toBeNull()
    expect(screen.queryByRole('button', { name: 'Resume offboarding' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Read current offboarding status' })).toBeTruthy()
  })

  it('does not unlock a new command when observation returns a different case', async () => {
    calls.resume.mockResolvedValue({ kind: 'unavailable' })
    calls.read.mockResolvedValue({ kind: 'available', status: { ...status, caseRef: 'offboarding:other', state: 'Action required' } })
    await show({ kind: 'available', status: { ...status, state: 'Action required', routeabilityFrozen: true } })
    fireEvent.click(await screen.findByRole('button', { name: 'Resume offboarding' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Read current offboarding status' }))
    await screen.findByText('Provider offboarding needs review')
    expect(screen.queryByRole('button', { name: 'Resume offboarding' })).toBeNull()
    expect(calls.resume).toHaveBeenCalledTimes(1)
  })
  it('keeps a lost request locked across delayed initial props and older explicit reads', async () => {
    calls.resume.mockResolvedValue({ kind: 'unavailable' })
    calls.read.mockResolvedValueOnce({ kind: 'available', status: { ...status, state: 'Action required', routeabilityFrozen: true, revision: 6 } })
      .mockResolvedValueOnce({ kind: 'available', status: { ...status, state: 'Action required', routeabilityFrozen: true, revision: 9 } })
    const initial = { kind: 'available' as const, status: { ...status, state: 'Action required' as const, routeabilityFrozen: true } }
    const refresh = vi.fn()
    const view = await show(initial, refresh)
    fireEvent.click(await screen.findByRole('button', { name: 'Resume offboarding' }))
    await screen.findByRole('button', { name: 'Read current offboarding status' })
    await act(async () => view.rerender(<ProviderWorkspaceOffboardingSection offboarding={Promise.resolve({ ...initial })} refreshWorkspace={refresh} />))
    expect(screen.queryByRole('button', { name: 'Resume offboarding' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Read current offboarding status' }))
    await screen.findByText('This read is older than the submitted case revision. Read current status again before another command.')
    expect(screen.queryByRole('button', { name: 'Review original offboarding request' })).toBeNull()
    expect(calls.resume).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Read current offboarding status' }))
    await screen.findByRole('button', { name: 'Resume offboarding' })
  })

  it('replays only the exact original request after an explicit unchanged read and a fresh consequence review', async () => {
    calls.resume.mockResolvedValueOnce({ kind: 'unavailable' }).mockResolvedValueOnce({ kind: 'available', status: { ...status, state: 'Verifying cleanup', routeabilityFrozen: true, revision: 8 } })
    calls.read.mockResolvedValue({ kind: 'available', status: { ...status, state: 'Action required', routeabilityFrozen: true } })
    await show({ kind: 'available', status: { ...status, state: 'Action required', routeabilityFrozen: true } })
    fireEvent.click(await screen.findByRole('button', { name: 'Resume offboarding' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Read current offboarding status' }))
    const review = await screen.findByRole('button', { name: 'Review original offboarding request' })
    expect(screen.queryByRole('button', { name: 'Resume offboarding' })).toBeNull()
    expect(calls.resume).toHaveBeenCalledTimes(1)
    fireEvent.click(review)
    await screen.findByRole('alertdialog', { name: 'Retry the original offboarding request?' })
    expect(screen.getByText(/revision 7/)).toBeTruthy()
    expect(calls.resume).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Retry original request' }))
    await screen.findByRole('heading', { name: 'Verifying cleanup' })
    expect(calls.resume.mock.calls[1]?.[0]).toEqual(calls.resume.mock.calls[0]?.[0])
    expect(Object.isFrozen(calls.resume.mock.calls[0]?.[0].data)).toBe(true)
  })

  it('ignores a late command result after a refreshed authority refusal', async () => {
    let resolve: ((value: OwnerProviderOffboardingResult) => void) | undefined
    calls.resume.mockImplementation(() => new Promise<OwnerProviderOffboardingResult>(complete => { resolve = complete }))
    const refresh = vi.fn()
    const view = await show({ kind: 'available', status: { ...status, state: 'Action required', routeabilityFrozen: true } }, refresh)
    fireEvent.click(await screen.findByRole('button', { name: 'Resume offboarding' }))
    await act(async () => view.rerender(<ProviderWorkspaceOffboardingSection offboarding={Promise.resolve({ kind: 'refused', reason: 'authorization_denied' })} refreshWorkspace={refresh} />))
    await screen.findByText('Provider offboarding needs review')
    await act(async () => resolve?.({ kind: 'available', status: { ...status, state: 'Action required', revision: 9 } }))
    expect(screen.getByText('Provider offboarding needs review')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Action required' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Resume offboarding' })).toBeNull()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('ignores a late status read after authority is withdrawn', async () => {
    let resolve: ((value: OwnerProviderOffboardingResult) => void) | undefined
    calls.read.mockImplementation(() => new Promise<OwnerProviderOffboardingResult>(complete => { resolve = complete }))
    const refresh = vi.fn()
    const view = await show({ kind: 'available', status: { ...status, state: 'Draining', routeabilityFrozen: true } }, refresh)
    fireEvent.click(await screen.findByRole('button', { name: 'Refresh status' }))
    await act(async () => view.rerender(<ProviderWorkspaceOffboardingSection offboarding={Promise.resolve({ kind: 'refused', reason: 'authorization_denied' })} refreshWorkspace={refresh} />))
    await screen.findByText('Provider offboarding needs review')
    await act(async () => resolve?.({ kind: 'available', status: { ...status, state: 'Action required', revision: 9 } }))
    expect(screen.getByText('Provider offboarding needs review')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Action required' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Resume offboarding' })).toBeNull()
  })

})
