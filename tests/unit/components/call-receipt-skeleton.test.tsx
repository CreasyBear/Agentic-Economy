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

    const regions = container.querySelectorAll('section[aria-hidden="true"]')
    expect(regions).toHaveLength(5)
    for (const region of regions) expect(region.querySelector('[data-slot="skeleton"]')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})
