/** @vitest-environment jsdom */
import type { ReactNode } from 'react'
import type { FunctionReturnType } from 'convex/server'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../../convex/_generated/api'
import '../../setup/jsdom-platform'

const mocks = vi.hoisted(() => ({ signedIn: true, current: undefined as FunctionReturnType<typeof api.trialAccess.readCurrent> | undefined, claim: vi.fn() }))
vi.mock('convex/react', () => ({ useQuery: () => mocks.current }))
vi.mock('@clerk/tanstack-react-start', () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: mocks.signedIn }) }))
vi.mock('@/components/ae/trial/claimTrial.functions', () => ({ claimTrialServer: (args: unknown) => mocks.claim(args) }))
vi.mock('@tanstack/react-router', () => ({ Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>, useRouter: () => ({ routesByPath: {} }), useLocation: () => ({ pathname: '/trial' }) }))

import { AeTrialPage } from '@/components/ae/trial/AeTrialPage'

beforeEach(() => { mocks.signedIn = true; mocks.current = undefined; mocks.claim.mockReset() })
afterEach(cleanup)

describe('trial activation page', () => {
  it('keeps the activation destination across signup/signin and never claims while signed out', () => {
    mocks.signedIn = false
    render(<AeTrialPage />)
    expect(screen.getByRole('link', { name: 'Create an Account' }).getAttribute('href')).toBe('/sign-up?redirect=%2Ftrial')
    expect(screen.getByRole('link', { name: 'Sign in to activate' }).getAttribute('href')).toBe('/sign-in?redirect=%2Ftrial')
    expect(screen.queryByRole('button', { name: 'Activate approved trial' })).toBeNull()
    expect(mocks.claim).not.toHaveBeenCalled()
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })

  it('claims without client identity or money arguments and distinguishes no approval from a zero balance', async () => {
    mocks.claim.mockResolvedValue({ kind: 'refused', code: 'trial_not_approved' })
    render(<AeTrialPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Activate approved trial' }))
    expect(await screen.findByText(/Signup does not include automatic credit/)).toBeTruthy()
    expect(mocks.claim).toHaveBeenCalledExactlyOnceWith({ data: {} })
  })

  it('preserves pending activation and shows the confirmed result when the live credit record updates', async () => {
    const pending = { kind: 'granted' as const, grantRef: 'grant:1', accountRef: 'acc_1', expiresAt: 1_900_000_000_000, booking: 'pending' as const }
    mocks.claim.mockResolvedValue(pending)
    const view = render(<AeTrialPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Activate approved trial' }))
    expect(await screen.findByText('Confirming your trial credit')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Check credit status' })).toBeTruthy()
    mocks.current = { ...pending, booking: 'booked' }
    view.rerender(<AeTrialPage />)
    expect(screen.getByText('Trial credit granted')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Check credit status' })).toBeNull()
    expect(mocks.claim).toHaveBeenCalledTimes(1)
  })

  it('keeps the claim result ahead of its stale query, then respects a later authority refusal', async () => {
    mocks.current = { kind: 'refused', code: 'trial_not_approved' }
    mocks.claim.mockResolvedValue({ kind: 'granted', grantRef: 'grant:1', accountRef: 'acc_1',
      expiresAt: 1_900_000_000_000, booking: 'booked' })
    const view = render(<AeTrialPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Check trial status' }))
    expect(await screen.findByText('Trial credit granted')).toBeTruthy()
    mocks.current = { kind: 'refused', code: 'trial_authority_invalid' }
    view.rerender(<AeTrialPage />)
    expect(screen.getByText(/trial approval could not be verified/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Contact private support' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Activate approved trial' })).toBeNull()
  })

  it('preserves the actionable claim refusal when the query only reports no approved offer', async () => {
    mocks.current = { kind: 'refused', code: 'trial_not_approved' }
    mocks.claim.mockResolvedValue({ kind: 'refused', code: 'verified_email_required' })
    const view = render(<AeTrialPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Check trial status' }))
    expect(await screen.findByText(/Verify your primary email/)).toBeTruthy()
    mocks.current = { kind: 'refused', code: 'trial_not_approved' }
    view.rerender(<AeTrialPage />)
    expect(screen.getByText(/Verify your primary email/)).toBeTruthy()
  })

  it('shows a new claim refusal while the live query still holds its earlier pending grant', async () => {
    mocks.current = { kind: 'granted', grantRef: 'grant:1', accountRef: 'acc_1',
      expiresAt: 1_900_000_000_000, booking: 'pending' }
    mocks.claim.mockResolvedValue({ kind: 'refused', code: 'trial_authority_invalid' })
    render(<AeTrialPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Check credit status' }))
    expect(await screen.findByText(/trial approval could not be verified/)).toBeTruthy()
    // The pending banner clears on a later commit than the refusal text; wait rather than assert once.
    await waitFor(() => expect(screen.queryByText('Confirming your trial credit')).toBeNull())
  })

  it('keeps a completed refusal ahead of a grant query received while the claim was pending', async () => {
    const pending = { kind: 'granted' as const, grantRef: 'grant:1', accountRef: 'acc_1',
      expiresAt: 1_900_000_000_000, booking: 'pending' as const }
    mocks.current = pending
    let finishClaim!: (result: FunctionReturnType<typeof api.trialAccess.readCurrent>) => void
    mocks.claim.mockReturnValue(new Promise(resolve => { finishClaim = resolve }))
    const view = render(<AeTrialPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Check credit status' }))
    mocks.current = { ...pending, booking: 'booked' }
    view.rerender(<AeTrialPage />)
    await act(async () => { finishClaim({ kind: 'refused', code: 'trial_authority_invalid' }) })
    expect(screen.getByText(/trial approval could not be verified/)).toBeTruthy()
    expect(screen.queryByText('Trial credit granted')).toBeNull()
    mocks.current = { ...pending, booking: 'booked' }
    view.rerender(<AeTrialPage />)
    expect(screen.getByText('Trial credit granted')).toBeTruthy()
  })

  it('recovers an unknown response through the same argument-free claim', async () => {
    mocks.claim.mockRejectedValueOnce(new Error('connection lost')).mockResolvedValueOnce({ kind: 'refused', code: 'verified_email_required' })
    render(<AeTrialPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Activate approved trial' }))
    expect(await screen.findByText('Activation could not be confirmed')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Activate approved trial' }))
    await waitFor(() => expect(mocks.claim).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(/Verify your primary email/)).toBeTruthy()
    expect(mocks.claim.mock.calls.map(call => call[0])).toEqual([{ data: {} }, { data: {} }])
  })
})
