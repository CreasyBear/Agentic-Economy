// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { toast } from '@/lib/ui/toast'

import type { SupplierOnboardingStep } from '@/modules/capability-supply/supplier-onboarding.contracts'

import { useSupplierOnboardingWizard } from './useSupplierOnboardingWizard'

function fillValidProfile(result: { current: ReturnType<typeof useSupplierOnboardingWizard> }) {
  act(() => {
    result.current.handleNameChange('Acme AI Systems')
    result.current.handleWebsiteChange('https://acme.example.com')
    result.current.handleAbnChange('51824753556')
  })
}

async function submitProfile(result: { current: ReturnType<typeof useSupplierOnboardingWizard> }) {
  const event = { preventDefault: vi.fn() }
  await act(async () => {
    await result.current.handleProfileSubmit(event)
  })
}

describe('useSupplierOnboardingWizard', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('advances to first Tool without payout setup when profile is saved locally', async () => {
    const { result } = renderHook(() => useSupplierOnboardingWizard({ currentStep: 'profile' }))

    fillValidProfile(result)
    await submitProfile(result)

    expect(result.current.view.step).toBe('first_tool')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('maps save error result to Rule 4 diagnostic', async () => {
    const onSaveProfile = vi.fn().mockResolvedValue({ kind: 'error', message: 'Server busy' })
    const { result } = renderHook(() =>
      useSupplierOnboardingWizard({ currentStep: 'profile', onSaveProfile }),
    )

    fillValidProfile(result)
    await submitProfile(result)

    expect(result.current.view.diagnostic?.whatHappened).toBe('Server busy')
    expect(result.current.view.step).toBe('profile')
  })

  it('maps thrown save failures to the shared save-failure triplet', async () => {
    const onSaveProfile = vi.fn().mockRejectedValue(new Error('network'))
    const { result } = renderHook(() =>
      useSupplierOnboardingWizard({ currentStep: 'profile', onSaveProfile }),
    )

    fillValidProfile(result)
    await submitProfile(result)

    expect(result.current.view.diagnostic?.whatHappened).toBe('Could not save provider profile.')
  })

  it('sets pending during save flight', async () => {
    let resolveSave!: (value: { kind: 'ok' }) => void
    const onSaveProfile = vi.fn().mockImplementation(
      () =>
        new Promise<{ kind: 'ok' }>((resolve) => {
          resolveSave = resolve
        }),
    )
    const { result } = renderHook(() =>
      useSupplierOnboardingWizard({ currentStep: 'profile', onSaveProfile }),
    )

    fillValidProfile(result)
    void act(() => {
      void result.current.handleProfileSubmit({ preventDefault: vi.fn() })
    })

    await waitFor(() => expect(result.current.view.pending).toBe(true))

    await act(async () => {
      resolveSave({ kind: 'ok' })
    })

    await waitFor(() => expect(result.current.view.pending).toBe(false))
  })


  it('goToStep no-ops on unvisited steps', () => {
    const { result } = renderHook(() => useSupplierOnboardingWizard({ currentStep: 'profile' }))

    act(() => {
      result.current.goToStep('first_tool')
    })

    expect(result.current.view.step).toBe('profile')
  })

  it('resume latch sets profileCompleted from currentStep without clearing on later profile step', () => {
    const { result, rerender } = renderHook(
      ({ currentStep }: { currentStep: SupplierOnboardingStep }) =>
        useSupplierOnboardingWizard({ currentStep }),
      { initialProps: { currentStep: 'first_tool' satisfies SupplierOnboardingStep } },
    )

    expect(result.current.isCompleted('profile')).toBe(true)
    expect(result.current.isVisited('first_tool')).toBe(true)

    rerender({ currentStep: 'profile' })

    expect(result.current.isCompleted('profile')).toBe(true)
    expect(result.current.isVisited('first_tool')).toBe(true)
  })
})
