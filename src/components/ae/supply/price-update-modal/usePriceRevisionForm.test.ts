// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { toast } from '@/lib/ui/toast'

import { parseDisplayAudPrice } from './price-revision-preview'
import { usePriceRevisionForm } from './usePriceRevisionForm'

vi.mock('@/lib/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

afterEach(() => {
  vi.clearAllMocks()
})

describe('usePriceRevisionForm', () => {
  it('resets state when open becomes true', () => {
    const { result, rerender } = renderHook(
      (props: { open: boolean }) =>
        usePriceRevisionForm({
          open: props.open,
          onOpenChange: vi.fn(),
          onUpdatePrice: vi.fn(),
          parsedCurrent: undefined,
        }),
      { initialProps: { open: false } },
    )

    act(() => {
      result.current.handlePriceAudChange('0.25')
    })
    expect(result.current.priceAud).toBe('0.25')

    rerender({ open: true })
    expect(result.current.priceAud).toBe('')
    expect(result.current.diagnostic).toBeUndefined()
    expect(result.current.pending).toBe(false)
  })

  it('publishes normalized price and toasts on applied', async () => {
    const onOpenChange = vi.fn()
    const onUpdatePrice = vi.fn(async () => ({
      kind: 'applied' as const,
      message: 'ok',
    }))
    const { result } = renderHook(() =>
      usePriceRevisionForm({
        open: true,
        onOpenChange,
        onUpdatePrice,
        parsedCurrent: parseDisplayAudPrice('A$ 0.10'),
      }),
    )

    act(() => {
      result.current.handlePriceAudChange('0.1')
    })

    await act(async () => {
      await result.current.handleConfirm()
    })

    expect(onUpdatePrice).toHaveBeenCalledWith('0.10')
    expect(toast.success).toHaveBeenCalledWith('Pricing revision published', {
      description: 'New price of A$0.10 is now live in the catalog.',
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('sets publish failure diagnostic without surfacing refused message', async () => {
    const onUpdatePrice = vi.fn(async () => ({
      kind: 'refused' as const,
      message: 'Catalog revision conflict.',
    }))
    const { result } = renderHook(() =>
      usePriceRevisionForm({
        open: true,
        onOpenChange: vi.fn(),
        onUpdatePrice,
        parsedCurrent: undefined,
      }),
    )

    act(() => {
      result.current.handlePriceAudChange('0.25')
    })

    await act(async () => {
      await result.current.handleConfirm()
    })

    await waitFor(() => {
      expect(result.current.diagnostic?.whatHappened).toBe('Failed to publish pricing revision.')
    })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('sets publish failure diagnostic when the port throws', async () => {
    const onUpdatePrice = vi.fn(async () => {
      throw new Error('network down')
    })
    const { result } = renderHook(() =>
      usePriceRevisionForm({
        open: true,
        onOpenChange: vi.fn(),
        onUpdatePrice,
        parsedCurrent: undefined,
      }),
    )

    act(() => {
      result.current.handlePriceAudChange('0.25')
    })

    await act(async () => {
      await result.current.handleConfirm()
    })

    expect(result.current.diagnostic?.whatHappened).toBe('Failed to publish pricing revision.')
    expect(result.current.pending).toBe(false)
  })

  it('sets invalid price diagnostic without calling the port', async () => {
    const onUpdatePrice = vi.fn()
    const { result } = renderHook(() =>
      usePriceRevisionForm({
        open: true,
        onOpenChange: vi.fn(),
        onUpdatePrice,
        parsedCurrent: undefined,
      }),
    )

    act(() => {
      result.current.handlePriceAudChange('0.00')
    })

    await act(async () => {
      await result.current.handleConfirm()
    })

    expect(result.current.diagnostic?.whatHappened).toBe('Invalid AUD price amount.')
    expect(onUpdatePrice).not.toHaveBeenCalled()
  })
})
