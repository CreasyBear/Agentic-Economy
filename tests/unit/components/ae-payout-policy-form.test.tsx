/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AePayoutPolicyForm } from '@/components/ae/supply/AePayoutPolicyForm'

describe('AePayoutPolicyForm (W-33)', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('T1: renders current minimum payout threshold and schedule', () => {
    render(
      <AePayoutPolicyForm
        businessId="biz_123"
        currency="AUD"
        initialThresholdUnits="50000000" // A$50.00
        initialSchedule="monthly"
        initialRevision={1}
        onSavePreferences={vi.fn()}
      />,
    )

    expect(screen.getByText(/payout schedule & threshold/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue('50')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /monthly \(1st of each month\)/i })).toBeChecked()
  })

  it('T2: allows modifying threshold and switching schedule to weekly', async () => {
    const onSaveMock = vi.fn().mockResolvedValue({ kind: 'updated', revision: 2 })

    render(
      <AePayoutPolicyForm
        businessId="biz_123"
        currency="AUD"
        initialThresholdUnits="50000000" // A$50.00
        initialSchedule="monthly"
        initialRevision={1}
        onSavePreferences={onSaveMock}
      />,
    )

    const thresholdInput = screen.getByLabelText(/minimum payout threshold \(a\$\)/i)
    fireEvent.change(thresholdInput, { target: { value: '100' } })

    const weeklyRadio = screen.getByRole('radio', { name: /weekly/i })
    fireEvent.click(weeklyRadio)

    const saveBtn = screen.getByRole('button', { name: /save payout preferences/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(onSaveMock).toHaveBeenCalledWith({
        businessId: 'biz_123',
        currency: 'AUD',
        minimumPayoutUnits: '100000000', // 100 * 10^6
        schedule: 'weekly',
        expectedRevision: 1,
      })
    })
  })

  it('T3: validates minimum threshold amount (> A$0)', async () => {
    const onSaveMock = vi.fn()

    render(
      <AePayoutPolicyForm
        businessId="biz_123"
        currency="AUD"
        initialThresholdUnits="50000000"
        initialSchedule="monthly"
        initialRevision={1}
        onSavePreferences={onSaveMock}
      />,
    )

    const thresholdInput = screen.getByLabelText(/minimum payout threshold \(a\$\)/i)
    fireEvent.change(thresholdInput, { target: { value: '5' } })

    const saveBtn = screen.getByRole('button', { name: /save payout preferences/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(screen.getByText(/minimum payout threshold must be at least a\$10\.00/i)).toBeInTheDocument()
    })
    expect(onSaveMock).not.toHaveBeenCalled()
  })
})
