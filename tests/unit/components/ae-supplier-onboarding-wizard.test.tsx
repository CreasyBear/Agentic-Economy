/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, hash, children, ...props }: { to: string; hash?: string; children: ReactNode }) => (
    <a href={`${to}${hash === undefined ? '' : `#${hash}`}`} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/lib/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { AeSupplierOnboardingWizard } from '@/components/ae/supply/supplier-onboarding-wizard/AeSupplierOnboardingWizard'
import { formatAbnDisplay } from '@/modules/money/public'
import { toast } from '@/lib/ui/toast'

describe('AeSupplierOnboardingWizard (W-30)', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows identity and first Tool setup without unsupported payout steps', () => {
    render(
      <AeSupplierOnboardingWizard
        currentStep="profile"
        onSaveProfile={vi.fn()}
      />,
    )

    expect(screen.getByRole('navigation', { name: /provider setup/i })).toBeInTheDocument()
    expect(screen.getByText('Provider identity')).toBeInTheDocument()
    expect(screen.getByText('First Tool')).toBeInTheDocument()
    expect(screen.getByText('~2 mins')).toBeInTheDocument()
    expect(screen.getByText('~1 min')).toBeInTheDocument()

    const nav = screen.getByRole('navigation', { name: /provider setup/i })
    expect(within(nav).getByRole('button', { name: /provider identity/i })).toHaveAttribute('aria-current', 'step')
    expect(within(nav).getByRole('button', { name: /first tool/i })).toHaveAttribute('aria-disabled', 'true')

    expect(within(nav).getByText('Step 1 of 2: Provider identity, Visited')).toBeInTheDocument()
  })

  it('T2: Step 1 validates brand name, website origin, and Australian ABN format', async () => {
    const onSaveProfileMock = vi.fn().mockResolvedValue({ kind: 'ok' })

    render(
      <AeSupplierOnboardingWizard
        currentStep="profile"
        onSaveProfile={onSaveProfileMock}
      />,
    )

    const nameInput = screen.getByLabelText(/provider or brand name/i)
    const websiteInput = screen.getByLabelText(/provider website/i)
    const abnInput = screen.getByLabelText(/australian business number/i)
    const continueBtn = screen.getByRole('button', { name: /continue to add tool/i })

    expect((continueBtn as HTMLButtonElement).type).toBe('submit')
    expect((continueBtn as HTMLButtonElement).disabled).toBe(false)

    // Invalid ABN — Rule 4 triplet
    fireEvent.change(nameInput, { target: { value: 'Acme AI Systems' } })
    fireEvent.change(websiteInput, { target: { value: 'https://acme.example.com' } })
    fireEvent.change(abnInput, { target: { value: '12345678901' } })
    fireEvent.click(continueBtn)

    await waitFor(() => {
      expect(screen.getByText(/invalid australian business number \(abn\)/i)).toBeInTheDocument()
      expect(screen.getByText(/A\$0\.00 affected — profile was not updated\./i)).toBeInTheDocument()
    })
    expect(onSaveProfileMock).not.toHaveBeenCalled()

    // Live ABN grouping while typing
    fireEvent.change(abnInput, { target: { value: '51824753556' } })
    expect(abnInput).toHaveValue('51 824 753 556')

    fireEvent.click(continueBtn)

    await waitFor(() => {
      expect(onSaveProfileMock).toHaveBeenCalledWith({
        name: 'Acme AI Systems',
        website: 'https://acme.example.com',
        abn: '51824753556',
      })
    })
    expect(toast.success).toHaveBeenCalledWith('Provider profile saved')
  })

  it('shows Rule 4 triplet for empty name and bad URL', async () => {
    render(<AeSupplierOnboardingWizard currentStep="profile" onSaveProfile={vi.fn()} />)

    const continueBtn = screen.getByRole('button', { name: /continue to add tool/i })

    fireEvent.change(screen.getByLabelText(/provider or brand name/i), { target: { value: '   ' } })
    fireEvent.change(screen.getByLabelText(/provider website/i), { target: { value: 'https://acme.example.com' } })
    fireEvent.change(screen.getByLabelText(/australian business number/i), { target: { value: '51824753556' } })
    fireEvent.click(continueBtn)

    await waitFor(() => {
      expect(screen.getByText(/enter your supplier \/ brand name\./i)).toBeInTheDocument()
      expect(screen.getByText(/A\$0\.00 affected — profile was not updated\./i)).toBeInTheDocument()
      expect(screen.getByText(/enter the public name shown on tool cards and invoices\./i)).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText(/provider or brand name/i), { target: { value: 'Acme' } })
    fireEvent.change(screen.getByLabelText(/provider website/i), { target: { value: 'http://insecure.example.com' } })
    fireEvent.click(continueBtn)

    await waitFor(() => {
      expect(screen.getByText(/enter a valid https provider website\./i)).toBeInTheDocument()
      expect(screen.getByText(/use a full https:\/\/ origin/i)).toBeInTheDocument()
    })
  })

  it('allows stepper navigation back to profile after saving it', async () => {
    const onSaveProfileMock = vi.fn().mockResolvedValue({ kind: 'ok' })

    render(
      <AeSupplierOnboardingWizard
        currentStep="profile"
        onSaveProfile={onSaveProfileMock}
      />,
    )

    fireEvent.change(screen.getByLabelText(/provider or brand name/i), { target: { value: 'Acme AI Systems' } })
    fireEvent.change(screen.getByLabelText(/provider website/i), { target: { value: 'https://acme.example.com' } })
    fireEvent.change(screen.getByLabelText(/australian business number/i), { target: { value: '51824753556' } })
    fireEvent.click(screen.getByRole('button', { name: /continue to add tool/i }))

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Add Tool' })).toBeInTheDocument()
    })

    const nav = screen.getByRole('navigation', { name: /provider setup/i })
    const profileTab = within(nav).getByRole('button', { name: /provider identity/i })
    expect(profileTab).toBeEnabled()
    expect(profileTab).toHaveAccessibleName(/completed/i)
    expect(within(nav).getByRole('button', { name: /first tool/i })).toHaveAttribute('aria-current', 'step')
    fireEvent.click(profileTab)

    expect(screen.getByLabelText(/provider or brand name/i)).toBeInTheDocument()

    fireEvent.click(within(nav).getByRole('button', { name: /first tool/i }))
    expect(screen.getByRole('link', { name: 'Add Tool' })).toBeInTheDocument()
    expect(onSaveProfileMock).toHaveBeenCalledTimes(1)
  })

  it('shows the first Tool action without payout prerequisite', () => {
    render(
      <AeSupplierOnboardingWizard
        currentStep="first_tool"
        providerName="Acme AI Systems"
      />,
    )

    const importLink = screen.getByRole('link', { name: /^Add Tool$/i })
    expect(importLink).toHaveAttribute('href', '/owner/operations/new')
    expect(screen.getByRole('link', { name: 'Manage Provider identity' })).toHaveAttribute('href', '/owner/operations#provider-identity')
  })
})

describe('formatAbnDisplay', () => {
  it('groups digits progressively', () => {
    expect(formatAbnDisplay('5')).toBe('5')
    expect(formatAbnDisplay('51')).toBe('51')
    expect(formatAbnDisplay('518')).toBe('51 8')
    expect(formatAbnDisplay('51824')).toBe('51 824')
    expect(formatAbnDisplay('51824753')).toBe('51 824 753')
    expect(formatAbnDisplay('51824753556')).toBe('51 824 753 556')
  })
})
