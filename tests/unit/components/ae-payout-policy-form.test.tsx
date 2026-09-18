/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AePayoutPolicyForm } from '@/components/ae/supply/AePayoutPolicyForm'
import {
  BELOW_MINIMUM_DIAGNOSTIC,
  BECS_REASSURANCE,
  CONFLICT_DIAGNOSTIC,
  INVALID_AMOUNT_DIAGNOSTIC,
  NETWORK_DIAGNOSTIC,
  TACTILE,
} from '@/components/ae/supply/payout-policy-copy'

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('@/lib/ui/toast', () => ({
  toast: toastMock,
}))

describe('AePayoutPolicyForm (W-32)', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('T1: renders heading, threshold, monthly schedule, projection, summary, BECS, and active preset', () => {
    const { container } = render(
      <AePayoutPolicyForm
        businessId="biz_123"
        currency="AUD"
        initialThresholdUnits="50000000"
        initialSchedule="monthly"
        initialRevision={1}
        onSavePreferences={vi.fn()}
      />,
    )

    expect(screen.getByText(/payout schedule & threshold/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue('50')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /monthly on the 1st/i })).toBeChecked()
    expect(screen.getByRole('status')).toHaveTextContent('Next scheduled payout: 1st of next month')
    expect(screen.getByText(/transfers will trigger when accumulated balance reaches a\$50\.00/i)).toBeInTheDocument()
    expect(screen.getByText(BECS_REASSURANCE)).toBeInTheDocument()

    const standardPreset = screen.getByRole('button', { name: /a\$50\.00 \(standard\)/i })
    expect(standardPreset).toHaveAttribute('aria-pressed', 'true')
    expect(container.firstChild).toHaveClass('min-h-[26rem]')
  })

  it('T2: saves modified threshold and weekly schedule with success toast and projection', async () => {
    const onSaveMock = vi.fn().mockResolvedValue({ kind: 'updated', revision: 2 })

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

    fireEvent.change(screen.getByLabelText(/minimum payout threshold \(a\$\)/i), {
      target: { value: '100' },
    })
    fireEvent.click(screen.getByRole('radio', { name: /weekly on monday/i }))

    fireEvent.click(screen.getByRole('button', { name: /save payout preferences/i }))

    await waitFor(() => {
      expect(onSaveMock).toHaveBeenCalledWith({
        businessId: 'biz_123',
        currency: 'AUD',
        minimumPayoutUnits: '100000000',
        schedule: 'weekly',
        expectedRevision: 1,
      })
    })

    expect(screen.getByRole('status')).toHaveTextContent('Next scheduled payout: Monday 10:00 AM AEST')
    expect(toastMock.success).toHaveBeenCalledWith(
      'Payout preferences saved',
      expect.objectContaining({ description: expect.stringContaining('Monday 10:00 AM AEST') }),
    )
  })

  it('T3: threshold below A$10 shows below-minimum diagnostic and toast.error', async () => {
    render(
      <AePayoutPolicyForm
        businessId="biz_123"
        currency="AUD"
        initialThresholdUnits="50000000"
        initialSchedule="monthly"
        initialRevision={1}
        onSavePreferences={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText(/minimum payout threshold \(a\$\)/i), {
      target: { value: '5' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save payout preferences/i }))

    await waitFor(() => {
      expect(screen.getByText(BELOW_MINIMUM_DIAGNOSTIC.whatHappened)).toBeInTheDocument()
    })
    expect(screen.getByText(BELOW_MINIMUM_DIAGNOSTIC.financialImpact)).toBeInTheDocument()
    expect(screen.getByText(BELOW_MINIMUM_DIAGNOSTIC.nextStep)).toBeInTheDocument()
    expect(toastMock.error).toHaveBeenCalledWith(
      BELOW_MINIMUM_DIAGNOSTIC.whatHappened,
      { description: BELOW_MINIMUM_DIAGNOSTIC.nextStep },
    )
  })

  it('T4: invalid dollar amount shows invalid-amount diagnostic and toast.error', async () => {
    render(
      <AePayoutPolicyForm
        businessId="biz_123"
        currency="AUD"
        initialThresholdUnits="50000000"
        initialSchedule="monthly"
        initialRevision={1}
        onSavePreferences={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText(/minimum payout threshold \(a\$\)/i), {
      target: { value: 'abc' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save payout preferences/i }))

    await waitFor(() => {
      expect(screen.getByText(INVALID_AMOUNT_DIAGNOSTIC.whatHappened)).toBeInTheDocument()
    })
    expect(screen.getByText(INVALID_AMOUNT_DIAGNOSTIC.financialImpact)).toBeInTheDocument()
    expect(screen.getByText(INVALID_AMOUNT_DIAGNOSTIC.nextStep)).toBeInTheDocument()
    expect(toastMock.error).toHaveBeenCalledWith(
      INVALID_AMOUNT_DIAGNOSTIC.whatHappened,
      { description: INVALID_AMOUNT_DIAGNOSTIC.nextStep },
    )
  })

  it('T5: concurrent conflict resets draft and shows conflict diagnostic', async () => {
    const onSaveMock = vi.fn().mockResolvedValue({ kind: 'conflict', currentRevision: 5 })

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

    fireEvent.change(screen.getByLabelText(/minimum payout threshold \(a\$\)/i), {
      target: { value: '100' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save payout preferences/i }))

    await waitFor(() => {
      expect(screen.getByText(CONFLICT_DIAGNOSTIC.whatHappened)).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('50')).toBeInTheDocument()
    expect(screen.getByText(CONFLICT_DIAGNOSTIC.financialImpact)).toBeInTheDocument()
    expect(screen.getByText(CONFLICT_DIAGNOSTIC.nextStep)).toBeInTheDocument()
    expect(toastMock.error).toHaveBeenCalledWith(
      CONFLICT_DIAGNOSTIC.whatHappened,
      { description: CONFLICT_DIAGNOSTIC.nextStep },
    )
  })

  it('T6: network failure shows network diagnostic and toast.error', async () => {
    const onSaveMock = vi.fn().mockRejectedValue(new Error('network'))

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

    fireEvent.click(screen.getByRole('button', { name: /save payout preferences/i }))

    await waitFor(() => {
      expect(screen.getByText(NETWORK_DIAGNOSTIC.whatHappened)).toBeInTheDocument()
    })
    expect(screen.getByText(NETWORK_DIAGNOSTIC.financialImpact)).toBeInTheDocument()
    expect(screen.getByText(NETWORK_DIAGNOSTIC.nextStep)).toBeInTheDocument()
    expect(toastMock.error).toHaveBeenCalledWith(
      NETWORK_DIAGNOSTIC.whatHappened,
      { description: NETWORK_DIAGNOSTIC.nextStep },
    )
  })

  it('T7: reserves diagnostic slot and container height', () => {
    const { container } = render(
      <AePayoutPolicyForm
        businessId="biz_123"
        currency="AUD"
        onSavePreferences={vi.fn()}
      />,
    )

    const diagnosticSlot = container.querySelector('[aria-live="polite"].min-h-\\[3rem\\]')
    expect(diagnosticSlot).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('min-h-[26rem]')
  })

  it('T8: frequency cards and preset chips use tactile classes; manual shows paused projection', () => {
    render(
      <AePayoutPolicyForm
        businessId="biz_123"
        currency="AUD"
        initialSchedule="manual"
        onSavePreferences={vi.fn()}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Payouts paused until manual review')

    const weeklyCard = screen.getByRole('radio', { name: /weekly on monday/i }).closest('label')
    expect(weeklyCard?.className).toContain(TACTILE.split(' ')[0])

    const presetButtons = screen.getAllByRole('button', { name: /a\$/i })
    for (const button of presetButtons) {
      if (button.getAttribute('type') === 'button' && button.hasAttribute('aria-pressed')) {
        expect(button.className).toContain('enabled:active:scale-[0.98]')
      }
    }

    fireEvent.click(screen.getByRole('button', { name: /a\$100\.00$/i }))
    expect(screen.getByDisplayValue('100')).toBeInTheDocument()
    const hundredPreset = screen.getByRole('button', { name: /^a\$100\.00$/i })
    expect(hundredPreset).toHaveAttribute('aria-pressed', 'true')
  })
})
