/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/lib/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

import { AeSupplierOnboardingWizard } from '@/components/ae/supply/supplier-onboarding-wizard/AeSupplierOnboardingWizard'
import { providerWorkspacePayoutConnection } from '@/components/ae/offerings/provider-workspace/provider-workspace.view-model'
import { formatAbnDisplay } from '@/modules/money/public'
import { toast } from '@/lib/ui/toast'

const TACTILE =
  'enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'
const disconnectedPayoutConnection = providerWorkspacePayoutConnection({
  result: { kind: 'not_applicable' },
  pending: false,
})
const connectedPayoutConnection = providerWorkspacePayoutConnection({
  result: {
    kind: 'available',
    value: {
      currencies: ['AUD'],
      earningsAccounts: 0,
      payoutAccounts: 1,
      readyAccounts: 1,
      needsAttention: 0,
    },
  },
  pending: false,
})

describe('AeSupplierOnboardingWizard (W-30)', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('T1: renders 3 activation steps in order with duration chips', () => {
    const { container } = render(
      <AeSupplierOnboardingWizard
        currentStep="profile"
        onSaveProfile={vi.fn()}
      />,
    )

    expect(screen.getByRole('navigation', { name: /provider setup/i })).toBeInTheDocument()
    expect(screen.getByText(/1\. Provider identity/i)).toBeInTheDocument()
    expect(screen.getByText(/2\. Payout account/i)).toBeInTheDocument()
    expect(screen.getByText(/3\. First Tool/i)).toBeInTheDocument()
    expect(screen.getByText('~2 mins')).toBeInTheDocument()
    expect(screen.getByText('~3 mins')).toBeInTheDocument()
    expect(screen.getByText('~1 min')).toBeInTheDocument()

    const shell = container.firstChild as HTMLElement
    expect(shell.className).toMatch(/min-h-\[28rem\]/)

    const liveSlot = container.querySelector('[aria-live="polite"]')
    expect(liveSlot).toBeInTheDocument()
    expect(liveSlot?.className).toMatch(/min-h-\[3rem\]/)
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
    const continueBtn = screen.getByRole('button', { name: /continue to payouts/i })

    expect(continueBtn.className).toContain(TACTILE)

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

    const continueBtn = screen.getByRole('button', { name: /continue to payouts/i })

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

  it('allows stepper back navigation from payouts to profile', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: /continue to payouts/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /connect stripe/i })).toBeInTheDocument()
    })

    const nav = screen.getByRole('navigation', { name: /provider setup/i })
    const profileTab = within(nav).getByRole('button', { name: /1\. provider identity/i })
    expect(profileTab.className).toContain(TACTILE)
    fireEvent.click(profileTab)

    expect(screen.getByLabelText(/provider or brand name/i)).toBeInTheDocument()
  })

  it('T3: Step 2 renders Stripe Express reassurance and payout badges', () => {
    const onConnectPayoutsMock = vi.fn()

    const { rerender } = render(
      <AeSupplierOnboardingWizard
        currentStep="payouts"
        providerName="Acme AI Systems"
        payoutConnection={disconnectedPayoutConnection}
        onConnectPayouts={onConnectPayoutsMock}
      />,
    )

    expect(screen.getByText(/stripe express securely hosts kyc and identity verification/i)).toBeInTheDocument()
    expect(screen.getByText(/bsb \+ account number/i)).toBeInTheDocument()
    expect(screen.getByText(/never stores account numbers/i)).toBeInTheDocument()
    expect(screen.getByText('Billing action required')).toBeInTheDocument()

    const setupBtn = screen.getByRole('button', { name: 'Connect Stripe' })
    expect(setupBtn.className).toContain(TACTILE)
    fireEvent.click(setupBtn)
    expect(onConnectPayoutsMock).toHaveBeenCalled()

    rerender(
      <AeSupplierOnboardingWizard
        currentStep="payouts"
        providerName="Acme AI Systems"
        payoutConnection={connectedPayoutConnection}
        onConnectPayouts={onConnectPayoutsMock}
      />,
    )
    expect(screen.getByText('Available')).toBeInTheDocument()
    expect(screen.getByText('Stripe is connected for payouts.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Connect Stripe' })).toBeNull()
  })

  it('T4: Step 3 renders First Tool import options linking to /owner/operations/new', () => {
    render(
      <AeSupplierOnboardingWizard
        currentStep="first_tool"
        providerName="Acme AI Systems"
        payoutConnection={connectedPayoutConnection}
      />,
    )

    expect(screen.getByText(/add your first tool/i)).toBeInTheDocument()
    const importLink = screen.getByRole('link', { name: /^Add Tool$/i })
    expect(importLink).toHaveAttribute('href', '/owner/operations/new')
    expect(importLink.className).toContain(TACTILE)
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
