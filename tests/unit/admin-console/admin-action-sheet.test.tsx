/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  overview: vi.fn(),
  execute: vi.fn(),
  query: vi.fn(),
}))
vi.mock('convex/react', () => ({ useQuery: (query: unknown) => mocks.query(query) }))
vi.mock('@/components/ae/admin/actions/useAdminCommandProof', () => ({
  useAdminCommandProof: () => mocks.execute,
}))
vi.mock('@/components/ae/layout/AeRecordSheet', () => ({
  AeRecordSheet: ({ open, title, children, action }: { open: boolean; title: string; children: ReactNode; action: ReactNode }) =>
    open ? <section aria-label={title}>{children}{action}</section> : null,
}))

import { AdminActionSheet } from '@/components/ae/admin/actions/AdminActionSheet'
let queryIndex = 0
mocks.query.mockImplementation(() =>
  ++queryIndex % 2 === 0 ? mocks.overview() : mocks.access())

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
  mocks.access.mockReset()
  mocks.execute.mockReset()
  mocks.overview.mockReset()
  queryIndex = 0
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
    mocks.access.mockReturnValue({ kind: 'allowed', role: 'owner_admin' })
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

  it('warns that FVA is absent while keeping submit enabled and preserving the MFA refusal', async () => {
    mocks.access.mockReturnValue({ kind: 'allowed', role: 'owner_admin' })
    mocks.overview.mockReturnValue({ convex: 'ok', clerkFva: 'absent', x402Custody: 'not_configured' })
    mocks.execute.mockResolvedValue({ kind: 'refused', action: props.action, code: 'mfa_reverification_required', correlationId: 'correlation:1' })
    render(<AdminActionSheet {...props} />)
    toPreview()
    expect(screen.getByRole('link', { name: 'Account security' }).getAttribute('href')).toBe('/owner/settings/account/security')
    expect(screen.getByRole('button', { name: 'Submit command' }).hasAttribute('disabled')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Submit command' }))
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Propose instead' })).toBeNull()
    expect(screen.getByLabelText<HTMLInputElement>('Other evidence reference').value).toBe('review:ticket-123')
  })

  it('renders a proposed receipt with the Perth expiry', async () => {
    mocks.access.mockReturnValue({ kind: 'allowed', role: 'owner_admin' })
    mocks.execute.mockResolvedValue({ kind: 'proposed', action: props.action, proposalRef: 'admin-proposal:1', expiresAt: 1_800_000_000_000, correlationId: 'correlation:1' })
    render(<AdminActionSheet {...props} />)
    toPreview()
    fireEvent.click(screen.getByRole('button', { name: 'Submit command' }))
    expect(await screen.findByText('Awaiting second approval')).toBeTruthy()
    expect(screen.getByText(/Perth time/u)).toBeTruthy()
  })

  it('offers proposal submission when a second approval is required', async () => {
    mocks.access.mockReturnValue({ kind: 'allowed', role: 'owner_admin' })
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
    mocks.access.mockReturnValue({ kind: 'allowed', role: 'owner_admin' })
    mocks.execute.mockRejectedValueOnce({ clerkRuntimeError: true, code: 'reverification_cancelled' })
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
    mocks.access.mockReturnValue({ kind: 'allowed', role: 'owner_admin' })
    mocks.execute.mockResolvedValueOnce({ kind: 'pending', action: 'grant_promotional_credit', effectRefs: ['grant:one'], auditEventRef: 'audit:pending', correlationId: 'correlation:1' })
      .mockResolvedValueOnce({ kind: 'completed', action: 'grant_promotional_credit', code: 'promotional_credit_granted', effectRefs: ['grant:one'], auditEventRef: 'audit:booked', correlationId: 'correlation:1' })
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
    mocks.access.mockReturnValue({ kind: 'allowed', role: 'owner_admin' })
    mocks.execute.mockReturnValue(new Promise(() => {}))
    render(<AdminActionSheet {...props} />)
    toPreview()
    fireEvent.click(screen.getByRole('button', { name: 'Submit command' }))
    expect(await screen.findByRole('button', { name: 'Submitting command…' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByText(/No change was made/)).toBeTruthy()
    const submit = screen.getByRole('button', { name: 'Submit command' })
    expect(submit.hasAttribute('disabled')).toBe(true)
    fireEvent.click(submit)
    expect(mocks.execute).toHaveBeenCalledTimes(1)
  })
})
