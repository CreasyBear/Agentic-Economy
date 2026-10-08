// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  SupplierOnboardingProfile,
  SupplierOnboardingSaveResult,
} from '@/modules/capability-supply/supplier-onboarding.contracts'

vi.mock('@/components/ae/supply/supplier-onboarding-wizard/AeSupplierOnboardingWizard', () => ({
  AeSupplierOnboardingWizard: ({
    onSaveProfile,
  }: {
    onSaveProfile: (input: SupplierOnboardingProfile) => Promise<SupplierOnboardingSaveResult>
  }) => (
    <button
      type="button"
      onClick={() => void onSaveProfile({ name: 'N', website: 'https://n.example' })}
    >
      Save profile
    </button>
  ),
}))

import { WorkspaceInventoryGate } from './WorkspaceInventoryGate'

afterEach(() => cleanup())

describe('WorkspaceInventoryGate', () => {
  it('renders onboarding for not_found', async () => {
    const onSaveProfile = vi.fn(async () => ({ kind: 'ok' as const }))
    render(<WorkspaceInventoryGate kind="not_found" onSaveProfile={onSaveProfile} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    expect(onSaveProfile).toHaveBeenCalledWith({ name: 'N', website: 'https://n.example' })
  })

  it('renders the ownership conflict alert', () => {
    render(<WorkspaceInventoryGate kind="conflict" />)
    expect(screen.getByText('Provider identity needs attention')).toBeTruthy()
  })

  it('renders an unavailable error alert with a retry and money outcome', () => {
    const onRefresh = vi.fn()
    render(<WorkspaceInventoryGate kind="unavailable" refreshPending={false} onRefresh={onRefresh} />)
    expect(screen.getByRole('alert').textContent).toContain('Tools could not be loaded')
    expect(screen.getByRole('alert').textContent).toContain('Nothing was charged.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})
