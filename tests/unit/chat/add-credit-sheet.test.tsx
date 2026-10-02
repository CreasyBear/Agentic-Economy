/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreditPaymentSession } from '@/modules/money/public'
import type { AccountFundingBalance, AccountFundingConstraints, AccountFundingStartResult } from '@/modules/money/server'
import { AddCreditSheet } from '@/components/ae/chat/add-credit/AddCreditSheet'
import { useAddCredit } from '@/components/ae/chat/add-credit/useAddCredit'

const source = vi.hoisted(() => ({
  userId: 'user:credit' as string | null,
  balance: vi.fn(), constraints: vi.fn(), begin: vi.fn(), read: vi.fn(), capture: vi.fn(),
}))
vi.mock('@clerk/tanstack-react-start', () => ({ useAuth: () => ({ userId: source.userId }) }))
vi.mock('@tanstack/react-start', async importOriginal => ({
  ...await importOriginal<typeof import('@tanstack/react-start')>(),
  useServerFn: (fn: unknown) => fn,
}))
vi.mock('@/modules/money/money.functions', () => ({
  readAccountFundingBalanceServer: source.balance,
  readAccountFundingConstraintsServer: source.constraints,
  beginAccountFundingServer: source.begin,
  readAccountFundingServer: source.read,
}))
vi.mock('@/lib/observability/capture-client-exception', () => ({ captureClientExceptionOnClient: source.capture }))

const available: Extract<AccountFundingBalance, { kind: 'available' }> = {
  kind: 'available', accountRef: 'account:credit', locked: false, version: 1,
  balance: { currency: 'AUD', units: '0', exponent: 6 },
  promotionalBalance: { currency: 'AUD', units: '5000000', exponent: 6 },
  totalBalance: { currency: 'AUD', units: '5000000', exponent: 6 },
  nextPromotionalExpiryAt: Date.UTC(2030, 0, 1),
}
const constraints: Extract<AccountFundingConstraints, { kind: 'available' }> = {
  kind: 'available', environment: 'sandbox', currency: 'AUD', exponent: 6,
  minimumPrincipalUnits: '5000000', maximumPrincipalUnits: '20000000', incrementUnits: '5000000',
  serviceFeeBps: 500, taxOnServiceFeeBps: 1000, legalCustomerMaximumAccessibleUnits: '100000000',
  policyDigest: 'a'.repeat(64),
}
const unavailable: AccountFundingConstraints = { kind: 'refused', code: 'stripe_setup_required', retryable: false }
const unknown: AccountFundingStartResult = {
  kind: 'outcome_unknown', code: 'funding_outcome_unknown', retryable: false,
  commandRef: 'funding:credit', status: 'outcome_unknown',
}
const settled: CreditPaymentSession = {
  kind: 'hosted_redirect', expiresAt: Date.UTC(2030, 0, 1),
  evidence: {
    provider: 'stripe', externalRef: 'checkout:credit', status: 'succeeded',
    amount: { currency: 'AUD', units: '5275000', exponent: 6 },
    requestDigest: 'a'.repeat(64), metadataDigest: 'b'.repeat(64), checkoutSessionDigest: 'c'.repeat(64),
    evidenceDigest: 'd'.repeat(64), evidenceRef: 'stripe:credit', observedAt: 1_800_000_000_000,
  },
}
const onFunded = vi.fn()
const onOpenChange = vi.fn()
const onEnablePaying = vi.fn()
const props = { open: true, signedIn: true, payingOn: true, enableBusy: false, onEnablePaying, onFunded, onOpenChange }

function pending<T>() {
  let resolve: (value: T) => void = () => { throw new Error('test_promise_not_initialized') }
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function checkoutTab() {
  const close = vi.fn()
  const replace = vi.fn()
  // Only the external window fields actually used by the hook are projected.
  const tab = { opener: null, close, location: { replace } } as unknown as Window
  const open = vi.spyOn(window, 'open').mockReturnValue(tab)
  return { close, replace, open }
}
function expectNoCheckout() {
  expect(screen.queryByRole('group', { name: 'Choose an amount' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^Add A\$/ })).not.toBeInTheDocument()
  expect(screen.queryByText(/Card or Apple Pay via Stripe/)).not.toBeInTheDocument()
}

beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
  source.userId = 'user:credit'
  source.balance.mockReset().mockResolvedValue(available)
  source.constraints.mockReset().mockResolvedValue(constraints)
  source.begin.mockReset().mockResolvedValue(unknown)
  source.read.mockReset().mockResolvedValue({ ...settled, evidence: { ...settled.evidence, status: 'pending' } })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('source-bound Add credit availability', () => {
  it('does not advertise or open checkout before funding constraints are known', async () => {
    const deferred = pending<AccountFundingConstraints>()
    source.constraints.mockReturnValue(deferred.promise)
    const popup = checkoutTab()
    render(<AddCreditSheet {...props} />)
    expect(screen.getByText('Checking card funding availability…')).toBeInTheDocument()
    expectNoCheckout()
    expect(popup.open).not.toHaveBeenCalled()
    await act(async () => { deferred.resolve(unavailable) })
    expect(screen.getByText(/Card funding is unavailable/)).toBeInTheDocument()
    expectNoCheckout()
  })

  it('displays real promo balance and expiry without Stripe when card funding refuses', async () => {
    source.constraints.mockResolvedValue(unavailable)
    const popup = checkoutTab()
    render(<AddCreditSheet {...props} />)
    expect(await screen.findByText('Available balance: A$5.00')).toBeInTheDocument()
    expect(screen.getByText('Purchased credit: A$0.00')).toBeInTheDocument()
    expect(screen.getByText('Promotional credit: A$5.00')).toBeInTheDocument()
    expect(screen.getByText(/Next promotional expiry:.*2030.*UTC/)).toBeInTheDocument()
    expectNoCheckout()
    expect(screen.getByRole('link', { name: /Get help/ })).toHaveAttribute('href', '/support')
    expect(popup.open).not.toHaveBeenCalled()
    expect(source.begin).not.toHaveBeenCalled()
  })

  it('retains successful balance facts when the independent constraints source throws', async () => {
    source.constraints.mockRejectedValue(new Error('provider_unavailable'))
    render(<AddCreditSheet {...props} />)
    expect(await screen.findByText('Promotional credit: A$5.00')).toBeInTheDocument()
    expect(screen.getByText(/could not confirm card funding availability/)).toBeInTheDocument()
    expectNoCheckout()
  })

  it('does not invent a zero balance when the balance source refuses', async () => {
    source.balance.mockResolvedValue({ kind: 'refused', code: 'billing_identity_missing', retryable: false })
    render(<AddCreditSheet {...props} />)
    await waitFor(() => expect(screen.queryByText('Checking card funding availability…')).not.toBeInTheDocument())
    expect(screen.queryByText(/Available balance:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Promotional credit:/)).not.toBeInTheDocument()
    expectNoCheckout()
  })

  it('also refuses direct begin calls without available constraints', async () => {
    source.constraints.mockResolvedValue(unavailable)
    const popup = checkoutTab()
    const hook = renderHook(() => useAddCredit(true, onFunded))
    await waitFor(() => expect(hook.result.current.busy).toBe(false))
    await act(async () => { await hook.result.current.begin() })
    expect(popup.open).not.toHaveBeenCalled()
    expect(source.begin).not.toHaveBeenCalled()
  })

  it('rechecks before funding and removes checkout after a fresh refusal', async () => {
    source.constraints.mockResolvedValueOnce(constraints).mockResolvedValue(unavailable)
    const popup = checkoutTab()
    render(<AddCreditSheet {...props} />)
    const begin = await screen.findByRole('button', { name: 'Add A$5' })
    fireEvent.click(begin)
    await waitFor(() => expect(popup.close).toHaveBeenCalledOnce())
    expect(source.begin).not.toHaveBeenCalled()
    expectNoCheckout()
  })

  it('cannot publish old owner constraints or start funding after an owner change during recheck', async () => {
    const deferred = pending<AccountFundingConstraints>()
    source.constraints.mockResolvedValueOnce(constraints).mockReturnValueOnce(deferred.promise).mockResolvedValue(unavailable)
    const popup = checkoutTab()
    const sheet = render(<AddCreditSheet {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add A$5' }))
    source.userId = 'user:other'
    source.balance.mockResolvedValue({ ...available, accountRef: 'account:other' })
    sheet.rerender(<AddCreditSheet {...props} />)
    expectNoCheckout()
    await act(async () => { deferred.resolve(constraints) })
    expect(popup.close).toHaveBeenCalledOnce()
    expect(source.begin).not.toHaveBeenCalled()
    expectNoCheckout()
  })

  it('refuses a changed canonical account even with the same signed-in user', async () => {
    source.balance.mockResolvedValueOnce(available).mockResolvedValue({ ...available, accountRef: 'account:changed' })
    const popup = checkoutTab()
    render(<AddCreditSheet {...props} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add A$5' }))
    expect(await screen.findByText(/Your account changed/)).toBeInTheDocument()
    expect(source.begin).not.toHaveBeenCalled()
    expect(popup.close).toHaveBeenCalledOnce()
    expectNoCheckout()
  })

  it('preserves an unknown attempt and automatically retries nonfinal reads while card funding becomes unavailable', async () => {
    source.read.mockResolvedValue({ kind: 'refused', code: 'funding_pending', retryable: true })
    const popup = checkoutTab()
    const sheet = render(<AddCreditSheet {...props} />)
    const button = await screen.findByRole('button', { name: 'Add A$5' })
    vi.useFakeTimers()
    fireEvent.click(button)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    const key = window.sessionStorage.getItem('ae.account-funding.attempt.user:credit')
    expect(key).toBeTruthy()
    expect(source.begin).toHaveBeenCalledWith({ data: {
      amount: { currency: 'AUD', units: '5000000', exponent: 6 }, expectedPolicyDigest: constraints.policyDigest, idempotencyKey: key,
    } })
    expect(popup.close).toHaveBeenCalledOnce()
    source.constraints.mockResolvedValue(unavailable)
    sheet.rerender(<AddCreditSheet {...props} open={false} />)
    sheet.rerender(<AddCreditSheet {...props} />)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expectNoCheckout()
    expect(screen.getByText(/checking your payment and balance.*confirm your credit/)).toBeInTheDocument()
    // A promotional change is not proof that the card top-up settled.
    source.balance.mockResolvedValue({ ...available, totalBalance: { currency: 'AUD', units: '6000000', exponent: 6 } })
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(onFunded).not.toHaveBeenCalled()
    expect(screen.getByText(/We’re checking your payment and balance/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Check payment' })).not.toBeInTheDocument()
    expect(window.sessionStorage.getItem('ae.account-funding.attempt.user:credit')).toBe(key)
    source.balance.mockResolvedValue({ ...available, balance: { currency: 'AUD', units: '5000000', exponent: 6 } })
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    // An unrelated same-account purchased-credit increase is also not finality.
    expect(onFunded).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem('ae.account-funding.attempt.user:credit')).toBe(key)
    source.read.mockResolvedValue(settled)
    // Exact posted funding can complete even if its credit has already been spent.
    source.balance.mockResolvedValue(available)
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(source.read).toHaveBeenLastCalledWith({ data: { commandRef: 'funding:credit', idempotencyKey: key } })
    expect(source.balance.mock.invocationCallOrder.at(-1)).toBeGreaterThan(source.read.mock.invocationCallOrder.at(-1) ?? 0)
    expect(onFunded).toHaveBeenCalledOnce()
    expect(window.sessionStorage.getItem('ae.account-funding.attempt.user:credit')).toBeNull()
    expect(source.begin).toHaveBeenCalledOnce()
  })

  it('does not complete or clear an unknown payment from another Account balance', async () => {
    checkoutTab()
    render(<AddCreditSheet {...props} />)
    const button = await screen.findByRole('button', { name: 'Add A$5' })
    vi.useFakeTimers()
    fireEvent.click(button)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    const key = window.sessionStorage.getItem('ae.account-funding.attempt.user:credit')
    source.balance.mockResolvedValue({ ...available, accountRef: 'account:other',
      balance: { currency: 'AUD', units: '20000000', exponent: 6 } })
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(screen.getByText(/This payment belongs to another account/)).toBeInTheDocument()
    expect(screen.queryByText(/Available balance:/)).not.toBeInTheDocument()
    expectNoCheckout()
    expect(onFunded).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem('ae.account-funding.attempt.user:credit')).toBe(key)
    expect(source.begin).toHaveBeenCalledOnce()
  })

  it('stops an exactly failed payment without continuing the Run', async () => {
    checkoutTab()
    source.read.mockResolvedValue({ ...settled, evidence: { ...settled.evidence, status: 'failed' } })
    render(<AddCreditSheet {...props} />)
    const button = await screen.findByRole('button', { name: 'Add A$5' })
    vi.useFakeTimers()
    fireEvent.click(button)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(screen.getByText('The card payment did not complete. No credit was added.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add A$5' })).toBeEnabled()
    expect(window.sessionStorage.getItem('ae.account-funding.attempt.user:credit')).toBeNull()
    expect(onFunded).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(source.read).toHaveBeenCalledOnce()
  })

  it('uses a lost-response pending command only with the original authenticated key', async () => {
    checkoutTab()
    source.begin.mockRejectedValue(new Error('response_lost'))
    render(<AddCreditSheet {...props} />)
    const button = await screen.findByRole('button', { name: 'Add A$5' })
    vi.useFakeTimers()
    fireEvent.click(button)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    const key = window.sessionStorage.getItem('ae.account-funding.attempt.user:credit')
    source.read.mockResolvedValue({ kind: 'refused', code: 'payment_binding_invalid', retryable: false })
    source.balance.mockResolvedValue({ ...available, pendingTopup: { commandRef: 'funding:candidate' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(source.read).toHaveBeenLastCalledWith({ data: { commandRef: 'funding:candidate', idempotencyKey: key } })
    expect(onFunded).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem('ae.account-funding.attempt.user:credit')).toBe(key)
    source.read.mockResolvedValue({ ...settled, evidence: { ...settled.evidence, status: 'pending' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check payment' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    // Keep the authenticated identity when pendingTopup later disappears.
    source.balance.mockResolvedValue(available)
    source.read.mockResolvedValue(settled)
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(source.read).toHaveBeenLastCalledWith({ data: { commandRef: 'funding:candidate', idempotencyKey: key } })
    expect(onFunded).toHaveBeenCalledOnce()
    expect(window.sessionStorage.getItem('ae.account-funding.attempt.user:credit')).toBeNull()
  })

  it('requires the original Account again after an exact succeeded read', async () => {
    checkoutTab()
    source.read.mockResolvedValue(settled)
    render(<AddCreditSheet {...props} />)
    const button = await screen.findByRole('button', { name: 'Add A$5' })
    vi.useFakeTimers()
    fireEvent.click(button)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    source.balance.mockResolvedValueOnce(available).mockResolvedValue({ ...available, accountRef: 'account:other' })
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(onFunded).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem('ae.account-funding.attempt.user:credit')).toBeTruthy()
    expect(screen.queryByText(/Available balance:/)).not.toBeInTheDocument()
    expectNoCheckout()
  })

  it('does not apply an exact status response after its owner changed', async () => {
    checkoutTab()
    const deferred = pending<CreditPaymentSession>()
    source.read.mockReturnValue(deferred.promise)
    const sheet = render(<AddCreditSheet {...props} />)
    const button = await screen.findByRole('button', { name: 'Add A$5' })
    vi.useFakeTimers()
    fireEvent.click(button)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    const originalKey = window.sessionStorage.getItem('ae.account-funding.attempt.user:credit')
    source.userId = 'user:other'
    source.balance.mockResolvedValue({ ...available, accountRef: 'account:other' })
    sheet.rerender(<AddCreditSheet {...props} />)
    await act(async () => { deferred.resolve(settled) })
    expect(onFunded).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem('ae.account-funding.attempt.user:credit')).toBe(originalKey)
  })

  it('pauses unresolved checks without permitting another amount or submission, then checks the same payment', async () => {
    checkoutTab()
    render(<AddCreditSheet {...props} />)
    const button = await screen.findByRole('button', { name: 'Add A$5' })
    vi.useFakeTimers()
    fireEvent.click(button)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    const key = window.sessionStorage.getItem('ae.account-funding.attempt.user:credit')
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60 * 1000) })
    expect(screen.getByText(/Payment checks stopped after 10 minutes/)).toBeInTheDocument()
    expect(screen.queryByText(/We’re checking your payment/)).not.toBeInTheDocument()
    expectNoCheckout()
    expect(source.begin).toHaveBeenCalledOnce()
    expect(window.sessionStorage.getItem('ae.account-funding.attempt.user:credit')).toBe(key)
    const reads = source.read.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Check payment' }))
    expect(screen.getByText(/We’re checking your payment and balance/)).toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(source.read.mock.calls.length).toBe(reads + 1)
    expect(source.read).toHaveBeenLastCalledWith({ data: { commandRef: 'funding:credit', idempotencyKey: key } })
    expect(source.begin).toHaveBeenCalledOnce()
  })

  it('preserves a refused-but-pending start and confirms its candidate without a second begin', async () => {
    const popup = checkoutTab()
    source.begin.mockResolvedValue({ kind: 'refused', code: 'funding_pending', retryable: true })
    render(<AddCreditSheet {...props} />)
    const add = await screen.findByRole('button', { name: 'Add A$5' })
    vi.useFakeTimers()
    fireEvent.click(add)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    const key = window.sessionStorage.getItem('ae.account-funding.attempt.user:credit')
    expect(key).toBeTruthy()
    expectNoCheckout()
    expect(popup.close).toHaveBeenCalledOnce()
    source.balance.mockResolvedValue({ ...available, pendingTopup: { commandRef: 'funding:pending-start' } })
    source.read.mockResolvedValue(settled)
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(source.read).toHaveBeenCalledWith({ data: { commandRef: 'funding:pending-start', idempotencyKey: key } })
    expect(source.begin).toHaveBeenCalledOnce()
    expect(onFunded).toHaveBeenCalledOnce()
    expect(window.sessionStorage.getItem('ae.account-funding.attempt.user:credit')).toBeNull()
    expect(window.sessionStorage.getItem('ae.account-funding.recovery.user:credit')).toBeNull()
  })

  it.each([true, false])('restores exact saved payment recovery with payingOn=%s', async payingOn => {
    const key = 'account-funding:reload-known'
    window.sessionStorage.setItem('ae.account-funding.attempt.user:credit', key)
    window.sessionStorage.setItem('ae.account-funding.recovery.user:credit', JSON.stringify({ commandRef: 'funding:saved', idempotencyKey: key }))
    const popup = checkoutTab()
    render(<AddCreditSheet {...props} payingOn={payingOn} shortfall={{ units: '20000000', exponent: 6 }} />)
    expectNoCheckout()
    expect(screen.queryByRole('button', { name: 'Turn on' })).not.toBeInTheDocument()
    const check = await screen.findByRole('button', { name: 'Check payment' })
    expect(screen.getByRole('link', { name: /Get help/ })).toHaveAttribute('href', '/support')
    source.read.mockResolvedValue(settled)
    vi.useFakeTimers()
    fireEvent.click(check)
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(source.read).toHaveBeenCalledWith({ data: { commandRef: 'funding:saved', idempotencyKey: key } })
    expect(source.begin).not.toHaveBeenCalled()
    expect(popup.open).not.toHaveBeenCalled()
    expect(onFunded).toHaveBeenCalledOnce()
    expect(window.sessionStorage.getItem('ae.account-funding.attempt.user:credit')).toBeNull()
    expect(window.sessionStorage.getItem('ae.account-funding.recovery.user:credit')).toBeNull()
  })

  it('retains a saved key with no command or candidate and refuses changed-amount begin', async () => {
    const key = 'account-funding:reload-missing'
    window.sessionStorage.setItem('ae.account-funding.attempt.user:credit', key)
    // External-reference-only recovery does not prove the saved key and must not be used.
    window.sessionStorage.setItem('ae.account-funding.recovery.user:credit', JSON.stringify({ externalRef: 'checkout:unbound' }))
    const popup = checkoutTab()
    const hook = renderHook(() => useAddCredit(true, onFunded))
    await waitFor(() => expect(hook.result.current.busy).toBe(false))
    expect(hook.result.current.paymentStatus).toBe('paused')
    await act(async () => { hook.result.current.setSelected(20); await hook.result.current.begin() })
    expect(source.begin).not.toHaveBeenCalled()
    expect(popup.open).not.toHaveBeenCalled()
    vi.useFakeTimers()
    act(() => hook.result.current.checkPayment())
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(source.read).not.toHaveBeenCalled()
    expect(hook.result.current.paymentStatus).toBe('paused')
    expect(hook.result.current.problem).toContain('could not be identified')
    expect(window.sessionStorage.getItem('ae.account-funding.attempt.user:credit')).toBe(key)
  })

  it('authenticates a reload candidate with the original key instead of a mismatched saved locator', async () => {
    const key = 'account-funding:reload-candidate'
    window.sessionStorage.setItem('ae.account-funding.attempt.user:credit', key)
    window.sessionStorage.setItem('ae.account-funding.recovery.user:credit', JSON.stringify({ commandRef: 'funding:other', idempotencyKey: 'account-funding:other' }))
    source.balance.mockResolvedValue({ ...available, pendingTopup: { commandRef: 'funding:candidate' } })
    source.read.mockResolvedValue({ kind: 'refused', code: 'payment_binding_invalid', retryable: false })
    render(<AddCreditSheet {...props} />)
    const check = await screen.findByRole('button', { name: 'Check payment' })
    vi.useFakeTimers()
    fireEvent.click(check)
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(source.read).toHaveBeenCalledWith({ data: { commandRef: 'funding:candidate', idempotencyKey: key } })
    expect(onFunded).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem('ae.account-funding.attempt.user:credit')).toBe(key)
    expectNoCheckout()
    expect(screen.getByRole('link', { name: /Get help/ })).toBeInTheDocument()
    source.read.mockResolvedValue(settled)
    fireEvent.click(screen.getByRole('button', { name: 'Check payment' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(onFunded).toHaveBeenCalledOnce()
  })

  it('retains known reload recovery on a wrong Account and completes after returning to its Account', async () => {
    const key = 'account-funding:reload-account'
    window.sessionStorage.setItem('ae.account-funding.attempt.user:credit', key)
    window.sessionStorage.setItem('ae.account-funding.recovery.user:credit', JSON.stringify({ commandRef: 'funding:saved', idempotencyKey: key }))
    source.balance.mockResolvedValue({ ...available, accountRef: 'account:other' })
    source.read.mockResolvedValue({ kind: 'refused', code: 'payment_binding_invalid', retryable: false })
    render(<AddCreditSheet {...props} />)
    const check = await screen.findByRole('button', { name: 'Check payment' })
    vi.useFakeTimers()
    fireEvent.click(check)
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(onFunded).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem('ae.account-funding.attempt.user:credit')).toBe(key)
    expect(window.sessionStorage.getItem('ae.account-funding.recovery.user:credit')).toContain('funding:saved')
    source.balance.mockResolvedValue(available)
    source.read.mockResolvedValue(settled)
    fireEvent.click(screen.getByRole('button', { name: 'Check payment' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(onFunded).toHaveBeenCalledOnce()
    expect(source.begin).not.toHaveBeenCalled()
  })

  it.each([{ signedIn: false, payingOn: false }, { signedIn: true, payingOn: false }, { signedIn: true, payingOn: true }])(
    'keeps Trust centre secondary and in a new tab for step %j', async step => {
      render(<AddCreditSheet {...props} {...step} />)
      const trust = screen.getByRole('link', { name: 'Trust centre (opens in a new tab)' })
      expect(trust).toHaveAttribute('href', '/trust')
      expect(trust).toHaveAttribute('target', '_blank')
      expect(trust).toHaveAttribute('rel', 'noreferrer')
      if (!step.signedIn) expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', expect.stringContaining('/sign-in'))
      else if (!step.payingOn) {
        fireEvent.click(screen.getByRole('button', { name: 'Turn on' }))
        expect(onEnablePaying).toHaveBeenCalledOnce()
      } else await screen.findByRole('button', { name: 'Add A$5' })
    },
  )
})
