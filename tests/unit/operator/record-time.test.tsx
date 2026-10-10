// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { RecordTime } from '@/components/ae/operator/RecordTime'

afterEach(cleanup)

describe('RecordTime', () => {
  it('shows a relative label with the absolute timestamp on hover', () => {
    const at = Date.now() - 3 * 60 * 60 * 1000
    render(<RecordTime at={at} />)
    const time = screen.getByText('3 hours ago')
    expect(time.tagName).toBe('TIME')
    expect(time.getAttribute('dateTime')).toBe(new Date(at).toISOString())
    expect(time.getAttribute('title')).toMatch(/\d{4}, \d{1,2}:\d{2}/)
  })

  it('renders the missing label when there is no time', () => {
    render(<RecordTime at={null} missing="Not recorded" />)
    expect(screen.getByText('Not recorded').tagName).toBe('SPAN')
  })
})
