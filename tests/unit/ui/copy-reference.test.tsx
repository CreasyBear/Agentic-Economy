/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AeCopyReference', () => {
  it('copies the exact safe reference and gives visible and announced success feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const reference = `operation:v1:${'a'.repeat(64)}`
    render(<AeCopyReference label="Operation reference" value={reference} />)

    const copy = screen.getByRole('button', { name: 'Copy Operation reference' })
    fireEvent.click(copy)

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(reference))
    expect(screen.getByText('Copied')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('Copied')
    expect(screen.getByRole('button', { name: 'Operation reference copied' })).toBeTruthy()
  })

  it('keeps the reference selectable and gives visible failure recovery', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    render(<AeCopyReference label="Receipt reference" value="receipt:public" />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy Receipt reference' }))

    expect(await screen.findByText('Copy failed')).toBeTruthy()
    expect(screen.getByText('receipt:public').tagName).toBe('CODE')
  })
})
