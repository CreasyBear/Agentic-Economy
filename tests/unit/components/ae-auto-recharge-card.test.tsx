/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeAutoRechargeCard } from '@/components/ae/console/AeAutoRechargeCard'

type AeAutoRechargeCardProps = Readonly<{
  settings: Readonly<{
    enabled: boolean
    thresholdUnits: string
    rechargeAmountUnits: string
    revision: number
  }>
  mandateState: 'ready' | 'missing' | 'authentication_required'
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
    const onSave = vi.fn()
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
    expect(screen.getByRole('link', { name: /add payment method/i })).toBeInTheDocument()

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
  })
})
