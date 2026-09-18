/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'

import { CallReceiptSkeleton } from '@/components/ae/call-receipt/CallReceiptSkeleton'

afterEach(cleanup)

describe('CallReceiptSkeleton (W-42)', () => {
  it('renders layout-stable pulse loading shapes with aria-busy', () => {
    render(<CallReceiptSkeleton />)

    const loadingContainer = screen.getByLabelText('Loading call receipt')
    expect(loadingContainer).toBeInTheDocument()
    expect(loadingContainer).toHaveAttribute('aria-busy', 'true')
  })
})
