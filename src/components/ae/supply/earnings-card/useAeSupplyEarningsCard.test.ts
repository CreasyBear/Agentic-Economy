// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { toast } from '@/lib/ui/toast'
import { isReverificationCancelledError } from '@clerk/tanstack-react-start/errors'

import { useAeSupplyEarningsCard } from './useAeSupplyEarningsCard'

const moneyServerMocks = vi.hoisted(() => ({
  beginOwnerPayoutTransferServer: vi.fn(),
  createOwnerConnectAccountServer: vi.fn(),
  createOwnerExpressLoginLinkServer: vi.fn(),
  createOwnerOnboardingLinkServer: vi.fn(),
  readOwnerPayoutTransferServer: vi.fn(),
}))

vi.mock('@/modules/money/money.functions', () => moneyServerMocks)
vi.mock('@clerk/tanstack-react-start', () => ({
  useReverification: <T extends (...args: never[]) => unknown>(callback: T) => callback,
}))
vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-start')>()),
  useServerFn: <T extends (...args: never[]) => unknown>(callback: T) => callback,
}))
vi.mock('@/lib/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))
vi.mock('@clerk/tanstack-react-start/errors', () => ({
  isReverificationCancelledError: vi.fn(),
}))

const exact = { currency: 'USD', units: '5000', exponent: 2 }

const account = {
  currency: 'USD',
  earnings: {
    kind: 'ok' as const,
    businessId: 'business-1',
    grossAccrual: exact,
    rake: { ...exact, units: '50' },
    providerNet: exact,
    paidOut: { ...exact, units: '0' },
    held: exact,
    recoveryDue: { ...exact, units: '0' },
    truncated: false,
    evidence: 'source' as const,
  },
  payout: {
    kind: 'ok' as const,
    businessId: 'business-1',
    accountState: 'ready' as const,
    payoutState: 'held_threshold' as const,
    payoutRef: 'payout-1',
    payoutRevision: 3,
    accountVersion: 4,
    idempotencyKey: 'idem-1',
    providerNet: exact,
    minimumPayout: { ...exact, units: '1000' },
    evidence: 'source' as const,
    stripeAccountId: 'acct_1234567890',
  },
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('useAeSupplyEarningsCard', () => {
  it('assigns onboarding URL on connect ok with URL', async () => {
    const assign = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign, reload: vi.fn() },
    })
    moneyServerMocks.createOwnerConnectAccountServer.mockResolvedValue({
      kind: 'ok',
      onboardingUrl: 'https://stripe.test/onboard',
    })
    const { result } = renderHook(() =>
      useAeSupplyEarningsCard({ account: account as never, businessId: 'business-1' }),
    )
    act(() => {
      result.current.setConfirmAction('connect')
    })
    await act(async () => {
      await result.current.confirmPayoutAuthority()
    })
    expect(assign).toHaveBeenCalledWith('https://stripe.test/onboard')
  })

  it('calls onStatusRefreshed when connect ok without URL', async () => {
    const onStatusRefreshed = vi.fn()
    moneyServerMocks.createOwnerConnectAccountServer.mockResolvedValue({ kind: 'ok' })
    const { result } = renderHook(() =>
      useAeSupplyEarningsCard({
        account: account as never,
        businessId: 'business-1',
        onStatusRefreshed,
      }),
    )
    act(() => {
      result.current.setConfirmAction('connect')
    })
    await act(async () => {
      await result.current.confirmPayoutAuthority()
    })
    expect(onStatusRefreshed).toHaveBeenCalled()
  })

  it('reloads on transfer success without onStatusRefreshed', async () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign: vi.fn(), reload },
    })
    moneyServerMocks.beginOwnerPayoutTransferServer.mockResolvedValue({
      kind: 'ok',
      transfer: { state: 'transfer_pending' },
    })
    const { result } = renderHook(() =>
      useAeSupplyEarningsCard({ account: account as never, businessId: 'business-1' }),
    )
    act(() => {
      result.current.setConfirmAction('transfer')
    })
    await act(async () => {
      await result.current.confirmPayoutAuthority()
    })
    expect(reload).toHaveBeenCalled()
  })

  it('stays silent on reverification cancel during payout', async () => {
    vi.mocked(isReverificationCancelledError).mockReturnValue(true)
    moneyServerMocks.beginOwnerPayoutTransferServer.mockRejectedValue(new Error('cancel'))
    const { result } = renderHook(() =>
      useAeSupplyEarningsCard({ account: account as never, businessId: 'business-1' }),
    )
    act(() => {
      result.current.setConfirmAction('transfer')
    })
    await act(async () => {
      await result.current.confirmPayoutAuthority()
    })
    expect(result.current.status.message).toBeUndefined()
    expect(result.current.status.diagnosticError).toBeUndefined()
    expect(result.current.busy).toBeUndefined()
  })

  it('maps actionMessage refusal on connect failure', async () => {
    moneyServerMocks.createOwnerConnectAccountServer.mockResolvedValue({
      kind: 'error',
      code: 'billing_identity_missing',
    })
    const { result } = renderHook(() =>
      useAeSupplyEarningsCard({ account: account as never, businessId: 'business-1' }),
    )
    act(() => {
      result.current.setConfirmAction('connect')
    })
    await act(async () => {
      await result.current.confirmPayoutAuthority()
    })
    expect(result.current.status.message).toContain('Sign in again')
  })

  it('toasts on express login failure', async () => {
    moneyServerMocks.createOwnerExpressLoginLinkServer.mockResolvedValue({
      kind: 'error',
      code: 'stripe_setup_required',
    })
    const { result } = renderHook(() =>
      useAeSupplyEarningsCard({ account: account as never, businessId: 'business-1' }),
    )
    await act(async () => {
      await result.current.openExpressDashboard()
    })
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
  })

  it('registers focus and visibility listeners', () => {
    const addWindow = vi.spyOn(window, 'addEventListener')
    const addDocument = vi.spyOn(document, 'addEventListener')
    const { unmount } = renderHook(() =>
      useAeSupplyEarningsCard({ account: account as never, businessId: 'business-1' }),
    )
    expect(addWindow).toHaveBeenCalledWith('focus', expect.any(Function))
    expect(addDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    unmount()
  })
})
