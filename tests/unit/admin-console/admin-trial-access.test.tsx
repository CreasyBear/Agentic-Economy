/** @vitest-environment jsdom */
import type { ReactNode } from 'react'
import { getFunctionName, type FunctionReference, type FunctionReturnType } from 'convex/server'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../convex/_generated/api'
import '../../setup/jsdom-platform'

const mocks = vi.hoisted(() => ({ view: undefined as FunctionReturnType<typeof api.trialAccess.readAdmin> | undefined, execute: vi.fn() }))
vi.mock('convex/react', () => ({ useQuery: (query: FunctionReference<'query'>) =>
  getFunctionName(query) === 'trialAccess:readAdmin' ? mocks.view : { kind: 'allowed', role: 'owner_admin' } }))
vi.mock('@/components/ae/admin/actions/useAdminCommandProof', () => ({ useAdminCommandProof: () => mocks.execute }))
vi.mock('@/components/ae/layout/AeRecordSheet', () => ({ AeRecordSheet: ({ open, title, children, action }: {
  open: boolean; title: string; children: ReactNode; action: ReactNode
}) => open ? <section aria-label={title}>{children}{action}</section> : null }))

import { AdminTrialAccess } from '@/components/ae/admin/actions/AdminTrialAccess'

beforeEach(() => {
  mocks.view = { kind: 'ready', environment: 'production', offers: [] }
  mocks.execute.mockReset().mockResolvedValue({ kind: 'completed', action: 'issue_trial', code: 'trial_approved', effectRefs: ['trial:1'], auditEventRef: 'audit:1', correlationId: 'correlation:1' })
})
afterEach(cleanup)

function approveReview() {
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.change(screen.getByLabelText('Other evidence reference'), { target: { value: 'review:trial-approval' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(screen.getByRole('button', { name: 'Submit command' }))
}

describe('Admin trial actions', () => {
  it('reviews the fixed code, campaign cap and expiry through the original guarded approval', async () => {
    render(<AdminTrialAccess />)
    fireEvent.click(screen.getByRole('button', { name: 'Review COLOSSEUM code' }))
    expect(screen.getByText(/COLOSSEUM: up to 10 Accounts/)).toBeTruthy()
    expect(mocks.execute).not.toHaveBeenCalled()
    approveReview()
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(1))
    expect(mocks.execute.mock.calls[0]?.[0]).toMatchObject({ action: 'issue_trial', input: { environment: 'production',
      recipient: { kind: 'code', code: 'COLOSSEUM', maxClaims: 10, claimBy: Date.UTC(2026, 10, 30, 16) } } })
  })
  it('reviews normalized email and fixed terms before submitting through the existing guarded command', async () => {
    render(<AdminTrialAccess />)
    fireEvent.change(screen.getByLabelText('Recipient email'), { target: { value: 'Buyer@Example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review trial invitation' }))
    expect(mocks.execute).not.toHaveBeenCalled()
    approveReview()
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(1))
    expect(mocks.execute.mock.calls[0]?.[0]).toMatchObject({ action: 'issue_trial', input: { environment: 'production', recipient: { kind: 'email', email: 'buyer@example.com' } },
      reasonCode: 'onboarding', evidenceRefs: ['review:trial-approval'] })
    expect(Object.keys(mocks.execute.mock.calls[0]?.[0].input ?? {}).sort()).toEqual(['environment', 'recipient'])
    expect(await screen.findByText(/Trial approved\. Check invitation delivery/)).toBeTruthy()
  })

  it('grants an existing Account using the same fixed trial command without an email', async () => {
    render(<AdminTrialAccess accountRef="acc_buyer" />)
    expect(screen.queryByLabelText('Recipient email')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Review A$10 trial grant' }))
    approveReview()
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(1))
    expect(mocks.execute.mock.calls[0]?.[0].input).toEqual({ environment: 'production', recipient: { kind: 'account', accountRef: 'acc_buyer' } })
  })

  it('shows pending confirmation and does not offer a second Account grant', () => {
    mocks.view = { kind: 'ready', environment: 'production', offers: [{ offerRef: 'trial:1', recipient: { kind: 'account', accountRef: 'acc_buyer' },
      activation: { kind: 'granted', accountRef: 'acc_buyer', ownerPrincipalRef: 'prn_buyer', grantRef: 'grant:1', activatedAt: 1, expiresAt: 2 },
      delivery: { kind: 'not_required' }, booking: 'pending', createdAt: 1 }] }
    render(<AdminTrialAccess accountRef="acc_buyer" />)
    expect(screen.getByText(/Credit confirmation pending/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Review A$10 trial grant' })).toBeNull()
  })

  it('does not expose invitations or recipients when Admin access is refused', () => {
    mocks.view = { kind: 'refused' }
    render(<AdminTrialAccess />)
    expect(screen.queryByLabelText('Recipient email')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
