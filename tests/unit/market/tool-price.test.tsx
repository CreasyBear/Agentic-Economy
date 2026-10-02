/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AeToolPrice } from '@/components/ae/market/AeToolPrice'

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('indicative Tool price display', () => {
  it('keeps the given price when its estimate window passes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    render(<AeToolPrice price="About A$1.50" validUntil={2000} />)
    expect(screen.queryByText('About A$1.50')).not.toBeNull()
    act(() => { vi.advanceTimersByTime(1001) })
    expect(screen.queryByText('About A$1.50')).not.toBeNull()
  })
})
