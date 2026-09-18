/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AePriceUpdateModal } from '@/components/ae/supply/AePriceUpdateModal'

afterEach(cleanup)

describe('AePriceUpdateModal', () => {
  it('renders modal with current price and allows updating price to publish new revision', async () => {
    const onUpdatePrice = vi.fn(async (_newPriceAud: string) => ({
      kind: 'applied' as const,
      message: 'New revision published with updated pricing.',
    }))

    render(
      <AePriceUpdateModal
        open={true}
        onOpenChange={vi.fn()}
        toolName="Australian Tax Calculator"
        currentPrice="A$ 0.10"
        onUpdatePrice={onUpdatePrice}
      />,
    )

    expect(screen.getByRole('heading', { name: /update price & publish new revision/i })).toBeTruthy()
    expect(screen.getByText(/current price: a\$ 0\.10/i)).toBeTruthy()

    const priceInput = screen.getByLabelText(/new price per call \(aud\)/i)
    fireEvent.change(priceInput, { target: { value: '0.25' } })

    const confirmBtn = screen.getByRole('button', { name: /publish new revision/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => expect(onUpdatePrice).toHaveBeenCalledWith('0.25'))
  })

  it('validates price input to prevent negative or invalid values', async () => {
    const onUpdatePrice = vi.fn()

    render(
      <AePriceUpdateModal
        open={true}
        onOpenChange={vi.fn()}
        toolName="Australian Tax Calculator"
        currentPrice="A$ 0.10"
        onUpdatePrice={onUpdatePrice}
      />,
    )

    const priceInput = screen.getByLabelText(/new price per call \(aud\)/i)
    fireEvent.change(priceInput, { target: { value: '-1.00' } })

    const confirmBtn = screen.getByRole('button', { name: /publish new revision/i })
    fireEvent.click(confirmBtn)

    expect(await screen.findByText(/enter a valid aud price with up to 2 decimal places/i)).toBeTruthy()
    expect(onUpdatePrice).not.toHaveBeenCalled()
  })

  it('rejects malformed decimal input before calling the server', async () => {
    const onUpdatePrice = vi.fn()

    render(
      <AePriceUpdateModal
        open={true}
        onOpenChange={vi.fn()}
        toolName="Australian Tax Calculator"
        onUpdatePrice={onUpdatePrice}
      />,
    )

    fireEvent.change(screen.getByLabelText(/new price per call \(aud\)/i), { target: { value: '12.345' } })
    fireEvent.click(screen.getByRole('button', { name: /publish new revision/i }))

    expect(await screen.findByText(/enter a valid aud price with up to 2 decimal places/i)).toBeTruthy()
    expect(onUpdatePrice).not.toHaveBeenCalled()
  })
})
