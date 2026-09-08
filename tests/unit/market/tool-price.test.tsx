/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AeToolPrice } from '@/components/ae/market/AeToolPrice'

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('held-open indicative Tool price', () => {
  it('expires the estimate without waiting for a network refresh', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    render(<AeToolPrice price="About A$1.50" validUntil={2000} />)
    expect(screen.queryByText('About A$1.50')).not.toBeNull()
    act(() => { vi.advanceTimersByTime(1001) })
    expect(screen.queryByText('About A$1.50')).toBeNull()
    expect(screen.queryByText('AUD estimate temporarily unavailable')).not.toBeNull()
  })
})
