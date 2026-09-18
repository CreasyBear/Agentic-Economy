/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeMonthlySpendCeilingCard } from '@/components/ae/console/AeMonthlySpendCeilingCard'

const CEILING_UNITS = '500000000'
const SPEND_29_PCT_UNITS = '145200000'
const SPEND_80_PCT_UNITS = '400000000'
const SPEND_AT_CAP_UNITS = '500000000'

type AeMonthlySpendCeilingCardProps = Readonly<{
  settings: Readonly<{
    enabled: boolean
    ceilingUnits: string
    revision: number
  }>
  monthSpend: Readonly<{
    kind: 'available' | 'unavailable'
    spendUnits?: string
  }>
  onSave: (payload: Readonly<{
    enabled: boolean
    ceilingUnits: string
    expectedRevision: number
  }>) => void | Promise<void>
}>

const disabledSettings: AeMonthlySpendCeilingCardProps['settings'] = {
  enabled: false,
  ceilingUnits: '0',
  revision: 0,
}

afterEach(cleanup)

describe('AeMonthlySpendCeilingCard (W-23)', () => {
  it('U1: disabled or missing ceiling shows Set Limit without threshold alerts', () => {
    const onSave = vi.fn()
    render(
      <AeMonthlySpendCeilingCard
        settings={disabledSettings}
        monthSpend={{ kind: 'available', spendUnits: '0' }}
        onSave={onSave}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Organization monthly spending cap' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set Limit' })).toBeInTheDocument()
    expect(screen.queryByText(/approaching monthly limit/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/monthly spending limit reached/i)).not.toBeInTheDocument()
  })

  it('U2: enabled 29% utilization shows spend, cap, and progress without warning alerts', () => {
    const onSave = vi.fn()
    render(
      <AeMonthlySpendCeilingCard
        settings={{ enabled: true, ceilingUnits: CEILING_UNITS, revision: 1 }}
        monthSpend={{ kind: 'available', spendUnits: SPEND_29_PCT_UNITS }}
        onSave={onSave}
      />,
    )

    expect(screen.getByText(/A\$145\.20/i)).toBeInTheDocument()
    expect(screen.getByText(/A\$500\.00/i)).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.queryByText(/approaching monthly limit/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/monthly spending limit reached/i)).not.toBeInTheDocument()
  })

  it('U3: 80% utilization shows approaching limit warning', () => {
    const onSave = vi.fn()
    render(
      <AeMonthlySpendCeilingCard
        settings={{ enabled: true, ceilingUnits: CEILING_UNITS, revision: 1 }}
        monthSpend={{ kind: 'available', spendUnits: SPEND_80_PCT_UNITS }}
        onSave={onSave}
      />,
    )

    expect(screen.getByText('Approaching monthly limit (80%)')).toBeInTheDocument()
  })

  it('U4: 100% or more utilization shows limit reached danger alert', () => {
    const onSave = vi.fn()
    render(
      <AeMonthlySpendCeilingCard
        settings={{ enabled: true, ceilingUnits: CEILING_UNITS, revision: 1 }}
        monthSpend={{ kind: 'available', spendUnits: SPEND_AT_CAP_UNITS }}
        onSave={onSave}
      />,
    )

    expect(screen.getByText('Monthly spending limit reached')).toBeInTheDocument()
  })

  it('U5: Edit Limit opens dialog with switch and amount field', async () => {
    const onSave = vi.fn()
    render(
      <AeMonthlySpendCeilingCard
        settings={{ enabled: true, ceilingUnits: CEILING_UNITS, revision: 1 }}
        monthSpend={{ kind: 'available', spendUnits: SPEND_29_PCT_UNITS }}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit Limit' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('switch', { name: /monthly spending cap/i })).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/monthly cap/i)).toBeInTheDocument()
  })

  it('U6: save submits enabled, canonical ceiling units, and expected revision', async () => {
    const onSave = vi.fn()
    render(
      <AeMonthlySpendCeilingCard
        settings={{ enabled: true, ceilingUnits: CEILING_UNITS, revision: 3 }}
        monthSpend={{ kind: 'available', spendUnits: SPEND_29_PCT_UNITS }}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit Limit' }))
    const dialog = await screen.findByRole('dialog')
    const capInput = within(dialog).getByLabelText(/monthly cap/i)
    fireEvent.change(capInput, { target: { value: '250' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        enabled: true,
        ceilingUnits: '250000000',
        expectedRevision: 3,
      })
    })
  })

  it('U7: enabled with unavailable spend shows unavailable alert', () => {
    const onSave = vi.fn()
    render(
      <AeMonthlySpendCeilingCard
        settings={{ enabled: true, ceilingUnits: CEILING_UNITS, revision: 1 }}
        monthSpend={{ kind: 'unavailable' }}
        onSave={onSave}
      />,
    )

    expect(screen.getByText(/spend data is unavailable/i)).toBeInTheDocument()
  })
})
