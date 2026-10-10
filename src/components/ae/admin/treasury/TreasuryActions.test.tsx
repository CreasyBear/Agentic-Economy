/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { treasuryTestView } from './treasury-test-fixture'
const mocks = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('../actions/useAdminCommandProof', () => ({ useAdminCommandProof: () => mocks.execute }))
import { TreasuryActions } from './TreasuryActions'

afterEach(() => { cleanup(); mocks.execute.mockReset() })
describe('reviewing changed treasury controls', () => {
  it('shows fresh current amounts alongside the retained draft before accepting a new digest', async () => {
    mocks.execute.mockResolvedValue({ kind: 'refused', action: 'change_treasury_thresholds', code: 'target_changed', correlationId: 'correlation:test' })
    const view = treasuryTestView()
    const { rerender } = render(<TreasuryActions view={view} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit thresholds' }))
    expect(screen.getByText('3 days of runway')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Low-water mark (USDC)'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Target float (USDC)'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save fixed thresholds' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review current settings' })).toBeTruthy())
    rerender(<TreasuryActions view={{ ...view, controls: { ...view.controls,
      settingsStateDigest: 'settings:2', thresholds: { kind: 'fixed', lowWaterUnits: '20000000', targetFloatUnits: '30000000' } } }} />)
    expect(screen.getByText('20.00 USDC')).toBeTruthy()
    expect(screen.getByText('30.00 USDC')).toBeTruthy()
    expect((screen.getByLabelText('Low-water mark (USDC)') as HTMLInputElement).value).toBe('1')
    expect((screen.getByLabelText('Target float (USDC)') as HTMLInputElement).value).toBe('2')
    fireEvent.click(screen.getByRole('button', { name: 'Review current settings' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save fixed thresholds' }))
    await waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(2))
    expect(mocks.execute.mock.calls[1]![0]).toMatchObject({ expectedStateDigest: 'settings:2', input: { lowWaterUnits: '1000000', targetFloatUnits: '2000000' } })
    expect(mocks.execute.mock.calls[1]![0].operationKey).not.toBe(mocks.execute.mock.calls[0]![0].operationKey)
  })
  it('offers an inline new proposal after another owner makes resume approval mandatory', async () => {
    mocks.execute.mockResolvedValueOnce({ kind: 'refused', action: 'set_payments_paused', code: 'approval_required', correlationId: 'correlation:test' })
      .mockResolvedValueOnce({ kind: 'proposed', action: 'set_payments_paused', proposalRef: 'proposal:test', expiresAt: Date.now() + 1000, correlationId: 'correlation:test' })
    const view = treasuryTestView()
    view.controls.paymentsOpenTo = 'none'
    const { rerender } = render(<TreasuryActions view={view} />)
    fireEvent.click(screen.getByRole('button', { name: 'Resume payments' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Resume payments' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit proposal' })).toBeTruthy())
    const original = mocks.execute.mock.calls[0]![0]
    rerender(<TreasuryActions view={{ ...view, controls: { ...view.controls, launchStateDigest: 'launch:2', resumePaymentsOpenTo: 'everyone', resumeRequiresApproval: true } }} />)
    expect(screen.getByText('Restore new purchases for everyone.', { exact: false })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Submit proposal' }))
    await waitFor(() => expect(screen.getByText('Awaiting another Admin owner')).toBeTruthy())
    expect(mocks.execute.mock.calls[1]![0]).toMatchObject({ approval: { kind: 'propose' }, expectedStateDigest: 'launch:2', input: { paused: false } })
    expect(mocks.execute.mock.calls[1]![0].operationKey).not.toBe(original.operationKey)
    expect(screen.getByText('Payments remain paused until the proposal is approved.', { exact: false })).toBeTruthy()
  })
})
