/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import '../../tests/setup/jsdom-platform'

import { useIsMobile, useViewportKind } from '@/hooks/use-mobile'

function mockViewport(width: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  })
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: width < 768 && query.includes('max-width: 767px'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useViewportKind', () => {
  it('resolves 390px to mobile', async () => {
    mockViewport(390)
    const { result } = renderHook(() => useViewportKind())
    await waitFor(() => {
      expect(result.current).toBe('mobile')
    })
  })

  it('resolves 1024px to desktop', async () => {
    mockViewport(1024)
    const { result } = renderHook(() => useViewportKind())
    await waitFor(() => {
      expect(result.current).toBe('desktop')
    })
  })
})

describe('useIsMobile', () => {
  it('is true below 768 after the media query resolves', async () => {
    mockViewport(390)
    const { result } = renderHook(() => useIsMobile())
    await waitFor(() => {
      expect(result.current).toBe(true)
    })
  })

  it('is false at 1024 after the media query resolves', async () => {
    mockViewport(1024)
    const { result } = renderHook(() => useIsMobile())
    await waitFor(() => {
      expect(result.current).toBe(false)
    })
  })
})
