/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeMonthlySpendCeilingCard } from '@/components/ae/console/AeMonthlySpendCeilingCard'
import { toast } from '@/lib/ui/toast'

vi.mock('@/lib/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

const CEILING_UNITS = '500000000'
const SPEND_29_PCT_UNITS = '145200000'
const SPEND_90_PCT_UNITS = '450000000'
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
  it('U1: disabled shows reassurance and Set limit', () => {
    const onSave = vi.fn()
    render(
      <AeMonthlySpendCeilingCard
        settings={disabledSettings}
        monthSpend={{ kind: 'available', spendUnits: '0' }}
        onSave={onSave}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Monthly spending cap' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/off\. prepaid credit/i)
    expect(screen.getByRole('button', { name: 'Set limit' })).toBeInTheDocument()
    expect(screen.queryByText(/approaching monthly limit/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/monthly spending limit reached/i)).not.toBeInTheDocument()
  })

  it('U2: 29% utilization shows exact amounts and an accessible monthly cap meter, no alert', () => {
    const onSave = vi.fn()
    render(
      <AeMonthlySpendCeilingCard
        settings={{ enabled: true, ceilingUnits: CEILING_UNITS, revision: 1 }}
        monthSpend={{ kind: 'available', spendUnits: SPEND_29_PCT_UNITS }}
        onSave={onSave}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(/monthly cap/i)
    expect(screen.getByText(/A\$145\.20/i)).toBeInTheDocument()
    expect(screen.getByText(/A\$500\.00/i)).toBeInTheDocument()
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '29')
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuetext', 'A$145.20 spent of A$500.00 monthly cap (29%)')
    expect(screen.queryByText(/approaching monthly limit/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/monthly spending limit reached/i)).not.toBeInTheDocument()
  })

  it.each([{ kind: 'unavailable' } as const, { kind: 'available' } as const, undefined])('withholds zero-spend claims and utilization when monthly spend evidence is missing (%j)', (monthSpend) => {
    render(<AeMonthlySpendCeilingCard settings={{ enabled: true, ceilingUnits: CEILING_UNITS, revision: 1 }}
      {...(monthSpend === undefined ? {} : { monthSpend })} onSave={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Monthly cap; monthly spend is unavailable.')
    expect(screen.queryByRole('meter')).toBeNull()
    expect(screen.queryByText(/spent of/u)).toBeNull()
    expect(screen.getByText('Monthly spend data is unavailable.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit limit' })).toBeEnabled()
  })

  it('withholds an off-state claim and editing when authoritative settings are missing', () => {
    const onSave = vi.fn()
    render(<AeMonthlySpendCeilingCard monthSpend={{ kind: 'available', spendUnits: '0' }} onSave={onSave} />)
    expect(screen.getByRole('status')).toHaveTextContent('Monthly spending cap unavailable.')
    expect(screen.queryByText(/off\. prepaid credit/i)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Set limit' })).toBeNull()
    expect(screen.queryByRole('meter')).toBeNull()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('U3: 90% utilization (critical) shows Approaching monthly limit (90%)', () => {
    const onSave = vi.fn()
    render(
      <AeMonthlySpendCeilingCard
        settings={{ enabled: true, ceilingUnits: CEILING_UNITS, revision: 1 }}
        monthSpend={{ kind: 'available', spendUnits: SPEND_90_PCT_UNITS }}
        onSave={onSave}
      />,
    )

    expect(screen.getByText('Approaching monthly limit (90%)')).toBeInTheDocument()
  })

  it('U4: 100% shows Monthly spending limit reached', () => {
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

  it('U5: Edit limit opens dialog with switch, input, and preset chips', async () => {
    const onSave = vi.fn()
    render(
      <AeMonthlySpendCeilingCard
        settings={{ enabled: true, ceilingUnits: CEILING_UNITS, revision: 1 }}
        monthSpend={{ kind: 'available', spendUnits: SPEND_29_PCT_UNITS }}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit limit' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('switch', { name: /monthly spending cap/i })).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/monthly cap/i)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'A$100' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'A$250' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'A$500' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'A$1,000' })).toBeInTheDocument()
  })

  it('U6: Save submits enabled and canonical units', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <AeMonthlySpendCeilingCard
        settings={{ enabled: true, ceilingUnits: CEILING_UNITS, revision: 3 }}
        monthSpend={{ kind: 'available', spendUnits: SPEND_29_PCT_UNITS }}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit limit' }))
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

  it('U7: Disabled save submits enabled: false', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <AeMonthlySpendCeilingCard
        settings={{ enabled: true, ceilingUnits: CEILING_UNITS, revision: 2 }}
        monthSpend={{ kind: 'available', spendUnits: SPEND_29_PCT_UNITS }}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit limit' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('switch', { name: /monthly spending cap/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        enabled: false,
        ceilingUnits: CEILING_UNITS,
        expectedRevision: 2,
      })
    })
  })

  it('U8: Preset chips populate input and set aria-pressed', async () => {
    const onSave = vi.fn()
    render(
      <AeMonthlySpendCeilingCard
        settings={{ enabled: true, ceilingUnits: CEILING_UNITS, revision: 1 }}
        monthSpend={{ kind: 'available', spendUnits: SPEND_29_PCT_UNITS }}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit limit' }))
    const dialog = await screen.findByRole('dialog')
    const chip250 = within(dialog).getByRole('button', { name: 'A$250' })
    fireEvent.click(chip250)

    expect(within(dialog).getByLabelText(/monthly cap/i)).toHaveValue('250')
    expect(chip250).toHaveAttribute('aria-pressed', 'true')
  })

  it('U9: Invalid enabled save triggers Rule 4 diagnostic alert and toast.error without calling onSave', async () => {
    const onSave = vi.fn()
    render(
      <AeMonthlySpendCeilingCard
        settings={{ enabled: true, ceilingUnits: CEILING_UNITS, revision: 1 }}
        monthSpend={{ kind: 'available', spendUnits: SPEND_29_PCT_UNITS }}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit limit' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/monthly cap/i), { target: { value: 'not-valid' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(within(dialog).getByText(/invalid spending cap amount/i)).toBeInTheDocument()
      expect(within(dialog).getByText(/a\$0\.00 charged — your spending cap is unchanged/i)).toBeInTheDocument()
      const alert = within(dialog).getByRole('alert')
      expect(alert).toHaveTextContent(/enter a valid dollar amount or select a preset chip/i)
    })
    expect(toast.error).toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('U10: Successful save calls toast.success with updated cap / disabled status', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <AeMonthlySpendCeilingCard
        settings={{ enabled: true, ceilingUnits: CEILING_UNITS, revision: 1 }}
        monthSpend={{ kind: 'available', spendUnits: SPEND_29_PCT_UNITS }}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit limit' }))
    let dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/monthly cap/i), { target: { value: '250' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Monthly spending cap updated: A$250.00')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Edit limit' }))
    dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('switch', { name: /monthly spending cap/i }))
    fireEvent.click(within(dialog).getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Monthly spending cap disabled')
    })
  })


  it('U10b: saving an already disabled cap does not say it was disabled', async () => {
    vi.mocked(toast.success).mockClear()
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <AeMonthlySpendCeilingCard
        settings={disabledSettings}
        monthSpend={{ kind: 'available', spendUnits: '0' }}
        onSave={onSave}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Set limit' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /save/i }))
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Monthly spending cap is already off')
    })
    expect(toast.success).not.toHaveBeenCalledWith('Monthly spending cap disabled')
  })

  it('U11: Conflict during save shows Rule 4 diagnostic in dialog', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('monthly_spend_budget_revision_conflict'))
    render(
      <AeMonthlySpendCeilingCard
        settings={{ enabled: true, ceilingUnits: CEILING_UNITS, revision: 1 }}
        monthSpend={{ kind: 'available', spendUnits: SPEND_29_PCT_UNITS }}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Edit limit' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(within(dialog).getByText(/this spending cap changed since you opened it/i)).toBeInTheDocument()
      expect(within(dialog).getByText(/refresh the page, review the current cap, then save again/i)).toBeInTheDocument()
    })
    expect(toast.error).toHaveBeenCalledWith(
      'This spending cap changed since you opened it.',
      expect.objectContaining({
        description: 'Refresh the page, review the current cap, then Save again.',
      }),
    )
  })
})
