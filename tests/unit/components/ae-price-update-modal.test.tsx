/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import {
  AePriceUpdateModal,
  TACTILE,
} from '@/components/ae/supply/price-update-modal/AePriceUpdateModal'
import { toast } from '@/lib/ui/toast'

vi.mock('@/lib/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

afterEach(cleanup)

function renderModal(
  overrides: Partial<{
    open: boolean
    onOpenChange: (open: boolean) => void
    currentPrice: string
    onUpdatePrice: (newPriceAud: string) => Promise<{ kind: 'applied' | 'refused'; message: string }>
  }> = {},
) {
  const onUpdatePrice =
    overrides.onUpdatePrice ??
    vi.fn(async () => ({
      kind: 'applied' as const,
      message: 'New revision published with updated pricing.',
    }))

  return render(
    <AePriceUpdateModal
      open={overrides.open ?? true}
      onOpenChange={overrides.onOpenChange ?? vi.fn()}
      toolName="Australian Tax Calculator"
      {...(overrides.currentPrice === undefined ? {} : { currentPrice: overrides.currentPrice })}
      onUpdatePrice={onUpdatePrice}
    />,
  )
}

describe('AePriceUpdateModal', () => {
  it('shows comparison, GST split, and delta when typing a new price', () => {
    renderModal({ currentPrice: 'A$ 0.10' })

    fireEvent.change(screen.getByLabelText(/new price per call \(aud\)/i), {
      target: { value: '0.15' },
    })

    const comparisonRow = screen.getByText('Current Price:').parentElement
    expect(comparisonRow).toBeTruthy()
    expect(within(comparisonRow as HTMLElement).getByText('A$0.10')).toBeInTheDocument()
    expect(screen.getByText('New Price:')).toBeInTheDocument()
    expect(within(comparisonRow as HTMLElement).getByText('A$0.15')).toBeInTheDocument()
    expect(screen.getByText('+A$0.05')).toBeInTheDocument()
    expect(screen.getByText('A$0.1500')).toBeInTheDocument()
    expect(screen.getByText('A$0.0000')).toBeInTheDocument()
    expect(screen.getByText('Total Buyer Consideration')).toBeInTheDocument()
    const totals = screen.getAllByText('A$0.15')
    expect(totals.length).toBeGreaterThanOrEqual(1)
  })

  it('shows No change delta when new price matches current price', () => {
    renderModal({ currentPrice: 'A$ 0.10' })

    fireEvent.change(screen.getByLabelText(/new price per call \(aud\)/i), {
      target: { value: '0.10' },
    })

    expect(screen.getByText('No change')).toBeInTheDocument()
  })

  it('reserves comparison and diagnostic geometry and shows em dash without current price', () => {
    renderModal()

    const comparisonCard = screen.getByText('Current Price:').closest('div[class*="min-h-[8.5rem]"]')
    expect(comparisonCard?.className).toContain('min-h-[8.5rem]')

    const diagnosticSlot = screen
      .getAllByRole('status')
      .find((element) => element.className.includes('min-h-[2.5rem]'))
    expect(diagnosticSlot?.className).toContain('min-h-[2.5rem]')

    const comparisonRow = screen.getByText('Current Price:').parentElement as HTMLElement
    const currentValue = comparisonRow.querySelector('span.font-mono')
    expect(currentValue?.textContent).toBe('—')
  })

  it('shows reassurance callout about 15-minute quote expiration', () => {
    renderModal({ currentPrice: 'A$ 0.10' })

    expect(
      screen.getByText(/existing quotes locked by agents remain valid until their 15-minute expiration/i),
    ).toBeInTheDocument()
  })

  it('applies preset percentage and tier chips to the price input', () => {
    renderModal({ currentPrice: 'A$ 0.10' })

    const priceInput = screen.getByLabelText(/new price per call \(aud\)/i) as HTMLInputElement

    fireEvent.click(screen.getByRole('button', { name: '+10%' }))
    expect(priceInput.value).toBe('0.11')

    fireEvent.click(screen.getByRole('button', { name: 'A$0.25' }))
    expect(priceInput.value).toBe('0.25')
  })

  it('shows invalid price Rule 4 triplet and does not publish negative, zero, or over-precision values', async () => {
    const onUpdatePrice = vi.fn()
    renderModal({ currentPrice: 'A$ 0.10', onUpdatePrice })

    const priceInput = screen.getByLabelText(/new price per call \(aud\)/i)
    const publishButton = screen.getByRole('button', { name: /publish new revision/i })

    for (const invalid of ['-1.00', '0.00', '12.345']) {
      fireEvent.change(priceInput, { target: { value: invalid } })
      fireEvent.click(publishButton)

      expect(await screen.findByText('Invalid AUD price amount.')).toBeInTheDocument()
      expect(
        screen.getByText('A$0.00 affected — pricing revision not published.'),
      ).toBeInTheDocument()
      expect(
        screen.getByText(
          /enter a valid positive dollar amount with up to 2 decimal places/i,
        ),
      ).toBeInTheDocument()
    }

    expect(onUpdatePrice).not.toHaveBeenCalled()
  })

  it('shows publish failure Rule 4 triplet when the server refuses', async () => {
    const onUpdatePrice = vi.fn(async () => ({
      kind: 'refused' as const,
      message: 'Catalog revision conflict.',
    }))
    renderModal({ currentPrice: 'A$ 0.10', onUpdatePrice })

    fireEvent.change(screen.getByLabelText(/new price per call \(aud\)/i), {
      target: { value: '0.25' },
    })
    fireEvent.click(screen.getByRole('button', { name: /publish new revision/i }))

    expect(await screen.findByText('Failed to publish pricing revision.')).toBeInTheDocument()
    expect(
      screen.getByText('A$0.00 affected — existing price remains active.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/please check your connection and try publishing again/i),
    ).toBeInTheDocument()
    expect(screen.queryByText('Catalog revision conflict.')).not.toBeInTheDocument()
  })

  it('shows publish failure Rule 4 triplet when the network throws', async () => {
    const onUpdatePrice = vi.fn(async () => {
      throw new Error('network down')
    })
    renderModal({ currentPrice: 'A$ 0.10', onUpdatePrice })

    fireEvent.change(screen.getByLabelText(/new price per call \(aud\)/i), {
      target: { value: '0.25' },
    })
    fireEvent.click(screen.getByRole('button', { name: /publish new revision/i }))

    expect(await screen.findByText('Failed to publish pricing revision.')).toBeInTheDocument()
    expect(screen.queryByText('network down')).not.toBeInTheDocument()
  })

  it('shows success toast and closes modal when publish is applied', async () => {
    const onOpenChange = vi.fn()
    const onUpdatePrice = vi.fn(async () => ({
      kind: 'applied' as const,
      message: 'ok',
    }))

    renderModal({
      currentPrice: 'A$ 0.10',
      onOpenChange,
      onUpdatePrice,
    })

    fireEvent.change(screen.getByLabelText(/new price per call \(aud\)/i), {
      target: { value: '0.25' },
    })
    fireEvent.click(screen.getByRole('button', { name: /publish new revision/i }))

    await waitFor(() => expect(onUpdatePrice).toHaveBeenCalledWith('0.25'))
    expect(toast.success).toHaveBeenCalledWith('Pricing revision published', {
      description: 'New price of A$0.25 is now live in the catalog.',
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('applies tactile classes to action buttons and preset chips', () => {
    renderModal({ currentPrice: 'A$ 0.10' })

    const cancelButton = screen.getByRole('button', { name: /^cancel$/i })
    const publishButton = screen.getByRole('button', { name: /publish new revision/i })
    const tierChip = screen.getByRole('button', { name: 'A$0.10' })
    const percentChip = screen.getByRole('button', { name: '+10%' })

    for (const element of [cancelButton, publishButton, tierChip, percentChip]) {
      expect(element.className).toContain('min-h-touch')
      expect(element.className).toContain('active:scale-[0.98]')
    }

    expect(TACTILE).toContain('active:scale-[0.98]')
  })
})
