/**
 * @vitest-environment jsdom
 */
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import '../../setup/jsdom-platform'

import { ResponsiveToaster } from '@/routes/__root'

const toasterProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }))

vi.mock('sonner', () => ({
  Toaster: (props: Record<string, unknown>) => {
    toasterProps.current = props
    return <div data-testid="sonner-toaster" />
  },
}))

function mockViewportMobile(isMobile: boolean): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: isMobile ? 390 : 1024,
  })
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: isMobile && query.includes('max-width: 767px'),
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
  cleanup()
  toasterProps.current = null
  vi.restoreAllMocks()
})

describe('ResponsiveToaster placement', () => {
  it('uses top-right position and 72px offset below md breakpoint', async () => {
    mockViewportMobile(true)
    render(<ResponsiveToaster />)

    await waitFor(() => {
      expect(toasterProps.current?.position).toBe('top-right')
      expect(toasterProps.current?.offset).toBe('72px')
    })
  })

  it('uses bottom-right position and 16px offset at desktop widths', async () => {
    mockViewportMobile(false)
    render(<ResponsiveToaster />)

    await waitFor(() => {
      expect(toasterProps.current?.position).toBe('bottom-right')
      expect(toasterProps.current?.offset).toBe('16px')
    })
  })
})
