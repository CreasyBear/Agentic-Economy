/** @vitest-environment jsdom */
import { ClerkRuntimeError } from '@clerk/shared/error'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  execute: vi.fn(),
  query: vi.fn(),
}))
vi.mock('convex/react', () => ({ useQuery: (query: unknown) => mocks.query(query) }))
vi.mock('@/components/ae/admin/actions/useAdminCommandProof', () => ({
  useAdminCommandProof: () => mocks.execute,
}))
vi.mock('@/components/ae/layout/AeRecordSheet', () => ({
  AeRecordSheet: ({ open, title, children, action, onOpenChange }: { open: boolean; title: string; children: ReactNode; action: ReactNode; onOpenChange: (open: boolean) => void }) =>
    open ? <section aria-label={title}>{children}{action}<button type="button" onClick={() => onOpenChange(false)}>Close</button></section> : null,
}))

import { adminCommandRecoveryScope, readAdminCommandRecovery } from '@/components/ae/admin/actions/admin-command-recovery'
import { useAdminActionSheet } from '@/components/ae/admin/actions/useAdminActionSheet'
import { AdminActionSheet } from '@/components/ae/admin/actions/AdminActionSheet'
mocks.query.mockImplementation(() => mocks.access())

const props = {
  action: 'verify_capability_source_authority',
  input: { publicationRef: 'publication:1', expectedRevision: 3, expectedSourceDigest: 'digest:3' },
  targetRefs: [{ label: 'Publication', value: 'publication:1' }],
  initialReasonCode: 'evidence_verified',
  open: true,
  onOpenChange: vi.fn(),
} satisfies Parameters<typeof AdminActionSheet>[0]

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.localStorage.clear()
  mocks.access.mockReset()
  mocks.execute.mockReset()
  props.onOpenChange.mockReset()
})

function toPreview() {
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.change(screen.getByLabelText('Other evidence reference'), {
    target: { value: 'review:ticket-123' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

describe('Admin action sheet', () => {
  it.each(['support', 'reviewer'])('does not offer a submit action to %s', (role) => {
    mocks.access.mockReturnValue({ kind: 'allowed', role })
    render(<AdminActionSheet {...props} />)
    expect(screen.queryByRole('button', { name: 'Submit command' })).toBeNull()
    expect(screen.getByText('Your account does not have the Admin role for this action.')).toBeTruthy()
  })

  it('keeps evidence and the operation key through MFA recovery, without submitting a proposal', async () => {
    mocks.access.mockReturnValue({ kind: 'allowed', actorRef: 'actor:test', role: 'owner_admin' })
    mocks.execute.mockResolvedValueOnce({ kind: 'refused', action: props.action, code: 'mfa_reverification_required', correlationId: 'correlation:1' })
      .mockResolvedValueOnce({ kind: 'completed', action: props.action, code: 'source_authority_verified', effectRefs: [], auditEventRef: 'audit:1', correlationId: 'correlation:1' })
    render(<AdminActionSheet {...props} />)
    toPreview()
    fireEvent.click(screen.getByRole('button', { name: 'Submit command' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(2))
    expect(mocks.execute.mock.calls[1]?.[0].operationKey).toBe(mocks.execute.mock.calls[0]?.[0].operationKey)
    expect(mocks.execute.mock.calls[1]?.[0].evidenceRefs).toEqual(['review:ticket-123'])
    expect(screen.queryByRole('button', { name: 'Propose instead' })).toBeNull()
  })

  it('shows MFA guidance only after the server refuses, preserving the command', async () => {
    mocks.access.mockReturnValue({ kind: 'allowed', actorRef: 'actor:test', role: 'owner_admin' })
    mocks.execute.mockResolvedValue({ kind: 'refused', action: props.action, code: 'mfa_reverification_required', correlationId: 'correlation:1' })
    render(<AdminActionSheet {...props} />)
    toPreview()
    expect(screen.queryByRole('link', { name: 'Account security' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Submit command' }).hasAttribute('disabled')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Submit command' }))
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Account security' }).getAttribute('href')).toBe('/owner/settings/account/security')
    expect(screen.queryByRole('button', { name: 'Propose instead' })).toBeNull()
    expect(screen.getByLabelText<HTMLInputElement>('Other evidence reference').value).toBe('review:ticket-123')
  })

  it('renders a proposed receipt with the Perth expiry', async () => {
    mocks.access.mockReturnValue({ kind: 'allowed', actorRef: 'actor:test', role: 'owner_admin' })
    mocks.execute.mockResolvedValue({ kind: 'proposed', action: props.action, proposalRef: 'admin-proposal:1', expiresAt: 1_800_000_000_000, correlationId: 'correlation:1' })
    render(<AdminActionSheet {...props} />)
    toPreview()
    fireEvent.click(screen.getByRole('button', { name: 'Submit command' }))
    expect(await screen.findByText('Awaiting second approval')).toBeTruthy()
    expect(screen.getByText(/Perth time/u)).toBeTruthy()
  })

  it('offers proposal submission when a second approval is required', async () => {
    mocks.access.mockReturnValue({ kind: 'allowed', actorRef: 'actor:test', role: 'owner_admin' })
    mocks.execute.mockResolvedValueOnce({ kind: 'refused', action: props.action, code: 'approval_required', correlationId: 'correlation:1' })
      .mockResolvedValueOnce({ kind: 'proposed', action: props.action, proposalRef: 'admin-proposal:1', expiresAt: 1_800_000_000_000, correlationId: 'correlation:2' })
    render(<AdminActionSheet {...props} />)
    toPreview()
    fireEvent.click(screen.getByRole('button', { name: 'Submit command' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Propose instead' }))
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(2))
    expect(mocks.execute.mock.calls[1]?.[0].approval).toEqual({ kind: 'propose' })
    expect(mocks.execute.mock.calls[1]?.[0].operationKey).not.toBe(mocks.execute.mock.calls[0]?.[0].operationKey)
  })

  it('returns a cancelled MFA check to the unchanged preview and does not submit again', async () => {
    mocks.access.mockReturnValue({ kind: 'allowed', actorRef: 'actor:test', role: 'owner_admin' })
    mocks.execute.mockRejectedValueOnce(new ClerkRuntimeError('Verification cancelled', { code: 'reverification_cancelled' }))
      .mockResolvedValueOnce({ kind: 'completed', action: props.action, code: 'source_authority_verified', effectRefs: [], auditEventRef: 'audit:1', correlationId: 'correlation:1' })
    render(<AdminActionSheet {...props} />)
    toPreview()
    fireEvent.click(screen.getByRole('button', { name: 'Submit command' }))
    expect(await screen.findByText(/No change was made/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Submitting command…' })).toBeNull()
    expect(mocks.execute).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Submit command' }))
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(2))
    expect(mocks.execute.mock.calls[1]?.[0].operationKey).toBe(mocks.execute.mock.calls[0]?.[0].operationKey)
  })

  it('checks a pending grant using the same operation, payload and evidence', async () => {
    mocks.access.mockReturnValue({ kind: 'allowed', actorRef: 'actor:test', role: 'owner_admin' })
    mocks.execute.mockResolvedValueOnce({ kind: 'pending', action: 'grant_promotional_credit', effectRefs: ['grant:one'], auditEventRef: 'audit:pending', correlationId: 'correlation:1' })
      .mockImplementationOnce(async request => ({ kind: 'completed', action: 'grant_promotional_credit', code: 'promotional_credit_granted', effectRefs: ['grant:one'], auditEventRef: 'audit:booked', correlationId: request.correlationId }))
    render(<AdminActionSheet action="grant_promotional_credit"
      input={{ accountRef: 'account:one', environment: 'sandbox', amountUnits: '10000000', expiresAt: 2_000_000_000_000 }}
      targetRefs={[{ label: 'Workspace', value: 'account:one' }]} initialReasonCode="onboarding" open onOpenChange={() => undefined} />)
    toPreview()
    fireEvent.click(screen.getByRole('button', { name: 'Submit command' }))
    expect(await screen.findByText('Credit grant pending')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Check grant status' }))
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(2))
    expect(mocks.execute.mock.calls[1]?.[0]).toEqual(mocks.execute.mock.calls[0]?.[0])
    expect(screen.queryByText('Credit grant pending')).toBeNull()
  })

  it('leaves a stalled submission without starting a second command', async () => {
    mocks.access.mockReturnValue({ kind: 'allowed', actorRef: 'actor:test', role: 'owner_admin' })
    mocks.execute.mockReturnValue(new Promise(() => {}))
    render(<AdminActionSheet {...props} />)
    toPreview()
    fireEvent.click(screen.getByRole('button', { name: 'Submit command' }))
    expect(await screen.findByRole('button', { name: 'Submitting command…' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByText(/Command outcome could not be confirmed/)).toBeTruthy()
    const submit = screen.getByRole('button', { name: 'Submit command' })
    expect(submit.hasAttribute('disabled')).toBe(true)
    fireEvent.click(submit)
    expect(mocks.execute).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(props.onOpenChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Submit command' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Resume command' }))
    expect(screen.getByRole('button', { name: 'Submit command' }).hasAttribute('disabled')).toBe(true)
  })

  it('minimizes an unknown outcome and resumes the entire unchanged request', async () => {
    mocks.access.mockReturnValue({ kind: 'allowed', actorRef: 'actor:test', role: 'owner_admin' })
    mocks.execute.mockRejectedValueOnce(new Error('response lost'))
      .mockImplementationOnce(async request => ({ kind: 'completed', action: props.action, code: 'source_authority_verified', effectRefs: [], auditEventRef: 'audit:1', correlationId: request.correlationId }))
    const rendered = render(<AdminActionSheet {...props} />)
    toPreview()
    fireEvent.click(screen.getByRole('button', { name: 'Submit command' }))
    expect(await screen.findByText(/Command outcome could not be confirmed/)).toBeTruthy()
    rendered.rerender(<AdminActionSheet {...props} input={{ ...props.input, expectedRevision: 999 }} currentStateDigest="changed" />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(props.onOpenChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Submit command' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Resume command' }))
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Submit command' }))
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(2))
    expect(mocks.execute.mock.calls[1]?.[0]).toEqual(mocks.execute.mock.calls[0]?.[0])
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('receives a completed command while minimized and resumes its receipt without resubmission', async () => {
    mocks.access.mockReturnValue({ kind: 'allowed', actorRef: 'actor:test', role: 'owner_admin' })
    let finish: ((receipt: unknown) => void) | undefined
    mocks.execute.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    render(<AdminActionSheet {...props} />)
    toPreview()
    fireEvent.click(screen.getByRole('button', { name: 'Submit command' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(props.onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByText(/response pending/)).toBeTruthy()
    await act(async () => {
      if (finish === undefined) throw new Error('submission_not_started')
      finish({ kind: 'completed', action: props.action, code: 'source_authority_verified', effectRefs: [], auditEventRef: 'audit:1', correlationId: 'correlation:1' })
    })
    expect(screen.getByText(/receipt available/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Resume command' }))
    expect(screen.getByText('Completed: Source authority verified')).toBeTruthy()
    expect(mocks.execute).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
  })
  it('retains only identity before dispatch and restores an uncertain command entry after remount', async () => {
    mocks.access.mockReturnValue({ kind: 'allowed', actorRef: 'actor:test', role: 'owner_admin' })
    const scope = adminCommandRecoveryScope('actor:test')
    mocks.execute.mockImplementation((request) => {
      expect(readAdminCommandRecovery(scope)).toEqual([{ action: request.action, operationKey: request.operationKey, correlationId: request.correlationId }])
      return Promise.reject(new Error('acknowledgement lost'))
    })
    const rendered = render(<AdminActionSheet {...props} />)
    toPreview()
    fireEvent.click(screen.getByRole('button', { name: 'Submit command' }))
    await screen.findByText(/Command outcome could not be confirmed/)
    const original = mocks.execute.mock.calls[0]?.[0]
    rendered.unmount()
    expect(readAdminCommandRecovery(scope)).toEqual([{ action: original.action, operationKey: original.operationKey, correlationId: original.correlationId }])
    render(<AdminActionSheet {...props} />)
    toPreview()
    fireEvent.click(screen.getByRole('button', { name: 'Submit command' }))
    expect(await screen.findByText(/Check the previous command in Command recovery/)).toBeTruthy()
    expect(mocks.execute).toHaveBeenCalledOnce()
  })

  it('keeps an unobserved terminal acknowledgement in recovery when the submitting page unmounts', async () => {
    mocks.access.mockReturnValue({ kind: 'allowed', actorRef: 'actor:test', role: 'owner_admin' })
    let finish: ((receipt: unknown) => void) | undefined
    mocks.execute.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const rendered = render(<AdminActionSheet {...props} />)
    toPreview()
    fireEvent.click(screen.getByRole('button', { name: 'Submit command' }))
    const original = mocks.execute.mock.calls[0]?.[0]
    rendered.unmount()
    await act(async () => {
      if (finish === undefined) throw new Error('submission_not_started')
      finish({ kind: 'completed', action: props.action, code: 'source_authority_verified', effectRefs: [], auditEventRef: 'audit:1', correlationId: original.correlationId })
    })
    expect(readAdminCommandRecovery(adminCommandRecoveryScope('actor:test'))).toHaveLength(1)
  })

  it.each(['mfa_cancelled', 'authority_refused', 'mfa_refused', 'mismatched_terminal'] as const)('retains an earlier unknown request after a %s recheck until its terminal receipt', async (recheck) => {
    mocks.access.mockReturnValue({ kind: 'allowed', actorRef: 'actor:test', role: 'owner_admin' })
    mocks.execute.mockRejectedValueOnce(new Error('acknowledgement lost'))
    if (recheck === 'mfa_cancelled') mocks.execute.mockRejectedValueOnce(new ClerkRuntimeError('Verification cancelled', { code: 'reverification_cancelled' }))
    else if (recheck === 'mismatched_terminal') mocks.execute.mockImplementationOnce(async request => ({ kind: 'completed', action: request.action,
      code: 'source_authority_verified', effectRefs: [], auditEventRef: 'audit:other', correlationId: 'correlation:other' }))
    else mocks.execute.mockImplementationOnce(async request => ({ kind: 'refused', action: request.action,
      code: recheck === 'authority_refused' ? 'missing_membership' : 'mfa_reverification_required', correlationId: request.correlationId }))
    mocks.execute.mockImplementationOnce(async request => ({ kind: 'completed', action: request.action,
      code: 'source_authority_verified', effectRefs: [], auditEventRef: 'audit:original', correlationId: request.correlationId }))
    const hook = renderHook(() => useAdminActionSheet({ ...props, initialEvidenceRefs: ['review:ticket-123'] }))
    await act(async () => { await hook.result.current.submit() })
    const original = hook.result.current.submittedRequest
    await act(async () => { await hook.result.current.submit() })
    expect(hook.result.current.phase).toBe('preview')
    expect(hook.result.current.receipt).toBeNull()
    expect(hook.result.current.error).toMatch(/could not be confirmed/u)
    expect(hook.result.current.submittedRequest).toEqual(original)
    expect(readAdminCommandRecovery(adminCommandRecoveryScope('actor:test'))).toEqual([{
      action: original?.action, operationKey: original?.operationKey, correlationId: original?.correlationId,
    }])
    await act(async () => { hook.result.current.edit(); await hook.result.current.retry(true); await hook.result.current.submit({ kind: 'propose' }) })
    expect(mocks.execute).toHaveBeenCalledTimes(2)
    expect(hook.result.current.submittedRequest).toEqual(original)
    await act(async () => { await hook.result.current.submit() })
    expect(mocks.execute.mock.calls[2]?.[0]).toEqual(original)
    expect(hook.result.current.receipt?.kind).toBe('completed')
    expect(readAdminCommandRecovery(adminCommandRecoveryScope('actor:test'))).toEqual([])
  })

  it('guards navigation only when the unresolved recovery identity could not be persisted', async () => {
    mocks.access.mockReturnValue({ kind: 'allowed', actorRef: 'actor:test', role: 'owner_admin' })
    vi.spyOn(Object.getPrototypeOf(window.localStorage), 'setItem').mockImplementation(() => { throw new Error('storage unavailable') })
    mocks.execute.mockRejectedValue(new Error('acknowledgement lost'))
    const hook = renderHook(() => useAdminActionSheet({ ...props, initialEvidenceRefs: ['review:ticket-123'] }))
    await act(async () => { await hook.result.current.submit() })
    expect(hook.result.current.durableRecovery).toBe(false)
    expect(hook.result.current.navigationRisk).toBe(true)
    expect(hook.result.current.submittedRequest?.input).toEqual(props.input)
  })

  it('hides but retains unresolved terms through access loss and clears visible state for a different actor', async () => {
    mocks.access.mockReturnValue({ kind: 'allowed', actorRef: 'actor:test', role: 'owner_admin' })
    mocks.execute.mockRejectedValue(new Error('acknowledgement lost'))
    const hook = renderHook(() => useAdminActionSheet({ ...props, initialEvidenceRefs: ['review:ticket-123'] }))
    await act(async () => { await hook.result.current.submit() })
    const original = hook.result.current.submittedRequest
    expect(original).not.toBeNull()
    act(() => { mocks.access.mockReturnValue({ kind: 'refused', code: 'missing_membership' }); hook.rerender() })
    expect(hook.result.current.submittedRequest).toBeNull()
    expect(readAdminCommandRecovery(adminCommandRecoveryScope('actor:test'))).toHaveLength(1)
    act(() => { mocks.access.mockReturnValue({ kind: 'allowed', actorRef: 'actor:test', role: 'owner_admin' }); hook.rerender() })
    expect(hook.result.current.submittedRequest).toEqual(original)
    act(() => { mocks.access.mockReturnValue({ kind: 'allowed', actorRef: 'actor:other', role: 'owner_admin' }); hook.rerender() })
    expect(hook.result.current.submittedRequest).toBeNull()
    expect(readAdminCommandRecovery(adminCommandRecoveryScope('actor:test'))).toHaveLength(1)
    expect(mocks.execute).toHaveBeenCalledOnce()
  })

})
