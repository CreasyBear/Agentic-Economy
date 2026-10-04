// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClerkRuntimeError } from '@clerk/shared/error'

vi.mock('@/lib/ui/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock('@/lib/observability/degrade', () => ({
  degrade: vi.fn(),
}))

import { useConnectAgentWizard } from './useConnectAgentWizard'
import { degrade } from '@/lib/observability/degrade'
import { toast } from '@/lib/ui/toast'

function submitHook(result: { current: ReturnType<typeof useConnectAgentWizard> }) {
  const event = { preventDefault: vi.fn() }
  return act(async () => {
    await result.current.handleSubmit(event)
  })
}

describe('useConnectAgentWizard', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })


  it('reviews access without issuing and defaults to explicit approval for paid work', () => {
    const onIssue = vi.fn()
    const { result } = renderHook(() => useConnectAgentWizard({ deploymentEnvironment: 'sandbox', onOpenChange: vi.fn(), onIssue }))
    act(() => result.current.handleNameChange('Review Agent'))
    act(() => expect(result.current.canReviewDraft()).toBe(true))
    expect(result.current.view.authorityMode).toBe('approval_required')
    expect(onIssue).not.toHaveBeenCalled()
  })

  it('admits one concurrent issuance and preserves the exact request after lost acknowledgement', async () => {
    let fail!: (cause: Error) => void
    const interrupted = new Promise((_, reject) => { fail = reject })
    const onIssue = vi.fn().mockReturnValueOnce(interrupted).mockResolvedValueOnce({ kind: 'replayed', keyId: 'key_one', secret: 'secret_one' })
    const onOpenChange = vi.fn()
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useConnectAgentWizard({ deploymentEnvironment: 'sandbox', onOpenChange, onIssue, onSuccess }))
    act(() => result.current.handleNameChange('Recovery Agent'))
    let first!: Promise<void>
    let duplicate!: Promise<void>
    act(() => {
      first = result.current.handleSubmit({ preventDefault: vi.fn() })
      duplicate = result.current.handleSubmit({ preventDefault: vi.fn() })
    })
    expect(onIssue).toHaveBeenCalledTimes(1)
    await act(async () => { fail(new Error('acknowledgement lost')); await Promise.all([first, duplicate]) })
    expect(result.current.view.awaitingConfirmation).toBe(true)
    act(() => result.current.handleOpenChange(false))
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
    await submitHook(result)
    expect(onIssue.mock.calls[0]?.[0]).toEqual(onIssue.mock.calls[1]?.[0])
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(result.current.view.awaitingConfirmation).toBe(false)
  })

  it('refuses changed material while an original issuance remains unconfirmed', async () => {
    const onIssue = vi.fn().mockRejectedValueOnce(new Error('lost acknowledgement'))
    const { result } = renderHook(() => useConnectAgentWizard({ deploymentEnvironment: 'sandbox', onOpenChange: vi.fn(), onIssue }))
    act(() => result.current.handleNameChange('Original Agent'))
    await submitHook(result)
    act(() => result.current.handleNameChange('Different Agent'))
    await submitHook(result)
    expect(onIssue).toHaveBeenCalledTimes(1)
    expect(result.current.view.awaitingConfirmation).toBe(true)
  })

  it('defaults to sandbox static spending presentation', () => {
    const { result } = renderHook(() =>
      useConnectAgentWizard({
        deploymentEnvironment: 'sandbox',
        onOpenChange: vi.fn(),
        onIssue: vi.fn(),
      }),
    )

    expect(result.current.view.environment).toBe('sandbox')
    expect(result.current.view.spendingPresentation).toBe('sandbox-static')
    expect(result.current.view.isNameValid).toBe(false)
  })

  it('shows editable spending limits in a production deployment', () => {
    const { result } = renderHook(() =>
      useConnectAgentWizard({
        deploymentEnvironment: 'production',
        onOpenChange: vi.fn(),
        onIssue: vi.fn(),
      }),
    )

    expect(result.current.view.environment).toBe('production')
    expect(result.current.view.spendingPresentation).toBe('editable')
  })

  it('trims spending limit decimals before parsing on submit', async () => {
    const onIssue = vi.fn().mockResolvedValue({ kind: 'created', keyId: 'k1', secret: 's1' })
    const { result } = renderHook(() =>
      useConnectAgentWizard({
        deploymentEnvironment: 'production',
        onOpenChange: vi.fn(),
        onIssue,
      }),
    )

    act(() => {
      result.current.handleNameChange('Trim Agent')
      result.current.setPerCallAmount('  5.00  ')
      result.current.setDailyAmount(' 25.00 ')
      result.current.setMonthlyAmount(' 100.00 ')
    })

    await submitHook(result)

    await waitFor(() => expect(onIssue).toHaveBeenCalledTimes(1))
    const payload = onIssue.mock.calls[0]![0].data
    expect(payload.maximumSpendPerCall).toEqual({
      currency: 'AUD',
      exponent: 6,
      units: '5000000',
    })
  })

  it('rejects zero production limits after trim', async () => {
    const onIssue = vi.fn()
    const { result } = renderHook(() =>
      useConnectAgentWizard({
        deploymentEnvironment: 'production',
        onOpenChange: vi.fn(),
        onIssue,
      }),
    )

    act(() => {
      result.current.handleNameChange('Zero Agent')
      result.current.setPerCallAmount('0.00')
      result.current.setDailyAmount('25.00')
      result.current.setMonthlyAmount('100.00')
    })

    await submitHook(result)

    expect(onIssue).not.toHaveBeenCalled()
    expect(result.current.view.diagnostic?.nextStep).toBe(
      'Production spending limits must be greater than zero.',
    )
  })

  it('blocks invalid per-call vs daily ordering', async () => {
    const onIssue = vi.fn()
    const { result } = renderHook(() =>
      useConnectAgentWizard({
        deploymentEnvironment: 'production',
        onOpenChange: vi.fn(),
        onIssue,
      }),
    )

    act(() => {
      result.current.handleNameChange('Order Agent')
      result.current.setPerCallAmount('50.00')
      result.current.setDailyAmount('20.00')
      result.current.setMonthlyAmount('100.00')
    })

    await submitHook(result)

    expect(onIssue).not.toHaveBeenCalled()
    expect(result.current.view.diagnostic?.nextStep).toBe(
      'Per-call limit cannot exceed daily limit.',
    )
  })

  it('omits budget fields for sandbox issuance', async () => {
    const onIssue = vi.fn().mockResolvedValue({ kind: 'created', keyId: 'k_sb', secret: 's' })
    const onSuccess = vi.fn()
    const { result } = renderHook(() =>
      useConnectAgentWizard({
        deploymentEnvironment: 'sandbox',
        onOpenChange: vi.fn(),
        onIssue,
        onSuccess,
      }),
    )

    act(() => {
      result.current.handleNameChange('Sandbox Agent')
    })

    await submitHook(result)

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    const payload = onIssue.mock.calls[0]![0].data
    expect(payload.environment).toBe('sandbox')
    expect(payload).not.toHaveProperty('maximumSpendPerCall')
  })

  it('resets fields when dialog closes via handleOpenChange', () => {
    const { result } = renderHook(() =>
      useConnectAgentWizard({
        deploymentEnvironment: 'production',
        onOpenChange: vi.fn(),
        onIssue: vi.fn(),
      }),
    )

    act(() => {
      result.current.handleNameChange('Temp')
      result.current.setAuthorityMode('read_only')
    })

    act(() => {
      result.current.handleOpenChange(false)
    })

    expect(result.current.view.name).toBe('')
    expect(result.current.view.environment).toBe('production')
    expect(result.current.view.authorityMode).toBe('approval_required')
  })

  it('keeps production through a tampered initial draft, close, and reopen', () => {
    const onDraftChange = vi.fn()
    const initialDraft = {
      name: 'Saved agent',
      environment: 'sandbox' as const,
      authorityMode: 'approval_required' as const,
      perCallAmount: '5.00',
      dailyAmount: '25.00',
      monthlyAmount: '100.00',
    }
    const { result, rerender } = renderHook(({ open }) => useConnectAgentWizard({
      deploymentEnvironment: 'production',
      open,
      onOpenChange: vi.fn(),
      onIssue: vi.fn(),
      initialDraft,
      onDraftChange,
    }), { initialProps: { open: true } })

    expect(result.current.view.environment).toBe('production')
    act(() => result.current.handleNameChange('Changed agent'))
    expect(onDraftChange).toHaveBeenCalledWith(expect.objectContaining({ environment: 'production' }))
    act(() => result.current.handleOpenChange(false))
    expect(result.current.view.environment).toBe('production')
    rerender({ open: false })
    rerender({ open: true })
    expect(result.current.view.name).toBe('Saved agent')
    expect(result.current.view.environment).toBe('production')
  })

  it('keeps the issue wizard ready without logging when step-up is cancelled', async () => {
    const onIssue = vi.fn().mockRejectedValue(
      new ClerkRuntimeError('Reverification was cancelled', { code: 'reverification_cancelled' }),
    )
    const onOpenChange = vi.fn()
    const { result } = renderHook(() => useConnectAgentWizard({ deploymentEnvironment: 'sandbox', onOpenChange, onIssue }))

    act(() => result.current.handleNameChange('Research Agent'))
    await submitHook(result)

    expect(result.current.view.name).toBe('Research Agent')
    expect(result.current.view.diagnostic).toBeNull()
    expect(result.current.view.isSubmitting).toBe(false)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(degrade).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })
})
