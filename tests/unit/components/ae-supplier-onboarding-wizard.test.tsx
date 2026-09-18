/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

import { AeSupplierOnboardingWizard } from '@/components/ae/supply/AeSupplierOnboardingWizard'

describe('AeSupplierOnboardingWizard (W-30)', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('T1: renders 3 activation steps in order (Business Profile -> Connect Payouts -> First Tool)', () => {
    render(
      <AeSupplierOnboardingWizard
        currentStep="profile"
        onSaveProfile={vi.fn()}
      />,
    )

    expect(screen.getByText(/1\. Business Profile/i)).toBeInTheDocument()
    expect(screen.getByText(/2\. Connect Bank Account/i)).toBeInTheDocument()
    expect(screen.getByText(/3\. Add First Tool/i)).toBeInTheDocument()
  })

  it('T2: Step 1 validates brand name, website origin, and Australian ABN format', async () => {
    const onSaveProfileMock = vi.fn().mockResolvedValue({ kind: 'ok' })

    render(
      <AeSupplierOnboardingWizard
        currentStep="profile"
        onSaveProfile={onSaveProfileMock}
      />,
    )

    const nameInput = screen.getByLabelText(/supplier \/ brand name/i)
    const websiteInput = screen.getByLabelText(/provider website/i)
    const abnInput = screen.getByLabelText(/australian business number/i)
    const continueBtn = screen.getByRole('button', { name: /continue to payouts/i })

    // Invalid ABN
    fireEvent.change(nameInput, { target: { value: 'Acme AI Systems' } })
    fireEvent.change(websiteInput, { target: { value: 'https://acme.example.com' } })
    fireEvent.change(abnInput, { target: { value: '12345678901' } }) // invalid checksum
    fireEvent.click(continueBtn)

    await waitFor(() => {
      expect(screen.getByText(/enter a valid 11-digit australian business number/i)).toBeInTheDocument()
    })
    expect(onSaveProfileMock).not.toHaveBeenCalled()

    // Valid ABN (ATO test ABN: 51 824 753 556)
    fireEvent.change(abnInput, { target: { value: '51824753556' } })
    fireEvent.click(continueBtn)

    await waitFor(() => {
      expect(onSaveProfileMock).toHaveBeenCalledWith({
        name: 'Acme AI Systems',
        website: 'https://acme.example.com',
        abn: '51824753556',
      })
    })
  })

  it('T3: Step 2 renders Connect Bank Account action with Stripe Express guidance', () => {
    const onConnectPayoutsMock = vi.fn()

    render(
      <AeSupplierOnboardingWizard
        currentStep="payouts"
        providerName="Acme AI Systems"
        onConnectPayouts={onConnectPayoutsMock}
      />,
    )

    expect(screen.getByText(/connect your bank account via stripe express/i)).toBeInTheDocument()
    const setupBtn = screen.getByRole('button', { name: /set up payouts with stripe/i })
    expect(setupBtn).toBeInTheDocument()

    fireEvent.click(setupBtn)
    expect(onConnectPayoutsMock).toHaveBeenCalled()
  })

  it('T4: Step 3 renders First Tool import options linking to /owner/operations/new', () => {
    render(
      <AeSupplierOnboardingWizard
        currentStep="first_tool"
        providerName="Acme AI Systems"
        payoutsConfigured={true}
      />,
    )

    expect(screen.getByText(/add your first tool/i)).toBeInTheDocument()
    const importLink = screen.getByRole('link', { name: /import openapi \/ mcp tool/i })
    expect(importLink).toHaveAttribute('href', '/owner/operations/new')
  })
})
