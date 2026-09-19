/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'

import { CallReceiptSkeleton } from '@/components/ae/call-receipt/CallReceiptSkeleton'

afterEach(cleanup)

describe('CallReceiptSkeleton (W-41)', () => {
  it('renders layout-stable pulse loading shapes with status semantics', () => {
    render(<CallReceiptSkeleton />)

    const loadingContainer = screen.getByRole('status', { name: 'Loading call receipt' })
    expect(loadingContainer).toBeInTheDocument()
    expect(loadingContainer).toHaveAttribute('aria-busy', 'true')
  })

  it('reserves summary, playbook, money facts, recovery, and technical record regions', () => {
    const { container } = render(<CallReceiptSkeleton />)

    expect(container.querySelector('.min-h-\\[12rem\\].rounded-xl.border.bg-card.p-4')).toBeInTheDocument()
    expect(container.querySelector('.min-h-\\[13\\.5rem\\]')).toBeInTheDocument()
    expect(container.querySelector('.min-h-\\[4\\.5rem\\].border-t.border-border.pt-section')).toBeInTheDocument()
    expect(container.querySelector('.min-h-touch.h-touch.w-44')).toBeInTheDocument()
    expect(container.querySelector('.h-5.w-24.font-mono')).toBeInTheDocument()
    expect(container.querySelector('.h-6.w-32.rounded-full')).toBeInTheDocument()
  })
})
