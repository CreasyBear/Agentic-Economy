/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'

import { CallReceiptSkeleton } from '@/components/ae/call-receipt/CallReceiptSkeleton'

afterEach(cleanup)

describe('CallReceiptSkeleton (W-41)', () => {
  it('exposes one named receipt loading status', () => {
    render(<CallReceiptSkeleton />)

    const loadingContainer = screen.getByRole('status', { name: 'Loading call receipt' })
    expect(loadingContainer).toBeInTheDocument()
    expect(loadingContainer).toHaveAttribute('aria-busy', 'true')
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('keeps five receipt regions decorative without exposing controls or financial values', () => {
    const { container } = render(<CallReceiptSkeleton />)

    const regions = container.querySelectorAll('section[aria-hidden="true"]')
    expect(regions).toHaveLength(5)
    for (const region of regions) {
      const placeholderStatuses = region.querySelectorAll('[role="status"]')
      expect(placeholderStatuses.length).toBeGreaterThan(0)
      for (const placeholderStatus of placeholderStatuses) {
        expect(placeholderStatus).toHaveAttribute('aria-busy', 'true')
      }
    }

    expect(container.querySelector('button')).not.toBeInTheDocument()
    expect(container.querySelector('h1, h2, h3, h4, h5, h6')).not.toBeInTheDocument()
    expect(container).not.toHaveTextContent(/\b(?:AUD|USD|USDC)\b\s*[\d,.]+|[$€£¥]\s*[\d,.]+|[\d,.]+\s*\b(?:AUD|USD|USDC)\b/i)
  })
})
