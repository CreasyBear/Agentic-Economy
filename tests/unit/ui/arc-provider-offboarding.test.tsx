/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const calls = vi.hoisted(() => ({ start: vi.fn(), resume: vi.fn(), cancel: vi.fn() }))
vi.mock('@/components/ae/offerings/provider-workspace.functions', () => ({
  startOwnerProviderOffboardingServer: calls.start,
  resumeOwnerProviderOffboardingServer: calls.resume,
  cancelOwnerProviderOffboardingServer: calls.cancel,
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
  await act(async () => { render(<ProviderWorkspaceOffboardingSection offboarding={Promise.resolve(result)} refreshWorkspace={refreshWorkspace} />) })
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
    expect((await screen.findByText('Provider offboarding unavailable')).closest('[role="alert"]')).toBeTruthy()
    expect(screen.getByText('This section could not be confirmed. The rest of the Tools page remains available.')).toBeTruthy()
    expect(calls.resume).toHaveBeenCalledWith({ data: { caseRef: status.caseRef, expectedRevision: 7, idempotencyKey: expect.stringMatching(/^provider-offboarding-resume:/u) } })
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Retired' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Cancel offboarding' })).toBeNull()
  })
})
