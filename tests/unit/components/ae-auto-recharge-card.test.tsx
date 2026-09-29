/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeAutoRechargeCard } from '@/components/ae/console/AeAutoRechargeCard'
import { toast } from '@/lib/ui/toast'

vi.mock('@/lib/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

type AeAutoRechargeCardProps = Readonly<{
  settings: Readonly<{
    enabled: boolean
    thresholdUnits: string
    rechargeAmountUnits: string
    revision: number
  }>
  mandateState: 'ready' | 'missing' | 'authentication_required' | 'failed'
  pendingTopup?: Readonly<{ commandRef: string }> | null
  onSave: (payload: Readonly<{
    enabled: boolean
    thresholdUnits: string
    rechargeAmountUnits: string
    expectedRevision: number
  }>) => void | Promise<void>
}>

const defaultSettings: AeAutoRechargeCardProps['settings'] = {
  enabled: false,
  thresholdUnits: '20000000',
  rechargeAmountUnits: '50000000',
  revision: 0,
}

afterEach(cleanup)

describe('AeAutoRechargeCard (W-21)', () => {
  it('U1: renders Auto-recharge heading and primary controls', () => {
    const onSave = vi.fn()
    render(
      <AeAutoRechargeCard
        settings={defaultSettings}
        mandateState="ready"
        onSave={onSave}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Auto-recharge' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /auto-recharge/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/low balance threshold/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/recharge amount/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })

  it('U2: valid save submits parsed units and expected revision', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <AeAutoRechargeCard
        settings={{ ...defaultSettings, revision: 2 }}
        mandateState="ready"
        onSave={onSave}
      />,
    )

    fireEvent.change(screen.getByLabelText(/low balance threshold/i), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText(/recharge amount/i), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        enabled: false,
        thresholdUnits: '20000000',
        rechargeAmountUnits: '50000000',
        expectedRevision: 2,
      })
    })
  })

  it('U3: missing mandate blocks enabling and surfaces add payment method guidance', () => {
    const onSave = vi.fn()
    render(
      <AeAutoRechargeCard
        settings={defaultSettings}
        mandateState="missing"
        onSave={onSave}
      />,
    )

    const toggle = screen.getByRole('switch', { name: /auto-recharge/i })
    expect(toggle).toBeDisabled()
    expect(screen.getByRole('link', { name: /add a payment method/i })).toHaveAttribute('href', '/owner/settings/payment-methods')

    fireEvent.click(toggle)
    expect(toggle).not.toBeChecked()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('U4: pending top-up shows in-progress state', () => {
    const onSave = vi.fn()
    render(
      <AeAutoRechargeCard
        settings={defaultSettings}
        mandateState="ready"
        pendingTopup={{ commandRef: 'auto-recharge:pending-one' }}
        onSave={onSave}
      />,
    )

    expect(screen.getByText(/top-up in progress/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /recover it on credit/i })).toHaveAttribute('href', '/owner/credit')
    expect(screen.queryByText(/auto-recharge is waiting/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/A\$0\.00 will be charged/i)).not.toBeInTheDocument()
  })

  it('U4b: a pending funding command does not hide a missing card', () => {
    render(
      <AeAutoRechargeCard
        settings={defaultSettings}
        mandateState="missing"
        pendingTopup={{ commandRef: 'funding:pending-one' }}
        onSave={vi.fn()}
      />,
    )

    expect(screen.getByRole('link', { name: /recover it on credit/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /add a payment method/i })).toBeInTheDocument()
  })

  it('U5: live trigger statement when enabled with valid default amounts', () => {
    const onSave = vi.fn()
    render(
      <AeAutoRechargeCard
        settings={{ ...defaultSettings, enabled: true }}
        mandateState="ready"
        onSave={onSave}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(/when balance dips below/i)
    expect(screen.getByRole('status')).toHaveTextContent(/automatically add/i)
  })

  it('U6: live statement when disabled shows disabled copy', () => {
    const onSave = vi.fn()
    render(
      <AeAutoRechargeCard
        settings={defaultSettings}
        mandateState="ready"
        onSave={onSave}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Auto-recharge is currently disabled.')
  })

  it('U7: quick setup chip updates inputs and aria-pressed', () => {
    const onSave = vi.fn()
    render(
      <AeAutoRechargeCard
        settings={defaultSettings}
        mandateState="ready"
        onSave={onSave}
      />,
    )

    const conservativeChip = screen.getByRole('button', { name: /conservative/i })
    fireEvent.click(conservativeChip)

    expect(screen.getByLabelText(/low balance threshold/i)).toHaveValue('10')
    expect(screen.getByLabelText(/recharge amount/i)).toHaveValue('25')
    expect(conservativeChip).toHaveAttribute('aria-pressed', 'true')
  })

  it('U8: invalid save shows Rule 4 playbook and does not call onSave', async () => {
    const onSave = vi.fn()
    render(
      <AeAutoRechargeCard
        settings={defaultSettings}
        mandateState="ready"
        onSave={onSave}
      />,
    )

    fireEvent.change(screen.getByLabelText(/low balance threshold/i), { target: { value: 'not-a-number' } })
    fireEvent.change(screen.getByLabelText(/recharge amount/i), { target: { value: 'also-bad' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(screen.getByText(/that is not a valid aud amount/i)).toBeInTheDocument()
      expect(screen.getByText(/a\$0\.00 charged — your balance is unchanged/i)).toBeInTheDocument()
      expect(screen.getByText(/enter dollars and cents, or choose a quick-setup chip/i)).toBeInTheDocument()
    })
    expect(onSave).not.toHaveBeenCalled()
  })

  it('U9: successful save triggers toast.success with policy description', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <AeAutoRechargeCard
        settings={{ ...defaultSettings, enabled: true }}
        mandateState="ready"
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Auto-recharge on',
        expect.objectContaining({
          description: expect.stringMatching(/when balance dips below/i),
        }),
      )
    })
  })

  it('U10: pending funding command shows its credit recovery, not an auto-recharge charge', () => {
    const onSave = vi.fn()
    const { container } = render(
      <AeAutoRechargeCard
        settings={defaultSettings}
        mandateState="ready"
        pendingTopup={{ commandRef: 'auto-recharge:pending-one' }}
        onSave={onSave}
      />,
    )

    expect(container.querySelector('.animate-pulse')).toBeTruthy()
    expect(screen.getByRole('link', { name: /recover it on credit/i })).toHaveAttribute('href', '/owner/credit')
    expect(screen.queryByText(/auto-recharge is waiting/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/a\$0\.00 will be charged for a duplicate top-up/i)).not.toBeInTheDocument()
  })

  it('U11: authentication required disables switch and shows bank guidance', () => {
    const onSave = vi.fn()
    render(
      <AeAutoRechargeCard
        settings={defaultSettings}
        mandateState="authentication_required"
        onSave={onSave}
      />,
    )

    expect(screen.getByRole('switch', { name: /auto-recharge/i })).toBeDisabled()
    expect(screen.getByText(/bank authentication required/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /authenticate the saved card/i })).toHaveAttribute('href', '/owner/settings/payment-methods')
  })

  it('U12: money inputs use monospace tabular styling', () => {
    const onSave = vi.fn()
    render(
      <AeAutoRechargeCard
        settings={defaultSettings}
        mandateState="ready"
        onSave={onSave}
      />,
    )

    expect(screen.getByLabelText(/low balance threshold/i)).toHaveClass('font-mono', 'tabular-nums')
    expect(screen.getByLabelText(/recharge amount/i)).toHaveClass('font-mono', 'tabular-nums')
  })
})
